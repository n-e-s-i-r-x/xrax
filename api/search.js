/* Web search with Tavily → Wikipedia → DuckDuckGo fallback chain.
   Uses the Node.js (Vercel serverless) runtime to keep the existing
   req/res shape from the original implementation. */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const UA = '0v-AI/1.0';

function setCors(res) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  if (!query) return res.status(400).json({ error: 'No query' });

  const apiKey = process.env.TAVILY_API_KEY;

  const providers = [
    apiKey ? () => tryTavily(query, apiKey) : null,
    () => tryWikipedia(query),
    () => tryDDG(query),
  ].filter(Boolean);

  for (const run of providers) {
    const result = await run().catch(() => null);
    if (result) return res.status(200).json(result);
  }

  return res.status(200).json({ results: [], answer: null, source: 'none' });
}

// ── Tavily (best results, requires API key) ────────────────────
async function tryTavily(query, apiKey) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth:        'advanced',
      include_answer:      true,
      include_raw_content: false,
      max_results:         6,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();

  return {
    results: (data.results || []).map(r => ({
      title:   r.title   || '',
      url:     r.url     || '',
      snippet: r.content || '',
      score:   r.score   || 0,
    })),
    answer: data.answer || null,
    source: 'tavily',
  };
}

// ── Wikipedia (free, deep) ─────────────────────────────────────
async function tryWikipedia(query) {
  const searchUrl = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', list: 'search', srsearch: query,
    format: 'json', srlimit: '5', srprop: 'snippet|titlesnippet', origin: '*',
  });

  const sData = await fetch(searchUrl, { headers: { 'User-Agent': UA } }).then(r => r.json());
  const hits = sData?.query?.search || [];
  if (!hits.length) return null;

  const results = [];
  for (const hit of hits.slice(0, 4)) {
    try {
      const extractUrl = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
        action: 'query', prop: 'extracts|info',
        exintro: 'true', explaintext: 'true', exsectionformat: 'plain',
        titles: hit.title, format: 'json', inprop: 'url', origin: '*',
      });
      const eData = await fetch(extractUrl, { headers: { 'User-Agent': UA } }).then(r => r.json());
      const page  = Object.values(eData?.query?.pages || {})[0];

      if (page?.extract && page.extract.length > 50) {
        results.push({
          title:   page.title,
          url:     page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
          snippet: page.extract.replace(/\n{2,}/g, '\n').trim().slice(0, 600),
        });
      }
    } catch { /* skip */ }
  }

  return results.length ? { results, answer: null, source: 'wikipedia' } : null;
}

// ── DuckDuckGo Instant Answer (free, lightweight) ──────────────
async function tryDDG(query) {
  const url = 'https://api.duckduckgo.com/?' + new URLSearchParams({
    q: query, format: 'json', no_redirect: '1', no_html: '1', skip_disambig: '1',
  });

  const data = await fetch(url, { headers: { 'User-Agent': `Mozilla/5.0 ${UA}` } }).then(r => r.json());
  const results = [];
  const answer  = data.Answer || null;

  if (data.AbstractText && data.AbstractText.length > 30) {
    results.push({
      title:   data.Heading || query,
      url:     data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      snippet: data.AbstractText.slice(0, 500),
    });
  }

  for (const t of (data.RelatedTopics || [])) {
    if (results.length >= 4) break;
    if (t.Text?.length > 20 && t.FirstURL) {
      results.push({
        title:   t.Text.split(' - ')[0].slice(0, 80),
        url:     t.FirstURL,
        snippet: t.Text.slice(0, 300),
      });
    }
  }

  return (results.length || answer) ? { results, answer, source: 'ddg' } : null;
}
