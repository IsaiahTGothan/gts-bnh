// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — TECHNICAL HANDOFF (generated from the live config)
//  Management → System → Configuration → "Technical handoff". The full,
//  static version lives in docs/SOFTWARE_HANDOFF.md in the repository.
// ═══════════════════════════════════════════════════════════════════════════
import { APP_VERSION, SERVICE_TYPES, TABS } from './constants';

export function handoffMarkdown(state, extra = {}) {
  const m = state.management || {};
  const n = (k) => (state[k] || []).filter((x) => !x.deletedAt).length;
  const yes = (v) => (v ? 'on' : 'off');
  return `# GTS Hub — technical handoff

Generated ${new Date().toLocaleString()} from ${state.settings.stationName || 'the counter'} · version **${APP_VERSION}** · store \`${m.storeCode || '—'}\`

## What it is
A Next.js 15 (App Router) + React 19 web app for the B&H Guest Technical Services counter. Single page, client-rendered, no UI library.
Deployed on Vercel. Optional Supabase (Postgres + Realtime) for the shared team board, optional Salesforce Connected App for Cases.

Pages: ${TABS.map((t) => t.label).join(' · ')}

## Data
* Browser: \`localStorage['gts-hub:state']\` (whole state, debounced writes).
* Team sync: one JSON document in \`public.gts_sync\` (row \`team\`) with a revision counter; compare-and-set writes; record-level merge (newest \`updatedAt\` wins, tombstones via \`deletedAt\`); Supabase Realtime broadcast + presence on channel \`gts-sync\`.
* Records right now: ${n('tickets')} tickets · ${n('assignments')} assignments · ${n('queue')} queue entries · ${n('inventory')} inventory items · ${(state.activity || []).length} activity events.
* Ticket service clock: \`serviceStartedAt\`, \`serviceEndedAt\`, \`servicePausedAt\`, \`servicePausedMs\` → duration = end − start − paused.

## HTTP API (all JSON, gated by the team passcode header \`x-gts-key\` once a database is attached)
| Route | Purpose |
|---|---|
| \`GET /api/health\` | Uptime probe — version, time, which integrations are configured. No data, no auth. |
| \`GET/POST /api/sync\` | Team board pull / compare-and-set push / passcode setup. |
| \`GET/POST /api/salesforce\` | Connector status · test · create Case. |
| \`POST /api/webhook\` | Relays GTS events to the configured HTTPS endpoint. |
| \`POST /api/linkcheck\` | Server-side check of the warranty directory links. |
| \`GET /api/keepalive\` | Daily Vercel cron so the free Supabase project never pauses. |

## Environment variables
\`SUPABASE_URL\`, \`SUPABASE_SERVICE_ROLE_KEY\`, \`SUPABASE_ANON_KEY\` (or \`NEXT_PUBLIC_*\`), \`POSTGRES_URL\` (one-time table creation), \`GTS_SYNC_KEY\` (optional forced passcode), \`SF_INSTANCE_URL\`, \`SF_CLIENT_ID\`, \`SF_CLIENT_SECRET\`, \`SF_API_VERSION\`, \`SF_CASE_ORIGIN\`, \`SF_CASE_RECORD_TYPE_ID\`, \`SF_CASE_FIELDS_JSON\`, \`CRON_SECRET\`.

## Current configuration
* Daily goal: ${m.goalPerDay} ${m.goalLabel} · emphasis ${m.goalEmphasis}
* Store hours: ${(m.hours || []).map((h, i) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]} ${h ? `${h.open}–${h.close}` : 'closed'}`).join(' · ')}
* Service clock default: ${m.serviceClock} · target ${m.serviceTargetMin} min · stale alert after ${m.staleServiceHours} h
* Per-type targets: ${Object.entries(m.serviceTargets || {}).map(([k, v]) => `${SERVICE_TYPES.find((s) => s.id === k)?.label || k} ${v}m`).join(', ') || 'none'}
* Ticket rules: service type ${m.requireServiceType ? 'required' : 'optional'} · order # ${m.requireOrderNumber ? 'required' : 'optional'} · pattern \`${m.orderPattern}\` (${m.orderCheck}) · duplicate window ${m.duplicateWindowHours} h
* Features: 3D stage ${yes(m.features?.scene3d)} (${m.sceneIntensity}) · queue ${yes(m.features?.queue)} · warranty ${yes(m.features?.warranty)} · customer display ${yes(m.features?.customerDisplay)}
* Privacy: names masked on the customer display ${yes(m.maskNamesOnDisplay)} · purge after ${m.purgeAfterDays ? `${m.purgeAfterDays} days` : 'never'}
* Security: manager PIN ${m.pinHash ? 'set' : 'NOT set'} · auto-lock ${m.autoLockMinutes ? `${m.autoLockMinutes} min` : 'off'} · tech permissions ${Object.entries(m.perms || {}).map(([k, v]) => `${k}=${v}`).join(', ')}
* Webhook: ${m.webhookUrl ? `${new URL(m.webhookUrl).host} (${(m.webhookEvents || []).join(', ')})` : 'not configured'}
* Warranty directory overrides: ${(m.warrantyBrands || []).length}
${extra.health ? `\n## Deployment health\n\`\`\`json\n${JSON.stringify(extra.health, null, 2)}\n\`\`\`\n` : ''}
## Suggested next steps for an enterprise rollout
1. SSO (Entra ID / Okta) in front of the app — replaces the shared team passcode and the manager PIN with real identities.
2. Move from the single JSON document to per-record tables (tickets, assignments, queue, activity) once more than one store is on it; \`storeCode\` is already on every webhook.
3. Salesforce Connected App (client-credentials) for real Cases; UNIX import job or SSH bridge instead of the barcode scan bridge.
4. Point \`/api/health\` at the existing uptime monitoring; send webhooks to Teams / Power Automate for the managers' channel.
5. Data retention policy: set Privacy → purge after N days.
`;
}
