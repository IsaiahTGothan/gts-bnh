// ═══════════════════════════════════════════════════════════════════════════
//  /api/sync — optional team sync backed by Upstash Redis (REST).
//
//  • With no env vars set, GET returns { enabled: false } and the app keeps
//    working local-only (browser storage). Nothing else changes.
//  • With UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or the Vercel
//    KV_REST_API_URL / KV_REST_API_TOKEN names) the three techs share one
//    document. Writes are compare-and-set on a revision counter so two
//    stations can never silently overwrite each other; the client merges
//    record-by-record on conflict and retries.
//  • GTS_SYNC_KEY (recommended) is a shared passcode sent as `x-gts-key`.
// ═══════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DOC_KEY = 'gts-hub:doc';
const REV_KEY = 'gts-hub:rev';
const MAX_DOC_BYTES = 900_000; // stay under Upstash's 1 MB request limit

function creds() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function authorized(req) {
  const required = process.env.GTS_SYNC_KEY;
  if (!required) return true;
  return req.headers.get('x-gts-key') === required;
}

async function redis(cmd) {
  const c = creds();
  const res = await fetch(c.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Upstash HTTP ${res.status}`);
  return data.result;
}

// ─── GET: current document ─────────────────────────────────────────────────
export async function GET(req) {
  if (!creds()) return json({ enabled: false });
  if (!authorized(req)) return json({ enabled: true, error: 'unauthorized' }, 401);
  try {
    const [rev, raw] = await Promise.all([redis(['GET', REV_KEY]), redis(['GET', DOC_KEY])]);
    let doc = null;
    if (raw) {
      try { doc = JSON.parse(raw); } catch { doc = null; }
    }
    return json({ enabled: true, rev: Number(rev || 0), doc });
  } catch (e) {
    return json({ enabled: true, error: String(e.message || e) }, 502);
  }
}

// ─── PUT: compare-and-set write ────────────────────────────────────────────
const CAS_SCRIPT = `
local rev = tonumber(redis.call('GET', KEYS[1]) or '0')
if rev ~= tonumber(ARGV[1]) then
  return {0, rev, redis.call('GET', KEYS[2])}
end
local nrev = redis.call('INCR', KEYS[1])
redis.call('SET', KEYS[2], ARGV[2])
return {1, nrev}
`;

export async function PUT(req) {
  if (!creds()) return json({ enabled: false }, 404);
  if (!authorized(req)) return json({ error: 'unauthorized' }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const baseRev = Number(body?.baseRev ?? 0);
  const doc = body?.doc;
  if (!doc || typeof doc !== 'object') return json({ error: 'missing doc' }, 400);
  const raw = JSON.stringify(doc);
  if (raw.length > MAX_DOC_BYTES) return json({ error: 'document too large — clear old activity or export & reset' }, 413);
  try {
    const result = await redis(['EVAL', CAS_SCRIPT, '2', REV_KEY, DOC_KEY, String(baseRev), raw]);
    const [ok, rev, currentRaw] = result;
    if (Number(ok) === 1) return json({ rev: Number(rev) });
    let current = null;
    if (currentRaw) {
      try { current = JSON.parse(currentRaw); } catch { current = null; }
    }
    return json({ conflict: true, rev: Number(rev), doc: current }, 409);
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}
