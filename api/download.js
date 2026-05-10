export const config = { runtime: 'edge' };

/* On-the-fly ZIP packaging for downloads.
   POST { files: [{ name, content, encoding? }], zipName? }
     - encoding: 'utf8' (default) | 'base64'
   Returns: a streamed application/zip response.

   Implements a minimal ZIP writer (STORE method, no compression) so this
   works in the edge runtime with no native deps. */

const TE = new TextEncoder();

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    crc32.table = table;
  }
  c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosTime(date) {
  const t = ((date.getHours() & 0x1F) << 11)
          | ((date.getMinutes() & 0x3F) << 5)
          | ((date.getSeconds() / 2) & 0x1F);
  const d = (((date.getFullYear() - 1980) & 0x7F) << 9)
          | (((date.getMonth() + 1) & 0x0F) << 5)
          | (date.getDate() & 0x1F);
  return { time: t, date: d };
}

function decode(content, encoding) {
  if (encoding === 'base64') {
    const bin = atob(content);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return TE.encode(String(content ?? ''));
}

function safeName(name) {
  return String(name || 'file')
    .replace(/^\/+|\\+/g, '')
    .replace(/\.\.+/g, '_')
    .slice(0, 200) || 'file';
}

function buildZip(files) {
  const { time, date } = dosTime(new Date());
  const localChunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = TE.encode(safeName(f.name));
    const data = decode(f.content, f.encoding);
    const crc = crc32(data);
    const size = data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const dvL = new DataView(local.buffer);
    dvL.setUint32(0, 0x04034b50, true);
    dvL.setUint16(4, 20, true);          // version
    dvL.setUint16(6, 0, true);           // flags
    dvL.setUint16(8, 0, true);           // method = STORE
    dvL.setUint16(10, time, true);
    dvL.setUint16(12, date, true);
    dvL.setUint32(14, crc, true);
    dvL.setUint32(18, size, true);
    dvL.setUint32(22, size, true);
    dvL.setUint16(26, nameBytes.length, true);
    dvL.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    localChunks.push(local, data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const dvC = new DataView(cd.buffer);
    dvC.setUint32(0, 0x02014b50, true);
    dvC.setUint16(4, 20, true);
    dvC.setUint16(6, 20, true);
    dvC.setUint16(8, 0, true);
    dvC.setUint16(10, 0, true);
    dvC.setUint16(12, time, true);
    dvC.setUint16(14, date, true);
    dvC.setUint32(16, crc, true);
    dvC.setUint32(20, size, true);
    dvC.setUint32(24, size, true);
    dvC.setUint16(28, nameBytes.length, true);
    dvC.setUint16(30, 0, true);
    dvC.setUint16(32, 0, true);
    dvC.setUint16(34, 0, true);
    dvC.setUint16(36, 0, true);
    dvC.setUint32(38, 0, true);
    dvC.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + data.length;
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const dvE = new DataView(eocd.buffer);
  dvE.setUint32(0, 0x06054b50, true);
  dvE.setUint16(8, files.length, true);
  dvE.setUint16(10, files.length, true);
  dvE.setUint32(12, cdSize, true);
  dvE.setUint32(16, offset, true);

  const total = offset + cdSize + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of localChunks) { out.set(c, p); p += c.length; }
  for (const c of central)     { out.set(c, p); p += c.length; }
  out.set(eocd, p);
  return out;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const files = Array.isArray(body?.files) ? body.files : [];
  if (!files.length) {
    return new Response(JSON.stringify({ error: 'No files provided' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const zipName = (typeof body.zipName === 'string' && body.zipName.trim())
    ? body.zipName.replace(/[^A-Za-z0-9._-]/g, '_')
    : 'bundle.zip';

  const zip = buildZip(files);

  return new Response(zip, {
    status: 200,
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Cache-Control':       'no-store',
    },
  });
}
