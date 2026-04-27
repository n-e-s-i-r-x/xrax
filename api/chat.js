export const config = { runtime: 'edge' };

/* ══════════════════════════════════════
   MODEL MAP
══════════════════════════════════════ */
const MODEL_MAP = {
  '0':   { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false },
  '00':  { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false },
  '000': { id: 'openai/gpt-oss-120b:free',         hasReasoning: true,  hasPromptedThink: false },
  'V':   { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false },
};

function modelEntry(key) {
  return MODEL_MAP[key] ?? MODEL_MAP['0'];
}

/* ══════════════════════════════════════
   SYSTEM BEHAVIOR (HIGH ACCURACY CORE)
══════════════════════════════════════ */
const ACCURACY_LAYER = `
You are an AI assistant operating in 2026.

Core rules:
- Always assume current context is April 2026 unless user specifies otherwise.
- Never guess uncertain facts. If unsure, say "uncertain".
- Do not fabricate events, names, statistics, or real-world claims.
- If a question contains a false assumption, correct it clearly.
- If information is not verifiable, state uncertainty instead of guessing.

Behavior style:
- Be human-like, natural, and direct.
- Avoid robotic or overly formal wording.
- Prefer clarity and truth over completeness or speculation.

Reasoning discipline:
- Think carefully step-by-step internally for complex questions.
- Do not expose internal reasoning unless asked.

Priority:
Accuracy > Clarity > Naturalness > Speed
`;

/* ══════════════════════════════════════
   PERSONAS (HUMANIZED)
══════════════════════════════════════ */
const PERSONA_BASE = (model) => `
You are "0", a smart, human-like AI assistant running model ${model}.
You respond naturally, clearly, and confidently when appropriate.
You do not sound robotic or overly formal.
`;

const PERSONA_0   = PERSONA_BASE('0');
const PERSONA_00  = PERSONA_BASE('00');
const PERSONA_000 = PERSONA_BASE('000') + `
You are more analytical and careful.
You verify logic before responding.
`;
const PERSONA_V   = PERSONA_BASE('V') + `
You are human-like, slightly bold in tone, but strictly accurate.
Never invent facts. Stay grounded in reality.
`;

const SYSTEM_PROMPT_MAP = {
  '0':   PERSONA_0,
  '00':  PERSONA_00,
  '000': PERSONA_000,
  'V':   PERSONA_V,
};

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */
function jsonEscape(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function sseContent(text) {
  return `data: {"choices":[{"delta":{"content":"${jsonEscape(text)}"},"finish_reason":null}]}\n\n`;
}

function genericError(status) {
  if (status === 401 || status === 403) return 'Authentication failed.';
  if (status === 429) return 'Rate limited. Try again shortly.';
  if (status === 402) return 'Out of credits.';
  if (status >= 500) return 'Server error. Try again later.';
  return 'Request failed.';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* ══════════════════════════════════════
   RETRY FETCH
══════════════════════════════════════ */
async function fetchWithRetry(url, options, maxRetries = 4) {
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);

  for (let i = 0; i <= maxRetries; i++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (e) {
      if (i < maxRetries) {
        await sleep(1000 * Math.pow(2, i));
        continue;
      }
      throw e;
    }

    if (res.ok) return res;
    if (!RETRYABLE.has(res.status)) return res;

    await sleep(1000 * Math.pow(2, i));
  }
}

/* ══════════════════════════════════════
   PAYLOAD
══════════════════════════════════════ */
function buildPayload(persona, messages) {
  return [
    { role: 'system', content: persona + ACCURACY_LAYER },
    ...messages
  ];
}

/* ══════════════════════════════════════
   MAIN HANDLER
══════════════════════════════════════ */
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(
      sseContent('Invalid request.') + 'data: [DONE]\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  const {
    messages,
    temperature = 0.7,
    maxTokens = 2000,
    model: modelKey = '0',
  } = body;

  const apiKey =
    (typeof process !== 'undefined' ? process.env?.OPENROUTER_API_KEY : undefined)
    ?? globalThis?.OPENROUTER_API_KEY;

  if (!apiKey) {
    return new Response(
      sseContent('Missing API key.') + 'data: [DONE]\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  const mEntry = modelEntry(modelKey);
  const persona = SYSTEM_PROMPT_MAP[modelKey] ?? PERSONA_0;

  const trimmed = Array.isArray(messages)
    ? messages.filter(m => m?.role && m?.content).slice(-20)
    : [];

  const payload = buildPayload(persona, trimmed);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (c) => controller.enqueue(encoder.encode(c));

      let upstream;
      try {
        upstream = await fetchWithRetry(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: mEntry.id,
              messages: payload,
              temperature,
              max_tokens: maxTokens,
              stream: true,
              ...(mEntry.hasReasoning ? { reasoning: { max_tokens: 8000 } } : {})
            }),
          },
          4
        );
      } catch {
        send(sseContent('Network error.'));
        send('data: [DONE]\n\n');
        controller.close();
        return;
      }

      if (!upstream.ok || !upstream.body) {
        send(sseContent(genericError(upstream.status)));
        send('data: [DONE]\n\n');
        controller.close();
        return;
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handle = (line) => {
        if (line === '[DONE]') return;
        try {
          const json = JSON.parse(line);
          const content = json?.choices?.[0]?.delta?.content;
          if (content) send(sseContent(content));
        } catch {}
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          buffer = parts.pop();

          for (const p of parts) {
            const l = p.replace('data:', '').trim();
            if (l) handle(l);
          }
        }
      } catch {
        send(sseContent('Stream error.'));
      }

      send('data: [DONE]\n\n');
      controller.close();
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
