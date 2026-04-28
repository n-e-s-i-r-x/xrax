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

  let audioResp;
  let lastErr = null;

  // Retry up to 3 times — Pollinations can be slow to spin up generation
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, attempt * 4000));
      }
      audioResp = await fetch(audioUrl, {
        method: 'GET',
        headers: {
          'Accept': 'audio/mpeg, audio/*',
          'User-Agent': '0vAi/1.0',
        },
        // Edge runtime supports signal for timeout
        signal: AbortSignal.timeout(60000),
      });
      if (audioResp.ok) break;
      lastErr = new Error('Pollinations returned ' + audioResp.status);
      audioResp = null;
    } catch (err) {
      lastErr = err;
      audioResp = null;
    }
  }

  if (!audioResp || !audioResp.ok) {
    return new Response(
      (lastErr?.message) || 'Music generation failed',
      { status: 502 }
    );
  }

  const contentType = audioResp.headers.get('content-type') || 'audio/mpeg';
  const audioBuffer = await audioResp.arrayBuffer();

  if (!audioBuffer || audioBuffer.byteLength < 200) {
    return new Response('Empty audio from provider', { status: 502 });
  }

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
