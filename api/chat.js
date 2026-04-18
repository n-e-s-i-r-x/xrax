export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const OR_KEY = process.env.OR_KEY;

    try {
        const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + OR_KEY,
                'HTTP-Referer': 'https://vertigozi.vercel.app',
                'X-Title': 'Vertigo AI'
            },
            body: JSON.stringify({
                ...req.body,
                stream: false
            })
        });

        const data = await upstream.json();
        res.status(upstream.status).json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
