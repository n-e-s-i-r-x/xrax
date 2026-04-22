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

  try {
    // Step 1: Get DuckDuckGo token (vqd)
    const initRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      }
    );

    const html = await initRes.text();

    // Extract vqd token from page
    const vqdMatch = html.match(/vqd=['"]([^'"]+)['"]/);
    if (!vqdMatch) {
      // Fallback: try DDG instant answers API
      return await fallbackSearch(query, res);
    }
    const vqd = vqdMatch[1];

    // Step 2: Fetch actual search results
    const searchUrl = `https://links.duckduckgo.com/d.js?q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&p=1&kl=us-en`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://duckduckgo.com/',
        'Accept': '*/*',
      }
    });

    const text = await searchRes.text();

    // Parse the JS response
    const dataMatch = text.match(/DDG\.pageLayout\.load\('d',(\[.+\])\)/s);
    if (!dataMatch) {
      return await fallbackSearch(query, res);
    }

    const raw = JSON.parse(dataMatch[1]);
    const results = raw
      .filter(r => r.u && r.t && r.a)
      .slice(0, 5)
      .map(r => ({
        title:   r.t   || '',
        url:     r.u   || '',
        snippet: r.a   ? r.a.replace(/<[^>]+>/g, '') : '',
      }));

    return res.status(200).json({ results });

  } catch (err) {
    console.error('DDG search error:', err);
    // Try fallback before giving up
    return await fallbackSearch(query, res);
  }
}

// ── FALLBACK: DDG Instant Answer API ──────────────────────────
// Less results but always works, no scraping needed
async function fallbackSearch(query, res) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;

    const r    = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 0v-AI-App' }
    });
    const data = await r.json();

    const results = [];

    // Abstract (main answer)
    if (data.AbstractText) {
      results.push({
        title:   data.Heading || query,
        url:     data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: data.AbstractText,
      });
    }

    // Related topics
    if (data.RelatedTopics) {
      for (const t of data.RelatedTopics) {
        if (results.length >= 5) break;
        if (t.Text && t.FirstURL) {
          results.push({
            title:   t.Text.split(' - ')[0] || t.Text.slice(0, 60),
            url:     t.FirstURL,
            snippet: t.Text,
          });
        }
        // Handle topic groups
        if (t.Topics) {
          for (const sub of t.Topics) {
            if (results.length >= 5) break;
            if (sub.Text && sub.FirstURL) {
              results.push({
                title:   sub.Text.split(' - ')[0] || sub.Text.slice(0, 60),
                url:     sub.FirstURL,
                snippet: sub.Text,
              });
            }
          }
        }
      }
    }

    // Answer box
    if (data.Answer && results.length < 5) {
      results.push({
        title:   'Quick Answer',
        url:     `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: data.Answer,
      });
    }

    // If we got nothing meaningful, return a search link
    if (!results.length) {
      results.push({
        title:   `Search results for: ${query}`,
        url:     `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: 'No instant answer available. Click to view full results.',
      });
    }

    return res.status(200).json({ results });

  } catch(err) {
    console.error('Fallback search error:', err);
    return res.status(200).json({
      results: [{
        title:   `Search: ${query}`,
        url:     `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: 'Search temporarily unavailable.',
      }]
    });
  }
}
