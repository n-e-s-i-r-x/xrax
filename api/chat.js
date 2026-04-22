export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { messages, systemPrompt, temperature, maxTokens, model: requestedModel, mode } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Model routing
  const MODEL_TEXT  = 'deepseek/deepseek-v3-2';
  const MODEL_CODE  = 'z-ai/glm-5.1:exacto';
  const MODEL_IMAGE = 'google/gemini-2.0-flash-exp:free'; // image-capable

  let model = requestedModel || MODEL_TEXT;

  // Image generation mode — use multimodal image model
  const isImageMode = mode === 'image';
  if (isImageMode) {
    model = 'google/gemini-3.1-flash-image-preview';
  }

  const referer = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://0vai.vercel.app';

  try {
    // Image generation: non-streaming, returns image data
    if (isImageMode) {
      const lastUserMsg = messages[messages.length - 1]?.content || '';
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-Title': '0v AI'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'user', content: lastUserMsg }
          ],
          max_tokens: 2048,
          stream: false,
        })
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('OpenRouter image error:', response.status, err);
        return res.status(response.status).json({ error: err });
      }

      const data = await response.json();
      // Check for image in response content
      const content = data.choices?.[0]?.message?.content;
      return res.status(200).json({ imageResponse: content, raw: data });
    }

    // Text/Code streaming
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': referer,
        'X-Title': '0v AI'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
          ...messages
        ],
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens ?? 4096,
        stream: true,
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenRouter error:', response.status, err);
      return res.status(response.status).json({ error: err });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            res.write(line + '\n\n');
          }
        }
      }
    } catch (streamErr) {
      console.error('Stream error:', streamErr);
    }
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
