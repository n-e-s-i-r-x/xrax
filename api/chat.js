module.exports = async function handler(req, res) {
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

  const {
    messages,
    systemPrompt,
    temperature,
    maxTokens,
    model: requestedModel,
    mode
  } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const MODEL_TEXT  = 'deepseek/deepseek-v3.2';
  const MODEL_CODE  = 'z-ai/glm-5.1:exacto';
  const MODEL_IMAGE = 'google/gemini-3.1-flash-image-preview';

  const isImageMode = mode === 'image';
  let model = isImageMode ? MODEL_IMAGE : (requestedModel || MODEL_TEXT);

  const referer = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://0vai.vercel.app';

  try {
    // ── IMAGE MODE ─────────────────────────────────────────────
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
          messages: [{ role: 'user', content: lastUserMsg }],
          max_tokens: maxTokens ?? 2048,
          stream: false
        })
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('Image error:', response.status, err);
        return res.status(response.status).json({ error: err });
      }

      const data = await response.json();
      return res.status(200).json({ raw: data });
    }

    // ── TEXT / CODE MODE ───────────────────────────────────────
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
          {
            role: 'system',
            content: systemPrompt || 'You are a helpful assistant.'
          },
          ...messages
        ],
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens ?? 4096,
        stream: false
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenRouter error:', response.status, err);
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
};
