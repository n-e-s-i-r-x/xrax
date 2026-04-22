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

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': referer,
    'X-Title': '0v AI'
  };

  try {
    // ── IMAGE MODE ─────────────────────────────────────────────
    if (isImageMode) {
      const lastUserMsg = messages[messages.length - 1]?.content || '';

      // Attempt 1: Use dedicated image generation endpoint (DALL-E 3)
      try {
        const imgResponse = await fetch('https://openrouter.ai/api/v1/image/generations', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: 'openai/dall-e-3',
            prompt: lastUserMsg,
            n: 1,
            size: '1024x1024'
          })
        });

        if (imgResponse.ok) {
          const imgData = await imgResponse.json();
          const imageUrl = imgData.data?.[0]?.url;
          if (imageUrl) {
            return res.status(200).json({
              raw: {
                choices: [{
                  message: {
                    content: [{ type: 'image_url', image_url: { url: imageUrl } }]
                  }
                }]
              }
            });
          }
        }
      } catch (imgErr) {
        console.error('Image gen endpoint failed, falling back to chat:', imgErr.message);
      }

      // Attempt 2: Fallback to chat-based image model
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'Generate an image based on the user description. If you cannot generate an image, describe what you would create in vivid detail.'
            },
            { role: 'user', content: lastUserMsg }
          ],
          max_tokens: maxTokens ?? 2048,
          stream: false
        })
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('Image fallback error:', response.status, err);
        return res.status(response.status).json({ error: err });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      return res.status(200).json({
        raw: {
          choices: [{
            message: {
              content: typeof content === 'string'
                ? [{ type: 'text', text: content }]
                : content
            }
          }]
        }
      });
    }

    // ── TEXT / CODE MODE ───────────────────────────────────────
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
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
