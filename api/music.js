export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let prompt = '';
  try {
    const body = await req.json();
    prompt = (body.prompt || '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
  } catch (_) {
    return new Response('Invalid request body', { status: 400 });
  }

  if (!prompt) {
    return new Response('Missing prompt', { status: 400 });
  }

  // Correct Pollinations audio endpoint per their API docs
  const apiUrl = 'https://audio.api.pollinations.ai/generateAudio';

  async function tryFetch(url, opts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const resp = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timer);
      return resp;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  let audioResp = null;
  let lastErr = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 4000));

      const resp = await tryFetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: 'musicgen-medium',
          duration: 15,
        }),
      });

      if (resp.ok) { audioResp = resp; break; }
      lastErr = new Error('Provider returned ' + resp.status + ': ' + await resp.text().catch(() => ''));
    } catch (err) {
      lastErr = err;
    }
  }

  if (!audioResp) {
    const msg = lastErr?.name === 'AbortError'
      ? 'Music generation timed out'
      : (lastErr?.message || 'Music generation failed');
    return new Response(msg, { status: 502 });
  }

  let audioBuffer;
  try { audioBuffer = await audioResp.arrayBuffer(); }
  catch (err) { return new Response('Failed to read audio data', { status: 502 }); }

  if (!audioBuffer || audioBuffer.byteLength < 200) {
    return new Response('Empty audio from provider', { status: 502 });
  }

  const contentType = audioResp.headers.get('content-type') || 'audio/mpeg';

  return new Response(audioBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(audioBuffer.byteLength),
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
