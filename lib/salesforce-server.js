// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — SALESFORCE CONNECTOR (server side)
//
//  Creates a Case in B&H's Salesforce org for a Quick Log ticket, using a
//  Connected App with the OAuth 2.0 *client credentials* flow (no user login,
//  no browser redirect — the org admin picks the "run as" user once).
//
//  Env (Vercel → Settings → Environment Variables):
//    SF_INSTANCE_URL        https://<mydomain>.my.salesforce.com
//    SF_CLIENT_ID           Connected App consumer key
//    SF_CLIENT_SECRET       Connected App consumer secret
//  Optional:
//    SF_API_VERSION         default v61.0
//    SF_CASE_ORIGIN         default "Web"
//    SF_CASE_RECORD_TYPE_ID RecordTypeId for the Case
//    SF_CASE_FIELDS_JSON    extra fields merged into every Case, e.g. {"Type":"GTS"}
//
//  Until those are set the app falls back to the manual "mark as pushed"
//  flag — nothing breaks, the button just doesn't reach Salesforce yet.
// ═══════════════════════════════════════════════════════════════════════════

export function sfConfig(env = process.env) {
  const instance = env.SF_INSTANCE_URL;
  const clientId = env.SF_CLIENT_ID;
  const clientSecret = env.SF_CLIENT_SECRET;
  if (!instance || !clientId || !clientSecret) return null;
  let extra = {};
  try { extra = env.SF_CASE_FIELDS_JSON ? JSON.parse(env.SF_CASE_FIELDS_JSON) : {}; } catch { extra = {}; }
  return {
    instance: instance.replace(/\/+$/, ''), clientId, clientSecret,
    apiVersion: env.SF_API_VERSION || 'v61.0', origin: env.SF_CASE_ORIGIN || 'Web',
    recordTypeId: env.SF_CASE_RECORD_TYPE_ID || null, extra,
  };
}

/** Public shape (no secrets) for the Management → Connections card. */
export function sfPublicStatus(c = sfConfig()) {
  if (!c) return { configured: false, missing: ['SF_INSTANCE_URL', 'SF_CLIENT_ID', 'SF_CLIENT_SECRET'].filter((k) => !process.env[k]) };
  let host = c.instance;
  try { host = new URL(c.instance).host; } catch { /* keep */ }
  return { configured: true, host, apiVersion: c.apiVersion, origin: c.origin };
}

let tokenCache = { key: null, token: null, exp: 0 };

export async function sfToken(c, fetchImpl = fetch) {
  const key = `${c.instance}|${c.clientId}`;
  if (tokenCache.key === key && tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const res = await fetchImpl(`${c.instance}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c.clientId, client_secret: c.clientSecret }).toString(),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || `Salesforce sign-in failed (${res.status})`);
  tokenCache = { key, token: data.access_token, exp: Date.now() + 45 * 60_000 };
  return data.access_token;
}

async function sfFetch(c, path, init = {}, fetchImpl = fetch) {
  const token = await sfToken(c, fetchImpl);
  const res = await fetchImpl(`${c.instance}/services/data/${c.apiVersion}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
    cache: 'no-store',
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (res.status === 401) tokenCache = { key: null, token: null, exp: 0 };
  if (!res.ok) {
    const msg = Array.isArray(data) ? data.map((e) => e.message).join('; ') : data?.message || data?.error_description || `Salesforce HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/** Confirms the token works and that Cases are writable for the run-as user. */
export async function sfTest(c, fetchImpl = fetch) {
  const describe = await sfFetch(c, '/sobjects/Case/describe', {}, fetchImpl);
  return { ok: true, object: describe?.label || 'Case', createable: !!describe?.createable, fields: Array.isArray(describe?.fields) ? describe.fields.length : undefined };
}

/** Builds the Case body from a ticket. Keep it plain so any org accepts it. */
export function caseFromTicket(ticket, c, settings = {}) {
  const who = ticket.customerName || 'Walk-up customer';
  const order = ticket.orderNumber ? `Order ${ticket.orderNumber}` : 'No order number';
  const svc = ticket.serviceLabel || ticket.serviceType || 'General';
  const lines = [
    `GTS Hub ticket ${ticket.tag}`,
    `${order} · ${who}`,
    `Service: ${svc}`,
    ticket.description ? `\n${ticket.description}` : '',
    `\nLogged by ${ticket.techName || ticket.tech || 'GTS'} at ${settings.stationName || 'GTS Counter'} (${settings.storeLabel || 'B&H'}) on ${new Date(ticket.createdAt || Date.now()).toLocaleString()}`,
  ].filter((l) => l !== '');
  const body = {
    Subject: `GTS · ${order} · ${svc}`.slice(0, 255),
    Description: lines.join('\n').slice(0, 32000),
    Origin: c.origin,
    Status: 'New',
    ...(c.recordTypeId ? { RecordTypeId: c.recordTypeId } : {}),
    ...(c.extra || {}),
  };
  if (ticket.customerName) body.SuppliedName = ticket.customerName.slice(0, 80);
  return body;
}

export async function sfCreateCase(c, ticket, settings, fetchImpl = fetch) {
  const created = await sfFetch(c, '/sobjects/Case', { method: 'POST', body: JSON.stringify(caseFromTicket(ticket, c, settings)) }, fetchImpl);
  if (!created?.id) throw new Error('Salesforce did not return a Case id');
  let caseNumber = null;
  try {
    const q = await sfFetch(c, `/query?q=${encodeURIComponent(`SELECT CaseNumber FROM Case WHERE Id = '${created.id}'`)}`, {}, fetchImpl);
    caseNumber = q?.records?.[0]?.CaseNumber || null;
  } catch { /* the id alone is still a success */ }
  return { id: created.id, caseNumber, url: `${c.instance}/lightning/r/Case/${created.id}/view` };
}
