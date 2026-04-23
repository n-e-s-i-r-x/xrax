export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { messages, systemPrompt, temperature = 0.7, maxTokens = 4096 } = await req.json();
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return new Response('data: {"error":"Missing API key"}\n\ndata: [DONE]\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  // Keep last 20 messages (10 turns) — aggressive but not destructive
  const trimmedMessages = messages.slice(-20);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => controller.enqueue(encoder.encode(data));

      let upstreamRes;
      try {
        upstreamRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://your-site.com', // helps OpenRouter routing
          },
          body: JSON.stringify({
            model: 'nvidia/nemotron-nano-9b-v2:free',
            messages: [
              { role: 'system', content: systemPrompt || 'Be helpful.' },
              ...trimmedMessages,
            ],
            temperature,
            max_tokens: maxTokens, // use what the frontend sends (default 4096)
            stream: true,
          }),
        });
      } catch (err) {
        send(`data: {"choices":[{"delta":{"content":"[Network error: ${err.message}]"},"finish_reason":"stop"}]}\n\n`);
        send('data: [DONE]\n\n');
        controller.close();
        return;
      }

      // Forward upstream errors as a readable message
      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text().catch(() => 'Unknown error');
        send(`data: {"choices":[{"delta":{"content":"[API error ${upstreamRes.status}: ${errText.slice(0,200)}]"},"finish_reason":"stop"}]}\n\n`);
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
            // Flush any remaining buffer content
            if (buffer.trim()) {
              for (const line of buffer.split('\n')) {
                if (line.startsWith('data: ')) send(line + '\n\n');
              }
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ''; // last item may be incomplete

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              send(line + '\n\n');
            }
          }
        }
      } catch (err) {
        // Stream read error — send what we have and close cleanly
      }

      send('data: [DONE]\n\n');
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // prevents Nginx from buffering SSE
    },
  });
}
