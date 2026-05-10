// Build the messages payload sent to the LLM. Replaces the dual
// inline/sandbox versions in the original chat.js — the sandbox path was
// unreachable on edge runtimes.

const THINK_INSTRUCTION = `

OUTPUT FORMAT — MANDATORY:
Every response must begin with <think> followed by your brief internal reasoning, then </think>, then your answer. Nothing before <think>. Nothing between <think> and </think> appears in the final output.`;

export function buildPayload(persona, trimmedMsgs, _hasReasoning, hasPromptedThink) {
  const finalPersona = persona + (hasPromptedThink ? THINK_INSTRUCTION : '');
  return [
    { role: 'system', content: finalPersona },
    ...trimmedMsgs,
  ];
}
