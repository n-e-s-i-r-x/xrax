export const config = { runtime: 'edge' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default function handler(req) {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CORS_HEADERS });

  if (req.method !== 'GET')
    return new Response(
      JSON.stringify({ error: { message: 'Method not allowed', type: 'api_error', code: 405 } }),
      { status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
    );

  return new Response(JSON.stringify({
    object: 'list',
    data: [
      {
        id:          'void/voidv1-flash',
        object:      'model',
        created:     1700000000,
        owned_by:    'void',
        name:        'Void V1 Flash',
        description: 'Advanced high-reasoning mode of Void V1 Flash featuring 284B total parameters with 13B active parameters, optimized for deeper thinking, coding, planning, and complex agent workflows with up to 1M token context.',
      },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
