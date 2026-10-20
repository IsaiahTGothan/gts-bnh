// ═══════════════════════════════════════════════════════════════════════════
//  /api/files?p=<pathname> — plays / downloads a file from a PRIVATE Blob
//  store. Private files have no public link, so this issues a short-lived
//  signed GET link and redirects to it; the <video> (or download) then talks
//  to Vercel's CDN directly, range requests and all. Only promo/ and
//  firmware/ files are served. Public stores never need this route.
// ═══════════════════════════════════════════════════════════════════════════
import { issueSignedToken, presignUrl } from '@vercel/blob';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PATHS = /^(firmware|promo)\/[^?#]+$/;
const TTL = 6 * 60 * 60 * 1000;
const memo = new Map(); // pathname → { url, until } — reuse a link while it is fresh (keeps the browser cache warm)

export async function GET(req) {
  const p = new URL(req.url).searchParams.get('p') || '';
  if (!PATHS.test(p) || p.includes('..')) return new Response('bad path', { status: 400 });
  try {
    let hit = memo.get(p);
    if (!hit || hit.until - Date.now() < 30 * 60 * 1000) {
      const until = Date.now() + TTL;
      const token = await issueSignedToken({ pathname: p, operations: ['get', 'head'], validUntil: until });
      const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname: p, validUntil: until });
      hit = { url: presignedUrl, until };
      memo.set(p, hit);
    }
    return new Response(null, { status: 302, headers: { location: hit.url, 'cache-control': 'private, max-age=1800' } });
  } catch (e) {
    return new Response(`Could not sign the file link: ${String(e?.message || e)}`, { status: 502 });
  }
}
