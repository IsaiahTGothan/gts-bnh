// ═══════════════════════════════════════════════════════════════════════════
//  /api/linkcheck — checks the warranty directory links from the server
//  (Management → System → Warranty directory → Check all links).
//  POST { urls: string[] } → { results: [{ url, ok, status, final, error? }] }
//  HTTPS only, public hosts only, max 200 URLs, 8 at a time, 8 s each.
// ═══════════════════════════════════════════════════════════════════════════
import { authorizeRequest, json } from '../../../lib/sync-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)|^172\.(1[6-9]|2\d|3[01])\./i;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 GTS-Hub-LinkCheck';

async function check(url) {
  let u;
  try { u = new URL(url); } catch { return { url, ok: false, status: 0, error: 'invalid URL' }; }
  if (u.protocol !== 'https:' || PRIVATE.test(u.hostname)) return { url, ok: false, status: 0, error: 'not a public https URL' };
  for (const method of ['HEAD', 'GET']) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(u, { method, redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'text/html,*/*' } });
      try { await res.body?.cancel(); } catch { /* ignore */ }
      // Many manufacturer sites answer HEAD with 403/405 — retry with GET before judging.
      if (method === 'HEAD' && (res.status === 403 || res.status === 405 || res.status >= 500)) continue;
      return { url, ok: res.status < 400, status: res.status, final: res.url !== url ? res.url : undefined, blocked: res.status === 403 || undefined };
    } catch (e) {
      if (method === 'GET') return { url, ok: false, status: 0, error: e?.name === 'AbortError' ? 'timed out' : String(e?.message || e) };
    } finally { clearTimeout(t); }
  }
  return { url, ok: false, status: 0, error: 'no response' };
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const gate = await authorizeRequest(req);
  if (!gate.ok) return json(gate.body, gate.status);
  const urls = [...new Set((Array.isArray(body.urls) ? body.urls : []).map(String))].slice(0, 200);
  const results = new Array(urls.length);
  let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (i < urls.length) { const k = i++; results[k] = await check(urls[k]); } }));
  return json({ results, checkedAt: new Date().toISOString() });
}
