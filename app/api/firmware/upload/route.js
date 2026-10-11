// ═══════════════════════════════════════════════════════════════════════════
//  /api/firmware/upload — firmware files for team-added gear (Vercel Blob).
//
//  The browser uploads straight to Blob storage (so big firmware zips never
//  pass through a serverless function); this route only hands out the upload
//  token (gated by the team passcode) and reports whether storage is attached.
//
//  GET            → { enabled, maxMB }
//  POST (client)  → handleUpload protocol from @vercel/blob/client
//  POST {action:"delete", url} with x-gts-key → { ok }
//
//  Setup: Vercel → project → Storage → Create → Blob, connect it to gts-hub
//  (adds BLOB_READ_WRITE_TOKEN), Redeploy. Hobby plan includes 1 GB.
// ═══════════════════════════════════════════════════════════════════════════
import { handleUpload } from '@vercel/blob/client';
import { del } from '@vercel/blob';
import { authorizeRequest, checkPasscode, config, json, readRow, withTable } from '../../../../lib/sync-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 1500 * 1024 * 1024;
const enabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export async function GET() {
  return json({ enabled: enabled(), maxMB: MAX_BYTES / 1048576 });
}

async function keyOk(key) {
  if (!config()) return true;                      // local mode: single station, nothing to protect
  const row = await withTable(readRow);
  const auth = checkPasscode(row, key || '');
  return auth.ok;
}

export async function POST(req) {
  if (!enabled()) return json({ error: 'File storage is not attached (Vercel → Storage → Blob).' }, 503);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  if (body?.action === 'delete') {
    const gate = await authorizeRequest(req);
    if (!gate.ok) return json(gate.body, gate.status);
    try { await del(String(body.url || '')); return json({ ok: true }); } catch (e) { return json({ error: String(e?.message || e) }, 502); }
  }

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let key = '';
        try { key = JSON.parse(clientPayload || '{}').key || ''; } catch { /* ignore */ }
        if (!(await keyOk(key))) throw new Error('Team passcode required — connect this station in Settings → Team sync first.');
        if (!/^firmware\//.test(pathname)) throw new Error('bad path');
        return { maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true, tokenPayload: JSON.stringify({ at: new Date().toISOString() }) };
      },
      onUploadCompleted: async () => { /* the record is written by the client into the shared board */ },
    });
    return json(result);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 400);
  }
}
