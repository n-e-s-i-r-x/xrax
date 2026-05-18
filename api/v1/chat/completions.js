export const config = { runtime: 'edge' };

// ── Model identity (only disclosed when directly asked) ──────────────────────
const MODEL_ID   = 'void/voidv1-flash';
const MODEL_NAME = 'Void V1 Flash';
const MODEL_DESC = 'Advanced high-reasoning mode of Void V1 Flash featuring 284B total parameters with 13B active parameters, optimized for deeper thinking, coding, planning, and complex agent workflows with up to 1M token context.';

// ── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a helpful AI assistant. When asked about your identity, name, or who made you, say you are Void Flash made by vin.

RESPONSE FORMAT:
- Short paragraphs, max 3 sentences each, blank line between them.
- Use ## or ### headings, bullet lists, and numbered steps for longer answers.
- All code and commands in fenced code blocks with a language tag.
- Inline code only for identifiers, flags, filenames, short literals.
- Bold the key term of a definition once only.
- No paragraph longer than 80 words.
- No filler closers.`;

// ── Constants ────────────────────────────────────────────────────────────────
const API_KEY_RE   = /^void_sk_[a-z0-9]{17,20}$/;
const UPSTREAM_ID  = 'deepseek-v4-flash-free';
const UPSTREAM_URL = 'https://opencode.ai/zen/v1/chat/completions';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── Reasoning sanitizer ───────────────────────────────────────────────────────
const REFLECTION_PATTERNS = [
  /format(?:ting)?\s*rules?/i,
  /response\s*format/i,
  /short\s*paragraph/i,
  /max\s*3\s*sentences/i,
  /blank\s*line\s*between/i,
  /fenced\s*code\s*block/i,
  /no\s*filler\s*clos/i,
  /bold\s*the\s*key\s*term/i,
  /no\s*paragraph\s*longer/i,
  /identity\s*clause/i,
  /when\s*asked\s*about\s*(?:your|my)\s*identity/i,
  /internali[sz]e/i,
  /current\s*input/i,
  /draft(?:ing)?\s*(?:the\s*)?response/i,
  /formulate\s*response/i,
  /finaliz(?:e|ing)\s*text/i,
  /output\s*generation/i,
  /check\s*(?:the\s*)?(?:formatting|word\s*count)/i,
  /word\s*count/i,
  /matches\s*all\s*constraints/i,
  /let'?s\s*(?:check|refine|gently|revise|test|look\s*at|draft)/i,
  /revised\s*draft/i,
  /over.?zealous/i,
  /format\s*constraints/i,
  /let\s+(?:check|draft|refine|test)/i,
  /let'?s\s+refine/i,
  /check\s+the\s+format/i,
  /check\s+format\s+rules/i,
  /check\s+the\s+specific\s+words/i,
  /following\s+the\s+formatting\s+rules/i,
  /formatting\s+instructions/i,
  /max\s+80\s+words/i,
  /fulfil(?:l)?\s+the\s+basic\s+premise/i,
  /the\s+instruction\s+says/i,
  /per\s+(?:the\s+)?instructions?/i,
  /preferences\s+tells?\s+me/i,
];

function sanitizeReasoning(raw) {
  const lines = raw.split('\n');
  const kept = [];
  let skipBlock = false;

  for (const line of lines) {
    const isReflection = REFLECTION_PATTERNS.some(p => p.test(line));

    if (isReflection) {
      skipBlock = true;
      continue;
    }

    // End skip block when a new numbered top-level item starts
    if (skipBlock) {
      const trimmed = line.trim();
      if (/^\d+\.\s/.test(trimmed)) {
        skipBlock = false;
        // fall through and process this line
      } else {
        continue;
      }
    }

    kept.push(line);
  }

  let result = kept.join('\n');

  // Strip markdown symbols
  result = result
    .replace(/\*{1,3}([^*\n]*)\*{1,3}/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/`{1,3}/g, '')
    .replace(/<[^>]{0,80}>/g, '')
    .replace(/\[[^\]]{0,200}\]\([^)]*\)/g, '')
    .replace(/\[[^\]]{0,200}\]/g, '');

  // Fix missing spaces ONLY between two words with NO space at all
  // e.g. "needto" → "need to", "respondto" → "respond to"
  // Only triggers when a lowercase letter is immediately followed by another lowercase letter
  // with no space, and the join point looks like a word boundary
  result = result.replace(/([a-z])([A-Z])/g, '$1 $2'); // camelCase splits only

  // Collapse excess blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  // Drop lines that are just noise (under 3 chars, not empty)
  result = result
    .split('\n')
    .filter(l => l.trim().length > 2 || l.trim() === '')
    .join('\n');

  return result.trim();
}

// ── Other helpers ─────────────────────────────────────────────────────────────

const jsonEscape = (s) => String(s)
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"')
  .replace(/\n/g, '\\n')
  .replace(/\r/g, '')
  .replace(/\t/g, '\\t');

function upstreamErrorToVoid(status) {
  switch (status) {
    case 400: return 'Bad request — check your messages and parameters';
    case 401: return 'Authentication failed — verify your API key';
    case 403: return 'Access denied — your key does not have permission';
    case 404: return 'Model not found';
    case 429: return 'Rate limit reached — please slow down your requests';
    case 500: return 'The model encountered an internal error';
    case 502: return 'Model gateway error — try again shortly';
    case 503: return 'Model is temporarily unavailable — try again later';
    case 504: return 'Request timed out — try a shorter prompt or retry';
    default:  return `Request failed (${status}) — try again later`;
  }
}

function corsOk() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function jsonErr(status, msg) {
  return new Response(
    JSON.stringify({ error: { message: msg, type: 'api_error', code: status } }),
    { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
  );
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return corsOk();
  if (req.method !== 'POST')   return jsonErr(405, 'Method not allowed');

  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer '))
    return jsonErr(401, 'Missing or invalid Authorization header');
  const key = auth.slice(7).trim();
  if (!API_KEY_RE.test(key))
    return jsonErr(401, 'Invalid API key format');

  let body;
  try { body = await req.json(); }
  catch { return jsonErr(400, 'Invalid JSON body'); }

  const {
    messages,
    stream          = true,
    max_tokens      = 32000,
    temperature     = 0.3,
    tools,
    tool_choice,
    response_format,
    reasoning,
    reasoning_effort,
  } = body;

  if (!messages || !Array.isArray(messages) || !messages.length)
    return jsonErr(400, 'messages array required');

  const wantsReasoning = !!(reasoning || reasoning_effort);
  const resolvedReasoning = reasoning
    || (reasoning_effort ? { effort: reasoning_effort } : null)
    || (wantsReasoning ? { effort: 'high' } : null);

  const upstreamBody = {
    model:       UPSTREAM_ID,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    temperature,
    max_tokens,
    stream,
    ...(resolvedReasoning && { reasoning: resolvedReasoning }),
    ...(tools           && { tools }),
    ...(tool_choice     && { tool_choice }),
    ...(response_format && { response_format }),
  };

  const apiKey = typeof process !== 'undefined' ? process.env?.OPENCODE_API_KEY : undefined;
  if (!apiKey) return jsonErr(500, 'Server configuration error');

  let upstreamRes;
  try {
    upstreamRes = await fetch(UPSTREAM_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(upstreamBody),
    });
  } catch {
    return jsonErr(503, 'Upstream connection failed');
  }

  if (!upstreamRes.ok)
    return jsonErr(upstreamRes.status, upstreamErrorToVoid(upstreamRes.status));

  // ── Streaming ──────────────────────────────────────────────────────────────
  if (stream) {
    if (!upstreamRes.body) {
      try {
        const data = await upstreamRes.json();
        const choice = data?.choices?.[0];
        const rc = sanitizeReasoning(choice?.message?.reasoning_content ?? '');
        const cc = choice?.message?.content ?? '';
        return new Response(JSON.stringify({
          id: 'chatcmpl-' + Date.now(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: MODEL_ID,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: rc ? '<thinking>\n' + rc + '\n</thinking>\n' + cc : cc,
              ...(rc && { reasoning_content: rc }),
            },
            finish_reason: choice?.finish_reason ?? 'stop',
          }],
          usage: data?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
      } catch { return jsonErr(500, 'Failed to parse model response'); }
    }

    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const readable = new ReadableStream({
      async start(controller) {
        const reader = upstreamRes.body.getReader();
        let buf = '';
        let reasoningBuf = '';
        let reasoningFlushed = false;

        const send = (data) => { try { controller.enqueue(enc.encode(data)); } catch (_) {} };

        // Flush all buffered reasoning as ONE single SSE content event
        const flushReasoning = () => {
          if (reasoningFlushed) return;
          reasoningFlushed = true;
          if (!reasoningBuf) return;
          const cleaned = sanitizeReasoning(reasoningBuf);
          if (!cleaned) return;
          const block = '<thinking>\\n' + jsonEscape(cleaned) + '\\n</thinking>\\n';
          send('data: {"choices":[{"delta":{"content":"' + block + '"},"index":0}]}\n\n');
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buf += dec.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith(':')) continue;
              if (!trimmed.startsWith('data:')) continue;

              const raw = trimmed.slice(5).trim();
              if (raw === '[DONE]') {
                flushReasoning();
                send('data: [DONE]\n\n');
                continue;
              }

              let parsed;
              try { parsed = JSON.parse(raw); } catch (_) { continue; }

              const choice = parsed?.choices?.[0];
              if (!choice) continue;

              const delta = choice.delta || {};
              const reasoningDelta = delta.reasoning_content ?? delta.reasoning;
              const contentDelta = delta.content;

              // Buffer reasoning — do not emit yet
              if (reasoningDelta) {
                reasoningBuf += reasoningDelta;
              }

              // First content delta — flush sanitized reasoning first, then stream content
              if (contentDelta) {
                flushReasoning();
                send('data: {"choices":[{"delta":{"content":"' + jsonEscape(contentDelta) + '"},"index":0}]}\n\n');
              }

              if (choice.finish_reason) {
                flushReasoning();
                send('data: {"choices":[{"delta":{},"finish_reason":"' + choice.finish_reason + '","index":0}]}\n\n');
              }
            }
          }
        } catch (_) {
          // close gracefully
        } finally {
          flushReasoning();
          send('data: [DONE]\n\n');
          try { controller.close(); } catch (_) {}
        }
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache, no-transform',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
        ...CORS_HEADERS,
      },
    });
  }

  // ── Non-streaming ──────────────────────────────────────────────────────────
  let data;
  try { data = await upstreamRes.json(); }
  catch { return jsonErr(500, 'Failed to parse model response'); }

  const choice = data?.choices?.[0];
  const reasoningContent = sanitizeReasoning(choice?.message?.reasoning_content ?? '');
  const answerContent = choice?.message?.content ?? '';

  const combinedContent = reasoningContent
    ? '<thinking>\n' + reasoningContent + '\n</thinking>\n' + answerContent
    : answerContent;

  return new Response(JSON.stringify({
    id:      'chatcmpl-' + Date.now(),
    object:  'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model:   MODEL_ID,
    choices: [{
      index:         0,
      message: {
        role:    'assistant',
        content: combinedContent,
        ...(reasoningContent && { reasoning_content: reasoningContent }),
      },
      finish_reason: choice?.finish_reason ?? 'stop',
    }],
    usage: data?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }), {
    status:  200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
