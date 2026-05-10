// Sampling and temperature heuristics. Behaviour preserved from the original
// chat.js — refactored for readability.
import { classifyDifficulty, isHardCSTheory } from './classifier.js';
import { HUMANIZER_TEMPERATURE } from './prompts.js';

export const STOP_SEQUENCES = ['As an AI language model,'];
export const FORCED_N = 1;

export function effectiveTemperature(modelKey, requested, lastUserMsg) {
  if (modelKey === 'humanizer') return HUMANIZER_TEMPERATURE;

  if (lastUserMsg && isHardCSTheory(lastUserMsg)) {
    return modelKey === '000' ? 0.0 : 0.05;
  }

  const difficulty = classifyDifficulty(lastUserMsg);

  if (difficulty === 'hard') {
    return modelKey === '000' ? 0.1 : 0.15;
  }

  if (difficulty === 'medium') {
    if (modelKey === '000') return 0.2;
    if (modelKey === '00')  return 0.25;
    return 0.3;
  }

  // Simple
  const caps = { '000': 0.4, '00': 0.5, '0': 0.6, 'V': 0.7, 'VV': 0.7, 'VVV': 0.6 };
  if (modelKey === '000') return caps['000'];
  return Math.min(requested, caps[modelKey] ?? 0.5);
}

export function samplingParams(_modelKey, difficulty) {
  if (difficulty === 'hard')   return { top_p: 0.9,  top_k: 5,  frequency_penalty: 0.3,  presence_penalty: 0.2  };
  if (difficulty === 'simple') return { top_p: 0.85, top_k: 25, frequency_penalty: 0.1,  presence_penalty: 0.05 };
  return                              { top_p: 0.75, top_k: 20, frequency_penalty: 0.15, presence_penalty: 0.1  };
}
