export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const GEMINI_KEY = process.env.GEMINI_KEY;

    try {
        const { model, payload } = req.body;
        const upstream = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/' + (model || 'gemini-2.0-flash') + ':generateContent?key=' + GEMINI_KEY,
            {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(payload)
            }
        );
        const data = await upstream.json();
        res.status(200).json(data);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
}