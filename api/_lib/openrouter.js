// OpenRouter chat completions wrapper.
import { fetchWithRetry } from './http.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export function openrouterHeaders(apiKey, { referer = 'https://0vai.vercel.app', title = '0vAI' } = {}) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type':  'application/json',
    'HTTP-Referer':  referer,
    'X-Title':       title,
  };
}

export function callOpenRouter(apiKey, body, { retries = 4 } = {}) {
  return fetchWithRetry(ENDPOINT, {
    method:  'POST',
    headers: openrouterHeaders(apiKey),
    body:    JSON.stringify(body),
  }, retries);
}
