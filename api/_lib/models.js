// Model registry. Each entry maps a short key (used by the UI) to an OpenRouter
// model id plus capability flags.

export const MODEL_MAP = {
  '0':         { id: 'liquid/lfm-2.5-1.2b-instruct:free',          hasReasoning: false, hasPromptedThink: false, minTokens: 10000 },
  '00':        { id: 'openai/gpt-oss-20b:free',                    hasReasoning: false, hasPromptedThink: false, minTokens: 10000 },
  '000':       { id: 'openai/gpt-oss-120b:free',                   hasReasoning: false, hasPromptedThink: false, minTokens: 10000 },
  'V':         { id: 'thedrummer/cydonia-24b-v4.1',                hasReasoning: false, hasPromptedThink: false, minTokens: 10000 },
  'VV':        { id: 'nvidia/nemotron-3-super-120b-a12b:free',     hasReasoning: false, hasPromptedThink: false, minTokens: 10000 },
  'VVV':       { id: 'nvidia/nemotron-3-super-120b-a12b:free',     hasReasoning: false, hasPromptedThink: false, minTokens: 10000 },
  'humanizer': { id: 'openai/gpt-oss-120b:free',                   hasReasoning: false, hasPromptedThink: false, minTokens: 10000, temperature: 1.5 },
};

// Vision-capable fallback used automatically when the message contains images.
export const VISION_MODEL_ID = 'meta-llama/llama-3.2-11b-vision-instruct';

// Adaptive routing buckets (used when modelKey === 'auto').
export const ADAPTIVE_MODEL_MAP = {
  fast:      MODEL_MAP['0'],
  standard:  MODEL_MAP['00'],
  complex:   MODEL_MAP['000'],
  reasoning: MODEL_MAP['000'],
};

export function modelEntry(key) {
  return MODEL_MAP[key] ?? MODEL_MAP['0'];
}

// Returns an entry from ADAPTIVE_MODEL_MAP based on difficulty/topic.
// Only used when the request opts into adaptive routing.
export function selectOptimalModel(msg, classifyDifficulty, isHardCSTheory) {
  const difficulty = classifyDifficulty(msg);
  if (difficulty === 'hard' && isHardCSTheory(msg)) return ADAPTIVE_MODEL_MAP.reasoning;
  if (difficulty === 'hard')                        return ADAPTIVE_MODEL_MAP.complex;
  if (difficulty === 'simple')                      return ADAPTIVE_MODEL_MAP.fast;
  return ADAPTIVE_MODEL_MAP.standard;
}
