export const config = { runtime: 'edge' };

const MODEL_MAP = {
  '0':   { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false, minTokens: 5000 },
  '00':  { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false, minTokens: 5000 },
  '000': { id: 'openai/gpt-oss-120b:free',          hasReasoning: true,  hasPromptedThink: false, minTokens: 5000 },
  'V':   { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false, minTokens: 5000 },
};

function modelEntry(key) { return MODEL_MAP[key] ?? MODEL_MAP['0']; }

// ── ACCURACY RULES (all models) ───────────────────────────────────────────────
// FIX: Expanded with first-principles reasoning mandate, uncertainty handling,
//      edge-case probing, and a lightweight self-verification pass.
//      Addresses: knowledge gaps, shallow processing, edge case reliability,
//      hard-to-verify answers.

const ACCURACY_RULES = `
Accuracy rules — apply only what the question actually requires:

RESPONSE DEPTH:
- Match depth to difficulty. A simple question gets a direct answer. A complex problem gets full reasoning. Do not apply heavy structure to light questions.
- If you know the answer, say it. If you don't know, say so clearly and stop — do not fill the gap with hedged guesses.
- Never describe what you would do — do it. Never say "we would simulate" — simulate it.

FIRST-PRINCIPLES REASONING (medium and hard questions):
- Before answering, identify what type of problem this actually is. Do not pattern-match to a surface resemblance — reason from definitions and constraints.
- Ask: what is the minimum set of facts needed to answer this? Do I actually have all of them? If not, flag the gap explicitly before answering.
- Intersection and trick questions often require combining two or more domains. Identify every domain the question touches before solving.

UNCERTAINTY AND KNOWLEDGE GAPS:
- Before stating a fact, ask yourself: am I certain, or am I pattern-completing? If uncertain, say so explicitly with a confidence marker: (confident), (likely), or (uncertain — verify).
- Do not state guesses as facts. Do not fill knowledge gaps with plausible-sounding details.
- "I don't know" is a complete, valid answer when it's true.

EDGE CASES:
- After forming your answer, ask: is there a boundary condition, degenerate case, or domain-specific exception that changes this answer? If yes, address it explicitly.
- For any rule or formula you apply, state the conditions under which it holds. If the question is near those boundaries, say so.

SELF-VERIFICATION (after reaching a conclusion):
- Re-read your answer and ask: does this actually answer what was asked? Check for off-by-one errors, sign errors, missed sub-parts, or unstated assumptions.
- For math: verify by plugging back in or reversing the operation.
- For logic: confirm the argument form is correctly identified and validity is evaluated structurally.
- For code: trace with a concrete input.
- If verification fails, recompute — do not patch.

MATH (only when doing math):
- Show steps. After a numeric answer, verify it by plugging back in or reversing the operation. If verification fails, recompute.
- Non-integer or non-physical results are not automatically "impossible" — state the exact value and note what it means.

LOGIC (only when evaluating arguments):
- Write the argument form in symbolic notation (P1, P2, ∴C). Name it explicitly.
- Evaluate structural validity before premise truth. Disjunctive syllogism is VALID.

CODE (only when writing code):
- Write code you are certain is correct. Never invent API names or library functions you cannot verify.
- Trace with a concrete example when asked step-by-step.

CREATIVE (only when given constraints):
- Word limits, forbidden words, and structural rules are hard constraints, not suggestions.
- The piece must embody its subject through structure, not just describe it.

FACTS / ATTRIBUTION:
- If uncertain about a date, name, or scholarly position, flag it explicitly. Do not state guesses as facts.
- Do not conflate historians with opposing frameworks (e.g., decline-narrative vs. continuity-based).

MISSING INFORMATION:
- If you lack the data to answer, say so directly and stop. Do not substitute speculation for facts.
- "I don't know" is a complete, valid answer when it's true.`;

const ACCURACY_RULES_000 = ACCURACY_RULES;

// ── THINK RULES ───────────────────────────────────────────────────────────────
// FIX: Adds structured attack plan, domain intersection detection, uncertainty
//      flagging, and edge-case probe inside the reasoning block.
//      Addresses: no reasoning transparency, trick/intersection questions,
//      shallow processing, edge case reliability.

const THINK_RULES = `
Reasoning rules (inside <think>...</think>):
- Think directly about the question. Match depth to difficulty.
- SCOPE FIRST: Before solving, list every sub-part or requirement. Identify every domain the question touches. If it crosses two or more domains (e.g., probability + combinatorics, history + geography), note the intersection explicitly.
- KNOWLEDGE CHECK: Before using a fact, ask — am I certain of this, or am I pattern-completing? Flag uncertain facts with (uncertain) inside the think block. If a gap would change the answer, say so.
- ATTACK PLAN: For hard or multi-domain problems, write a 2-3 step plan before executing it. Do not start solving until the plan is clear.
- EDGE-CASE PROBE: After reaching a preliminary answer, ask — is there a boundary condition, degenerate case, or exception that invalidates this? If yes, address it.
- Challenge your first conclusion before committing. Find a flaw or counterexample. If it holds, proceed.
- For math: compute explicitly. Verify by an independent method. If wrong, recompute — never patch.
- For logic: write symbolic form. Evaluate structural validity independent of premise truth.
- For code: trace with a concrete example. Never invent APIs.
- For creative tasks with constraints: check word count, forbidden words, and structure before committing.
- For attribution: use the scholar's actual published position. Flag uncertainty if unsure.
- If you don't have enough information to answer, say so and stop. Do not construct an answer out of guesses.
- Use dense, focused reasoning. No restating rules. No filler.
- After </think>, output ONLY the final answer. Never repeat, summarize, or reference the thinking block.`;

const THINK_RULES_000 = THINK_RULES;

// ── SYSTEM PROMPTS ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_MAP = {
  '0':   `You are 0, created by Vin.\n${ACCURACY_RULES}\n${THINK_RULES}`,
  '00':  `You are 00, created by Vin.\n${ACCURACY_RULES}\n${THINK_RULES}`,
  '000': `You are 000, created by Vin.\n${ACCURACY_RULES_000}\n${THINK_RULES_000}`,
  'V':   `You are V, created by Vin.\n${ACCURACY_RULES}\n${THINK_RULES}`,
};

// ── DIFFICULTY CLASSIFICATION ─────────────────────────────────────────────────
// FIX: Added intersection detection and trick-question patterns to difficulty
//      scoring so they reliably promote to 'hard'.
//      Addresses: trick/intersection questions being under-classified.

function classifyDifficulty(msg) {
  const t = msg.trim();
  if (t.length < 40) return 'simple';
  const conversational = /^(hi|hello|hey|thanks?|ok|sure|yes|no|what('?s| is) (up|good)|how (are|r) (you|u)|lol|haha|nice|cool|great|got it|makes sense|understood)/i.test(t);
  if (conversational) return 'simple';

  // FIX: Intersection signals — questions that cross multiple domains always need deep processing
  const isIntersection = (
    (/\b(both|combine|intersection|overlap|relate|connection between|difference between|compare)\b/i.test(t) && t.length > 80) ||
    // Multiple distinct domain keywords in same question
    [
      /\b(math|algebra|calculus|geometry|probability|statistics)\b/i,
      /\b(history|century|war|treaty|empire|revolution)\b/i,
      /\b(logic|argument|premise|syllogism|valid)\b/i,
      /\b(code|algorithm|function|runtime|complexity)\b/i,
      /\b(physics|chemistry|biology|science)\b/i,
    ].filter(re => re.test(t)).length >= 2
  );
  if (isIntersection) return 'hard';

  // FIX: Trick/trap patterns always hard — these are exactly where shallow processing fails
  const isTrickHard = /\b(trick|trap|paradox|always\s+true|never\s+true|impossible|counterintuitive|common\s+mistake|most\s+people|obvious(ly)?|simple(ly)?|easy\s+question|what\s+is\s+wrong)\b/i.test(t);
  if (isTrickHard) return 'hard';

  const hasSubParts = /\b([A-E]\)|[a-e]\)|part [A-Ea-e]|section \d|\(\d\)|\([A-Ea-e]\)|sub.?question)\b/i.test(t) || /[A-E]\./i.test(t);
  const isLong = t.length > 200;
  const isDeep = /\b(prove|proof|derive|algorithm|implement|simulate|explain\s+how|step.?by.?step|in\s+detail|thoroughly|rigorously|trace|analyze|compare|contrast)\b/i.test(t);
  if (!hasSubParts && !isLong && !isDeep) return 'medium';
  return 'hard';
}

// ── DOMAIN HINT INJECTION ─────────────────────────────────────────────────────
// FIX: Added intersection hint, uncertainty-flag hint, edge-case probe hint,
//      and self-verify reminder. These fire on hard questions.
//      Addresses: knowledge gaps, trick questions, edge cases, verifiability.

function injectTaskHint(messages, modelKey) {
  if (!messages.length) return messages;

  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || typeof last.content !== 'string') return messages;

  const msg = last.content;
  const difficulty = classifyDifficulty(msg);

  if (difficulty === 'simple') return messages;

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

  // FIX: Intersection hint — fires when multiple domains are detected in one question
  const domainCount = [
    /\b(math|algebra|calculus|geometry|probability|statistics)\b/i,
    /\b(history|century|war|treaty|empire|revolution)\b/i,
    /\b(logic|argument|premise|syllogism|valid)\b/i,
    /\b(code|algorithm|function|runtime|complexity)\b/i,
    /\b(physics|chemistry|biology|science)\b/i,
  ].filter(re => re.test(msg)).length;
  const isIntersection = domainCount >= 2 || /\b(both|combine|intersection|overlap|relate|connection between|difference between)\b/i.test(msg);
  if (isIntersection) hints.push('[INTERSECTION] This question crosses multiple domains. Identify each domain and what it contributes before solving. Do not collapse them into one framework prematurely.');

  if (isMultiPart)  hints.push('[MULTI-PART] List every sub-part first. Answer all of them in order. Do not skip any.');
  if (isMath)       hints.push('[MATH] Show steps. After your answer, verify it by plugging back in or reversing the operation. Non-integer results are not automatically impossible — state the value and explain it.');
  if (isCalculus)   hints.push('[CALCULUS] Classify every critical point (min, max, or saddle) using the second derivative test. Finding them without classifying is incomplete.');
  if (isLogic)      hints.push('[LOGIC] Write the argument in symbolic form (P1, P2, ∴C). Name the form. Evaluate structural validity before premise truth. Disjunctive syllogism is VALID.');
  if (isStats)      hints.push('[STATS] Sensitivity and specificity are distinct. Never assume they are equal. State each separately.');
  if (isProof)      hints.push('[PROOF] Full rigorous proof. Every step cites a theorem, postulate, or definition. No abbreviated constructions.');
  if (isAlgorithm)  hints.push('[ALGORITHM] Show every step. For sorting: full recursive breakdown, every merge/partition. Trace with a concrete example. For concurrency/conflict: name the specific technique (OT, CRDT, etc.) and explain it mechanically.');
  if (isSimulation) hints.push('[SIMULATION] Produce the content — do not describe what you would produce.');
  if (isTiming)     hints.push('[TIMING] Simulate every time increment. Verify the solution satisfies all constraints simultaneously. Prefer the simplest reliable approach.');
  if (isCreative)   hints.push('[CREATIVE] Hard constraints: check word count, forbidden words, structure. The piece must embody its subject through structure, not just describe it.');
  if (isHistory)    hints.push('[HISTORY] Flag any date, name, or place you are not certain of. For scholarly attribution: use the author\'s actual published thesis. Flag uncertainty explicitly.');
  if (isCode)       hints.push('[CODE] Only write code you are certain is correct. Never invent API names. Trace with a concrete example when asked step-by-step.');
  if (isTrick)      hints.push('[CAUTION] Possible cognitive trap. Solve mechanically. If a result seems impossible, check whether it is non-integer/non-physical but still meaningful.');
  if (isList)       hints.push('[COMPLETENESS] If you cannot be certain the list is exhaustive, say so explicitly.');

  // FIX: Uncertainty-flag hint — always present on hard questions
  //      Addresses: knowledge gaps, non-obvious facts
  if (difficulty === 'hard') {
    hints.push('[UNCERTAINTY] Before stating any fact you are less than confident about, mark it (uncertain). Do not present guesses as facts.');
    hints.push('[EDGE CASE] After your answer, ask: is there a boundary condition or exception that changes this? If yes, address it.');
    hints.push('[SELF-VERIFY] Re-read your final answer. Does it actually answer what was asked? Check for missed sub-parts, sign errors, or off-by-one errors. If verification fails, recompute.');
    hints.push('[If you lack the data to answer a part, say so and stop — do not substitute speculation.]');
  }

  if (!hints.length) return messages;

  const patched = { ...last, content: last.content + '\n\n' + hints.join('\n') };
  return [...messages.slice(0, -1), patched];
}

// ── CONSISTENCY NUDGE ─────────────────────────────────────────────────────────

function injectConsistencyNudge(messages, modelKey) {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || typeof last.content !== 'string') return messages;

  const difficulty = classifyDifficulty(last.content);
  if (difficulty === 'simple') return messages;

  const msg = last.content;
  const isMultiPart  = /\b([A-E]\)|[a-e]\)|part [A-Ea-e]|section \d|\(\d\)|\([A-Ea-e]\))\b/i.test(msg) || /[A-E]\./i.test(msg);
  const isSimulation = /\b(simulate|roleplay|dialogue|conversation between|act as|play out)\b/i.test(msg);

  // FIX: Nudge now also asks for uncertainty flagging, not just accuracy.
  //      Addresses: non-obvious facts slipping through without a flag.
  let nudge = '\n\n[Answer accurately. Flag any fact you are uncertain about — do not state guesses as facts.]';
  if (isMultiPart)  nudge += '\n[Answer every sub-part. Do not skip any.]';
  if (isSimulation) nudge += '\n[Produce the content — do not describe it.]';

  const patched = { ...last, content: last.content + nudge };
  return [...messages.slice(0, -1), patched];
}

// ── FORCED THINK FOR NON-REASONING MODELS ────────────────────────────────────
// FIX: Models without native reasoning (hasReasoning: false, hasPromptedThink: false)
//      now receive a lightweight prompted-think instruction on hard questions.
//      Addresses: no reasoning transparency, shallow processing.

function injectForcedThinkOnHard(messages, modelKey, mEntry) {
  // Only apply to models that have neither native reasoning nor prompted think
  if (mEntry.hasReasoning || mEntry.hasPromptedThink) return messages;

  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || typeof last.content !== 'string') return messages;

  const difficulty = classifyDifficulty(last.content);
  if (difficulty !== 'hard') return messages;

  // Append a think-before-answer instruction directly to the user message
  const thinkPrompt = '\n\n[Before answering, work through this step-by-step inside <think>...</think> tags. Show your reasoning. Then give the final answer after </think>.]';
  const patched = { ...last, content: last.content + thinkPrompt };
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
  return { top_p: 0.75, top_k: 20, frequency_penalty: 0.15, presence_penalty: 0.05 };
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
    contMode = false,
  } = body;

  const temp = effectiveTemperature(modelKey, temperature);
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
  const effectiveMaxTokens = Math.max(maxTokens, mEntry.minTokens ?? 5000);

  const trimmed = Array.isArray(messages)
    ? messages
        .filter(m => m && typeof m === 'object' && typeof m.role === 'string' && typeof m.content === 'string')
        .slice(-20)
    : [];

  // Step 1: inject domain-specific verification hints (skip on continuations)
  const trimmedWithHints = contMode ? trimmed : injectTaskHint(trimmed, modelKey);
  // Step 2: inject self-consistency nudge (skip on continuations)
  const trimmedWithNudge = contMode ? trimmedWithHints : injectConsistencyNudge(trimmedWithHints, modelKey);
  // Step 3 (NEW): inject forced think on hard questions for non-reasoning models
  //               Addresses: no reasoning transparency, shallow processing on 0/00/V
  const trimmedFinal = contMode ? trimmedWithNudge : injectForcedThinkOnHard(trimmedWithNudge, modelKey, mEntry);

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
