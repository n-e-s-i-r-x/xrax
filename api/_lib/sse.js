// Server-Sent Events helpers and small HTTP utilities.

export function jsonEscape(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

export function sseContent(text) {
  return `data: {"choices":[{"delta":{"content":"${jsonEscape(text)}"},"finish_reason":null}]}\n\n`;
}

export function sseFinish(reason = 'stop') {
  return `data: {"choices":[{"delta":{},"finish_reason":"${reason}"}]}\n\n`;
}

export const SSE_DONE = 'data: [DONE]\n\n';

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
};

export function genericError(status) {
  if (status === 401 || status === 403) return 'Authentication failed. Check your API key.';
  if (status === 429)                   return 'Rate limited. The service is busy — please wait a moment and try again.';
  if (status === 402)                   return 'Out of credits. Please add funds to your OpenRouter account.';
  if (status >= 500)                    return 'Upstream service unavailable. Please try again in a moment.';
  return 'Request failed. Please try again.';
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
