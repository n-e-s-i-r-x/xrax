export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'No query' });

  const apiKey = process.env.TAVILY_API_KEY;

  // If no Tavily key, fall through to free scraping
  if (apiKey) {
    const result = await tryTavily(query, apiKey);
    if (result) return res.status(200).json(result);
  }

  // Free fallbacks (no key needed)
  const wiki = await tryWikipediaDeep(query);
  if (wiki) return res.status(200).json(wiki);

  const ddg = await tryDDG(query);
  if (ddg) return res.status(200).json(ddg);

  return res.status(200).json({
    results: [],
    answer: null,
    source: 'none'
  });
}

// ── TAVILY (best results, 1000/month free) ────────────────────
async function tryTavily(query, apiKey) {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth: 'advanced',   // deep crawl
        include_answer: true,        // AI-extracted answer from results
        include_raw_content: false,
        max_results: 6,
      }),
    });

    if (!res.ok) {
      console.error('Tavily error:', await res.text());
      return null;
    }

    const data = await res.json();

    const results = (data.results || []).map(r => ({
      title:   r.title   || '',
      url:     r.url     || '',
      snippet: r.content || '',
      score:   r.score   || 0,
    }));

    return {
      results,
      // Tavily extracts a direct answer from all pages combined
      answer: data.answer || null,
      source: 'tavily',
    };
  } catch (e) {
    console.error('Tavily fetch error:', e);
    return null;
  }
}

// ── WIKIPEDIA DEEP (searches then fetches full intro) ─────────
async function tryWikipediaDeep(query) {
  try {
    // Use Wikipedia's opensearch to find best matching article
    const searchUrl = `https://en.wikipedia.org/w/api.php?` + new URLSearchParams({
      action:   'query',
      list:     'search',
      srsearch: query,
      format:   'json',
      srlimit:  '5',
      srprop:   'snippet|titlesnippet',
      origin:   '*',
    });

    const sRes  = await fetch(searchUrl, { headers: { 'User-Agent': '0v-AI/1.0' } });
    const sData = await sRes.json();
    const hits  = sData?.query?.search || [];
    if (!hits.length) return null;

    const results = [];

    // For each hit, get a proper extract
    for (const hit of hits.slice(0, 4)) {
      try {
        const extractUrl = `https://en.wikipedia.org/w/api.php?` + new URLSearchParams({
          action:       'query',
          prop:         'extracts|info',
          exintro:      'true',
          explaintext:  'true',
          exsectionformat: 'plain',
          titles:       hit.title,
          format:       'json',
          inprop:       'url',
          origin:       '*',
        });

        const eRes  = await fetch(extractUrl, { headers: { 'User-Agent': '0v-AI/1.0' } });
        const eData = await eRes.json();
        const pages = eData?.query?.pages || {};
        const page  = Object.values(pages)[0];

        if (page?.extract && page.extract.length > 50) {
          // Take first 600 chars of extract — meaty content
          const snippet = page.extract
            .replace(/\n{2,}/g, '\n')
            .trim()
            .slice(0, 600);

          results.push({
            title:   page.title,
            url:     page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g,'_'))}`,
            snippet,
          });
        }
      } catch(e) { /* skip this hit */ }
    }

    return results.length ? { results, answer: null, source: 'wikipedia' } : null;
  } catch (e) {
    console.error('Wikipedia error:', e);
    return null;
  }
}

// ── DDG INSTANT ANSWER ────────────────────────────────────────
async function tryDDG(query) {
  try {
    const url  = `https://api.duckduckgo.com/?` + new URLSearchParams({
      q:               query,
      format:          'json',
      no_redirect:     '1',
      no_html:         '1',
      skip_disambig:   '1',
    });

    const r    = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 0v-AI/1.0' } });
    const data = await r.json();

    const results = [];
    let answer    = null;

    if (data.Answer) {
      answer = data.Answer;
    }

    if (data.AbstractText?.length > 30) {
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

    return results.length || answer
      ? { results, answer, source: 'ddg' }
      : null;

  } catch (e) {
    console.error('DDG error:', e);
    return null;
  }
}
