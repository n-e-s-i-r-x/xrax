# 0v AI — Refactored

Refactored backend for the existing 0v AI chatbot. **UI is unchanged** (`index.html` is byte-for-byte the original). All system prompts are preserved verbatim — only relocated into a dedicated module for organization.

## Project layout

```
.
├── index.html               # Original UI, unchanged
├── package.json
├── vercel.json
└── api/
    ├── chat.js              # POST /api/chat   (edge runtime, SSE stream)
    ├── image.js             # POST /api/image  (edge runtime)
    ├── search.js            # POST /api/search (Node runtime)
    ├── download.js          # POST /api/download (NEW — packages files into a .zip)
    └── _lib/                # Shared modules (underscore prefix → not a route)
        ├── prompts.js       # POW_AI, CODE_AI, THINK_RULES, SYSTEM_PROMPT_MAP, HUMANIZER_*
        ├── models.js        # MODEL_MAP, modelEntry, selectOptimalModel, vision fallback
        ├── classifier.js    # classifyDifficulty, isHardCSTheory, isSimpleComparison, lastUserText
        ├── injectors.js     # injectTaskHint, injectConsistencyNudge, injectForcedThinkOnHard
        ├── sampling.js      # effectiveTemperature, samplingParams, STOP_SEQUENCES
        ├── sanitize.js      # leak detection + <think>-stream sanitisers + prompted-think filter
        ├── sse.js           # SSE event helpers, headers, generic errors
        ├── http.js          # fetchWithRetry (exponential backoff, Retry-After aware)
        ├── openrouter.js    # callOpenRouter wrapper
        ├── payload.js       # buildPayload (single source — sandbox path removed)
        └── handler.js       # Main chat orchestration
```

Anything under `api/_lib/` is **not** a Vercel route (the leading underscore is excluded from routing). `api/*.js` files are.

## Environment variables

Set in Vercel → Project → Settings → Environment Variables:

| Variable             | Required | Used by              |
| -------------------- | -------- | -------------------- |
| `OPENROUTER_API_KEY` | yes      | `/api/chat`, `/api/image` |
| `TAVILY_API_KEY`     | optional | `/api/search` (falls back to Wikipedia → DuckDuckGo if absent) |

## Deploy

```
vercel --prod
```

or push to a GitHub repo connected to Vercel. No build step is needed.

## What changed vs. the original `api/chat.js`

Behavior preserved. Code reorganized into the modules above. Specifically:

* The 1466-line `api/chat.js` was split into ~10 focused modules.
* `THINK_RULES_000` (an alias for `THINK_RULES`) is exported from `prompts.js` for backward compatibility.
* `buildPayloadInline` and `buildPayloadInSandbox` merged into one `buildPayload`. The Vercel sandbox path was unreachable on the edge runtime and is removed.
* `selectOptimalModel` is now wired up. Send `model: "auto"` in the request body to opt into adaptive routing — explicit keys (`0`, `00`, `000`, `V`, `VV`, `VVV`, `humanizer`) keep their existing behavior.
* The undefined `verifyResponse` call in the original was a dead reference; removed.
* CORS / SSE headers, generic error mapping, and retry logic are centralized.
* New `/api/download` endpoint packages an arbitrary set of `{name, content, encoding?}` files into a streamed `.zip`, no native deps. Optional — the existing UI can call it via `fetch('/api/download', { method: 'POST', body: JSON.stringify({ files, zipName }) })` and pipe the response into a download link when needed.

## All system prompts

Live in `api/_lib/prompts.js`. Content is identical to the original. To edit a prompt, edit that file.
