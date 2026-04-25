export const config = { runtime: 'edge' };

/* ══════════════════════════════════════
   IMAGE GENERATION — OpenRouter
   Model: black-forest-labs/FLUX-1-schnell
   No filters, no censorship.
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
    const res = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://0vai.vercel.app',
        'X-Title': '0vAI',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX-1-schnell',
        prompt: prompt.trim(),
        n: 1,
        size: '1024x1024',
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
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
    const item = data?.data?.[0];
    if (!item) {
      return new Response(JSON.stringify({ error: 'No image returned from API.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // OpenRouter returns either a URL or base64
    const url = item.url
      ? item.url
      : item.b64_json
        ? `data:image/png;base64,${item.b64_json}`
        : null;

    if (!url) {
      return new Response(JSON.stringify({ error: 'No image URL in response.' }), {
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
