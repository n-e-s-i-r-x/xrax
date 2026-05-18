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
//
// Strategy: buffer the ENTIRE reasoning string, then:
//   1. Detect and remove any block where the model reflects on formatting rules,
//      identity instructions, or system-prompt-style content.
//   2. Remove markdown symbols that don't belong in plain reasoning prose.
//   3. Fix broken spacing (tokens jammed together or split mid-word).
//   4. Collapse noise lines.
//
// We do this on the complete string (non-streaming) and on a rolling buffer
// that we flush sentence-by-sentence in the streaming path.

// Patterns that indicate the model is narrating the system prompt back
const SYSTEM_REFLECTION_PATTERNS = [
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
  /let'?s\s*(?:check|refine|gently|revise)/i,
  /revised\s*draft/i,
  /over.?zealous/i,
];

// Remove a numbered or bulleted list item line if it contains a reflection pattern
function sanitizeReasoningLine(line) {
  for (const pat of SYSTEM_REFLECTION_PATTERNS) {
    if (pat.test(line)) return null; // drop this line
  }
  return line;
}

// Full sanitize pass on a complete reasoning string
function sanitizeReasoning(raw) {
  // Split into lines, filter reflection lines, rejoin
  const lines = raw.split('\n');
  const kept = [];
  let skipIndentBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect a numbered/bulleted section header that is a reflection trigger
    const isReflectionHeader = SYSTEM_REFLECTION_PATTERNS.some(p => p.test(line));
    if (isReflectionHeader) {
      skipIndentBlock = true;
      continue;
    }

    // If we were skipping an indented block under a reflection header, continue
    // skipping until we hit a non-indented, non-empty line that starts a new section
    if (skipIndentBlock) {
      const trimmed = line.trim();
      // A new numbered item or a non-indented non-empty line ends the skip block
      if (/^\d+\./.test(trimmed) || (trimmed.length > 0 && !/^\s/.test(line) && !/^[\s\-\*]/.test(line))) {
        skipIndentBlock = false;
        // Don't skip this line — fall through to normal processing
      } else {
        continue;
      }
    }

    // Line-level reflection check
    const cleaned = sanitizeReasoningLine(line);
    if (cleaned === null) continue;

    kept.push(cleaned);
  }

  let result = kept.join('\n');

  // Strip markdown formatting symbols
  result = result
    .replace(/\*{1,3}([^*\n]*)\*{1,3}/g, '$1')   // bold/italic → plain
    .replace(/^#{1,6}\s*/gm, '')                   // headings
    .replace(/`{1,3}/g, '')                        // backticks
    .replace(/<[^>]{0,80}>/g, '')                  // html/xml tags
    .replace(/\[[^\]]{0,200}\]\([^)]*\)/g, '')     // markdown links
    .replace(/\[[^\]]{0,200}\]/g, '');             // bare brackets

  // Fix spacing artifacts: letters jammed together across token boundaries
  // e.g. "Analy ze" → "Analyze", "V oid" → "Void"
  // Strategy: collapse single spaces between letters that form common patterns
  result = result
    .replace(/([A-Za-z])\s([a-z]{1,3})\b/g, (m, a, b) => {
      // Only collapse if the combined word looks like a real word split
      // Heuristic: if the second part is very short (1-3 chars) and lowercase
      // and follows a capital or lowercase letter, it's likely a split token
      return a + b;
    })
    // Fix "V oid" → "Void" style (capital + space + lowercase continuation)
    .replace(/\b([A-Z])\s([a-z]+)/g, '$1$2');

  // Collapse 3+ blank lines to 2
  result = result.replace(/\n{3,}/g, '\n\n');

  // Remove lines that are just punctuation/symbols with no content
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

  if (!upstreamRes.ok) {
    return jsonErr(upstreamRes.status, upstreamErrorToVoid(upstreamRes.status));
  }

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

        // Buffer ALL reasoning, sanitize and emit only after reasoning is done
        let reasoningBuf = '';
        let reasoningDone = false;
        let thinkOpen = false;

        const send = (data) => { try { controller.enqueue(enc.encode(data)); } catch (_) {} };

        const flushReasoning = () => {
          if (!reasoningBuf) return;
          const cleaned = sanitizeReasoning(reasoningBuf);
          if (cleaned) {
            send('data: {"choices":[{"delta":{"content":"<thinking>\\n"},"index":0}]}\n\n');
            // Send in one shot so sanitization works on the full string
            send('data: {"choices":[{"delta":{"content":"' + jsonEscape(cleaned) + '"},"index":0}]}\n\n');
            send('data: {"choices":[{"delta":{"content":"\\n</thinking>\\n"},"index":0}]}\n\n');
          }
          reasoningBuf = '';
          reasoningDone = true;
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
                if (!reasoningDone) flushReasoning();
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

              // Accumulate reasoning into buffer — don't emit yet
              if (reasoningDelta) {
                reasoningBuf += reasoningDelta;
              }

              // When content starts, reasoning is done — flush sanitized reasoning first
              if (contentDelta) {
                if (!reasoningDone) flushReasoning();
                send('data: {"choices":[{"delta":{"content":"' + jsonEscape(contentDelta) + '"},"index":0}]}\n\n');
              }

              if (choice.finish_reason) {
                if (!reasoningDone) flushReasoning();
                send('data: {"choices":[{"delta":{},"finish_reason":"' + choice.finish_reason + '","index":0}]}\n\n');
              }
            }
          }
        } catch (_) {
          // Upstream read error — close gracefully
        } finally {
          if (!reasoningDone) flushReasoning();
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
