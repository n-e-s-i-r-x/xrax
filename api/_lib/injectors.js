// Message injectors: append task hints, consistency nudges, and forced-think
// instructions to the user's last message based on classified difficulty.
import { classifyDifficulty, isSimpleComparison } from './classifier.js';

// Pattern -> hint text. Only patterns that match the message contribute hints.
// Order is preserved when emitting hints into the prompt.
const TASK_HINTS = [
  ['multiPart',     /\b([A-E]\)|[a-e]\)|part [A-Ea-e]|section \d|\(\d\)|\([A-Ea-e]\)|sub.?question)\b/i, 'Identify every sub-part before answering. Work through all of them in order. Do not skip any.'],
  ['math',          /\b(mod|modulo|remainder|divisib|\^|\bpow\b|equation|solve|calculat|speed|distance|rate|volume|surface area|sphere|cylinder|triangle|percent|average|mean|median|algebra|arithmetic|trig|sine|cosine)\b/i, 'Write each calculation step on its own line with the actual numbers and operations — not a description of what you would calculate. After reaching the answer, verify by substitution or reverse operation.'],
  ['calculus',      /\b(critical point|inflection|derivative|maximum|minimum|saddle|classify|second derivative|optimization)\b/i, 'After finding each critical point, classify it (minimum, maximum, or saddle) using the second derivative test. An unclassified critical point is an incomplete answer.'],
  ['stats',         /\b(sensitivity|specificity|precision|recall|probability|bayes|conditional|false positive|true positive)\b/i, 'Sensitivity and specificity measure different things. State each one separately and do not assume they are equal.'],
  ['proof',         /\b(prove|proof|theorem|lemma|postulate|congruent|parallel|perpendicular|construct|geometric)\b/i, 'Every step in the proof must cite a theorem, postulate, or definition by name. Do not skip or abbreviate steps.'],
  ['algorithm',     /\b(sort|merge|quicksort|binary|search|traverse|graph|tree|recursion|step.?by.?step|trace|simulate|run)\b/i, 'Show every step of the algorithm. Trace through it with a concrete example input. For concurrency or conflict resolution, name the specific technique and explain it.'],
  ['simulation',    /\b(simulate|roleplay|role.?play|dialogue|conversation between|act as|pretend|scenario|play out)\b/i, 'Produce the content directly. Do not describe or summarise what you would produce.'],
  ['timing',        /\b(hourglass|timer|stopwatch|elapsed|minute|second|hour|simultaneously|at the same time|time.?puzzle)\b/i, 'Simulate each time increment explicitly. Verify the solution satisfies every constraint simultaneously before presenting it.'],
  ['creative',      /\b(write|poem|story|haiku|limerick|creative|compose|word.?limit|without using|forbidden|constraint|exactly \d+ words?)\b/i, 'Before finalising, check every hard constraint: word count, forbidden words, required structure. Constraints take priority over all other considerations.'],
  ['history',       /\b(year|century|founded|signed|treaty|war|battle|born|died|reign|monarch|capital|emperor|president|when did|when was)\b/i, "Flag any date, name, or place you are not fully certain of. For scholarly attribution, use the source's actual published thesis — flag it as uncertain if needed."],
  ['code',          /\b(function|def |class |import |return|variable|bug|error|compile|syntax|runtime|debug|algorithm|implement|code|program)\b/i, 'Only use functions and APIs you are certain exist. Trace through the logic with a concrete input, showing key variable values at each step, before presenting the answer.'],
  ['trick',         /\b(trick|trap|riddle|paradox|always|never|all|none|every|impossible|obvious|simple|easy)\b/i, 'Solve this mechanically from first principles. Do not rely on intuition or surface pattern. If the result seems unexpected, verify it rather than dismissing it.'],
  ['list',          /\b(list|enumerate|all of|every|name all|give me all|what are all)\b/i, 'If the list may be incomplete, say so explicitly rather than presenting it as exhaustive.'],
  ['typeTheory',    /\b(type|typing|typable|untypable|hindley.?milner|unif|lambda calculus|type inference|principal type|polymorphi|type variable|type scheme|let.?binding|type environment)\b/i, 'Run the Hindley-Milner unification algorithm explicitly. Generate every type constraint from every sub-expression, then unify step by step, writing each substitution.'],
  ['persistentDS',  /\b(persistent|immutable|functional data structure|version|fully persistent|partially persistent|union.?find|path compression|union.?by.?rank|link.?cut)\b/i, 'Ephemeral complexity bounds do not transfer to persistent data structures without justification. For fully persistent union-find with union-by-rank, O(α(n)) is achievable only with additional care.'],
  ['concurrent',    /\b(lock.?free|wait.?free|cas|compare.?and.?swap|aba|hazard pointer|epoch|rcu|concurrent|atomic|memory order|reclaim|free\(|dequeue|enqueue|stack|queue)\b/i, 'After presenting any lock-free algorithm: (1) inspect every memory reclamation point — if another thread can still hold a reference to a freed node, the algorithm is unsound; (2) never claim wait-freedom unless every operation completes in a bounded number of steps independent of contention.'],
];

// Logic hint excludes simple comparison messages.
const LOGIC_RE = /\b(valid|invalid|fallacy|syllogism|argument|therefore|conclude|premise|disjunct|modus ponens|modus tollens|consequent|antecedent|deductive|inductive)\b/i;
const LOGIC_HINT = 'Write the argument in symbolic form (P1, P2, ∴C) and name it before evaluating. Evaluate structural validity first, premise truth second.';

const DOMAIN_REGEXES = [
  /\b(math|algebra|calculus|geometry|probability|statistics)\b/i,
  /\b(history|century|war|treaty|empire|revolution)\b/i,
  /\b(logic|argument|premise|syllogism|valid)\b/i,
  /\b(code|algorithm|function|runtime|complexity)\b/i,
  /\b(physics|chemistry|biology|science)\b/i,
];
const INTERSECTION_HINT = 'This question involves more than one domain. Determine what each domain contributes to the answer before combining them. Do not collapse them into a single framework.';

function patchLastUser(messages, transform) {
  if (!messages.length) return messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || typeof last.content !== 'string') return messages;
  const next = transform(last);
  if (!next || next === last.content) return messages;
  return [...messages.slice(0, -1), { ...last, content: next }];
}

export function injectTaskHint(messages, _modelKey) {
  return patchLastUser(messages, (last) => {
    const msg = last.content;
    const difficulty = classifyDifficulty(msg);
    if (difficulty === 'simple') return null;

    const hints = [];

    // multiPart goes first (as in original)
    if (TASK_HINTS[0][1].test(msg)) hints.push(TASK_HINTS[0][2]);

    const domainCount = DOMAIN_REGEXES.filter(re => re.test(msg)).length;
    const isIntersection = domainCount >= 2 ||
      /\b(both|combine|intersection|overlap|relate|connection between|difference between)\b/i.test(msg);
    if (isIntersection) hints.push(INTERSECTION_HINT);

    // Remaining hints in original order (skip multiPart re-add)
    for (let i = 1; i < TASK_HINTS.length; i++) {
      const [name, re, hint] = TASK_HINTS[i];
      if (re.test(msg)) hints.push(hint);
    }

    // Logic hint slotted after stats in original; keep logically grouped — append at end is fine
    if (!isSimpleComparison(msg) && LOGIC_RE.test(msg)) hints.push(LOGIC_HINT);

    if (!hints.length) return null;
    return msg + '\n\n' + hints.map(h => `• ${h}`).join('\n');
  });
}

export function injectConsistencyNudge(messages, _modelKey) {
  return patchLastUser(messages, (last) => {
    if (classifyDifficulty(last.content) !== 'medium') return null;
    return last.content + '\n\nAnswer accurately. Flag anything you are uncertain about.';
  });
}

export function injectForcedThinkOnHard(messages, _modelKey, mEntry) {
  if (mEntry.hasReasoning || mEntry.hasPromptedThink) return messages;
  return patchLastUser(messages, (last) => {
    if (classifyDifficulty(last.content) !== 'hard') return null;
    return last.content + '\n\nReason through this inside <think>...</think> before giving your answer.';
  });
}
