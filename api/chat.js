export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { messages, systemPrompt } = await req.json();
  const apiKey = process.env.OPENROUTER_API_KEY;

  const encoder = new TextEncoder();
  const trimmedMessages = messages.slice(-5);

  const stream = new ReadableStream({
    async start(controller) {
      // ⚡ instant response (UI unlock)
      controller.enqueue(encoder.encode(' '));

      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // 🧠 YOUR MODEL (UNCHANGED)
            model: 'openai/gpt-5.1-codex-mini',

            messages: [
              { role: 'system', content: systemPrompt || 'Be short and fast.' },
              ...trimmedMessages,
            ],

            temperature: 0.2,
            max_tokens: 400,
            stream: true,
          }),
        }
      );

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value);

        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);

          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            const token = json?.choices?.[0]?.delta?.content;

            if (token) {
              controller.enqueue(encoder.encode(token));
            }
          } catch {}
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
