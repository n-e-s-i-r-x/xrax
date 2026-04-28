export const config = { runtime: 'edge' };

const MODEL_MAP = {
  '0':   { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false, minTokens: 5000 },
  '00':  { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false, minTokens: 5000 },
  '000': { id: 'openai/gpt-oss-120b:free',          hasReasoning: true,  hasPromptedThink: false, minTokens: 8000 },
  'V':   { id: 'inclusionai/ling-2.6-flash:free',  hasReasoning: false, hasPromptedThink: false, minTokens: 5000 },
};

function modelEntry(key) { return MODEL_MAP[key] ?? MODEL_MAP['0']; }

// ── ACCURACY RULES ────────────────────────────────────────────────────────────

const ACCURACY_RULES = `
Match response depth to the question. Classify it first: simple, medium, or hard. Simple = one direct answer, no working. Medium = key steps only. Hard = full working and verification. Never upgrade complexity because the topic is interesting.

Before stating a fact you are not certain of, mark it (uncertain). Do not fill gaps with plausible-sounding details. "I don't know" is a complete answer. Never describe what you would do — do it.

For math: write each step on its own line with actual numbers and operations. Show every intermediate value. Verify by substituting back or reversing once, when non-obvious. If verification fails, recompute from the error — do not patch.

For factual answers: use the most specific correct term. Do not say "none" when you mean a named exception, or "some" when you can name them. If a question has a common wrong answer, state why it is wrong in one sentence first.

For logic: write the argument in symbolic form (P1, P2, ∴C), name the form, then evaluate structure before truth.

For code — mandatory pre-submission checklist: before presenting any code, execute all five of the following steps in order and state the result of each. Do not skip any step. Do not present code that fails any step.
  STEP 1 — COMPILE CHECK: Read every line. Verify every identifier is defined before it is used (no forward references to values defined later in the same let/def/var expression). Verify every function call matches a defined or imported function. Verify every pattern match is exhaustive or has a wildcard. Verify syntax is valid for the exact target language. If any check fails, fix first.
  STEP 2 — TYPE CHECK: For typed languages (C, C++, OCaml, Rust, Java, TypeScript, Haskell, Go): verify every expression has the correct type at every call site. Verify destructuring patterns match the actual constructor shape (e.g. in OCaml, a single-constructor type Scheme of 'a list * ty cannot be destructured with fst/snd; it requires pattern matching: let Scheme(vars, t) = ...). Verify no implicit coercions are assumed.
  STEP 3 — TRACE: Pick one concrete input. Execute the code mentally, writing the value of every variable at every step. Confirm the output matches the expected result.
  STEP 4 — EDGE CASES: Test mentally: empty input, null/None, zero, single element, maximum size. If any case produces wrong output, fix before presenting.
  STEP 5 — COMPLEXITY AUDIT: State time and space complexity. If the algorithm copies data it should not copy (e.g. an entire array when only a path through it is needed), that is a performance correctness failure — fix it.

For code — general: only use APIs and functions you are certain exist in the target language and version. Every function you call must be defined or imported. No pseudocode in a code answer unless explicitly asked. Syntax must be valid for the stated language. If no language is stated, choose the most appropriate one and name it.

For code — correctness: after writing any function, mentally execute it on at least one normal case and one edge case (empty input, zero, null, single element, max value). If either case fails, fix before presenting. State the result of this check. Off-by-one errors, wrong loop bounds, and incorrect base cases must be caught here.

For code — APIs and libraries: never invent method names. If you are not certain a method exists, do not use it. Prefer standard library over third-party when both work. If a library is required, name the exact import and version constraint if relevant.

For code — complexity: after any non-trivial algorithm, state its time and space complexity with a one-line justification. If a simpler algorithm with equal correctness exists, prefer it unless the question requires the complex one. Copying an entire data structure when only a logarithmic-sized path through it is needed is always wrong — path-copying means duplicating only the O(log n) nodes on the access path, not all n nodes.

For code — concurrency and async: never introduce a race condition. For async code, every awaited call must have its error handled. For concurrent code, identify every shared resource and state what synchronisation protects it.

For code — debugging: when fixing a bug, identify the exact line and root cause before touching anything. State what the bug is, why it causes the symptom, and what the fix does differently. Do not apply a patch that suppresses the symptom without fixing the cause.

For code — low-level and systems: undefined behaviour in C/C++ is a correctness failure. Integer overflow, out-of-bounds access, use-after-free, and uninitialized reads must be identified and prevented, not worked around. For any malloc/free or new/delete pair, verify every allocation has exactly one free on every code path.

For code — OCaml specifically: (a) Mutually recursive definitions require let rec ... and ...; a let rec f = ... that references a value defined later in the same binding group is a forward reference and will not compile — use let rec ... and ... for mutual recursion. (b) Single-constructor types must be destructured by pattern matching their constructor: let Scheme(vars, t) = x, not fst x or snd x — fst/snd only work on tuples. (c) List.map, List.fold_left, List.assoc are in the standard library; verify any other module function exists before using it. (d) After writing any OCaml function, re-read every let binding and confirm no binding refers to a name that is not yet in scope at the point of that binding.

For code — C/C++ persistent data structures: path-copying means allocating new nodes only for the O(log n) nodes on the traversal path from root to the modified node, then returning a new root. It does NOT mean copying the entire backing array with std::make_shared<std::vector<Node>>(existing_vector) — that is O(n) and defeats the purpose. For each persistent operation, count exactly how many nodes are newly allocated: it must be proportional to the depth of the structure, not its total size.

For code — C/C++ lock-free memory reclamation: before writing free(ptr) or delete ptr in any lock-free code path, answer: "Between the moment another thread loaded this pointer and now, could that thread still be dereferencing it?" For a Treiber stack pop, the answer is yes — the thread that read old_head may not have finished reading old_head->next by the time the CAS succeeds. Therefore free(old_head) after a successful pop CAS is a use-after-free. The fix is to name and apply a safe reclamation scheme: hazard pointers, epoch-based reclamation (EBR), or RCU. Never write a comment asserting safety without this proof.

For type theory and type inference: do not conclude a term is untypable until you have fully run the unification algorithm step by step — every constraint, every substitution. A type error requires a specific clash between two concrete types. If a term is typable, derive its principal type. An Algorithm W implementation that omits Let is incomplete — Let is where generalisation occurs. Every helper (apply, apply_env, lookup, occurs, fresh variable generation) must be fully implemented, not stubbed.

For complexity theory and persistent data structures: ephemeral bounds do not transfer to persistent structures without proof. O(α(n)) for fully persistent union-find is theoretically impossible — the correct bound is O(log²n). When claiming O(log n), confirm whether each node lookup in the backing store is O(1) or O(log n) — if the latter, the true bound is O(log²n). A correct fully persistent structure supports true branching: old version handles must remain valid and independent after newer versions are created. Array-indexed versioning into a shared mutable array does NOT satisfy this — if version 3 is branched into 4a and 4b, mutations from 4a must not affect 4b, and both must still be able to query version 3 correctly. Verify this property explicitly before claiming persistence. Any function that maps a version handle to a node (e.g. node_of, find_node, lookup) must actually consult the persistent backing store for that version — returning a fixed offset into a shared mutable array is broken by definition. State mutable fields explicitly; if a field is declared mutable on a type that claims immutability, that is a correctness failure and must be called out.

For concurrent data structures: after any lock-free algorithm, check every reclamation point. If another thread can still hold a reference, naive free() is unsafe — name the required scheme (hazard pointers, epoch-based reclamation, RCU). Never assert that a node is safe to free without proving no other thread holds a live pointer to it. A comment saying "safe: no other thread can hold this node" is a claim that requires proof — the proof must show that no thread can have loaded the pointer between the successful CAS and the free(). For ABA: stamps/tags are only needed on CAS operations vulnerable to the ABA problem; for a Treiber stack, ABA only threatens pop (where a popped-and-reallocated node could be pushed back), not push. Do not add ABA tags to push. For atomic ordering: every atomic operation must specify its memory order (relaxed, acquire, release, acq_rel, seq_cst) with a one-sentence justification. Default (seq_cst) is acceptable only if you state why weaker ordering is insufficient. For any atomic struct larger than the native word, verify lock-freedom explicitly: in C11, _Atomic on a 16-byte struct is not guaranteed lock-free — require __attribute__((aligned(16))) and verify via atomic_is_lock_free().

For type theory — pretty printing and arrow associativity: function arrows are right-associative. This means A -> B -> C is A -> (B -> C) and must be printed without the outer parentheses on the right-hand side. Parentheses around the right-hand side of an arrow are wrong. Only parenthesise the left-hand side of an arrow when the left-hand side is itself a function type. Example: the correct printing of (α -> α) -> α -> α has no parens on the right of the outer arrow; printing it as (α -> α) -> (α -> α) is incorrect. For unification walkthroughs: show every substitution composition step explicitly. After each unification step, state the current substitution map, then show how the next constraint is simplified under that substitution before unifying. Narrating the conclusion without showing intermediate substitution states is an incomplete walkthrough.

For creative tasks with hard constraints: check every constraint (word count, forbidden words, required structure) explicitly before finalising. Constraints take priority over everything else.

If you lack the information needed to answer, say so and stop.`;

const ACCURACY_RULES_000 = ACCURACY_RULES;

// ── THINK RULES ───────────────────────────────────────────────────────────────

const THINK_RULES = `
When reasoning inside <think>...</think>:

Classify first: simple (one fact, one step), medium (multi-step), or hard (proof, algorithm, multi-domain, trick). Simple = one or two lines. Medium = key steps. Hard = full derivation with verification. Do not over-examine simple questions.

Identify the actual underlying requirement. For sub-parts, classify each independently. For multi-domain questions, name each domain's contribution before combining.

Before using any fact, ask: certain or pattern-completing? Flag uncertain facts with (uncertain). If a gap would change the answer, stop and say so.

For hard problems: commit to an approach in one or two sentences, then execute it with actual values and actual steps. Naming a method without executing it is narration, not reasoning.

For math: write actual numbers and operations, one operation per line with a label. A reasoning block with no numbers for a math question is a failed block. After reaching a result, verify by an independent method and show the check.

For code: before writing any implementation, run the five-step checklist mentally: (1) compile — every identifier defined before use, no forward references, valid syntax; (2) type — every destructuring matches the actual constructor, no fst/snd on single-constructor types in OCaml; (3) trace — execute on one concrete input writing all variable values; (4) edge cases — empty, null, zero, single element; (5) complexity audit — if copying more data than the algorithm requires, that is wrong. State the result of each step. Fix failures before writing the final answer.

For code — OCaml: scan every let or let rec binding. If a binding uses a name defined later in the same mutual group without and, it is a forward reference and will not compile — restructure using let rec ... and .... If a single-constructor type (e.g. Scheme of vars * ty) is destructured anywhere, use pattern matching (let Scheme(vars, t) = x), never fst/snd. After writing any function, re-read it as if you are the OCaml compiler: does every name have a binding in scope at the point it is used?

For code — C/C++ data structures: if the question involves a persistent (immutable/versioned) structure, path-copying means allocating only the nodes on the root-to-target path — O(depth) new allocations per operation. std::make_shared<std::vector<Node>>(old_vec) copies all n nodes and is O(n) — this is full-copy, not path-copy, and is wrong. For each persistent operation, count the exact number of new node allocations and verify it is O(log n) or O(depth), not O(n).

For code — C/C++ lock-free: before every free() or delete in a lock-free path, write out the proof: "No other thread can hold a live pointer to this object because ___." If you cannot complete that sentence with a concrete argument, the free is unsafe. For a Treiber stack pop, you cannot complete it — another thread may have loaded head before your CAS and still be reading head->next. The correct answer is to defer reclamation using hazard pointers, EBR, or RCU — name which one and explain why it is safe.

For debugging: identify the exact line and root cause first — state what the bug is, why it produces the symptom, what the fix changes. For performance: state current complexity, target complexity, and exactly what change achieves it. For async/concurrent: identify every shared resource and what synchronises it; do not introduce races. For low-level: check every pointer, every free, every array access for undefined behaviour.

For type inference: run Hindley-Milner explicitly — every constraint from every sub-expression, every substitution one by one. Untypable requires a specific clash. For Algorithm W: implement Var, Lam, App, and Let. Let requires: run W on bound expression, generalise the type, extend env with the scheme, run W on body. All helpers must be fully implemented before being called — no stubs. For pretty printing types: function arrows are right-associative — never parenthesise the right-hand side of an arrow. Only parenthesise the left-hand side when it is itself a function type. Concretely: (α → α) → α → α is correct; (α → α) → (α → α) is wrong (spurious outer parens on the right). For unification walkthroughs: after each unification step, write the current substitution map explicitly, then show how the remaining constraints are simplified under that substitution before proceeding to the next step.

For persistent data structures: before writing any persistent structure, define what "branching" means for it and verify the implementation actually supports it. Branching means: take version V, create V1 from it, create V2 also from V — then queries on V, V1, and V2 must all return correct independent results. Test this property mentally with a two-branch scenario before presenting the implementation. For every function that retrieves a node by version (e.g. node_of, find, lookup): trace it on a concrete version handle and confirm it consults the persistent backing store, not a shared mutable array. If the function would return the same value for every version, it is broken. For complexity: identify (a) the cost of one node lookup in the backing store, (b) the number of such lookups per operation, then multiply. State both quantities explicitly. Do not claim O(log n) if any single lookup costs O(log n) — the result is O(log²n).

For concurrent algorithms: at every point where a node or memory region is freed or retired, ask: "Could any other thread have loaded a pointer to this object before the CAS completed?" If yes, the free is unsafe — name the required reclamation scheme. Never assert safety without this proof. For ABA analysis: identify the exact CAS that is vulnerable (for a Treiber stack this is the pop CAS, not the push CAS — push cannot experience ABA because the old head is never reused while still expected). Do not add ABA mitigation to operations that cannot experience it. For memory ordering: state the required order for every atomic load and store, with a one-line justification. Show why the specific ordering is necessary (e.g. "release on push to ensure the node's data is visible before the pointer is published; acquire on pop to ensure we see the node's data after loading the pointer").

For factual questions: after reaching a first answer, ask whether there is an exception or bordering case. Challenge the conclusion — find a specific flaw. If none holds, state why the obvious objection fails.

After a preliminary answer, ask: boundary condition? Degenerate case? Domain exception? Address before committing.

Reasoning must be dense and direct. Do not restate rules. Do not narrate — do. Do not repeat a derivation — reference the result.

After </think>, output only the final answer. Do not summarise or reference the reasoning block. Simple questions get one-line answers.`;

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

  const domainMatches = [
    /\b(math|algebra|calculus|geometry|probability|statistics)\b/i,
    /\b(history|century|war|treaty|empire|revolution)\b/i,
    /\b(logic|argument|premise|syllogism|valid)\b/i,
    /\b(code|algorithm|function|runtime|complexity)\b/i,
    /\b(physics|chemistry|biology|science)\b/i,
  ].filter(re => re.test(t)).length;
  if (domainMatches >= 2) return 'hard';

  if (/\b(trick|trap|paradox|always\s+true|never\s+true|impossible|counterintuitive|common\s+mistake|most\s+people|obviously|what\s+is\s+wrong)\b/i.test(t)) return 'hard';

  const hasSubParts = /\b([A-E]\)|[a-e]\)|part [A-Ea-e]|section \d|\(\d\)|\([A-Ea-e]\)|sub.?question)\b/i.test(t) || /[A-E]\./i.test(t);
  const isLong = t.length > 200;
  const isDeep = /\b(prove|proof|derive|algorithm|implement|simulate|explain\s+how|step.?by.?step|in\s+detail|thoroughly|rigorously|trace|analyze|compare|contrast|debug|fix|bug|optimize)\b/i.test(t);
  if (!hasSubParts && !isLong && !isDeep) return 'medium';
  return 'hard';
}

// ── TASK HINT INJECTION ───────────────────────────────────────────────────────

function injectTaskHint(messages, modelKey) {
  if (!messages.length) return messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || typeof last.content !== 'string') return messages;

  const msg = last.content;
  const difficulty = classifyDifficulty(msg);
  if (difficulty === 'simple') return messages;

  const hints = [];

  const isMath         = /\b(mod|modulo|remainder|divisib|\^|\bpow\b|equation|solve|calculat|speed|distance|rate|volume|surface area|sphere|cylinder|triangle|percent|average|mean|median|algebra|arithmetic|\d+\s*[×\*\/\+\-]\s*\d)/i.test(msg);
  const isLogic        = /\b(valid|invalid|fallacy|syllogism|argument|therefore|conclude|premise|disjunct|modus|consequent|antecedent|either|or|if.+then)\b/i.test(msg);
  const isHistory      = /\b(year|century|founded|signed|treaty|war|battle|born|died|reign|monarch|capital|emperor|president|when did|when was)\b/i.test(msg);
  const isProof        = /\b(prove|proof|theorem|lemma|postulate|congruent|parallel|perpendicular|construct|geometric)\b/i.test(msg);
  const isAlgorithm    = /\b(sort|merge|quicksort|binary|search|traverse|graph|tree|recursion|step.?by.?step|trace|simulate|run)\b/i.test(msg);
  const isCreative     = /\b(write|poem|story|haiku|limerick|creative|compose|word.?limit|without using|forbidden|constraint|exactly \d+ words?)\b/i.test(msg);
  const isMultiPart    = /\b([A-E]\)|[a-e]\)|part [A-Ea-e]|section \d|\(\d\)|\([A-Ea-e]\)|sub.?question)\b/i.test(msg) || /[A-E]\./i.test(msg);
  const isSimulation   = /\b(simulate|roleplay|role.?play|dialogue|conversation between|act as|pretend|scenario|play out)\b/i.test(msg);
  const isTiming       = /\b(hourglass|timer|stopwatch|elapsed|minute|second|hour|simultaneously|at the same time|time.?puzzle)\b/i.test(msg);
  const isStats        = /\b(sensitivity|specificity|precision|recall|probability|bayes|conditional|false positive|true positive)\b/i.test(msg);
  const isCalculus     = /\b(critical point|inflection|derivative|maximum|minimum|saddle|classify|second derivative|optimization)\b/i.test(msg);
  const isTrick        = /\b(trick|trap|riddle|paradox|always|never|all|none|every|impossible|obvious|simple|easy)\b/i.test(msg);
  const isList         = /\b(list|enumerate|all of|every|name all|give me all|what are all)\b/i.test(msg);

  const isCodeGeneral  = /\b(function|def |class |import |return|variable|bug|error|compile|syntax|runtime|debug|algorithm|implement|code|program|script)\b/i.test(msg);
  const isCodeDebug    = /\b(bug|debug|fix|broken|error|crash|exception|wrong output|not working|fails|issue)\b/i.test(msg);
  const isCodePerf     = /\b(optimize|optimise|slow|performance|bottleneck|faster|efficiency|big.?o|complexity)\b/i.test(msg);
  const isCodeAsync    = /\b(async|await|promise|callback|race condition|thread|lock|mutex|semaphore|parallel)\b/i.test(msg);
  const isCodeLowLevel = /\b(pointer|malloc|free|memory leak|buffer|overflow|undefined behaviour|undefined behavior|segfault|null.?deref|uninitialized)\b/i.test(msg);
  const isCodeOCaml    = /\b(ocaml|\.ml\b|let rec|fun |match |with\s*\||List\.|module |open [A-Z]|type \w+ =|Scheme|forall|polymorphic|hindley|algorithm w)\b/i.test(msg);
  const isCodePathCopy = /\b(path.?cop|persistent.*struct|immutable.*tree|functional.*tree|copy.?on.?write|versioned.*node|node.*version)\b/i.test(msg);
  const isCodeLockFree = /\b(lock.?free|treiber|cas\b|compare.?and.?swap|atomic.*stack|atomic.*queue|free\s*\(|hazard|epoch|reclaim)\b/i.test(msg);

  const isTypeTheory   = /\b(type|typing|typable|untypable|hindley.?milner|unif|lambda calculus|type inference|principal type|polymorphi|type variable|type scheme|let.?binding|type environment)\b/i.test(msg);
  const isPersistentDS = /\b(persistent|immutable|functional data structure|version|fully persistent|partially persistent|union.?find|path compression|union.?by.?rank|link.?cut)\b/i.test(msg);
  const isConcurrent   = /\b(lock.?free|wait.?free|cas|compare.?and.?swap|aba|hazard pointer|epoch|rcu|concurrent|atomic|memory order|reclaim|dequeue|enqueue)\b/i.test(msg);

  const domainCount = [
    /\b(math|algebra|calculus|geometry|probability|statistics)\b/i,
    /\b(history|century|war|treaty|empire|revolution)\b/i,
    /\b(logic|argument|premise|syllogism|valid)\b/i,
    /\b(code|algorithm|function|runtime|complexity)\b/i,
    /\b(physics|chemistry|biology|science)\b/i,
  ].filter(re => re.test(msg)).length;
  const isIntersection = domainCount >= 2 || /\b(both|combine|intersection|overlap|relate|connection between|difference between)\b/i.test(msg);

  if (isMultiPart)     hints.push('Identify every sub-part before answering. Work through all of them in order. Do not skip any.');
  if (isIntersection)  hints.push('This question spans more than one domain. Determine what each domain contributes before combining. Do not collapse them prematurely.');
  if (isMath)          hints.push('Write each calculation step on its own line with actual numbers and operations. After reaching the answer, verify by substituting back or reversing. If verification fails, recompute from the error — do not patch.');
  if (isCalculus)      hints.push('After finding each critical point, classify it (minimum, maximum, or saddle) using the second derivative test. An unclassified critical point is an incomplete answer.');
  if (isLogic)         hints.push('Write the argument in symbolic form (P1, P2, ∴C) and name it before evaluating. Evaluate structural validity first, then premise truth.');
  if (isStats)         hints.push('Sensitivity and specificity measure different things. State each one separately and do not assume they are equal.');
  if (isProof)         hints.push('Every step in the proof must cite a theorem, postulate, or definition by name. Do not skip or abbreviate steps.');
  if (isAlgorithm)     hints.push('Show every step of the algorithm with a concrete example input, tracing variable values at each step.');
  if (isSimulation)    hints.push('Produce the content directly. Do not describe or summarise what you would produce.');
  if (isTiming)        hints.push('Simulate each time increment explicitly. Verify the solution satisfies every constraint simultaneously before presenting it.');
  if (isCreative)      hints.push('Before finalising, check every hard constraint: word count, forbidden words, required structure. Constraints override everything else.');
  if (isHistory)       hints.push('Flag any date, name, or place you are not fully certain of. Flag scholarly attributions as uncertain if you are not sure of their exact thesis.');
  if (isTrick)         hints.push('Solve from first principles. Do not rely on intuition or surface pattern. If the result seems unexpected, verify rather than dismiss.');
  if (isList)          hints.push('If the list may be incomplete, say so explicitly rather than presenting it as exhaustive.');

  if (isCodeGeneral)   hints.push('MANDATORY CODE CHECKLIST — run all five before presenting: (1) COMPILE: every name defined before use, no forward references, valid syntax; (2) TYPE: every destructuring matches actual constructor shape; (3) TRACE: execute on one concrete input writing all variable values step by step; (4) EDGE CASES: empty, null/None, zero, single element — fix any failure; (5) COMPLEXITY: count exact allocations/operations, confirm no unnecessary full-copy where path-copy is required. State pass/fail for each step.');
  if (isCodeOCaml)     hints.push('OCaml-specific: (a) Scan every let/let rec binding — if any name is used before its binding is in scope (forward reference in the same expression), restructure with `let rec ... and ...`. (b) Every single-constructor type (e.g. `Scheme of vars * ty`) must be destructured with its constructor pattern (`let Scheme(vars, t) = x`), never with fst/snd — fst/snd only work on tuples. (c) Re-read your code as if you are the OCaml compiler: does every identifier have a binding in scope at every point of use?');
  if (isCodePathCopy)  hints.push('Path-copying: allocate ONLY the nodes on the root-to-modified-node path — O(log n) new nodes per operation. `make_shared<vector<Node>>(old_vec)` or any full-array copy is O(n) and wrong — that is full-copy, not path-copy. Count the exact number of newly allocated nodes in your implementation and verify it equals the path length, not the total structure size.');
  if (isCodeLockFree)  hints.push('Before every free()/delete in lock-free code, write the reclamation proof: "No other thread holds a live pointer to this object because ___." For a Treiber stack pop, that proof cannot be completed — another thread may have loaded head before your CAS and still be reading head->next. The only safe answers are: (a) hazard pointers, (b) epoch-based reclamation (EBR), or (c) RCU. Name which scheme you use and confirm it applies at the exact reclamation point. Never write a safety assertion without this proof.');
  if (isCodeDebug)     hints.push('Identify the exact line and root cause before touching anything. State: what the bug is, why it produces the symptom, what the fix changes. Do not patch symptoms — fix the cause.');
  if (isCodePerf)      hints.push('State the current time and space complexity with a one-line justification, then the target complexity and the specific change that achieves it. Do not introduce correctness regressions for performance.');
  if (isCodeAsync)     hints.push('Identify every shared resource and state what synchronisation protects it. Every awaited call must have its error handled. Do not introduce race conditions.');
  if (isCodeLowLevel)  hints.push('Undefined behaviour is a correctness failure. Check every pointer dereference, array access, and free() — verify no path double-frees, leaks, or reads freed memory. Catch integer overflow before it happens.');

  if (isTypeTheory)    hints.push('Run Hindley-Milner unification explicitly: every constraint from every sub-expression, every substitution step by step — show the substitution map after each step and simplify remaining constraints under it before proceeding. "Untypable" requires a specific clash between two concrete types. For Algorithm W, implement all cases including Let (where generalisation occurs) and all helpers (apply, apply_env, lookup, occurs, fresh var). No stubs. For pretty printing: function arrows are right-associative — never parenthesise the right-hand side of an arrow (e.g. (α → α) → α → α is correct; (α → α) → (α → α) is wrong).');
  if (isPersistentDS)  hints.push('Verify the implementation supports true branching — branch from version V to create V1 and V2; queries on all three must return independent correct results. Array-indexed versioning into a shared mutable array does NOT satisfy this. Any version-lookup function (node_of, find, etc.) that returns a fixed offset into a shared array is broken — trace it on two branches and confirm independence. State every mutable field explicitly; mutable fields on a type claiming immutability is a correctness failure. Derive complexity: (a) cost per node lookup in backing store × (b) lookups per operation = actual bound. O(α(n)) for fully persistent union-find is impossible — correct bound is O(log²n).');
  if (isConcurrent)    hints.push('At every free/retire point, prove no other thread holds a live pointer before freeing — if proof fails, name the required scheme (hazard pointers, epoch-based, RCU). Never write "safe: no other thread can hold this" without the proof. Identify the exact CAS vulnerable to ABA — for a Treiber stack it is the pop CAS only, not push; do not add ABA tags to push. For every atomic operation state its memory order and why (e.g. release on publish so data is visible before pointer; acquire on load so data is visible after). For 16-byte atomic structs in C11: require __attribute__((aligned(16))) and verify lock-freedom via atomic_is_lock_free().');

  if (difficulty === 'hard') {
    hints.push('Mark any fact you are less than certain about as (uncertain).');
    hints.push('Before finalising, check: missed sub-parts, sign errors, off-by-one errors, missing edge cases. State the result of this check explicitly.');
    hints.push('If you lack the information needed to answer a part, say so and stop — do not substitute inference.');
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
  if (difficulty !== 'medium') return messages;
  const patched = {
    ...last,
    content: last.content + '\n\nAnswer accurately. Flag anything you are uncertain about.',
  };
  return [...messages.slice(0, -1), patched];
}

// ── FORCED THINK FOR NON-REASONING MODELS ────────────────────────────────────

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

function isHardCSTheory(msg) {
  return /\b(type|typing|typable|untypable|hindley.?milner|unif|lambda calculus|type inference|principal type|polymorphi|persistent|union.?find|path compression|lock.?free|wait.?free|cas|compare.?and.?swap|aba|hazard pointer|epoch|rcu|concurrent|atomic)\b/i.test(msg);
}

function isHardCodeImpl(msg) {
  // Hard implementation questions where determinism matters more than creativity.
  // Temperature 0 eliminates invented API names, wrong syntax, and random structural choices.
  return /\b(implement|write.*function|write.*class|write.*program|write.*algorithm|write.*code|code.*for|algorithm.*for|function.*that|implement.*in\s+(c\b|c\+\+|ocaml|rust|go|java|haskell|python|javascript|typescript))\b/i.test(msg)
    && classifyDifficulty(msg) === 'hard';
}

function effectiveTemperature(modelKey, requested, lastUserMsg) {
  if (lastUserMsg && isHardCSTheory(lastUserMsg)) {
    if (modelKey === '000') return 0.0;
    return 0.05;
  }
  // Hard code implementation: lock to near-zero — determinism eliminates invented APIs/syntax
  if (lastUserMsg && isHardCodeImpl(lastUserMsg)) {
    return 0.0;
  }
  if (modelKey === '000') return 0.05;
  if (modelKey === '00')  return Math.min(requested, 0.3);
  if (modelKey === '0')   return Math.min(requested, 0.4);
  if (modelKey === 'V')   return Math.min(requested, 0.5);
  return Math.min(requested, 0.4);
}

// ── SAMPLING PARAMS ───────────────────────────────────────────────────────────

function samplingParams(modelKey) {
  // BUG FIX: top_k is not a standard OpenRouter/OpenAI parameter and was causing
  // silent request failures / early stream termination on many models.
  // Removed top_k; kept top_p, frequency_penalty, presence_penalty which are
  // universally supported. This was the primary cause of the AI stopping mid-response.
  return { top_p: 0.9, frequency_penalty: 0.1, presence_penalty: 0.05 };
}

// ── STOP SEQUENCES ────────────────────────────────────────────────────────────
// FIX: Removed overly broad stop sequences that were silently truncating legitimate
// responses. Only keep sequences that are clearly problematic self-referential leaks.

const STOP_SEQUENCES = [
  'As an AI language model,',
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
  if (status===429) return 'Rate limited. Please wait a moment and try again.';
  if (status===402) return 'Out of credits. Please add funds to your OpenRouter account.';
  if (status>=500)  return 'Upstream service unavailable. Please try again in a moment.';
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

async function fetchWithRetry(url, options, maxRetries=3) {
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

// ── PAYLOAD BUILDER ───────────────────────────────────────────────────────────
// FIX: Removed the Vercel Sandbox builder entirely. It was a critical reliability
// failure point — if the sandbox import failed, timed out, or returned malformed
// JSON, the entire request silently died. The inline builder is correct and safe;
// there was no security or correctness benefit to running it in a sandbox.

function buildPayload(persona, trimmedMsgs, hasPromptedThink) {
  const thinkInstruction = hasPromptedThink
    ? `\n\nOUTPUT FORMAT — MANDATORY:\nEvery response must begin with <think> followed by your brief internal reasoning, then </think>, then your answer. Nothing before <think>. Nothing between </think> and your answer except a newline. Do not label, explain, or reference this format.`
    : '';
  const finalPersona = persona + thinkInstruction;
  return [{ role:'system', content: finalPersona }, ...trimmedMsgs];
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

  // FIX: Robust API key resolution — covers Node.js edge runtimes and
  // Cloudflare Workers (which expose env vars on the global scope differently).
  const apiKey = (typeof process !== 'undefined' && process.env?.OPENROUTER_API_KEY)
    || (typeof globalThis !== 'undefined' && globalThis.OPENROUTER_API_KEY)
    || null;

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

  // FIX: Validate and sanitize messages more carefully.
  // The previous slice(-20) could include messages with non-string content
  // (e.g. array content from multi-modal clients), which breaks some models.
  const trimmed = Array.isArray(messages)
    ? messages
        .filter(m =>
          m &&
          typeof m === 'object' &&
          typeof m.role === 'string' &&
          (m.role === 'user' || m.role === 'assistant' || m.role === 'system') &&
          typeof m.content === 'string' &&
          m.content.trim().length > 0
        )
        .slice(-20)
    : [];

  const lastUserMsg = [...trimmed].reverse().find(m => m.role === 'user')?.content ?? '';
  const temp = effectiveTemperature(modelKey, temperature, lastUserMsg);
  const sampling = samplingParams(modelKey);

  const trimmedWithHints = contMode ? trimmed          : injectTaskHint(trimmed, modelKey);
  const trimmedWithNudge = contMode ? trimmedWithHints : injectConsistencyNudge(trimmedWithHints, modelKey);
  const trimmedFinal     = contMode ? trimmedWithNudge : injectForcedThinkOnHard(trimmedWithNudge, modelKey, mEntry);

  // Replaced try/catch sandbox wrapper with direct deterministic call
  const messagesPayload = buildPayload(persona, trimmedFinal, hasPromptedThink);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk) => { try { controller.enqueue(encoder.encode(chunk)); } catch(_) {} };

      let upstreamRes;
      try {
        // FIX: Build request body carefully — only include parameters that are
        // universally supported by OpenRouter. Non-standard params (top_k) caused
        // silent 400/422 errors or stream termination on some models.
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

        // Only add reasoning config for models that explicitly support it
        if (hasReasoning) {
          reqBody.reasoning = { max_tokens: Math.min(Math.floor(effectiveMaxTokens * 0.6), 14000) };
        }

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
          3
        );
      } catch(err) {
        send(sseContent('Network error. Please try again.'));
        send('data: [DONE]\n\n');
        try { controller.close(); } catch(_) {}
        return;
      }

      if (!upstreamRes.ok) {
        // FIX: Log status for debugging without leaking to client
        let errBody = '';
        try { errBody = await upstreamRes.text(); } catch(_) {}
        // errBody available for server-side logging if needed
        send(sseContent(genericError(upstreamRes.status)));
        send('data: [DONE]\n\n');
        try { controller.close(); } catch(_) {}
        return;
      }

      // FIX: Non-streaming fallback was broken for reasoning models — it never
      // extracted reasoning_content properly because it assumed a specific block
      // order. Rewrote to be order-agnostic and handle missing fields gracefully.
      if (!upstreamRes.body) {
        try {
          const data = await upstreamRes.json();
          const msg = data?.choices?.[0]?.message ?? {};
          const reasoningRaw = msg.reasoning_content ?? msg.reasoning ?? '';
          let answerText = msg.content ?? '';
          const fr = data?.choices?.[0]?.finish_reason ?? 'stop';

          let combined = '';
          if (isThinkModel && hasReasoning && reasoningRaw) {
            const cleaned = reasoningRaw.split('\n').map(l => looksLikeLeak(l) ? '…' : l).join('\n');
            combined += `<think>\n${cleaned}\n</think>\n`;
            // If model returned reasoning but no content, synthesize from last reasoning line
            if (!answerText.trim()) {
              const lines = reasoningRaw.trimEnd().split('\n');
              for (let i = lines.length - 1; i >= 0; i--) {
                const l = lines[i].trim();
                if (l && !looksLikeLeak(lines[i])) { answerText = l; break; }
              }
            }
          }
          combined += answerText;
          if (!combined.trim()) combined = '_(No answer generated — please try again)_';
          send(sseContent(combined));
          send(`data: {"choices":[{"delta":{},"finish_reason":"${fr}"}]}\n\n`);
        } catch(_) {
          send(sseContent('[Empty response — please try again]'));
        }
        send('data: [DONE]\n\n');
        try { controller.close(); } catch(_) {}
        return;
      }

      // ── STREAMING PATH ────────────────────────────────────────────────────

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();

      // FIX: Use a single string buffer across all reads. The previous code used
      // separate `buffer` and line-splitting logic that could lose partial SSE
      // lines at chunk boundaries, causing parse errors and dropped tokens.
      let readBuffer = '';

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

      // FIX: Extracted SSE line handler to a named function for clarity and to
      // ensure it is called identically on both the main loop and flush paths.
      const handleDataLine = (raw) => {
        const trimmedRaw = raw.trim();
        if (!trimmedRaw || trimmedRaw === '[DONE]') return;

        let parsed;
        try { parsed = JSON.parse(trimmedRaw); }
        catch (_) { return; } // Malformed SSE line — skip silently

        const choice = parsed?.choices?.[0];
        if (!choice) return;

        const delta = choice.delta || {};
        // FIX: Some OpenRouter models emit reasoning in different field names;
        // check all known variants in priority order.
        const reasoningDelta = delta.reasoning_content ?? delta.reasoning ?? null;
        const contentDelta = (typeof delta.content === 'string') ? delta.content : null;

        if (!isThinkModel) {
          if (contentDelta !== null && contentDelta.length > 0) send(sseContent(contentDelta));
          if (choice.finish_reason) finishReason = choice.finish_reason;
          return;
        }

        if (hasReasoning) {
          if (reasoningDelta !== null && reasoningDelta.length > 0) {
            if (!inReasoningPhase && !thinkOpened) {
              send(sseContent('<think>\n'));
              inReasoningPhase = true;
              thinkOpened = true;
            }
            emitThink(reasoningDelta);
          }
          if (contentDelta !== null && contentDelta.length > 0) {
            closeThinkIfOpen();
            send(sseContent(contentDelta));
          }
        } else {
          // promptedThink or non-reasoning model with think injection
          let out = '';
          if (contentDelta !== null) out += contentDelta;
          if (reasoningDelta !== null && contentDelta === null) out += reasoningDelta;

          if (!promptedThinkLeadStripped && out.length) {
            out = out.trimStart();
            if (out.length) promptedThinkLeadStripped = true;
          }
          if (out.length) {
            if (filterPromptedThink) out = filterPromptedThink(out);
            if (out.length) send(sseContent(out));
          }
        }

        if (choice.finish_reason) finishReason = choice.finish_reason;
      };

      // FIX: Stream reading loop now correctly handles chunk boundaries.
      // The previous implementation called lines.pop() to keep a partial line
      // but then didn't properly guard against the very last line being a
      // non-empty partial when `done` is true — causing the last SSE event
      // to be dropped. Now the final flush handles all remaining buffer content.
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (value) {
            readBuffer += decoder.decode(value, {stream: !done});
          }

          // Process all complete lines (terminated by \n)
          let newlineIdx;
          while ((newlineIdx = readBuffer.indexOf('\n')) !== -1) {
            const line = readBuffer.slice(0, newlineIdx);
            readBuffer = readBuffer.slice(newlineIdx + 1);
            const l = line.trimEnd(); // preserve leading 'data:' prefix exactly
            if (l.startsWith('data:')) {
              handleDataLine(l.slice(5));
            }
          }

          if (done) {
            // Flush any remaining content that didn't end with \n
            if (readBuffer.trim()) {
              const l = readBuffer.trimEnd();
              if (l.startsWith('data:')) handleDataLine(l.slice(5));
            }
            break;
          }
        }
      } catch(streamErr) {
        // Stream was interrupted (e.g. client disconnected or upstream closed early)
        send(sseContent('\n[Stream interrupted — please try again.]'));
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
