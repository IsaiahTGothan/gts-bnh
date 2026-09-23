// ═══════════════════════════════════════════════════════════════════════════
//  /api/salesforce — Quick Log → Salesforce Case (see lib/salesforce-server.js)
//
//  GET                          → { configured, host?, missing? }
//  POST { action: "test" }      → { ok, object, createable }
//  POST { action: "case", ticket, settings } → { ok, caseNumber, caseId, url }
//  Gated by the team passcode (x-gts-key) whenever a team database is attached.
// ═══════════════════════════════════════════════════════════════════════════
import { authorizeRequest, json } from '../../../lib/sync-server';
import { sfConfig, sfCreateCase, sfPublicStatus, sfTest } from '../../../lib/salesforce-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return json({ ...sfPublicStatus(), unix: { mode: 'scan', bridge: false } });
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const gate = await authorizeRequest(req);
  if (!gate.ok) return json(gate.body, gate.status);
  const c = sfConfig();
  if (!c) return json({ configured: false, error: 'Salesforce is not connected yet — add SF_INSTANCE_URL, SF_CLIENT_ID and SF_CLIENT_SECRET in Vercel.' }, 409);
  try {
    if (body.action === 'test') return json({ configured: true, ...(await sfTest(c)) });
    if (body.action === 'case') {
      if (!body.ticket || typeof body.ticket !== 'object') return json({ error: 'missing ticket' }, 400);
      const result = await sfCreateCase(c, body.ticket, body.settings || {});
      return json({ ok: true, caseId: result.id, caseNumber: result.caseNumber, url: result.url });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ configured: true, error: String(e?.message || e) }, 502);
  }
}
