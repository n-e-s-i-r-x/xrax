export const config = { runtime: 'edge' };

const MODEL_MAP = {
  '0':   { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false },
  '00':  { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false },
  '000': { id: 'openai/gpt-oss-120b:free',          hasReasoning: true,  hasPromptedThink: false },
  'V':   { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false },
};

function modelEntry(key) { return MODEL_MAP[key] ?? MODEL_MAP['0']; }

// ── ACCURACY RULES ────────────────────────────────────────────────────────────

const ACCURACY_RULES = `
Accuracy rules (non-negotiable):
- VERIFY before answering. Only assert what you are confident is true.
- If you are uncertain, say so explicitly: use phrases like "I'm not certain", "you may want to verify this", or "I don't know" rather than guessing.
- NEVER fabricate facts, citations, names, dates, statistics, URLs, or code that you cannot verify.
- If a user's question contains a false premise or incorrect assumption, point it out directly before answering.
- Prioritize truth over completeness. An incomplete but accurate answer is better than a complete but inaccurate one.
- Follow all constraints in the user's request exactly. Do not skip, ignore, or reinterpret them.
- Do not speculate as if it were fact. Clearly label speculation or estimates when they occur.
- If you don't know something, say "I don't know" — never fill gaps with plausible-sounding content.
- SELF-CHECK: Before finalizing your answer, ask yourself: "Could any part of this be wrong?" If yes, revise or flag it.
- CALIBRATION: Express your confidence level where relevant (e.g., "I'm highly confident…", "I believe but am not certain…").
- RECENCY: Flag if your knowledge may be outdated for time-sensitive topics.`;

const ACCURACY_RULES_000 = `
Accuracy rules (non-negotiable):
- VERIFY before answering. Only assert what you are confident is true.
- If you are uncertain, say so explicitly: "I'm not certain", "you may want to verify this", or "I don't know".
- NEVER fabricate facts, citations, names, dates, statistics, URLs, or code.
- If a question contains a false premise or incorrect assumption, correct it before answering.
- Prioritize truth over completeness. An incomplete but accurate answer is better than a complete but inaccurate one.
- Follow all constraints in the user's request exactly.
- Do not speculate as fact. Clearly label all speculation or estimates.
- If you don't know something, say "I don't know" — never fill gaps with plausible-sounding content.
- SELF-CHECK: Before writing your answer, ask: "Is every claim here something I am confident is true?" Revise if not.
- CALIBRATION: Express your confidence level where relevant ("I'm highly confident…", "I believe but am not certain…").
- RECENCY: Flag if your knowledge may be outdated for time-sensitive topics.
- CONTRADICTION CHECK: If your reasoning or any step contradicts a later step, resolve the contradiction before answering.
- STEP VALIDATION: After each reasoning step, verify it is consistent with the previous steps before continuing.
- ALTERNATIVE CHECK: Before committing to an answer, briefly consider if there is an alternative interpretation or answer that could also be correct. If so, address it.

Domain-specific accuracy rules:
- MATH: Always work step by step. Show all intermediate steps. After reaching an answer, verify it by plugging back in or re-checking the arithmetic. If modular arithmetic is involved, find the cycle length explicitly before computing. Re-derive from scratch if any doubt exists.
- LOGIC: Always name the argument form (e.g. modus ponens, disjunctive syllogism, affirming the consequent). Evaluate structural validity independently of whether premises are true. A valid argument can have false premises. An invalid argument can have a true conclusion. Never confuse soundness with validity. Disjunctive syllogism is VALID — never call it a fallacy.
- HISTORY / GEOGRAPHY: If you are not 100% certain of a date, name, or place, flag it explicitly. Do not round or approximate without saying so.
- SCIENCE: Distinguish between established consensus, emerging research, and speculation. Label each.
- CODE: Only write code you are certain is syntactically and logically correct. If you cannot verify it, say so. Never invent API names, library functions, or parameters that you are not sure exist.
- COMMON TRAPS: Watch for: (1) cognitive bias traps in word problems — re-read and solve algebraically; (2) famous misconceptions stated as questions — answer what is actually true, not what sounds right; (3) disjunctive syllogism — it IS a valid argument form, do not call it a fallacy; (4) leading questions — do not accept the framing uncritically.

Final answer gate — before writing your answer, run through ALL of these:
1. Is every factual claim in this answer something I am confident is true?
2. Did I verify all arithmetic and check the result independently?
3. Did I correctly identify the logical structure before evaluating validity?
4. Am I avoiding the intuitive but wrong answer?
5. Have I considered alternative correct answers or interpretations?
6. Is my confidence level correctly calibrated (am I overstating certainty)?
7. Could my knowledge be outdated for this topic?
If ANY answer is "no" or "unsure", revise before outputting.`;

// ── THINKING RULES ────────────────────────────────────────────────────────────

const THINK_RULES = `
Reasoning rules (inside <think>...</think>):
- Think directly about the user's question with rigor and depth.
- Break the problem down, consider edge cases, verify your reasoning.
- Use short, dense fragments. No filler. No restating rules or role text.
- Keep reasoning focused — reach the answer without padding.
- After </think>, output ONLY the final answer — clean and direct.
- CRITICAL: The final answer must NEVER repeat, summarize, or reference anything from the thinking block. Thinking is internal only. The answer stands completely on its own.`;

const THINK_RULES_000 = `
Reasoning rules (inside <think>...</think>):
- Think directly about the user's question with rigor and depth.
- Break the problem down. Consider edge cases. Verify your reasoning step by step.
- SCRATCHPAD VERIFICATION: After reaching a conclusion inside think, challenge it — try to find a flaw or counterexample. Only proceed if it holds.
- For math: compute explicitly. Check your answer by an independent method (plug back in, estimate, alternative formula). If wrong, recompute from scratch — do not patch.
- For logic: write out the argument form symbolically. Then evaluate validity from structure alone, completely independent of whether premises are true.
- For factual questions: surface what you know, note any uncertainty, then commit to the best answer.
- For trick questions or cognitive traps: slow down, re-read carefully, solve mechanically step by step — do not trust your first instinct. Assume it could be a trap.
- For code: mentally trace execution with a concrete example before committing.
- MULTI-ANGLE CHECK: After forming your answer, approach it from a completely different angle and verify you reach the same conclusion.
- Use short, dense fragments. No filler. No restating rules or role text.
- Keep reasoning focused — reach the answer without padding.
- After </think>, output ONLY the final answer — clean and direct.
- CRITICAL: The final answer must NEVER repeat, summarize, or reference anything from the thinking block. Thinking is internal only. The answer stands completely on its own.`;

// ── SYSTEM PROMPTS ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_MAP = {
  '0':   `You are 0, created by Vin.\n${ACCURACY_RULES}`,
  '00':  `You are 00, created by Vin.\n${ACCURACY_RULES}`,
  '000': `You are 000, created by Vin.\n${ACCURACY_RULES_000}\n${THINK_RULES_000}`,
  'V':   `You are V, created by Vin.\n${ACCURACY_RULES}`,
};

// ── DOMAIN HINT INJECTION (000 only) ─────────────────────────────────────────

// Expanded keyword detection and more surgical hints that force verification steps
function injectTaskHint(messages, modelKey) {
  if (modelKey !== '000') return messages;
  if (!messages.length) return messages;

  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || typeof last.content !== 'string') return messages;

  const msg = last.content;
  const hints = [];

  const isMath    = /\b(mod|modulo|remainder|divisib|\^|\bpow\b|equation|solve|calculat|speed|distance|rate|volume|surface area|sphere|cylinder|triangle|percent|average|mean|median|algebra|arithmetic|\d+\s*[×\*\/\+\-]\s*\d)/i.test(msg);
  const isLogic   = /\b(valid|invalid|fallacy|syllogism|argument|therefore|conclude|premise|disjunct|modus|consequent|antecedent|either|or|if.+then)\b/i.test(msg);
  const isHistory = /\b(year|century|founded|signed|treaty|war|battle|born|died|reign|monarch|capital|emperor|president|when did|when was)\b/i.test(msg);
  const isCode    = /\b(function|def |class |import |return|variable|bug|error|compile|syntax|runtime|debug|algorithm|implement|code|program)\b/i.test(msg);
  const isTrick   = /\b(trick|trap|riddle|paradox|always|never|all|none|every|impossible|obvious|simple|easy)\b/i.test(msg);
  const isList    = /\b(list|enumerate|all of|every|name all|give me all|what are all)\b/i.test(msg);

  if (isMath)    hints.push('[MATH] Work step by step. Show ALL steps explicitly. After reaching an answer, verify it using an INDEPENDENT method (plug back in, reverse the operation, or re-derive). If your verification fails, recompute from scratch — do not patch. State your final numeric answer clearly.');
  if (isLogic)   hints.push('[LOGIC] Write out the argument form using symbolic notation (P1, P2, C). Name the argument form explicitly. Evaluate STRUCTURAL VALIDITY first — completely independent of whether premises are true or false. Remember: disjunctive syllogism is VALID. Only then evaluate soundness.');
  if (isHistory) hints.push('[HISTORY] Be precise about all dates, names, and places. For any fact you are less than fully certain about, flag it explicitly with "I believe…" or "you may want to verify…". Do not round or approximate without saying so.');
  if (isCode)    hints.push('[CODE] Before writing any code, outline the logic. Then write the code. Then mentally trace it with at least one concrete example input. Verify the output matches expectations. Never invent library functions or API methods you are not certain exist — flag any you are unsure about.');
  if (isTrick)   hints.push('[CAUTION] This question may be a trick or contain a cognitive trap. Slow down. Re-read the exact wording carefully. Solve mechanically and algebraically — do not rely on intuition. Consider whether the "obvious" answer might be wrong.');
  if (isList)    hints.push('[COMPLETENESS] You are being asked for a complete list. Before finalizing, ask yourself: "Am I missing any important items?" If you cannot be certain the list is complete, say so explicitly.');

  // Universal gate appended to every 000 message
  hints.push('[VERIFICATION GATE] Before outputting your final answer: (1) Is every claim verifiably true? (2) Did you check your work independently? (3) Is your confidence calibrated correctly? (4) Have you considered alternative correct answers? Revise if any answer is no.');

  const patched = { ...last, content: last.content + '\n\n' + hints.join('\n') };
  return [...messages.slice(0, -1), patched];
}

// ── REPETITION / CONSISTENCY CHECK INJECTION ──────────────────────────────────

// For all models: append a lightweight self-consistency nudge to the last user message
function injectConsistencyNudge(messages, modelKey) {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || typeof last.content !== 'string') return messages;

  // Already injected by injectTaskHint for 000 — skip double-injection
  if (modelKey === '000') return messages;

  const nudge = '\n\n[Before answering: verify your response is accurate. If uncertain about any claim, flag it explicitly.]';
  const patched = { ...last, content: last.content + nudge };
  return [...messages.slice(0, -1), patched];
}

// ── TEMPERATURE SELECTION ─────────────────────────────────────────────────────

// Lower temperature = less random = more accurate/consistent outputs
// 000 already handled below; apply tighter values to all models
function effectiveTemperature(modelKey, requested) {
  if (modelKey === '000') return 0.1;  // was 0.2 — tighter for accuracy
  if (modelKey === '00')  return Math.min(requested, 0.4);
  if (modelKey === '0')   return Math.min(requested, 0.5);
  return Math.min(requested, 0.5);
}

// ── SAMPLING: TOP-P / TOP-K ───────────────────────────────────────────────────

// Restrict nucleus sampling — narrows token candidates to high-probability region
// top_p=0.85 cuts low-probability hallucination tail; top_k adds a hard cap
function samplingParams(modelKey) {
  if (modelKey === '000') return { top_p: 0.8, top_k: 30, frequency_penalty: 0.1, presence_penalty: 0.0 };
  return { top_p: 0.85, top_k: 40, frequency_penalty: 0.05, presence_penalty: 0.0 };
}

// ── REPETITION PENALTY ────────────────────────────────────────────────────────

// frequency_penalty > 0 discourages the model from repeating tokens it has already used,
// which reduces redundant "filler" reasoning that can lead to drift and hallucination.
// (included in samplingParams above)

// ── STOP SEQUENCES ────────────────────────────────────────────────────────────

// Hard-stop the model if it starts outputting known hallucination markers
const STOP_SEQUENCES = [
  'As an AI language model,',   // deflection filler
  'I cannot provide',            // often precedes hallucinated refusals
  'Note: This is a fictional',   // fabrication marker
];

// ── N=1 FORCED (no sampling variance) ────────────────────────────────────────
// Always n=1. Multiple samples are not used here, but this ensures no accidental n>1.
const FORCED_N = 1;

// ── UTILITY ───────────────────────────────────────────────────────────────────

function jsonEscape(s) {
  return String(s)
    .replace(/\\/g,'\\\\').replace(/"/g,'\\"')
    .replace(/\n/g,'\\n').replace(/\r/g,'');
}

function sseContent(text) {
  return `data: {"choices":[{"delta":{"content":"${jsonEscape(text)}"},"finish_reason":null}]}\n\n`;
}

function genericError(status) {
  if (status===401||status===403) return 'Authentication failed. Check your API key.';
  if (status===429) return 'Rate limited. The service is busy — please wait a moment and try again.';
  if (status===402) return 'Out of credits. Please add funds to your OpenRouter account.';
  if (status>=500) return 'Upstream service unavailable. Please try again in a moment.';
  return 'Request failed. Please try again.';
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ── LEAK / HALLUCINATION DETECTION ───────────────────────────────────────────

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
  /\bYou are (?:0|00|000)\b/,
  /\bsystem prompt\b/i,
  /\b(?:my|the) (?:instructions?|rules|role|configuration|behavior list)\b/i,
];

function looksLikeLeak(line) {
  if (!line) return false;
  for (const re of LEAK_LINE_PATTERNS) if (re.test(line)) return true;
  return false;
}

function sanitizeThinkChunk(buf, incoming) {
  const combined = buf + incoming;
  const lastNl = combined.lastIndexOf('\n');
  if (lastNl === -1) return { safe:'', buf:combined };
  const head = combined.slice(0, lastNl+1);
  const tail = combined.slice(lastNl+1);
  const cleaned = head.split('\n').map((line,i,arr) => {
    if (i===arr.length-1 && line==='') return '';
    return looksLikeLeak(line) ? '…' : line;
  }).join('\n');
  return { safe: cleaned, buf: tail };
}

function sanitizeThinkFlush(buf) {
  if (!buf) return '';
  return looksLikeLeak(buf) ? '…' : buf;
}

// ── FETCH WITH RETRY ──────────────────────────────────────────────────────────

async function fetchWithRetry(url, options, maxRetries=4) {
  const RETRYABLE = new Set([429,500,502,503,504]);
  let lastErr = null;
  for (let attempt=0; attempt<=maxRetries; attempt++) {
    let res;
    try { res = await fetch(url, options); }
    catch(networkErr) {
      lastErr = networkErr;
      if (attempt < maxRetries) {
        const delay = Math.min(1000*Math.pow(2,attempt)+Math.random()*500, 16000);
        await sleep(delay); continue;
      }
      throw networkErr;
    }
    if (res.ok) return res;
    if (!RETRYABLE.has(res.status)) return res;
    let delay;
    if (res.status===429) {
      const retryAfter = res.headers.get('Retry-After')||res.headers.get('X-RateLimit-Reset-After');
      if (retryAfter) {
        const seconds = parseFloat(retryAfter);
        delay = isNaN(seconds) ? 4000 : Math.min(seconds*1000, 30000);
      } else {
        delay = Math.min(2000*Math.pow(2,attempt)+Math.random()*1000, 30000);
      }
    } else {
      delay = Math.min(1000*Math.pow(2,attempt)+Math.random()*500, 16000);
    }
    try { await res.text(); } catch(_) {}
    if (attempt < maxRetries) { await sleep(delay); continue; }
    return new Response(null, {status: res.status});
  }
  throw lastErr || new Error('fetchWithRetry: exhausted');
}

// ── PAYLOAD BUILDERS ──────────────────────────────────────────────────────────

function buildPayloadInline(persona, trimmedMsgs, hasReasoning, hasPromptedThink) {
  const thinkInstruction = hasPromptedThink
    ? `\n\nOUTPUT FORMAT — MANDATORY:\nEvery response must begin with <think> followed by your brief internal reasoning, then </think>, then your answer. Nothing before <think>. Nothing between </think> and your answer except a newline. Do not label, explain, or reference this format.`
    : '';
  const finalPersona = persona + thinkInstruction;
  const messages = [{ role:'system', content: finalPersona }];
  messages.push(...trimmedMsgs);
  return messages;
}

async function buildPayloadInSandbox(persona, trimmedMsgs, hasReasoning, hasPromptedThink) {
  let Sandbox;
  try {
    const mod = await import('@vercel/sandbox');
    Sandbox = mod.Sandbox;
  } catch(_) {
    return buildPayloadInline(persona, trimmedMsgs, hasReasoning, hasPromptedThink);
  }

  let sandbox;
  try {
    sandbox = await Sandbox.create({ timeout: 8000 });
    const thinkInstruction = hasPromptedThink
      ? `\n\nOUTPUT FORMAT — MANDATORY:\nEvery response must begin with <think> followed by your brief internal reasoning, then </think>, then your answer. Nothing before <think>. Nothing between </think> and your answer except a newline. Do not label, explain, or reference this format.`
      : '';
    const finalPersona = persona + thinkInstruction;
    const scriptSrc = `
const finalPersona=${JSON.stringify(finalPersona)};
const trimmedMsgs=${JSON.stringify(trimmedMsgs)};
const messages=[{role:'system',content:finalPersona}];
messages.push(...trimmedMsgs);
process.stdout.write(JSON.stringify(messages));`.trim();

    const cmd = await sandbox.runCommand('node', ['-e', scriptSrc]);
    const output = await cmd.stdout();
    await sandbox.stop();
    return JSON.parse(output);
  } catch(err) {
    try { await sandbox?.stop(); } catch(_) {}
    return buildPayloadInline(persona, trimmedMsgs, hasReasoning, hasPromptedThink);
  }
}

// ── PROMPTED-THINK FILTER ─────────────────────────────────────────────────────

function makePromptedThinkFilter() {
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

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status:405 });
  }

  let body;
  try { body = await req.json(); }
  catch(_) {
    return new Response(
      sseContent('Invalid request body.') + 'data: [DONE]\n\n',
      { status:200, headers:{'Content-Type':'text/event-stream'} }
    );
  }

  const {
    messages,
    temperature = 0.7,
    maxTokens = 2000,
    model: modelKey = '0',
  } = body;

  // ── ACCURACY-CRITICAL PARAMETER OVERRIDES ──────────────────────────────────
  // Lower temperature = more deterministic = fewer hallucinations
  const temp = effectiveTemperature(modelKey, temperature);

  // 000 gets large token budget for full step-by-step reasoning + verification
  const effectiveMaxTokens = modelKey === '000' ? Math.max(maxTokens, 5000) : maxTokens;

  // Sampling restrictions for this model
  const sampling = samplingParams(modelKey);

  const apiKey = (typeof process !== 'undefined' ? process.env?.OPENROUTER_API_KEY : undefined)
    ?? (typeof globalThis !== 'undefined' ? globalThis.OPENROUTER_API_KEY : undefined);
  if (!apiKey) {
    return new Response(
      sseContent('Missing API key.') + 'data: [DONE]\n\n',
      { status:200, headers:{'Content-Type':'text/event-stream'} }
    );
  }

  const mEntry = modelEntry(modelKey);
  const modelId = mEntry.id;
  const hasReasoning = mEntry.hasReasoning;
  const hasPromptedThink = mEntry.hasPromptedThink ?? false;
  const persona = SYSTEM_PROMPT_MAP[modelKey] ?? SYSTEM_PROMPT_MAP['0'];
  const isThinkModel = hasReasoning || hasPromptedThink;

  const trimmed = Array.isArray(messages)
    ? messages
        .filter(m => m && typeof m === 'object' && typeof m.role === 'string' && typeof m.content === 'string')
        .slice(-20)
    : [];

  // Step 1: inject domain-specific verification hints (000 only)
  const trimmedWithHints = injectTaskHint(trimmed, modelKey);
  // Step 2: inject lightweight self-consistency nudge (non-000 models)
  const trimmedFinal = injectConsistencyNudge(trimmedWithHints, modelKey);

  let messagesPayload;
  try {
    messagesPayload = await buildPayloadInSandbox(persona, trimmedFinal, hasReasoning, hasPromptedThink);
  } catch(_) {
    messagesPayload = buildPayloadInline(persona, trimmedFinal, hasReasoning, hasPromptedThink);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk) => { try { controller.enqueue(encoder.encode(chunk)); } catch(_) {} };

      let upstreamRes;
      try {
        const reqBody = {
          model: modelId,
          messages: messagesPayload,
          temperature: temp,
          max_tokens: effectiveMaxTokens,
          stream: true,
          n: FORCED_N,
          // Nucleus + top-k sampling restrictions reduce hallucination probability
          top_p: sampling.top_p,
          // Penalize repetition to reduce drift/filler reasoning
          frequency_penalty: sampling.frequency_penalty,
          presence_penalty: sampling.presence_penalty,
          // Hard stop sequences that signal fabrication or deflection
          stop: STOP_SEQUENCES,
        };

        // top_k is passed as extra_body for OpenRouter compatibility
        if (sampling.top_k) reqBody.top_k = sampling.top_k;

        if (hasReasoning) reqBody.reasoning = { max_tokens: 14000 };  // was 12000 — more room to verify

        upstreamRes = await fetchWithRetry(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            method:'POST',
            headers:{
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://your-site.com',
              'X-Title': '0vAI',
            },
            body: JSON.stringify(reqBody),
          },
          4
        );
      } catch(err) {
        send(sseContent('Network error. Please try again.'));
        send('data: [DONE]\n\n');
        try { controller.close(); } catch(_) {}
        return;
      }

      if (!upstreamRes.ok) {
        try { await upstreamRes.text(); } catch(_) {}
        send(sseContent(genericError(upstreamRes.status)));
        send('data: [DONE]\n\n');
        try { controller.close(); } catch(_) {}
        return;
      }

      if (!upstreamRes.body) {
        try {
          const data = await upstreamRes.json();
          const reasoningRaw = data?.choices?.[0]?.message?.reasoning_content ?? data?.choices?.[0]?.message?.reasoning ?? '';
          let answerText = data?.choices?.[0]?.message?.content ?? '';
          const fr = data?.choices?.[0]?.finish_reason ?? 'stop';
          let combined = '';
          if (isThinkModel) {
            if (hasReasoning) {
              if (reasoningRaw) {
                const cleaned = reasoningRaw.split('\n').map(l => looksLikeLeak(l)?'…':l).join('\n');
                combined += `<think>\n${cleaned}\n</think>\n`;
              }
              if (!answerText.trim() && reasoningRaw) {
                const lines = reasoningRaw.trimEnd().split('\n');
                for (let i = lines.length - 1; i >= 0; i--) {
                  const l = lines[i].trim();
                  if (l && !looksLikeLeak(lines[i])) { answerText = l; break; }
                }
              }
            } else if (hasPromptedThink) {
              if (answerText && !answerText.trimStart().startsWith('<think>')) {
                combined += '<think>\n</think>\n';
              }
            }
          }
          combined += answerText;
          if (!combined.trim()) combined = '_(No answer generated — please try again)_';
          send(sseContent(combined));
          send(`data: {"choices":[{"delta":{},"finish_reason":"${fr}"}]}\n\n`);
        } catch(_) { send(sseContent('[Empty response]')); }
        send('data: [DONE]\n\n');
        try { controller.close(); } catch(_) {}
        return;
      }

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let inReasoningPhase = false;
      let thinkOpened = false;
      let finishReason = null;
      let thinkLineBuf = '';
      let promptedThinkLeadStripped = !hasPromptedThink;

      const filterPromptedThink = hasPromptedThink ? makePromptedThinkFilter() : null;

      const closeThinkIfOpen = () => {
        if (inReasoningPhase) {
          const tail = sanitizeThinkFlush(thinkLineBuf);
          if (tail) send(sseContent(tail));
          thinkLineBuf = '';
          send(sseContent('\n</think>\n'));
          inReasoningPhase = false;
          thinkOpened = false;
        }
      };

      const emitThink = (delta) => {
        const {safe, buf} = sanitizeThinkChunk(thinkLineBuf, delta);
        thinkLineBuf = buf;
        if (safe) send(sseContent(safe));
      };

      const handleDataLine = (raw) => {
        if (raw === '[DONE]') return;
        let parsed;
        try { parsed = JSON.parse(raw); } catch (_) { return; }
        const choice = parsed?.choices?.[0];
        if (!choice) return;
        const delta = choice.delta || {};
        const reasoningDelta = delta.reasoning_content ?? delta.reasoning;
        const contentDelta = delta.content;

        if (!isThinkModel) {
          if (typeof contentDelta === 'string' && contentDelta.length) send(sseContent(contentDelta));
          if (choice.finish_reason) finishReason = choice.finish_reason;
          return;
        }

        if (hasReasoning) {
          if (typeof reasoningDelta === 'string' && reasoningDelta.length) {
            if (!inReasoningPhase && !thinkOpened) {
              send(sseContent('<think>\n'));
              inReasoningPhase = true;
              thinkOpened = true;
            }
            if (inReasoningPhase) {
              emitThink(reasoningDelta);
            }
          }
          if (typeof contentDelta === 'string' && contentDelta.length) {
            closeThinkIfOpen();
            send(sseContent(contentDelta));
          }
        } else {
          let out = (typeof contentDelta === 'string' ? contentDelta : '')
                  + (typeof reasoningDelta === 'string' && !contentDelta ? reasoningDelta : '');
          if (!promptedThinkLeadStripped && out.length) {
            out = out.trimStart();
            if (out.length) promptedThinkLeadStripped = true;
          }
          if (out.length) {
            out = filterPromptedThink(out);
            if (out.length) send(sseContent(out));
          }
        }

        if (choice.finish_reason) finishReason = choice.finish_reason;
      };

      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) {
            if (buffer.trim()) {
              for (const line of buffer.split('\n')) {
                const l = line.trim();
                if (l.startsWith('data:')) handleDataLine(l.slice(5).trim());
              }
            }
            break;
          }
          buffer += decoder.decode(value, {stream:true});
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const l = line.trim();
            if (!l.startsWith('data:')) continue;
            handleDataLine(l.slice(5).trim());
          }
        }
      } catch(streamErr) {
        send(sseContent('\n[Stream interrupted. Please try again.]'));
      }

      closeThinkIfOpen();
      if (finishReason) {
        send(`data: {"choices":[{"delta":{},"finish_reason":"${finishReason}"}]}\n\n`);
      }
      send('data: [DONE]\n\n');
      try { controller.close(); } catch(_) {}
    }
  });

  return new Response(stream, {
    status:200,
    headers:{
      'Content-Type':'text/event-stream',
      'Cache-Control':'no-cache, no-transform',
      'Connection':'keep-alive',
      'X-Accel-Buffering':'no',
    },
  });
}
