// ═══════════════════════════════════════════════════════════════════════════
//  /api/firmware/upload — files for team-added firmware gear and the promo-
//  screen video (Vercel Blob). The browser uploads straight to Blob storage,
//  so big files never pass through a serverless function; this route only
//  authorises the upload (team passcode) and reports whether storage exists.
//
//  Works with both kinds of Blob connection Vercel hands out:
//    • classic   — BLOB_READ_WRITE_TOKEN       → client-token uploads
//    • OIDC      — BLOB_STORE_ID (+ Vercel's    → presigned uploads; also how
//                  automatic OIDC sign-in)        new public/private stores connect
//
//  GET            → { enabled, mode, maxMB, vars }
//  POST (client)  → handleUpload / handleUploadPresigned protocol
//  POST {action:"delete", url} with x-gts-key → { ok }
// ═══════════════════════════════════════════════════════════════════════════
import { handleUpload, handleUploadPresigned } from '@vercel/blob/client';
import { del, issueSignedToken } from '@vercel/blob';
import { authorizeRequest, checkPasscode, config, json, readRow, withTable } from '../../../../lib/sync-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 1500 * 1024 * 1024;
const PATHS = /^(firmware|promo)\//;          // promo/ = the promo-screen video (Management → System)
const mode = () => (process.env.BLOB_READ_WRITE_TOKEN ? 'token' : process.env.BLOB_STORE_ID ? 'oidc' : null);

export async function GET() {
  // names only (never values) — tells the Promo screen panel what Vercel attached
  const vars = Object.keys(process.env).filter((k) => /^BLOB_/.test(k)).sort();
  return json({ enabled: !!mode(), mode: mode(), maxMB: MAX_BYTES / 1048576, vars });
}

async function keyOk(key) {
  if (!config()) return true;                      // local mode: single station, nothing to protect
  const row = await withTable(readRow);
  return checkPasscode(row, key || '').ok;
}
const keyFrom = (clientPayload) => { try { return JSON.parse(clientPayload || '{}').key || ''; } catch { return ''; } };

export async function POST(req) {
  if (!mode()) return json({ error: 'File storage is not attached (Vercel → Storage → Blob, connect it to this project, redeploy).' }, 503);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  if (body?.action === 'delete') {
    const gate = await authorizeRequest(req);
    if (!gate.ok) return json(gate.body, gate.status);
    try { await del(String(body.url || '')); return json({ ok: true }); } catch (e) { return json({ error: String(e?.message || e) }, 502); }
  }

  try {
    // New-style stores (OIDC): hand the browser a short-lived presigned PUT for exactly this path.
    if (body?.type === 'blob.generate-presigned-url') {
      const result = await handleUploadPresigned({
        body,
        request: req,
        webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || 'unused', // no upload-completed callback is used
        getSignedToken: async (pathname, clientPayload) => {
          if (!(await keyOk(keyFrom(clientPayload)))) throw new Error('Team passcode required — connect this station in Settings → Team sync first.');
          if (!PATHS.test(pathname)) throw new Error('bad path');
          const token = await issueSignedToken({ pathname, operations: ['put'], maximumSizeInBytes: MAX_BYTES, validUntil: Date.now() + 60 * 60 * 1000 });
          return { token, urlOptions: { maximumSizeInBytes: MAX_BYTES, cacheControlMaxAge: 60 * 60 * 24 * 30 } };
        },
      });
      return json(result);
    }
    // Classic stores (read-write token): client-token uploads.
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!(await keyOk(keyFrom(clientPayload)))) throw new Error('Team passcode required — connect this station in Settings → Team sync first.');
        if (!PATHS.test(pathname)) throw new Error('bad path');
        return { maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true, tokenPayload: JSON.stringify({ at: new Date().toISOString() }) };
      },
      onUploadCompleted: async () => { /* the record is written by the client into the shared board */ },
    });
    return json(result);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 400);
  }
}
