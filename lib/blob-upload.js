// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — FILE UPLOADS (Vercel Blob), shared by the Promo screen and the
//  Firmware hub. Handles both kinds of store Vercel creates:
//    classic token stores → upload()            (always public)
//    new OIDC stores      → uploadPresigned()   (public, or private → played
//                                                through /api/files)
// ═══════════════════════════════════════════════════════════════════════════
const HANDLE = '/api/firmware/upload';

export async function storageStatus() {
  try { return await (await fetch(HANDLE, { cache: 'no-store' })).json(); } catch { return { enabled: false }; }
}

/**
 * Upload `file` under `folder/` → { url, pathname, access }.
 * `url` is what to store and play: the public CDN link, or /api/files?p=… for private stores.
 */
export async function uploadFile(folder, file, { passcode, onProgress, status } = {}) {
  const st = status || (await storageStatus());
  if (!st?.enabled) throw new Error('File storage isn’t attached to this deployment yet.');
  const client = await import('@vercel/blob/client');
  const safe = String(file.name || 'file').replace(/[^\w.\-() ]+/g, '_');
  const base = {
    handleUploadUrl: HANDLE,
    clientPayload: JSON.stringify({ key: passcode || '' }),
    contentType: file.type || undefined,
    onUploadProgress: (p) => onProgress?.(Math.round(p?.percentage || 0)),
  };
  if (st.mode === 'token') {
    const b = await client.upload(`${folder}/${safe}`, file, { access: 'public', ...base });
    return { url: b.url, pathname: b.pathname, access: 'public' };
  }
  // OIDC store: presigned upload to a unique path. Try public first (promo videos play straight
  // from the CDN); a private store refuses public writes, so retry as private.
  const pathname = `${folder}/${Date.now().toString(36)}-${safe}`;
  try {
    const b = await client.uploadPresigned(pathname, file, { access: 'public', ...base });
    return { url: b.url, pathname: b.pathname, access: 'public' };
  } catch (e) {
    const msg = String(e?.message || e);
    if (!/private|access|public/i.test(msg)) throw e;
    const b = await client.uploadPresigned(pathname, file, { access: 'private', ...base });
    return { url: `/api/files?p=${encodeURIComponent(b.pathname)}`, pathname: b.pathname, access: 'private' };
  }
}
