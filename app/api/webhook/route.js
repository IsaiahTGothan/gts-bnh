// ═══════════════════════════════════════════════════════════════════════════
//  /api/webhook — relays a GTS event to the HTTPS endpoint set in
//  Management → System → Integrations (Teams / Slack / Power Automate /
//  an internal B&H service). POST { url, event, payload } → { ok, status }.
//  Gated by the team passcode whenever a team database is attached.
// ═══════════════════════════════════════════════════════════════════════════
import { authorizeRequest, json } from '../../../lib/sync-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 32_000;
// Literal private / loopback / link-local addresses are refused (no internal probing).
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)|^172\.(1[6-9]|2\d|3[01])\./i;

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const gate = await authorizeRequest(req);
  if (!gate.ok) return json(gate.body, gate.status);
  let target;
  try { target = new URL(String(body.url || '')); } catch { return json({ error: 'Webhook URL is not a valid URL' }, 400); }
  if (target.protocol !== 'https:') return json({ error: 'Webhook URL must start with https://' }, 400);
  if (PRIVATE.test(target.hostname)) return json({ error: 'Private / local addresses are not allowed' }, 400);
  const payload = JSON.stringify({ ...(body.payload || {}), event: String(body.event || body.payload?.event || 'event') });
  if (payload.length > MAX_BYTES) return json({ error: 'Payload too large' }, 413);
  // Slack / Teams incoming webhooks want a `text` field; everything else gets the full object.
  const text = summary(body.payload || {});
  const out = /hooks\.slack\.com|webhook\.office\.com|\.logic\.azure\.com/i.test(target.hostname) ? JSON.stringify({ text, ...(body.payload || {}) }) : payload;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'GTS-Hub-Webhook/4' }, body: out, signal: ctrl.signal, redirect: 'manual' });
    return json({ ok: res.status >= 200 && res.status < 300, status: res.status });
  } catch (e) {
    return json({ ok: false, error: e?.name === 'AbortError' ? 'Endpoint timed out after 6 s' : String(e?.message || e) }, 502);
  } finally { clearTimeout(timer); }
}

function summary(p) {
  const t = p.ticket; const a = p.assignment;
  if (p.event === 'test') return `GTS Hub test event from ${p.station || 'the counter'} ✅`;
  if (t) return `GTS ${p.event === 'ticket.done' ? 'service done' : 'ticket'} ${t.tag} · ${t.orderNumber ? `Order ${t.orderNumber}` : t.customer || 'walk-up'} · ${t.serviceLabel}${t.serviceMinutes != null && p.event === 'ticket.done' ? ` · ${t.serviceMinutes} min` : ''} · ${t.tech}`;
  if (a) return `GTS drop-off ${a.tag} · ${a.customer} · ${a.device || a.serviceType || ''} · ${a.tech}`;
  return `GTS event: ${p.event}`;
}
