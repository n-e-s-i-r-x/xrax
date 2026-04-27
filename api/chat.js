export const config = { runtime: 'edge' };

const MODEL_MAP = {
  '0':   { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false, minTokens: 5000 },
  '00':  { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false, minTokens: 5000 },
  '000': { id: 'openai/gpt-oss-120b:free',          hasReasoning: true,  hasPromptedThink: false, minTokens: 5000 },
  'V':   { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false, minTokens: 5000 },
};

function modelEntry(key) { return MODEL_MAP[key] ?? MODEL_MAP['0']; }

// ── ACCURACY RULES ────────────────────────────────────────────────────────────
// Design principles:
//   - Prose, not headed sections. Headers mirror into output as structural padding.
//   - One rule per concern. No repetition across rules.
//   - Concrete operations, not categories. "Plug back in" beats "[MATH]".
//   - Uncertainty flagging is a single, unconditional habit — not a named section.
//   - Edge-case probe belongs in the reasoning phase only; removed from output rules.

const ACCURACY_RULES = `
Match response depth to the question. Simple questions get direct answers. Hard problems get full working. Never add structure a question doesn't require.

Before stating a fact you are not certain of, mark it (uncertain). Do not fill knowledge gaps with plausible-sounding details. "I don't know" is a complete answer.

Never describe what you would do — do it. Never say "we would simulate" — simulate it.

For math: write each step on its own line, one operation per line. State what you are doing and why before each step, not just the operation. After reaching the answer, verify it by substituting back or reversing the operation. If verification fails, recompute from the point of error — do not patch.

For logic: write the argument in symbolic form (P1, P2, ∴C) before evaluating it. Name the argument form. Then explain in plain language why the structure is valid or invalid before considering whether the premises are true.

For code: only use APIs and library functions you are certain exist. Trace through the logic with a concrete input before presenting the answer.

For creative tasks with hard constraints (word limits, forbidden words, required structure): check every constraint explicitly before finalising. The constraint list takes priority over everything else.

For attribution: use the source's actual published position. If you are uncertain of their exact thesis, flag it.

If you lack the information needed to answer, say so directly and stop.`;

const ACCURACY_RULES_000 = ACCURACY_RULES;
// ── THINK RULES ───────────────────────────────────────────────────────────────
// Design principles:
//   - No bold imperative labels (SCOPE FIRST:, ATTACK PLAN:) — they leak into output.
//   - Reasoning flow is described as a sequence of actions, not a checklist to echo.
//   - Edge-case probe placed here (reasoning phase), not in output-phase rules.
//   - Math format requirement restated concisely to match ACCURACY_RULES.
//   - Final rule: output only the answer after </think>, never reference the block.

const THINK_RULES = `
When reasoning inside <think>...</think>:

Start by identifying what the question is actually asking — not its surface form, but its underlying requirement. If it has sub-parts, list them. If it crosses more than one domain, name each domain and what it contributes before attempting a solution.

Before using any fact, ask whether you are certain of it or pattern-completing. Flag uncertain facts inline with (uncertain). If a gap would materially change the answer, say so and stop rather than filling it with inference.

For hard or multi-step problems, settle on an approach before executing it. Two or three sentences is enough — the point is to commit to a method, not describe one.

Work through the problem step by step. For math, write one operation per line. After reaching a preliminary answer, check it by an independent method. For logic, write the symbolic form first and evaluate structure before truth. For code, trace with a concrete input.

After a preliminary answer, ask: is there a boundary condition, degenerate case, or domain exception that would change this? If yes, address it before committing.

Challenge your first conclusion. Find a specific flaw or counterexample. If none holds, proceed.

Reasoning should be dense and direct. Do not restate the rules. Do not narrate what you are about to do — do it.

After </think>, output only the final answer. Do not summarise, reference, or repeat anything from the reasoning block.`;

const THINK_RULES_000 = THINK_RULES;

// ── SYSTEM PROMPTS ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_MAP = {
  '0':   `You are 0, created by Vin.\n${ACCURACY_RULES}\n${THINK_RULES}`,
  '00':  `You are 00, created by Vin.\n${ACCURACY_RULES}\n${THINK_RULES}`,
  '000': `You are 000, created by Vin.\n${ACCURACY_RULES_000}\n${THINK_RULES_000}`,
  'V':   `You are V, created by Vin.\n${ACCURACY_RULES}\n${THINK_RULES}`,
};

// ── DIFFICULTY CLASSIFICATION ─────────────────────────────────────────────────

function classifyDifficulty(msg) {
  const t = msg.trim();
  if (t.length < 40) return 'simple';
  const conversational = /^(hi|hello|hey|thanks?|ok|sure|yes|no|what('?s| is) (up|good)|how (are|r) (you|u)|lol|haha|nice|cool|great|got it|makes sense|understood)/i.test(t);
  if (conversational) return 'simple';

  // Multi-domain questions always need deep processing
  const domainMatches = [
    /\b(math|algebra|calculus|geometry|probability|statistics)\b/i,
    /\b(history|century|war|treaty|empire|revolution)\b/i,
    /\b(logic|argument|premise|syllogism|valid)\b/i,
    /\b(code|algorithm|function|runtime|complexity)\b/i,
    /\b(physics|chemistry|biology|science)\b/i,
  ].filter(re => re.test(t)).length;
  if (domainMatches >= 2) return 'hard';

  // Trick/trap language — shallow processing most likely to fail here
  if (/\b(trick|trap|paradox|always\s+true|never\s+true|impossible|counterintuitive|common\s+mistake|most\s+people|obviously|what\s+is\s+wrong)\b/i.test(t)) return 'hard';

  const hasSubParts = /\b([A-E]\)|[a-e]\)|part [A-Ea-e]|section \d|\(\d\)|\([A-Ea-e]\)|sub.?question)\b/i.test(t) || /[A-E]\./i.test(t);
  const isLong = t.length > 200;
  const isDeep = /\b(prove|proof|derive|algorithm|implement|simulate|explain\s+how|step.?by.?step|in\s+detail|thoroughly|rigorously|trace|analyze|compare|contrast)\b/i.test(t);
  if (!hasSubParts && !isLong && !isDeep) return 'medium';
  return 'hard';
}

// ── TASK HINT INJECTION ───────────────────────────────────────────────────────
// Design principles:
//   - Hints are instructions, not category labels. No [BRACKET TAGS] in hint text.
//   - Each hint tells the model what to DO, not what type the question IS.
//   - Hard-question hints (uncertainty, self-check) are merged here — no separate nudge pass.
//   - Math hint specifies the exact output format (one operation per line, then verify).
//   - Logic hint specifies the exact output format (symbolic form first, then evaluate).
//   - Removed: [INTERSECTION], [UNCERTAINTY], [EDGE CASE], [SELF-VERIFY] bracket labels.
//     Their substance is now expressed as plain imperative instructions.

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

  const domainCount = [
    /\b(math|algebra|calculus|geometry|probability|statistics)\b/i,
    /\b(history|century|war|treaty|empire|revolution)\b/i,
    /\b(logic|argument|premise|syllogism|valid)\b/i,
    /\b(code|algorithm|function|runtime|complexity)\b/i,
    /\b(physics|chemistry|biology|science)\b/i,
  ].filter(re => re.test(msg)).length;
  const isIntersection = domainCount >= 2 ||
    /\b(both|combine|intersection|overlap|relate|connection between|difference between)\b/i.test(msg);

  // Instructions: what to DO, not what type this IS.
  // No bracket category labels — they add meta-commentary noise to the output.
  if (isMultiPart)    hints.push('Identify every sub-part before answering. Work through all of them in order. Do not skip any.');
  if (isIntersection) hints.push('This question involves more than one domain. Determine what each domain contributes to the answer before combining them. Do not collapse them into a single framework prematurely.');
  if (isMath)         hints.push('Write each calculation step on its own line. After reaching the answer, verify it by substituting back or reversing the operation. If verification fails, recompute from the error — do not patch.');
  if (isCalculus)     hints.push('After finding each critical point, classify it (minimum, maximum, or saddle) using the second derivative test. An unclassified critical point is an incomplete answer.');
  if (isLogic)        hints.push('Write the argument in symbolic form (P1, P2, ∴C) and name it before evaluating. Evaluate structural validity first, premise truth second.');
  if (isStats)        hints.push('Sensitivity and specificity measure different things. State each one separately and do not assume they are equal.');
  if (isProof)        hints.push('Every step in the proof must cite a theorem, postulate, or definition by name. Do not skip or abbreviate steps.');
  if (isAlgorithm)    hints.push('Show every step of the algorithm. Trace through it with a concrete example input. For concurrency or conflict resolution, name the specific technique and explain its mechanism.');
  if (isSimulation)   hints.push('Produce the content directly. Do not describe or summarise what you would produce.');
  if (isTiming)       hints.push('Simulate each time increment explicitly. Verify the solution satisfies every constraint simultaneously before presenting it.');
  if (isCreative)     hints.push('Before finalising, check every hard constraint: word count, forbidden words, required structure. Constraints take priority over all other considerations.');
  if (isHistory)      hints.push('Flag any date, name, or place you are not fully certain of. For scholarly attribution, use the source\'s actual published thesis — flag it as uncertain if you are not sure of their exact position.');
  if (isCode)         hints.push('Only use functions and APIs you are certain exist. Trace through the logic with a concrete input before presenting the answer.');
  if (isTrick)        hints.push('Solve this mechanically from first principles. Do not rely on intuition or surface pattern. If the result seems unexpected, verify it rather than dismissing it.');
  if (isList)         hints.push('If the list may be incomplete, say so explicitly rather than presenting it as exhaustive.');

  // Hard-question baseline: uncertainty flagging + self-check.
  // Expressed as plain instructions, not bracket tags, and not repeated in a separate nudge pass.
  if (difficulty === 'hard') {
    hints.push('Mark any fact you are less than certain about as (uncertain). Do not present uncertain claims as facts.');
    hints.push('Before finalising your answer, check that it addresses what was actually asked. Look for missed sub-parts, sign errors, and off-by-one errors. If something fails the check, fix it.');
    hints.push('If you lack the information needed to answer a part, say so and stop — do not substitute inference for missing facts.');
  }

  if (!hints.length) return messages;

  const patched = { ...last, content: last.content + '\n\n' + hints.join('\n') };
  return [...messages.slice(0, -1), patched];
}

// ── CONSISTENCY NUDGE ─────────────────────────────────────────────────────────
// Kept minimal. Hard-question substance was moved into injectTaskHint above.
// This pass only fires for medium difficulty and adds a single terse reminder.
// It does NOT fire for hard questions — they already have full hint coverage.

function injectConsistencyNudge(messages, modelKey) {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || typeof last.content !== 'string') return messages;

  const difficulty = classifyDifficulty(last.content);
  // Simple: no nudge. Hard: covered by injectTaskHint. Only medium gets this.
  if (difficulty !== 'medium') return messages;

  const patched = {
    ...last,
    content: last.content + '\n\nAnswer accurately. Flag anything you are uncertain about.',
  };
  return [...messages.slice(0, -1), patched];
}

// ── FORCED THINK FOR NON-REASONING MODELS ────────────────────────────────────
// Non-reasoning models (hasReasoning: false, hasPromptedThink: false) get a
// prompted <think> block on hard questions only. Instruction is a single
// imperative sentence — not a bulleted list that the model might echo.

function injectForcedThinkOnHard(messages, modelKey, mEntry) {
  if (mEntry.hasReasoning || mEntry.hasPromptedThink) return messages;

  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || typeof last.content !== 'string') return messages;

  const difficulty = classifyDifficulty(last.content);
  if (difficulty !== 'hard') return messages;

  const patched = {
    ...last,
    content: last.content + '\n\nReason through this inside <think>...</think> before giving your answer.',
  };
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

  // Pipeline (skipped entirely on continuations):
  //   1. Domain-specific task hints — concrete operations, no bracket labels
  //   2. Consistency nudge — medium difficulty only; hard is covered by step 1
  //   3. Forced think — non-reasoning models on hard questions only
  const trimmedWithHints  = contMode ? trimmed          : injectTaskHint(trimmed, modelKey);
  const trimmedWithNudge  = contMode ? trimmedWithHints : injectConsistencyNudge(trimmedWithHints, modelKey);
  const trimmedFinal      = contMode ? trimmedWithNudge : injectForcedThinkOnHard(trimmedWithNudge, modelKey, mEntry);

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
