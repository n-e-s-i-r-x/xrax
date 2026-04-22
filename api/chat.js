export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { messages, systemPrompt } = await req.json();
  const apiKey = process.env.OPENROUTER_API_KEY;

  const trimmedMessages = messages.slice(-4); // 🔥 VERY aggressive

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // ⚡ 1. INSTANT RESPONSE (0ms perceived latency)
      controller.enqueue(
        encoder.encode(`data: {"choices":[{"delta":{"content":"..."}}]}\n\n`)
      );

      // ⚡ 2. CALL MODEL (fastest available)
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini', // 🔥 key change
          messages: [
            { role: 'system', content: systemPrompt || 'Be short and fast.' },
            ...trimmedMessages
          ],
          temperature: 0.3, // 🔥 lower = faster + more deterministic
          max_tokens: 99999999,  // 🔥 shorter = faster
          stream: true
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            controller.enqueue(encoder.encode(line + '\n\n'));
          }
        }
      }

      // ⚡ 3. DONE SIGNAL
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
