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

  const encodedPrompt = encodeURIComponent(prompt);
  const audioUrl = `https://audio.pollinations.ai/${encodedPrompt}`;

  async function tryFetch() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const resp = await fetch(audioUrl, {
        method: 'GET',
        headers: {
          'Accept': 'audio/mpeg, audio/*',
          'User-Agent': 'Mozilla/5.0',
        },
        signal: controller.signal,
      });
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
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, attempt * 5000));
      }
      const resp = await tryFetch();
      if (resp.ok) {
        audioResp = resp;
        break;
      }
      lastErr = new Error('Provider returned ' + resp.status);
    } catch (err) {
      lastErr = err;
    }
  }

  if (!audioResp) {
    const msg = lastErr?.name === 'AbortError'
      ? 'Music generation timed out — try a shorter prompt'
      : (lastErr?.message || 'Music generation failed');
    return new Response(msg, { status: 502 });
  }

  let audioBuffer;
  try {
    audioBuffer = await audioResp.arrayBuffer();
  } catch (err) {
    return new Response('Failed to read audio data', { status: 502 });
  }

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
