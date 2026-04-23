export const config = { runtime: 'edge' };

const MODEL_MAP = {
  '0':   'tencent/hy3-preview:free',
  '00':  'google/gemma-4-26b-a4b-it:free',
  '000': 'inclusionai/ling-2.6-flash:free',
};

// ─── System prompts per model ─────────────────────────────────────────────────
// Add your system prompts here. Leave blank and they'll default to "Be helpful."
const SYSTEM_PROMPTS = {
  '0':   ``,
  '00':  ``,
  '000': ``,
};
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const {
    messages,
    systemPrompt: extraCtx,
    temperature = 0.5,
    model: modelKey = '0',
  } = await req.json();

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return new Response(
      'data: {"choices":[{"delta":{"content":"Missing API key"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  const modelId = MODEL_MAP[modelKey] || MODEL_MAP['0'];

  // Build final system prompt:
  // 1. Model's own system prompt (from SYSTEM_PROMPTS)
  // 2. Extra context injected from frontend (date/time, search results, code mode, etc.)
  const basePrompt = SYSTEM_PROMPTS[modelKey] || SYSTEM_PROMPTS['0'] || '';
  const finalSystemPrompt = [basePrompt, extraCtx].filter(Boolean).join('\n\n') || 'Be helpful.';

  const trimmed = messages.slice(-20);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (d) => controller.enqueue(encoder.encode(d));
      let upstreamRes;
      try {
        upstreamRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://your-site.com',
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: 'system', content: finalSystemPrompt },
              ...trimmed,
            ],
            temperature,
            max_tokens: maxTokens,
            stream: true,
          }),
        });
      } catch (err) {
        send(`data: {"choices":[{"delta":{"content":"[Network error: ${err.message}]"},"finish_reason":"stop"}]}\n\n`);
        send('data: [DONE]\n\n');
        controller.close();
        return;
      }

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text().catch(() => 'Unknown error');
        send(`data: {"choices":[{"delta":{"content":"[API error ${upstreamRes.status}: ${errText.slice(0, 200)}]"},"finish_reason":"stop"}]}\n\n`);
        send('data: [DONE]\n\n');
        controller.close();
        return;
      }

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.trim()) {
              for (const line of buffer.split('\n')) {
                if (line.startsWith('data: ')) send(line + '\n\n');
              }
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data: ')) send(line + '\n\n');
          }
        }
      } catch (e) {}
      send('data: [DONE]\n\n');
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
