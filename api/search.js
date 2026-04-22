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

  // Try each source in order
  let results = null;

  results = await tryWikipedia(query);
  if (results && results.length) return res.status(200).json({ results, source: 'wikipedia' });

  results = await tryDDGInstant(query);
  if (results && results.length) return res.status(200).json({ results, source: 'ddg' });

  results = await tryGoogleScrape(query);
  if (results && results.length) return res.status(200).json({ results, source: 'google' });

  // Last resort — at least give a useful link
  return res.status(200).json({
    results: [{
      title: `Results for: ${query}`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      snippet: 'Could not fetch live results. Click to search manually.',
    }],
    source: 'fallback'
  });
}

// ── METHOD 1: Wikipedia Search + Extract ─────────────────────
// Great for factual/versioned info like Minecraft updates
async function tryWikipedia(query) {
  try {
    // Search Wikipedia for relevant articles
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&origin=*`;

    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': '0v-AI/1.0 (https://0vai.vercel.app)' }
    });
    const searchData = await searchRes.json();
    const hits = searchData?.query?.search || [];

    if (!hits.length) return null;

    const results = [];

    for (const hit of hits.slice(0, 3)) {
      // Get extract for each result
      const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=true&explaintext=true&titles=${encodeURIComponent(hit.title)}&format=json&exsentences=4&origin=*`;

      const extractRes  = await fetch(extractUrl, {
        headers: { 'User-Agent': '0v-AI/1.0' }
      });
      const extractData = await extractRes.json();
      const pages       = extractData?.query?.pages || {};
      const page        = Object.values(pages)[0];

      if (page && page.extract) {
        // Clean up the extract
        const clean = page.extract
          .replace(/\n+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 400);

        results.push({
          title:   page.title,
          url:     `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
          snippet: clean,
        });
      }
    }

    return results.length ? results : null;
  } catch (e) {
    console.error('Wikipedia error:', e);
    return null;
  }
}

// ── METHOD 2: DuckDuckGo Instant Answer API ───────────────────
async function tryDDGInstant(query) {
  try {
    const url  = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
    const r    = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 0v-AI/1.0' }
    });
    const data = await r.json();

    const results = [];

    if (data.AbstractText && data.AbstractText.length > 30) {
      results.push({
        title:   data.Heading || query,
        url:     data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: data.AbstractText.slice(0, 400),
      });
    }

    if (data.Answer && data.Answer.length > 5) {
      results.push({
        title:   'Quick Answer',
        url:     `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: data.Answer,
      });
    }

    for (const t of (data.RelatedTopics || [])) {
      if (results.length >= 4) break;
      if (t.Text && t.FirstURL && t.Text.length > 20) {
        results.push({
          title:   t.Text.split(' - ')[0].slice(0, 80),
          url:     t.FirstURL,
          snippet: t.Text.slice(0, 300),
        });
      }
    }

    return results.length ? results : null;
  } catch (e) {
    console.error('DDG instant error:', e);
    return null;
  }
}

// ── METHOD 3: Google scrape via search-json endpoint ─────────
// Uses Google's public search page with special params
async function tryGoogleScrape(query) {
  try {
    // Use Google's "featured snippet" endpoint — returns structured data
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=5&hl=en&gl=us`;

    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    const html = await r.text();

    const results = [];

    // Extract result blocks — Google's structure: <h3> titles, snippets in specific divs
    // Match title + URL pairs
    const titlePattern = /<h3[^>]*class="[^"]*LC20lb[^"]*"[^>]*>([^<]+)<\/h3>/g;
    const urlPattern   = /<a[^>]+href="\/url\?q=([^&"]+)[^"]*"[^>]*>/g;
    const snippetPat   = /class="[^"]*VwiC3b[^"]*"[^>]*>(?:<span[^>]*>)?([^<]{40,400})/g;

    const titles   = [...html.matchAll(titlePattern)].map(m => decodeHTML(m[1]));
    const urls     = [...html.matchAll(urlPattern)].map(m => decodeURIComponent(m[1])).filter(u => u.startsWith('http'));
    const snippets = [...html.matchAll(snippetPat)].map(m => decodeHTML(m[1]).replace(/<[^>]+>/g, ''));

    const count = Math.min(titles.length, urls.length, 5);
    for (let i = 0; i < count; i++) {
      if (titles[i] && urls[i]) {
        results.push({
          title:   titles[i],
          url:     urls[i],
          snippet: snippets[i] || '',
        });
      }
    }

    return results.length ? results : null;
  } catch (e) {
    console.error('Google scrape error:', e);
    return null;
  }
}

function decodeHTML(str) {
  return str
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}
