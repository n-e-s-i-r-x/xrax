export const config = { runtime: 'edge' };

/* ══════════════════════════════════════
   IMAGE GENERATION — OpenRouter
   Model: black-forest-labs/FLUX-1-schnell
   Uses /chat/completions with modalities (correct OpenRouter image API)
══════════════════════════════════════ */

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try { body = await req.json(); }
  catch (_) {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { prompt } = body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return new Response(JSON.stringify({ error: 'Missing prompt.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey =
    (typeof process !== 'undefined' ? process.env?.OPENROUTER_API_KEY : undefined) ??
    (typeof globalThis !== 'undefined' ? globalThis.OPENROUTER_API_KEY : undefined);

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing API key.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // OpenRouter image generation uses /chat/completions with modalities, NOT /images/generations
    // flux.2-flex is image-only output so modalities must be ["image"] not ["image","text"]
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://0vai.vercel.app',
        'X-Title': '0vAI',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux.2-flex',
        modalities: ['image'],
        messages: [{ role: 'user', content: prompt.trim() }],
      }),
    });

    if (!res.ok) {
      let msg = `Image API error ${res.status}`;
      if (res.status === 401 || res.status === 403) msg = 'Authentication failed. Check your API key.';
      else if (res.status === 429) msg = 'Rate limited. Please wait a moment and try again.';
      else if (res.status === 402) msg = 'Out of credits. Please add funds to your OpenRouter account.';
      else if (res.status >= 500) msg = 'Upstream service unavailable. Please try again.';
      return new Response(JSON.stringify({ error: msg }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();

    // Per OpenRouter docs: images are at choices[0].message.images[].image_url.url
    const images = data?.choices?.[0]?.message?.images;
    const content = data?.choices?.[0]?.message?.content;

    let url = null;

    if (Array.isArray(images) && images.length > 0) {
      // Official format: images[].image_url.url
      url = images[0]?.image_url?.url || images[0]?.url || null;
    } else if (Array.isArray(content)) {
      const imgPart = content.find(p => p.type === 'image_url');
      url = imgPart?.image_url?.url || null;
    } else if (typeof content === 'string' && content.startsWith('data:image')) {
      url = content;
    }

    if (!url) {
      return new Response(JSON.stringify({ error: 'No image returned from API.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Network error. Please try again.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
