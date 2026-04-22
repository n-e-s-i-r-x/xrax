export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { messages, systemPrompt } = await req.json();
  const apiKey = process.env.OPENROUTER_API_KEY;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // ⚡ USE A CONFIRMED MODEL FIRST
      model: 'openai/gpt-4o-mini',

      messages: [
        { role: 'system', content: systemPrompt || 'Be short.' },
        ...messages.slice(-6),
      ],

      temperature: 0.2,
      max_tokens: 400,
      stream: true,
    }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';

  return new Response(
    new ReadableStream({
      async start(controller) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            const data = line.replace('data: ', '');

            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data);
              const token = json?.choices?.[0]?.delta?.content;

              if (token) controller.enqueue(new TextEncoder().encode(token));
            } catch {
              // ignore broken chunks safely
            }
          }
        }

        controller.close();
      },
    }),
    {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache',
      },
    }
  );
}
