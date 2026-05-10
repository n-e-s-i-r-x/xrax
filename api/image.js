export const config = { runtime: 'edge' };

/* image.js — Google Gemini image generation with dynamic model fallback.
   Response shape preserved for UI compat: { url } on success, { error } on fail. */

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

// Models that actually support image generation output (responseModalities: IMAGE)
const GEMINI_IMAGE_MODELS = [
  'gemini-2.0-flash-preview-image-generation',
  'gemini-2.0-flash-exp-image-generation',
  'imagen-3.0-generate-002',
  'imagen-3.0-generate-001',
  'imagen-3.0-fast-generate-001',
];

// Errors that should trigger a model switch vs hard-fail
const shouldFallback = (status, body) => {
  if (status === 429) return true;   // rate limited on this model
  if (status === 503) return true;   // model unavailable
  if (status === 404) return true;   // model not found / not enabled
  if (status === 400 && body && /not supported|unavailable|invalid model/i.test(body)) return true;
  return false;
};

const errMsg = (status) => {
  if (status === 401 || status === 403) return 'Authentication failed. Check your Gemini API key.';
  if (status === 429) return 'Rate limited across all models. Please wait a moment and try again.';
  if (status === 402) return 'Quota exceeded on your Gemini account.';
  if (status >= 500) return 'Gemini service unavailable. Please try again.';
  return `Image API error ${status}`;
};

async function tryGeminiModel(apiKey, model, prompt, signal) {
  const isImagen = model.startsWith('imagen-');

  let url, bodyPayload;

  if (isImagen) {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;
    bodyPayload = {
      instances: [{ prompt }],
      parameters: { sampleCount: 1 },
    };
  } else {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    bodyPayload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload),
    signal,
  });

  const bodyText = await res.text();

  if (!res.ok) {
    return { ok: false, status: res.status, body: bodyText, fallback: shouldFallback(res.status, bodyText) };
  }

  let data;
  try { data = JSON.parse(bodyText); } catch (_) {
    return { ok: false, status: 200, body: 'Invalid JSON response', fallback: false };
  }

  let dataUrl = null;

  if (isImagen) {
    // Imagen response: predictions[0].bytesBase64Encoded
    const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
    const mime = data?.predictions?.[0]?.mimeType || 'image/png';
    if (b64) dataUrl = `data:${mime};base64,${b64}`;
  } else {
    // Gemini response: candidates[0].content.parts[].inlineData
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (imagePart) {
      const mime = imagePart.inlineData.mimeType || 'image/png';
      dataUrl = `data:${mime};base64,${imagePart.inlineData.data}`;
    }
  }

  if (!dataUrl) {
    return { ok: false, status: 200, body: 'No image in response', fallback: true };
  }

  return { ok: true, url: dataUrl, model };
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch (_) { return json({ error: 'Invalid request body.' }, 400); }

  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return json({ error: 'Missing prompt.' }, 400);
  if (prompt.length > 4000) return json({ error: 'Prompt is too long (max 4000 chars).' }, 400);

  const apiKey = (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined)
              ?? (typeof globalThis !== 'undefined' ? globalThis.GEMINI_API_KEY : undefined);
  if (!apiKey) return json({ error: 'Image generation is not configured.' }, 200);

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 60000);

  try {
    let lastError = 'No models available.';

    for (const model of GEMINI_IMAGE_MODELS) {
      let result;
      try {
        result = await tryGeminiModel(apiKey, model, prompt, ctrl.signal);
      } catch (err) {
        if (err?.name === 'AbortError') {
          return json({ error: 'Image generation timed out. Try again.' }, 200);
        }
        // Network error on this model — try next
        lastError = 'Network error on model ' + model;
        continue;
      }

      if (result.ok) {
        return json({ url: result.url, model: result.model }, 200);
      }

      if (result.fallback) {
        // Try next model
        lastError = errMsg(result.status);
        continue;
      }

      // Hard failure (auth, bad request, etc.) — don't try more models
      let detail = '';
      try { detail = result.body?.slice(0, 200); } catch (_) {}
      return json({ error: errMsg(result.status) + (detail ? ` (${detail})` : '') }, 200);
    }

    // All models exhausted
    return json({ error: lastError || 'All image models are currently unavailable. Please try again later.' }, 200);

  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return json({ error: aborted ? 'Image generation timed out. Try again.' : 'Network error. Please try again.' }, 200);
  } finally {
    clearTimeout(timeoutId);
  }
}
