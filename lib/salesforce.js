// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — SALESFORCE / CONNECTIONS CLIENT
// ═══════════════════════════════════════════════════════════════════════════
import { headers } from './sync';

const ENDPOINT = '/api/salesforce';
async function parse(res) { const data = await res.json().catch(() => ({})); return { ...data, status: res.status }; }

/** { configured, host, missing, unix } — what Management → Connections shows. */
export async function connectionsStatus() {
  try { return await parse(await fetch(ENDPOINT, { cache: 'no-store' })); } catch (e) { return { configured: false, error: String(e?.message || e), status: 0 }; }
}

export async function sfTestConnection(passcode) {
  return parse(await fetch(ENDPOINT, { method: 'POST', headers: headers(passcode), body: JSON.stringify({ action: 'test' }) }));
}

/** Creates the Case. Resolves { ok, caseNumber, caseId, url } or { ok:false, error }. */
export async function sfPushTicket(ticket, settings, passcode) {
  const res = await parse(await fetch(ENDPOINT, { method: 'POST', headers: headers(passcode), body: JSON.stringify({ action: 'case', ticket, settings }) }));
  if (res.status === 200 && res.ok) return res;
  return { ok: false, configured: res.configured, error: res.error || `Salesforce push failed (${res.status})`, status: res.status };
}
