// ═══════════════════════════════════════════════════════════════════════════
//  /api/sync — live team sync backed by Supabase (Postgres + Realtime).
//
//  • No Supabase env vars → GET returns { enabled: false } and the app keeps
//    working local-only (browser storage). Nothing else changes.
//  • With Supabase attached (Vercel → Storage → Supabase), the three techs
//    share one document. The first device creates a team passcode
//    (POST action:"setup"); every device sends it as the `x-gts-key` header.
//  • Writes are compare-and-set on a revision counter; on a conflict the
//    client merges record-by-record and retries. After each successful write
//    the server broadcasts the new revision over Supabase Realtime so other
//    devices pull it immediately.
//
//  GET  ?since=<rev>            → { enabled, needsSetup | locked | rev, doc, realtime }
//  PUT  { baseRev, doc, by }    → { rev } | 409 { conflict, rev, doc }
//  POST { action:"setup", passcode }                 → { ok }
//  POST { action:"change", passcode, newPasscode }   → { ok }
// ═══════════════════════════════════════════════════════════════════════════
import {
  MAX_DOC_BYTES, broadcast, casWrite, checkPasscode, config, failure, json, keyFromRequest,
  noteFailure, readRow, realtimeConfig, setPasscode, throttled, withTable,
} from '../../../lib/sync-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function unauthorized() {
  noteFailure();
  return json({ enabled: true, locked: true, error: 'unauthorized' }, throttled() ? 429 : 401);
}

// ─── GET: current document (or just the revision when nothing changed) ─────
export async function GET(req) {
  const c = config();
  if (!c) return json({ enabled: false });
  try {
    const row = await withTable(readRow);
    const auth = checkPasscode(row, keyFromRequest(req));
    if (auth.needsSetup) return json({ enabled: true, needsSetup: true });
    if (!auth.ok) return unauthorized();
    const since = Number(new URL(req.url).searchParams.get('since'));
    const base = { enabled: true, rev: row.rev, updatedAt: row.updated_at, realtime: realtimeConfig(c) };
    if (Number.isFinite(since) && since === row.rev && row.doc) return json({ ...base, unchanged: true });
    return json({ ...base, doc: row.doc || null });
  } catch (e) {
    return failure(e);
  }
}

// ─── PUT: compare-and-set write + realtime ping ────────────────────────────
export async function PUT(req) {
  const c = config();
  if (!c) return json({ enabled: false }, 404);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const baseRev = Number(body?.baseRev ?? 0);
  const doc = body?.doc;
  if (!doc || typeof doc !== 'object' || !Number.isFinite(baseRev)) return json({ error: 'missing doc' }, 400);
  if (JSON.stringify(doc).length > MAX_DOC_BYTES) return json({ error: 'document too large — clear old activity or export & reset' }, 413);
  try {
    const row = await withTable(readRow);
    const auth = checkPasscode(row, keyFromRequest(req));
    if (auth.needsSetup) return json({ enabled: true, needsSetup: true, error: 'setup required' }, 409);
    if (!auth.ok) return unauthorized();
    if (row.rev !== baseRev) return json({ conflict: true, rev: row.rev, doc: row.doc }, 409);
    const result = await casWrite(baseRev, doc);
    if (result.conflict) return json(result, 409);
    const by = typeof body.by === 'string' ? body.by.slice(0, 40) : null;
    const device = typeof body.device === 'string' ? body.device.slice(0, 64) : null;
    const live = await broadcast({ rev: result.rev, by, device, at: result.updatedAt }, c);
    return json({ rev: result.rev, live });
  } catch (e) {
    return failure(e);
  }
}

// ─── POST: passcode management ─────────────────────────────────────────────
export async function POST(req) {
  const c = config();
  if (!c) return json({ enabled: false }, 404);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const action = body?.action;
  try {
    const row = await withTable(readRow);
    if (action === 'setup') {
      if (process.env.GTS_SYNC_KEY) return json({ error: 'The passcode is set by GTS_SYNC_KEY on the server — enter that one.' }, 409);
      const pass = String(body.passcode || '');
      if (pass.length < 4 || pass.length > 128) return json({ error: 'Passcode must be 4–128 characters' }, 400);
      if (row.passcode_hash) return json({ error: 'A team passcode already exists — enter it instead.', exists: true }, 409);
      const ok = await setPasscode(pass, { onlyIfUnset: true });
      if (!ok) return json({ error: 'A team passcode already exists — enter it instead.', exists: true }, 409);
      return json({ ok: true });
    }
    if (action === 'change') {
      if (process.env.GTS_SYNC_KEY) return json({ error: 'The passcode is set by GTS_SYNC_KEY on the server — change it in Vercel.' }, 409);
      const auth = checkPasscode(row, String(body.passcode || ''));
      if (auth.needsSetup) return json({ enabled: true, needsSetup: true, error: 'No passcode set yet' }, 409);
      if (!auth.ok) return unauthorized();
      const next = String(body.newPasscode || '');
      if (next.length < 4 || next.length > 128) return json({ error: 'New passcode must be 4–128 characters' }, 400);
      await setPasscode(next);
      await broadcast({ rev: row.rev, passcodeChanged: true, at: new Date().toISOString() }, c);
      return json({ ok: true });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return failure(e);
  }
}
