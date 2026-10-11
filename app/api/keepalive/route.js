// ═══════════════════════════════════════════════════════════════════════════
//  /api/keepalive — touched once a day by the Vercel cron (vercel.json).
//  Supabase pauses free projects after 7 days without traffic; a daily read
//  keeps the GTS Hub database awake so team sync never silently dies again.
//  GET → { ok, ms } | { ok:false, error }   (502 when the database is down)
// ═══════════════════════════════════════════════════════════════════════════
import { config, describeError, json, ping, withTable } from '../../../lib/sync-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  const c = config();
  if (!c) return json({ ok: true, enabled: false, note: 'local mode — no database attached' });
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  // Vercel sends "Bearer <CRON_SECRET>" when the secret is set; manual checks are fine too.
  if (secret && auth !== `Bearer ${secret}` && new URL(req.url).searchParams.get('key') !== secret) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  try {
    const r = await withTable(ping);
    return json({ ok: true, ms: r.ms, at: new Date().toISOString() });
  } catch (e) {
    const d = describeError(e);
    return json({ ok: false, ...d, at: new Date().toISOString() }, 502);
  }
}
