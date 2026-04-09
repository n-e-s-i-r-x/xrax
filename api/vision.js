export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const GEMINI_KEY = process.env.GEMINI_KEY;

    try {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch(e) { body = {}; }
        }

        const model   = body.model || 'gemini-2.0-flash';
        const payload = body.payload;

        if (!payload) {
            return res.status(400).json({ error: 'No payload provided' });
        }

        const upstream = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + GEMINI_KEY,
            {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(payload)
            }
        );

        const data = await upstream.json();

        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: JSON.stringify(data) });
        }

        res.status(200).json(data);

    } catch(e) {
        res.status(500).json({ error: e.message });
    }
}
