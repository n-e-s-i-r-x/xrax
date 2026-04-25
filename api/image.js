export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;
  const apiKey = process.env.REPLICATE_API_TOKEN;

  if (!apiKey) {
    return res.status(500).json({ error: 'REPLICATE_API_TOKEN not set' });
  }

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'No prompt provided' });
  }

  try {
    // Start prediction
    const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({
        input: {
          prompt: prompt.trim(),
          num_outputs: 1,
          aspect_ratio: '1:1',
          output_format: 'webp',
          output_quality: 90,
        },
      }),
    });

    if (!createRes.ok) {
      const status = createRes.status;
      if (status === 401) return res.status(401).json({ error: 'Invalid Replicate API token' });
      if (status === 402) return res.status(402).json({ error: 'Replicate account out of credits' });
      if (status === 422) return res.status(422).json({ error: 'Invalid input parameters' });
      if (status === 429) return res.status(429).json({ error: 'Rate limited — slow down' });
      const errText = await createRes.text();
      return res.status(status).json({ error: `Replicate error ${status}: ${errText}` });
    }

    const prediction = await createRes.json();

    // With Prefer: wait, prediction should be completed already
    if (prediction.status === 'succeeded' && prediction.output) {
      const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      return res.status(200).json({ url: imageUrl });
    }

    // If not done yet (shouldn't happen with Prefer: wait, but fallback poll)
    if (prediction.status === 'processing' || prediction.status === 'starting') {
      let result = prediction;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        result = await pollRes.json();
        if (result.status === 'succeeded') {
          const imageUrl = Array.isArray(result.output) ? result.output[0] : result.output;
          return res.status(200).json({ url: imageUrl });
        }
        if (result.status === 'failed' || result.status === 'canceled') {
          return res.status(500).json({ error: result.error || 'Prediction failed' });
        }
      }
      return res.status(504).json({ error: 'Timed out waiting for image' });
    }

    if (prediction.status === 'failed') {
      return res.status(500).json({ error: prediction.error || 'Prediction failed' });
    }

    return res.status(500).json({ error: 'Unexpected prediction state', status: prediction.status });

  } catch (err) {
    console.error('Image generation error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
