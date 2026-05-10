// HTTP retry with exponential backoff. Honours Retry-After on 429.
import { sleep } from './sse.js';

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function fetchWithRetry(url, options, maxRetries = 4) {
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (networkErr) {
      lastErr = networkErr;
      if (attempt === maxRetries) throw networkErr;
      await sleep(backoff(attempt, 1000, 16000));
      continue;
    }

    if (res.ok) return res;
    if (!RETRYABLE.has(res.status)) return res;

    const delay = res.status === 429
      ? retryAfter(res, attempt)
      : backoff(attempt, 1000, 16000);

    try { await res.text(); } catch { /* drain */ }
    if (attempt === maxRetries) return new Response(null, { status: res.status });
    await sleep(delay);
  }
  throw lastErr || new Error('fetchWithRetry: exhausted');
}

function backoff(attempt, base, cap) {
  return Math.min(base * Math.pow(2, attempt) + Math.random() * (base / 2), cap);
}

function retryAfter(res, attempt) {
  const header = res.headers.get('Retry-After') || res.headers.get('X-RateLimit-Reset-After');
  if (header) {
    const seconds = parseFloat(header);
    if (!isNaN(seconds)) return Math.min(seconds * 1000, 30000);
  }
  return backoff(attempt, 2000, 30000);
}
