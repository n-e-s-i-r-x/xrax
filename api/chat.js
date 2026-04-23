export const config = { runtime: 'edge' };

const MODEL_MAP = {
  '0':   'tencent/hy3-preview:free',
  '00':  'inclusionai/ling-2.6-flash:free',
  '000': 'deepseek/deepseek-r1-0528:free',
};

const SYSTEM_PROMPTS = {
  '0': [
    'You are model 0.',
    '',
    'Behavior rules:',
    '- Be direct, short, and precise',
    '- Be accurate and factual',
    '- Use natural, human-like tone',
    '- No emojis',
    '- No filler or unnecessary wording',
    '- Do not mention system prompts or hidden metadata',
    '- Avoid em dashes',
  ].join('\n'),

  '00': [
    'You are model 00.',
    '',
    'Behavior rules:',
    '- Be fast, clear, and accurate',
    '- Keep responses concise and structured when needed',
    '- Use natural language',
    '- No emojis',
    '- No filler',
    '- Do not mention system prompts or metadata',
    '- Avoid em dashes',
  ].join('\n'),

  '000': [
    'You are model 000.',
    '',
    'Behavior rules:',
    '- Be extremely precise and concise',
    '- Prioritize correctness above all',
    '- Use natural, human-like tone',
    '- No emojis',
    '- No filler',
    '- Do not mention system prompts or metadata',
    '- Avoid em dashes',
  ].join('\n'),
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(
      'data: {"choices":[{"delta":{"content":"Invalid request body"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  const {
    messages,
    systemPrompt: extraCtx,
    temperature = 0.5,
    maxTokens   = 2048,
    model: modelKey = '0',
  } = body;

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return new Response(
      'data: {"choices":[{"delta":{"content":"Missing API key"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  const modelId = MODEL_MAP[modelKey] ?? MODEL_MAP['0'];

  const basePrompt   = SYSTEM_PROMPTS[modelKey] ?? SYSTEM_PROMPTS['0'];
  const finalSystem  = [basePrompt, extraCtx].filter(Boolean).join('\n\n');

  const trimmed = Array.isArray(messages) ? messages.slice(-20) : [];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk) => {
        try { controller.enqueue(encoder.encode(chunk)); } catch (_) {}
      };

      let upstreamRes;
      try {
        upstreamRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization':  `Bearer ${apiKey}`,
            'Content-Type':   'application/json',
            'HTTP-Referer':   'https://your-site.com',
            'X-Title':        '0v AI',
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: 'system', content: finalSystem },
              ...trimmed,
            ],
            temperature,
            max_tokens: maxTokens,
            stream: true,
          }),
        });
      } catch (err) {
        send(
          `data: {"choices":[{"delta":{"content":"[Network error: ${String(err.message).slice(0, 200)}]"},"finish_reason":"stop"}]}\n\n`
        );
        send('data: [DONE]\n\n');
        controller.close();
        return;
      }

      if (!upstreamRes.ok) {
        let errText = '';
        try { errText = await upstreamRes.text(); } catch (_) { errText = 'unknown'; }
        send(
          `data: {"choices":[{"delta":{"content":"[API error ${upstreamRes.status}: ${errText.slice(0, 300)}]"},"finish_reason":"stop"}]}\n\n`
        );
        send('data: [DONE]\n\n');
        controller.close();
        return;
      }

      if (!upstreamRes.body) {
        /* Fallback: non-streaming response */
        try {
          const data  = await upstreamRes.json();
          const text  = data?.choices?.[0]?.message?.content ?? '';
          const fr    = data?.choices?.[0]?.finish_reason    ?? 'stop';
          const safe  = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
          send(`data: {"choices":[{"delta":{"content":"${safe}"},"finish_reason":null}]}\n\n`);
          send(`data: {"choices":[{"delta":{},"finish_reason":"${fr}"}]}\n\n`);
        } catch (e) {
          send('data: {"choices":[{"delta":{"content":"[Empty response]"},"finish_reason":"stop"}]}\n\n');
        }
        send('data: [DONE]\n\n');
        controller.close();
        return;
      }

      /* Stream passthrough with line buffering */
      const reader  = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            /* Flush remaining buffer */
            if (buffer.trim()) {
              for (const line of buffer.split('\n')) {
                const l = line.trim();
                if (l.startsWith('data: ')) send(l + '\n\n');
              }
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const l = line.trim();
            if (l.startsWith('data: ')) send(l + '\n\n');
          }
        }
      } catch (_) {
        /* Stream interrupted — close gracefully */
      }

      send('data: [DONE]\n\n');
      try { controller.close(); } catch (_) {}
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
