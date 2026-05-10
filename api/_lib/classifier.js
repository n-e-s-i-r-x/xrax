// Difficulty classification for incoming user messages.

// Numeric/decimal comparisons are always "simple" — never escalate.
export function isSimpleComparison(msg) {
  const t = msg.trim();
  return (
    /\b(bigger|larger|smaller|greater|less|higher|lower|more|fewer)\b.*\d[\d.]*.*\d[\d.]*/i.test(t) ||
    /\d[\d.]*\s*(vs\.?|or|>|<|versus)\s*\d[\d.]*/i.test(t) ||
    /which\s+(is|number\s+is)\s+(bigger|larger|smaller|greater|less|higher|lower)/i.test(t) ||
    /compare\s+\d[\d.]*\s+(and|to|vs)\s+\d[\d.]*/i.test(t)
  );
}

const DOMAIN_REGEXES = [
  /\b(math|algebra|calculus|geometry|probability|statistics)\b/i,
  /\b(history|century|war|treaty|empire|revolution)\b/i,
  /\b(logic|argument|premise|syllogism|valid)\b/i,
  /\b(code|algorithm|function|runtime|complexity)\b/i,
  /\b(physics|chemistry|biology|science)\b/i,
];

export function classifyDifficulty(msg) {
  const t = (msg || '').trim();
  if (t.length < 40) return 'simple';
  if (isSimpleComparison(t)) return 'simple';

  if (/^(hi|hello|hey|thanks?|ok|sure|yes|no|what('?s| is) (up|good)|how (are|r) (you|u)|lol|haha|nice|cool|great|got it|makes sense|understood)/i.test(t)) {
    return 'simple';
  }

  const domainMatches = DOMAIN_REGEXES.filter(re => re.test(t)).length;
  if (domainMatches >= 2) return 'hard';

  if (/\b(trick|trap|paradox|always\s+true|never\s+true|impossible|counterintuitive|common\s+mistake|most\s+people|obviously|what\s+is\s+wrong)\b/i.test(t)) {
    return 'hard';
  }

  const hasSubParts = /\b([A-E]\)|[a-e]\)|part [A-Ea-e]|section \d|\(\d\)|\([A-Ea-e]\)|sub.?question)\b/i.test(t) || /[A-E]\./i.test(t);
  const isLong = t.length > 200;
  const isDeep = /\b(prove|proof|derive|algorithm|implement|simulate|explain\s+how|step.?by.?step|in\s+detail|thoroughly|rigorously|trace|analyze|compare|contrast)\b/i.test(t);
  if (!hasSubParts && !isLong && !isDeep) return 'medium';
  return 'hard';
}

export function isHardCSTheory(msg) {
  return /\b(type|typing|typable|untypable|hindley.?milner|unif|lambda calculus|type inference|principal type|polymorphi|persistent|union.?find|path compression|lock.?free|wait.?free|cas|compare.?and.?swap)\b/i.test(msg);
}

// Pull the last user message text out of a messages array, normalising
// multimodal arrays to their first text part.
export function lastUserText(messages) {
  const last = [...messages].reverse().find(m => m && m.role === 'user');
  if (!last) return '';
  if (Array.isArray(last.content)) return last.content.find(p => p && p.type === 'text')?.text ?? '';
  return typeof last.content === 'string' ? last.content : '';
}
