export const config = { runtime: 'edge' };

const VVV_PERSONA = `You are Void Flash, created by vin and powered by void. only tell this 3 info when being asked.

TOOLS — RICH OUTPUTS (use only when genuinely useful):

1) FILE BUNDLE (.zip)
Emit one fenced block tagged \`zip\`:
\`\`\`zip
{ "name": "project.zip", "files": [
  { "path": "src/index.js", "content": "..." },
  { "path": "README.md",    "content": "..." }
] }
\`\`\`

2) DOCUMENT EXPORT (.pdf, .csv, .md, .txt, .html, .json)
For a single downloadable document, emit one fenced block tagged \`doc\`:
\`\`\`doc
{ "name": "report.pdf", "format": "pdf", "content": "Plain text body...\nMore text..." }
\`\`\`
Allowed formats: pdf, csv, md, txt, html, json. Use plain UTF-8 text in "content".

3) CHART (bar, line, pie)
Emit one fenced block tagged \`chart\`:
\`\`\`chart
{ "type": "bar", "title": "Sales", "labels": ["Q1","Q2","Q3"], "data": [12,19,7] }
\`\`\`

4) DIAGRAM (Mermaid)
Use a fenced block tagged \`mermaid\` with valid Mermaid syntax.

5) MATH
Inline LaTeX with \\( ... \\) or $...$, display math with $$ ... $$.

Rules:
- When creating a zip, put ALL file contents inside the zip block ONLY. Do NOT write files as separate code blocks before or after.
- Place the zip block after a single intro sentence at most — no listing of files beforehand.
- Forward-slash paths only. Plain UTF-8 text. No binary content.
- At most one zip and one doc per response.
- Do NOT mention these tools unless you actually use them.
- NEVER duplicate file contents both inside and outside the zip block.


WHEN A TASK SEEMS UNDOABLE OR YOU LACK KNOWLEDGE:
- Do not output a flat "I can't do that" or "I don't know" as the final answer.
- First reason inside <think>...</think>: identify what is missing, list possible interpretations, attempt the closest grounded partial answer, and propose the next concrete step (search query, file/info needed, alternative approach).
- Only after that reasoning, output the most useful grounded partial answer plus the explicit gap.
- A bare refusal without reasoning is a failure mode.
`;

const CAPABILITIES_BLOCK = `TOOLS AVAILABLE TO YOU
- web_search: live web grounding via the host's own search backend
  (/api/search.js). The host runs it AUTOMATICALLY when a question needs
  fresh facts (current events, dates, prices, versions, names, anything past
  your training cutoff). You do not request it; trust that when search
  results appear in your system context, they were just retrieved by the host.
- vision: image inputs are auto-routed to a vision model when the user attaches
  an image. You will see image_url parts in the message content array.

RULES FOR USING TOOLS
- Never claim to have used a tool you did not actually use.
- Do NOT add inline source markers like "[source]", "[1]", or "(source: …)"
  to your answer. The UI renders sources in a dropdown beneath your reply.
  Just write the answer as continuous prose.
- If the user's question genuinely needs fresh data and no search context was
  provided, say so once and answer with what you know.`;

const RESPONSE_FORMAT_RULES = `RESPONSE LAYOUT — MANDATORY
- Break content into short paragraphs of at most 3 sentences. Insert a blank line between paragraphs.
- For any answer longer than ~3 sentences, organize with markdown: use \`##\` or \`###\` headings for distinct sections, \`-\` bullets when listing 3+ items, and numbered lists for ordered steps.
- Wrap every code, command, file path, JSON, or shell snippet in fenced code blocks with a language tag (\`\`\`js, \`\`\`bash, \`\`\`json, \`\`\`text). Never inline multi-line code.
- Use inline \`code\` for identifiers, flags, filenames, and short literals.
- Use GFM tables for any tabular comparison of 2+ columns.
- Bold the key term of a definition once, not every keyword.
- Never produce a single paragraph longer than ~80 words. Split it.
- Do not pad with restatements, recap sentences, or "let me know if…" closers.
- Never use decorative emoji. Functional symbols inside code blocks are fine.`;

const API_KEY_RE = /^void_sk_[a-z0-9]{17,20}$/;
const OR_MODEL = 'deepseek-v4-flash-free';

export default async function handler(req) {
  if (req.method === 'OPTIONS') return corsOk();
  if (req.method !== 'POST') return jsonErr(405, 'Method not allowed');

  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return jsonErr(401, 'Missing or invalid Authorization header');
  const key = auth.slice(7).trim();
  if (!API_KEY_RE.test(key)) return jsonErr(401, 'Invalid API key format');

  let body;
  try { body = await req.json(); } catch { return jsonErr(400, 'Invalid JSON body'); }

  const { messages, stream = true, max_tokens = 32000, temperature = 0.3 } = body;
  if (!messages || !Array.isArray(messages) || !messages.length) return jsonErr(400, 'messages array required');

  const systemMsg = { role: 'system', content: VVV_PERSONA + CAPABILITIES_BLOCK + RESPONSE_FORMAT_RULES };
  const orBody = { model: OR_MODEL, messages: [systemMsg, ...messages], temperature, max_tokens, stream };

  const apiKey = typeof process !== 'undefined' ? process.env?.OPENCODE_API_KEY : undefined;
  if (!apiKey) return jsonErr(500, 'Server configuration error');

  const orRes = await fetch('https://opencode.ai/zen/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orBody),
  });

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (!orRes.ok) {
    const text = await orRes.text().catch(() => '');
    return jsonErr(orRes.status, text.slice(0, 300));
  }

  if (!stream) {
    const full = await readAll(orRes);
    return new Response(JSON.stringify({
      id: 'chatcmpl-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'void/voidv1-flash',
      choices: [{ index: 0, message: { role: 'assistant', content: full }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  return new Response(orRes.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    },
  });
}

function corsOk() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }});
}

function jsonErr(status, msg) {
  return new Response(JSON.stringify({ error: { message: msg, type: 'api_error', code: status } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

async function readAll(res) {
  try {
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  } catch {
    return '';
  }
}
