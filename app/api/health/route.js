// ═══════════════════════════════════════════════════════════════════════════
//  /api/health — uptime / monitoring probe for IT (no secrets, no data).
//  GET → { ok, app, version, time, integrations: { teamSync, salesforce } }
// ═══════════════════════════════════════════════════════════════════════════
import { config } from '../../../lib/sync-server';
import { sfConfig } from '../../../lib/salesforce-server';
import { APP_VERSION } from '../../../lib/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return new Response(JSON.stringify({
    ok: true, app: 'gts-hub', version: APP_VERSION, time: new Date().toISOString(),
    region: process.env.VERCEL_REGION || null, commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    integrations: { teamSync: !!config(), salesforce: !!sfConfig() },
  }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
