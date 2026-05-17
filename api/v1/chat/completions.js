export const config = { runtime: 'edge' };

// ── Model identity (only disclosed when directly asked) ──────────────────────
const MODEL_ID   = 'void/voidv1-flash';
const MODEL_NAME = 'Void V1 Flash';
const MODEL_DESC = 'Advanced high-reasoning mode of Void V1 Flash featuring 284B total parameters with 13B active parameters, optimized for deeper thinking, coding, planning, and complex agent workflows with up to 1M token context.';

// ── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Void Flash, created by vin and powered by void. Only share this when directly asked.

You are an advanced AI assistant designed to be helpful, harmless, and honest. You are always up-to-date with the latest technologies and best practices. You aim to deliver clear, efficient, concise, and innovative solutions while maintaining a friendly and approachable demeanor.

RESPONSE FORMAT - MANDATORY:
- Break content into short paragraphs of at most 3 sentences. Insert a blank line between paragraphs.
- For answers longer than ~3 sentences, use markdown: ## or ### headings for sections, - bullets for 3+ items, numbered lists for ordered steps.
- Wrap all code, commands, file paths, or shell snippets in fenced code blocks with a language tag. Never inline multi-line code.
- Use inline code for identifiers, flags, filenames, and short literals.
- Bold the key term of a definition once, not every keyword.
- Never produce a single paragraph longer than ~80 words. Split it.
- Do not pad with restatements or "let me know if you need anything" closers.`;

// ── Constants ────────────────────────────────────────────────────────────────
const API_KEY_RE   = /^void_sk_[a-z0-9]{17,20}$/;
const UPSTREAM_ID  = 'deepseek-v4-flash-free';
const UPSTREAM_URL = 'https://opencode.ai/zen/v1/chat/completions';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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
  } = body;

  if (!messages || !Array.isArray(messages) || !messages.length)
    return jsonErr(400, 'messages array required');

  // Build upstream payload — pass tool calls + structured output through
  const upstreamBody = {
    model:       UPSTREAM_ID,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    temperature,
    max_tokens,
    stream,
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

  // ── Error handling — never leak upstream messages ─────────────────────────
  if (!upstreamRes.ok) {
    const status = upstreamRes.status;
    return jsonErr(status, upstreamErrorToVoid(status));
  }

  // ── Streaming ─────────────────────────────────────────────────────────────
  if (stream) {
    return new Response(upstreamRes.body, {
      status:  200,
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

  return new Response(JSON.stringify({
    id:      'chatcmpl-' + Date.now(),
    object:  'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model:   MODEL_ID,
    choices: [
      {
        index:         0,
        message:       choice?.message ?? { role: 'assistant', content: '' },
        finish_reason: choice?.finish_reason ?? 'stop',
      },
    ],
    usage: data?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }), {
    status:  200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
