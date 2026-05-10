// System-prompt leak detection and <think>-stream sanitisation.

const LEAK_LINE_PATTERNS = [
  /^\s*\[[A-Z][^\]]{2,120}\]\s*$/,
  /---\s*WEB SEARCH RESULTS\s*---/i,
  /---\s*END SEARCH RESULTS\s*---/i,
  /\bDIRECT\s*ANSWER\s*:/i,
  /\[CODE MODE\b/i,
  /\[Current date and time\]/i,
  /\[Reasoning context above/i,
  /\[Continue from where/i,
  /\[Search complete/i,
  /<context>|<\/context>/i,
  /\bYou are (?:0|00|000|V|VV|VVV)\b/,
  /\bsystem prompt\b/i,
  /\b(?:my|the) (?:instructions?|rules|role|configuration|behavior list)\b/i,
];

const LEAK_MESSAGE_PATTERNS = [
  /^Universal Production System Prompt/m,
  /^FORMATTING RULES — MANDATORY/m,
  /^Core Behavior\n/m,
  /You are (?:0|00|000|V), created by Vin/,
];

export function looksLikeLeak(line) {
  if (!line) return false;
  return LEAK_LINE_PATTERNS.some(re => re.test(line));
}

export function messageLooksLikeSystemLeak(content) {
  if (typeof content !== 'string') return false;
  return LEAK_MESSAGE_PATTERNS.some(re => re.test(content));
}

// Buffered, line-aware sanitiser for streamed <think> content.
export function sanitizeThinkChunk(buf, incoming) {
  const combined = buf + incoming;
  const lastNl = combined.lastIndexOf('\n');
  if (lastNl === -1) return { safe: '', buf: combined };

  const head = combined.slice(0, lastNl + 1);
  const tail = combined.slice(lastNl + 1);
  const cleaned = head.split('\n').map((line, i, arr) => {
    if (i === arr.length - 1 && line === '') return '';
    return looksLikeLeak(line) ? '…' : line;
  }).join('\n');
  return { safe: cleaned, buf: tail };
}

export function sanitizeThinkFlush(buf) {
  if (!buf) return '';
  return looksLikeLeak(buf) ? '…' : buf;
}

// Streaming filter that ensures only one <think>...</think> block is emitted.
// Subsequent rogue think tags are suppressed.
export function makePromptedThinkFilter() {
  let state = 'before';
  return function filterChunk(chunk) {
    let out = '';
    let i = 0;
    while (i < chunk.length) {
      if (state === 'before') {
        const tOpen = chunk.indexOf('<think>', i);
        if (tOpen === -1) { out += chunk.slice(i); break; }
        out += chunk.slice(i, tOpen + 7);
        state = 'in_think';
        i = tOpen + 7;
      } else if (state === 'in_think') {
        const tClose = chunk.indexOf('</think>', i);
        if (tClose === -1) { out += chunk.slice(i); break; }
        out += chunk.slice(i, tClose + 8);
        state = 'after_think';
        i = tClose + 8;
      } else if (state === 'after_think') {
        const rogue = chunk.indexOf('<think>', i);
        if (rogue === -1) { out += chunk.slice(i); break; }
        out += chunk.slice(i, rogue);
        state = 'suppressing';
        i = rogue + 7;
      } else {
        const tClose = chunk.indexOf('</think>', i);
        if (tClose === -1) break;
        state = 'after_think';
        i = tClose + 8;
      }
    }
    return out;
  };
}
