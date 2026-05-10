// Main chat handler. Coordinates classification, message-shaping, payload
// building, OpenRouter streaming, and SSE relay back to the client.
import { modelEntry, selectOptimalModel, VISION_MODEL_ID } from './models.js';
import { SYSTEM_PROMPT_MAP, HUMANIZER_SYSTEM, HUMANIZER_SAMPLING } from './prompts.js';
import { classifyDifficulty, isHardCSTheory, lastUserText } from './classifier.js';
import { effectiveTemperature, samplingParams, STOP_SEQUENCES, FORCED_N } from './sampling.js';
import { injectTaskHint, injectConsistencyNudge, injectForcedThinkOnHard } from './injectors.js';
import { messageLooksLikeSystemLeak, looksLikeLeak, sanitizeThinkChunk, sanitizeThinkFlush, makePromptedThinkFilter } from './sanitize.js';
import { buildPayload } from './payload.js';
import { callOpenRouter } from './openrouter.js';
import { sseContent, sseFinish, SSE_DONE, SSE_HEADERS, genericError } from './sse.js';

const MAX_HISTORY = 20;
const REASONING_MAX_TOKENS = 14000;

function getApiKey() {
  return (typeof process !== 'undefined' ? process.env?.OPENROUTER_API_KEY : undefined)
    ?? (typeof globalThis !== 'undefined' ? globalThis.OPENROUTER_API_KEY : undefined);
}

function jsonError(text) {
  return new Response(sseContent(text) + SSE_DONE, { status: 200, headers: SSE_HEADERS });
}

function isValidMessage(m) {
  return m && typeof m === 'object'
    && typeof m.role === 'string'
    && (typeof m.content === 'string' || Array.isArray(m.content));
}

function dedupeAndDeleak(messages) {
  const out = [];
  for (const m of messages) {
    const text = Array.isArray(m.content)
      ? (m.content.find(p => p?.type === 'text')?.text ?? '')
      : m.content;

    if (m.role === 'assistant' && messageLooksLikeSystemLeak(text)) continue;

    if (m.role === 'assistant' && out.length) {
      const prev = out[out.length - 1];
      if (prev.role === 'assistant') {
        const prevText = Array.isArray(prev.content) ? (prev.content.find(p => p?.type === 'text')?.text ?? '') : prev.content;
        if (prevText === text) continue;
      }
    }
    out.push(m);
  }
  return out;
}

function pickPersona(modelKey, context) {
  if (modelKey === 'humanizer') return HUMANIZER_SYSTEM;
  const base = SYSTEM_PROMPT_MAP[modelKey] ?? SYSTEM_PROMPT_MAP['0'];
  return context ? base + '\n\n' + context : base;
}

function buildRequestBody({
  modelId, messagesPayload, temperature, maxTokens,
  hasImages, hasReasoning, modelKey, sampling,
}) {
  const body = {
    model: modelId,
    messages: messagesPayload,
    temperature,
    max_tokens: maxTokens,
    stream: true,
    n: FORCED_N,
    stop: STOP_SEQUENCES,
  };

  if (!hasImages) {
    if (modelKey === 'humanizer') {
      body.top_p = HUMANIZER_SAMPLING.top_p;
      body.frequency_penalty = HUMANIZER_SAMPLING.frequency_penalty;
      body.presence_penalty  = HUMANIZER_SAMPLING.presence_penalty;
    } else {
      body.top_p = sampling.top_p;
      body.frequency_penalty = sampling.frequency_penalty;
      body.presence_penalty  = sampling.presence_penalty;
      if (sampling.top_k) body.top_k = sampling.top_k;
    }
  }

  if (hasReasoning && !hasImages) {
    body.reasoning = { max_tokens: REASONING_MAX_TOKENS };
  }
  return body;
}

// Handle the rare non-streaming response path (when upstream returns no body).
async function relayNonStreaming(upstreamRes, { isThinkModel, hasReasoning, hasPromptedThink, send }) {
  try {
    const data = await upstreamRes.json();
    const reasoningRaw = data?.choices?.[0]?.message?.reasoning_content
      ?? data?.choices?.[0]?.message?.reasoning ?? '';
    let answerText = data?.choices?.[0]?.message?.content ?? '';
    const finishReason = data?.choices?.[0]?.finish_reason ?? 'stop';
    let combined = '';

    if (isThinkModel) {
      if (hasReasoning && reasoningRaw) {
        const cleaned = reasoningRaw.split('\n').map(l => looksLikeLeak(l) ? '…' : l).join('\n');
        combined += `<think>\n${cleaned}\n</think>\n`;
        if (!answerText.trim()) {
          const lines = reasoningRaw.trimEnd().split('\n');
          for (let i = lines.length - 1; i >= 0; i--) {
            const l = lines[i].trim();
            if (l && !looksLikeLeak(lines[i])) { answerText = l; break; }
          }
        }
      } else if (hasPromptedThink && answerText && !answerText.trimStart().startsWith('<think>')) {
        combined += '<think>\n</think>\n';
      }
    }
    combined += answerText;
    if (!combined.trim()) combined = '_(No answer generated — please try again)_';

    send(sseContent(combined));
    send(sseFinish(finishReason));
  } catch {
    send(sseContent('[Empty response]'));
  }
}

// Streaming relay. Emits SSE events to the client as upstream chunks arrive.
async function relayStreaming(upstreamRes, { isThinkModel, hasReasoning, hasPromptedThink, send }) {
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
    if (!inReasoningPhase) return;
    const tail = sanitizeThinkFlush(thinkLineBuf);
    if (tail) send(sseContent(tail));
    thinkLineBuf = '';
    send(sseContent('\n</think>\n'));
    inReasoningPhase = false;
    thinkOpened = false;
  };

  const emitThink = (delta) => {
    const { safe, buf } = sanitizeThinkChunk(thinkLineBuf, delta);
    thinkLineBuf = buf;
    if (safe) send(sseContent(safe));
  };

  const handleDataLine = (raw) => {
    if (raw === '[DONE]') return;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return; }
    const choice = parsed?.choices?.[0];
    if (!choice) return;
    const delta = choice.delta || {};
    const reasoningDelta = delta.reasoning_content ?? delta.reasoning;
    const contentDelta = delta.content;

    if (!isThinkModel) {
      if (typeof contentDelta === 'string' && contentDelta.length) send(sseContent(contentDelta));
    } else if (hasReasoning) {
      if (typeof reasoningDelta === 'string' && reasoningDelta.length) {
        if (!inReasoningPhase && !thinkOpened) {
          send(sseContent('<think>\n'));
          inReasoningPhase = true;
          thinkOpened = true;
        }
        emitThink(reasoningDelta);
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
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) {
          for (const line of buffer.split('\n')) {
            const l = line.trim();
            if (l.startsWith('data:')) handleDataLine(l.slice(5).trim());
          }
        }
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const l = line.trim();
        if (l.startsWith('data:')) handleDataLine(l.slice(5).trim());
      }
    }
  } catch {
    send(sseContent('\n[Stream interrupted. Please try again.]'));
  }

  closeThinkIfOpen();
  if (finishReason) send(sseFinish(finishReason));
}

export async function handleChat(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch { return jsonError('Invalid request body.'); }

  const {
    messages,
    temperature = 0.5,
    maxTokens = 100000,
    model: modelKeyRaw = '0',
    contMode = false,
    context = '',
  } = body || {};

  const apiKey = getApiKey();
  if (!apiKey) return jsonError('Missing API key.');

  // Adaptive routing opt-in via 'auto' key.
  let modelKey = modelKeyRaw;
  if (modelKeyRaw === 'auto') {
    const probeText = lastUserText(Array.isArray(messages) ? messages : []);
    const adaptive = selectOptimalModel(probeText, classifyDifficulty, isHardCSTheory);
    // Reverse-lookup the key for adaptive entry; fall back to '00'.
    modelKey = Object.keys(SYSTEM_PROMPT_MAP).find(k => k === '000' || k === '00' || k === '0') && '00';
    if (adaptive?.id) modelKey = (adaptive === undefined ? '0' : modelKey);
  }

  const mEntry = modelEntry(modelKey);

  const rawTrimmed = (Array.isArray(messages) ? messages : [])
    .filter(isValidMessage)
    .slice(-MAX_HISTORY);

  const hasImages = rawTrimmed.some(m =>
    Array.isArray(m.content) && m.content.some(p => p?.type === 'image_url'));

  const modelId          = hasImages ? VISION_MODEL_ID : mEntry.id;
  const hasReasoning     = !hasImages && mEntry.hasReasoning;
  const hasPromptedThink = !hasImages && (mEntry.hasPromptedThink ?? false);
  const isThinkModel     = hasReasoning || hasPromptedThink;

  const persona = pickPersona(modelKey, context);
  const trimmed = dedupeAndDeleak(rawTrimmed);

  const lastUserMsg = lastUserText(trimmed);
  const difficulty  = classifyDifficulty(lastUserMsg);
  const temp        = effectiveTemperature(modelKey, temperature, lastUserMsg);
  const sampling    = samplingParams(modelKey, difficulty);

  const prepared = contMode
    ? trimmed
    : injectForcedThinkOnHard(
        injectConsistencyNudge(
          injectTaskHint(trimmed, modelKey),
          modelKey),
        modelKey, mEntry);

  const messagesPayload = buildPayload(persona, prepared, hasReasoning, hasPromptedThink);
  const effectiveMaxTokens = Math.max(maxTokens, mEntry.minTokens ?? 5000);

  const requestBody = buildRequestBody({
    modelId, messagesPayload, temperature: temp, maxTokens: effectiveMaxTokens,
    hasImages, hasReasoning, modelKey, sampling,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk) => { try { controller.enqueue(encoder.encode(chunk)); } catch { /* closed */ } };

      let upstreamRes;
      try {
        upstreamRes = await callOpenRouter(apiKey, requestBody);
      } catch {
        send(sseContent('Network error. Please try again.'));
        send(SSE_DONE);
        try { controller.close(); } catch { /* */ }
        return;
      }

      if (!upstreamRes.ok) {
        try { await upstreamRes.text(); } catch { /* */ }
        send(sseContent(genericError(upstreamRes.status)));
        send(SSE_DONE);
        try { controller.close(); } catch { /* */ }
        return;
      }

      if (!upstreamRes.body) {
        await relayNonStreaming(upstreamRes, { isThinkModel, hasReasoning, hasPromptedThink, send });
      } else {
        await relayStreaming(upstreamRes, { isThinkModel, hasReasoning, hasPromptedThink, send });
      }

      send(SSE_DONE);
      try { controller.close(); } catch { /* */ }
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
