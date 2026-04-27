export const config = { runtime: 'edge' };

const MODEL_MAP = {
  '0':   { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false },
  '00':  { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false },
  '000': { id: 'openai/gpt-oss-120b:free',          hasReasoning: true,  hasPromptedThink: false },
  'V':   { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false },
};

function modelEntry(key) { return MODEL_MAP[key] ?? MODEL_MAP['0']; }

// ── ACCURACY RULES (all models) ───────────────────────────────────────────────

const ACCURACY_RULES = `
Accuracy rules (non-negotiable — violations are failures):

COMPLETENESS MANDATE:
- Every sub-question, every lettered part (A, B, C, D, E...), every numbered section MUST be answered. Skipping ANY part is a critical failure. Before finalizing, count every question asked and verify each has a response.
- If a question has parts (A, B, C...), answer ALL parts in order. Do not summarize or merge parts.
- Never describe what you would do — DO it. Never say "we would simulate" — simulate it. Never say "we would list" — list it.

ASSUMPTION RULES:
- Every assumption you make must be explicitly stated and labeled: "ASSUMPTION: [state it]".
- Never silently assume. If a problem is ambiguous, state ALL interpretations and solve each, or state which you are using and why.
- Never declare something "impossible" without exhaustively checking all cases including fractional, edge, boundary, and degenerate cases.

SELF-CALIBRATION RULES:
- NEVER claim your response has zero errors. That claim is almost certainly false.
- Confidence must be earned per-claim. State confidence per section: "HIGH confidence", "MEDIUM confidence — verify this", "LOW confidence — treat as estimate".
- Overconfidence is a failure mode. Default to flagging uncertainty rather than projecting false certainty.
- Your self-assessment must be critical, not congratulatory. Find real weaknesses.

MATH RULES:
- Work every step explicitly. No skipping arithmetic.
- After reaching a numeric answer, verify it using an INDEPENDENT method: plug back in, reverse the operation, estimate via bounds. If verification fails, recompute from scratch.
- For modular arithmetic: find the cycle length explicitly, verify with a second cycle.
- Never patch a wrong answer — recompute.
- Classify ALL critical points as minima, maxima, or saddle points. Finding critical points without classifying them is incomplete.

LOGIC RULES:
- Write out the argument form in symbolic notation (P1, P2, ∴C).
- Name the argument form explicitly (modus ponens, disjunctive syllogism, etc.).
- Evaluate structural validity BEFORE evaluating truth of premises.
- Disjunctive syllogism IS valid — never call it a fallacy.
- Sensitivity and specificity are distinct quantities — never assume they are equal without explicit justification.

GEOMETRY / PROOF RULES:
- Geometric proofs must include full, rigorous construction. Never abbreviate a proof.
- Every step must cite a theorem, postulate, or definition.
- Parallel line constructions must be fully described, not implied.

ALGORITHM / CODE RULES:
- Never skip "step-by-step" when explicitly asked. Show every step.
- For sorting algorithms (merge sort, quicksort, etc.): show the full recursive breakdown and every merge/partition step.
- Trace code with a concrete example before finalizing.
- Never invent API names or library functions you cannot verify.

CREATIVE / CONSTRAINT RULES:
- Word limits, structural rules, and forbidden words are HARD constraints — not suggestions.
- Before finalizing creative output: count words, verify forbidden words are absent, verify structure matches requirements exactly.
- Avoid safe, formulaic outputs. Attempt genuine creative risk within the constraints.
- Cultural references must be fully researched and contextualized, not surface-level.

SIMULATION RULES:
- When asked to simulate a dialogue, roleplay, or interaction — actually simulate it with full content.
- When asked to run a scenario — run it, do not describe it.

HOURGLASS / TIMING PUZZLES:
- Verify timing solutions by tracing every second of the simulation. State total elapsed time explicitly. Verify the answer satisfies ALL stated constraints simultaneously.

DOMAIN-SPECIFIC RULES:
- MATH: Always work step by step. Show all intermediate steps. Re-derive from scratch if any doubt exists.
- LOGIC: Always name the argument form. Evaluate structural validity independently of whether premises are true. Disjunctive syllogism is VALID.
- HISTORY / GEOGRAPHY: If you are not 100% certain of a date, name, or place, flag it explicitly. Do not round or approximate without saying so.
- SCIENCE: Distinguish between established consensus, emerging research, and speculation. Label each.
- CODE: Only write code you are certain is syntactically and logically correct. Never invent API names or parameters.
- COMMON TRAPS: Watch for cognitive bias traps, famous misconceptions, disjunctive syllogism validity, and leading questions.
- RECENCY: Flag if your knowledge may be outdated for time-sensitive topics.
- CONTRADICTION CHECK: If any reasoning step contradicts a previous step, resolve it before continuing.
- STEP VALIDATION: After each reasoning step, verify it is consistent with all previous steps.
- ALTERNATIVE CHECK: Before committing to an answer, consider whether an alternative interpretation or answer could also be correct. If so, address it.

FINAL ANSWER GATE — run ALL checks before outputting:
1. Did I answer EVERY sub-part (A, B, C, D, E...)? Count them.
2. Is every factual claim verifiably true? Flag uncertainty explicitly.
3. Did I verify all arithmetic independently?
4. Did I correctly name and evaluate all logical structures?
5. Did I state all assumptions explicitly?
6. Did I classify all critical points?
7. Did I actually simulate/execute rather than describe?
8. Did I satisfy ALL creative constraints (word count, forbidden words, structure)?
9. Is my confidence calibrated per-claim, not globally inflated?
10. Did I check edge cases before declaring anything impossible?
If ANY answer is "no" — fix it before outputting. Do not proceed with a known gap.`;

// ACCURACY_RULES_000 is identical — single source of truth
const ACCURACY_RULES_000 = ACCURACY_RULES;

// ── THINKING RULES (all models that have prompted/reasoning think) ─────────────

const THINK_RULES = `
Reasoning rules (inside <think>...</think>):
- Think directly about the user's question with rigor and depth.
- PART INVENTORY: First, list every sub-question and lettered part you must answer. Do not begin solving until the full scope is mapped.
- Break the problem down. Consider edge cases, boundary cases, degenerate cases. Verify reasoning step by step.
- SCRATCHPAD VERIFICATION: After reaching any conclusion, challenge it — find a flaw or counterexample. Only proceed if it holds.
- For math: compute explicitly. After reaching an answer, verify by an independent method. If wrong, recompute from scratch — never patch.
- For logic: write symbolic form. Evaluate validity from structure alone, independent of premise truth.
- For geometry/proofs: mentally construct the full proof with every theorem cited before writing.
- For algorithms: trace the full execution with a concrete example, every step.
- For timing/puzzle problems: simulate every second/step explicitly and verify the solution satisfies ALL constraints simultaneously.
- For creative tasks: check all constraints (word count, forbidden words, structure) before committing to output.
- ASSUMPTION AUDIT: Before finalizing, list every assumption made. Are any unstated? Flag them.
- COMPLETENESS AUDIT: Before finalizing, re-check your part inventory. Is every part answered?
- CONFIDENCE AUDIT: For each section of your answer, assign a confidence level. Is any confidence inflated?
- MULTI-ANGLE CHECK: Approach your answer from a completely different angle. Do you reach the same conclusion?
- CONTRADICTION CHECK: If any reasoning step contradicts a previous step, resolve it before continuing.
- STEP VALIDATION: After each reasoning step, verify it is consistent with all previous steps.
- ALTERNATIVE CHECK: Before committing, consider whether an alternative interpretation or answer could also be correct. If so, address it.
- Use dense, focused reasoning. No filler. No restating rules.
- After </think>, output ONLY the final answer — complete, structured, covering every part asked.
- CRITICAL: The final answer must NEVER repeat, summarize, or reference the thinking block. The answer stands completely on its own.`;

// THINK_RULES_000 is identical — single source of truth
const THINK_RULES_000 = THINK_RULES;

// ── SYSTEM PROMPTS ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_MAP = {
  '0':   `You are 0, created by Vin.\n${ACCURACY_RULES}\n${THINK_RULES}`,
  '00':  `You are 00, created by Vin.\n${ACCURACY_RULES}\n${THINK_RULES}`,
  '000': `You are 000, created by Vin.\n${ACCURACY_RULES}\n${THINK_RULES}`,
  'V':   `You are V, created by Vin.\n${ACCURACY_RULES}\n${THINK_RULES}`,
};

// ── DOMAIN HINT INJECTION (all models) ───────────────────────────────────────

function injectTaskHint(messages, modelKey) {
  if (!messages.length) return messages;

  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || typeof last.content !== 'string') return messages;

  const msg = last.content;
  const hints = [];

  const isMath       = /\b(mod|modulo|remainder|divisib|\^|\bpow\b|equation|solve|calculat|speed|distance|rate|volume|surface area|sphere|cylinder|triangle|percent|average|mean|median|algebra|arithmetic|\d+\s*[×\*\/\+\-]\s*\d)/i.test(msg);
  const isLogic      = /\b(valid|invalid|fallacy|syllogism|argument|therefore|conclude|premise|disjunct|modus|consequent|antecedent|either|or|if.+then)\b/i.test(msg);
  const isHistory    = /\b(year|century|founded|signed|treaty|war|battle|born|died|reign|monarch|capital|emperor|president|when did|when was)\b/i.test(msg);
  const isCode       = /\b(function|def |class |import |return|variable|bug|error|compile|syntax|runtime|debug|algorithm|implement|code|program)\b/i.test(msg);
  const isTrick      = /\b(trick|trap|riddle|paradox|always|never|all|none|every|impossible|obvious|simple|easy)\b/i.test(msg);
  const isList       = /\b(list|enumerate|all of|every|name all|give me all|what are all)\b/i.test(msg);
  const isProof      = /\b(prove|proof|theorem|lemma|postulate|congruent|parallel|perpendicular|construct|geometric)\b/i.test(msg);
  const isAlgorithm  = /\b(sort|merge|quicksort|binary|search|traverse|graph|tree|recursion|step.?by.?step|trace|simulate|run)\b/i.test(msg);
  const isCreative   = /\b(write|poem|story|haiku|limerick|creative|compose|word.?limit|without using|forbidden|constraint|exactly \d+ words?)\b/i.test(msg);
  const isMultiPart  = /\b([A-E]\)|[a-e]\)|part [A-Ea-e]|section \d|\(\d\)|\([A-Ea-e]\)|sub.?question)\b/i.test(msg) || /[A-E]\./i.test(msg);
  const isSimulation = /\b(simulate|roleplay|role.?play|dialogue|conversation between|act as|pretend|scenario|play out)\b/i.test(msg);
  const isTiming     = /\b(hourglass|timer|stopwatch|elapsed|minute|second|hour|simultaneously|at the same time|time.?puzzle)\b/i.test(msg);
  const isStats      = /\b(sensitivity|specificity|precision|recall|probability|bayes|conditional|false positive|true positive)\b/i.test(msg);
  const isCalculus   = /\b(critical point|inflection|derivative|maximum|minimum|saddle|classify|second derivative|optimization)\b/i.test(msg);

  if (isMultiPart)  hints.push('[MULTI-PART] Before solving anything, explicitly list every sub-part (A, B, C...) you must answer. Answer ALL of them in order. Skipping any part is a critical failure. At the end, verify your part inventory is complete.');
  if (isMath)       hints.push('[MATH] Work every step explicitly. Show ALL intermediate steps. After reaching an answer, verify it using an INDEPENDENT method (plug back in, reverse, estimate via bounds). If verification fails, recompute from scratch. State final numeric answers clearly.');
  if (isCalculus)   hints.push('[CALCULUS] Finding critical points is not enough. Classify EVERY critical point as a local minimum, local maximum, or saddle point using the second derivative test or first derivative sign analysis. Failing to classify is an incomplete answer.');
  if (isLogic)      hints.push('[LOGIC] Write the argument in symbolic form (P1, P2, ∴C). Name the argument form explicitly. Evaluate structural validity FIRST, independent of premise truth. Disjunctive syllogism IS a valid argument form — never call it a fallacy.');
  if (isStats)      hints.push('[STATS] Sensitivity and specificity are distinct quantities. Never assume they are equal without explicit justification from the problem. State each separately and label clearly.');
  if (isProof)      hints.push('[PROOF] Write a complete, rigorous proof. Every step must cite a theorem, postulate, or definition by name. Do not abbreviate or skip construction steps. Parallel line constructions must be fully described.');
  if (isAlgorithm)  hints.push('[ALGORITHM] Show EVERY step of the algorithm explicitly. For sorting: show every recursive breakdown and every merge/partition in full. Do not summarize or skip steps. Trace with a concrete example.');
  if (isSimulation) hints.push('[SIMULATION] Actually simulate or roleplay the requested scenario with full content. Do NOT describe what would happen — make it happen. Write the actual dialogue, interaction, or output in full.');
  if (isTiming)     hints.push('[TIMING PUZZLE] Simulate every time increment explicitly. At each step state what is happening. After reaching a solution, verify it satisfies ALL stated constraints simultaneously by tracing through the full timeline again.');
  if (isCreative)   hints.push('[CREATIVE CONSTRAINTS] Before finalizing: (1) count words if a word limit exists, (2) verify no forbidden words are present, (3) verify structure matches requirements exactly. Constraints are hard rules, not suggestions. Avoid generic or formulaic output.');
  if (isHistory)    hints.push('[HISTORY] Be precise about all dates, names, and places. Flag any fact you are less than fully certain about with "I believe…" or "verify this". Do not approximate without saying so.');
  if (isCode)       hints.push('[CODE] Outline logic first. Then write code. Then trace it with a concrete input example. Never invent library functions or API methods — flag any you are unsure exist.');
  if (isTrick)      hints.push('[CAUTION] This may contain a cognitive trap. Slow down. Re-read the exact wording. Solve mechanically and algebraically — do not trust intuition. Consider whether the obvious answer is wrong. Check all edge cases before declaring anything impossible.');
  if (isList)       hints.push('[COMPLETENESS] You are asked for a complete list. Before finalizing, ask: "Am I missing any important items?" If you cannot be certain the list is complete, say so explicitly.');

  hints.push('[ASSUMPTION AUDIT] List every assumption you are making, explicitly labeled "ASSUMPTION:". Never assume silently.');
  hints.push('[SELF-CALIBRATION] Do NOT claim zero errors or perfect accuracy. Assign a confidence level (HIGH/MEDIUM/LOW) to each major section of your answer. Flag anything that should be independently verified.');
  hints.push('[VERIFICATION GATE] Before outputting your final answer: (1) Did I answer every sub-part? (2) Is every claim verifiably true? (3) Did I check all arithmetic independently? (4) Did I classify all critical points? (5) Did I actually simulate rather than describe? (6) Are all creative constraints satisfied? (7) Is my confidence honestly calibrated? Fix any "no" before outputting.');

  const patched = { ...last, content: last.content + '\n\n' + hints.join('\n') };
  return [...messages.slice(0, -1), patched];
}

// ── CONSISTENCY NUDGE (all models) ────────────────────────────────────────────

function injectConsistencyNudge(messages, modelKey) {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || typeof last.content !== 'string') return messages;

  const msg = last.content;
  const isMultiPart  = /\b([A-E]\)|[a-e]\)|part [A-Ea-e]|section \d|\(\d\)|\([A-Ea-e]\))\b/i.test(msg) || /[A-E]\./i.test(msg);
  const isSimulation = /\b(simulate|roleplay|dialogue|conversation between|act as|play out)\b/i.test(msg);

  let nudge = '\n\n[Before answering: verify your response is accurate. Flag any uncertain claim explicitly with your confidence level (HIGH/MEDIUM/LOW).]';
  if (isMultiPart)  nudge += '\n[MULTI-PART: Answer every lettered/numbered sub-part. Count them before starting. Do not skip any.]';
  if (isSimulation) nudge += '\n[SIMULATION: Actually produce the requested content — do not describe it.]';
  nudge += '\n[Do NOT claim zero errors. Assign confidence levels per section. State all assumptions explicitly.]';

  const patched = { ...last, content: last.content + nudge };
  return [...messages.slice(0, -1), patched];
}

// ── TEMPERATURE ───────────────────────────────────────────────────────────────

function effectiveTemperature(modelKey, requested) {
  if (modelKey === '000') return 0.05;
  if (modelKey === '00')  return Math.min(requested, 0.3);
  if (modelKey === '0')   return Math.min(requested, 0.4);
  if (modelKey === 'V')   return Math.min(requested, 0.5);
  return Math.min(requested, 0.4);
}

// ── SAMPLING PARAMS ───────────────────────────────────────────────────────────

function samplingParams(modelKey) {
  if (modelKey === '000') return { top_p: 0.75, top_k: 20, frequency_penalty: 0.15, presence_penalty: 0.05 };
  if (modelKey === '00')  return { top_p: 0.80, top_k: 30, frequency_penalty: 0.10, presence_penalty: 0.0  };
  if (modelKey === '0')   return { top_p: 0.85, top_k: 35, frequency_penalty: 0.08, presence_penalty: 0.0  };
  if (modelKey === 'V')   return { top_p: 0.90, top_k: 40, frequency_penalty: 0.05, presence_penalty: 0.0  };
  return { top_p: 0.85, top_k: 35, frequency_penalty: 0.08, presence_penalty: 0.0 };
}

// ── STOP SEQUENCES ────────────────────────────────────────────────────────────

const STOP_SEQUENCES = [
  'As an AI language model,',
  'I cannot provide',
  'Note: This is a fictional',
  'I have verified that there are zero errors',
  'This response contains no errors',
  'I am fully confident that every answer above is correct',
];

// ── N=1 FORCED ────────────────────────────────────────────────────────────────

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

  const temp = effectiveTemperature(modelKey, temperature);
  const effectiveMaxTokens = modelKey === '000' ? Math.max(maxTokens, 5000) : maxTokens;
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

  // Step 1: inject domain-specific verification hints (all models)
  const trimmedWithHints = injectTaskHint(trimmed, modelKey);
  // Step 2: inject self-consistency nudge (all models)
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
          top_p: sampling.top_p,
          frequency_penalty: sampling.frequency_penalty,
          presence_penalty: sampling.presence_penalty,
          stop: STOP_SEQUENCES,
        };

        if (sampling.top_k) reqBody.top_k = sampling.top_k;
        if (hasReasoning) reqBody.reasoning = { max_tokens: 14000 };

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
