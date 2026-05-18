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

// ── Helpers ──────────────────────────────────────────────────────────────────

const jsonEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, '\\t');

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

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return corsOk();
  if (req.method !== 'POST')   return jsonErr(405, 'Method not allowed');

  // Auth
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer '))
    return jsonErr(401, 'Missing or invalid Authorization header');
  const key = auth.slice(7).trim();
  if (!API_KEY_RE.test(key))
    return jsonErr(401, 'Invalid API key format');

  // Parse body
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

  // Resolve reasoning config
  const wantsReasoning = !!(reasoning || reasoning_effort);
  const resolvedReasoning = reasoning
    || (reasoning_effort ? { effort: reasoning_effort } : null)
    || (wantsReasoning ? { effort: 'high' } : null);

  // Build upstream payload
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

  // Upstream key
  const apiKey = typeof process !== 'undefined' ? process.env?.OPENCODE_API_KEY : undefined;
  if (!apiKey) return jsonErr(500, 'Server configuration error');

  // Call opencode zen
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

  // ── Error handling ────────────────────────────────────────────────────────
  if (!upstreamRes.ok) {
    const status = upstreamRes.status;
    return jsonErr(status, upstreamErrorToVoid(status));
  }

  // ── Streaming ─────────────────────────────────────────────────────────────
  if (stream) {
    // Fallback: upstream returned no body
    if (!upstreamRes.body) {
      try {
        const data = await upstreamRes.json();
        const choice = data?.choices?.[0];
        const cc = choice?.message?.content ?? '';
        return new Response(JSON.stringify({
          id: 'chatcmpl-' + Date.now(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: MODEL_ID,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: cc },
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

        const send = (data) => { try { controller.enqueue(enc.encode(data)); } catch (_) {} };

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

              // Reasoning is intentionally dropped — never sent to client
              if (reasoningDelta) continue;

              // Emit normal content only
              if (contentDelta) {
                send('data: {"choices":[{"delta":{"content":"' + jsonEscape(contentDelta) + '"},"index":0}]}\n\n');
              }

              // Pass finish_reason through
              if (choice.finish_reason) {
                send('data: {"choices":[{"delta":{},"finish_reason":"' + choice.finish_reason + '","index":0}]}\n\n');
              }
            }
          }
        } catch (_) {
          // Upstream read error — close gracefully
        } finally {
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

  // ── Non-streaming ─────────────────────────────────────────────────────────
  let data;
  try { data = await upstreamRes.json(); }
  catch { return jsonErr(500, 'Failed to parse model response'); }

  const choice = data?.choices?.[0];
  const answerContent = choice?.message?.content ?? '';

  // Reasoning is intentionally omitted from the response
  return new Response(JSON.stringify({
    id:      'chatcmpl-' + Date.now(),
    object:  'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model:   MODEL_ID,
    choices: [
      {
        index:         0,
        message: {
          role:    'assistant',
          content: answerContent,
        },
        finish_reason: choice?.finish_reason ?? 'stop',
      },
    ],
    usage: data?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }), {
    status:  200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
