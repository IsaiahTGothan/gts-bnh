// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — TEAM SYNC CLIENT
//  Talks to /api/sync. Pull → merge → push with compare-and-set retries.
//  Everything here is optional: if the API says { enabled: false } the app
//  simply stays local. Realtime pings (lib/realtime.js) just trigger cycles.
// ═══════════════════════════════════════════════════════════════════════════
import { mergeStates, sharedSlice } from './store';

const ENDPOINT = '/api/sync';

export function headers(passcode) {
  const h = { 'content-type': 'application/json' };
  if (passcode) h['x-gts-key'] = encodeURIComponent(passcode);
  return h;
}

async function parse(res) {
  const data = await res.json().catch(() => ({}));
  return { ...data, status: res.status };
}

/** @returns {Promise<{enabled:boolean, needsSetup?:boolean, locked?:boolean, unchanged?:boolean, rev?:number, doc?:object, realtime?:object, error?:string, status:number}>} */
export async function pullRemote(passcode, since) {
  const url = Number.isFinite(since) ? `${ENDPOINT}?since=${since}` : ENDPOINT;
  return parse(await fetch(url, { headers: headers(passcode), cache: 'no-store' }));
}

export async function pushRemote(doc, baseRev, passcode, meta = {}) {
  return parse(await fetch(ENDPOINT, { method: 'PUT', headers: headers(passcode), body: JSON.stringify({ baseRev, doc, ...meta }) }));
}

export async function setupPasscode(passcode) {
  return parse(await fetch(ENDPOINT, { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'setup', passcode }) }));
}

export async function changePasscode(passcode, newPasscode) {
  return parse(await fetch(ENDPOINT, { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'change', passcode, newPasscode }) }));
}

const sig = (doc) => JSON.stringify(sharedSlice(doc || {}));

function outcome(res, extra) {
  if (res.status === 401 || res.status === 429 || res.locked) return { enabled: true, locked: true, error: res.status === 429 ? 'Too many wrong passcodes — wait a minute' : 'Passcode rejected', ...extra };
  if (res.needsSetup) return { enabled: true, needsSetup: true, ...extra };
  if (res.enabled === false) return { enabled: false, ...extra };
  if (res.error) return { enabled: true, error: res.error, needsTable: !!res.needsTable, sql: res.sql, ...extra };
  return null;
}

/**
 * One full sync cycle.
 *   1. pull the remote doc (or just its revision when we are not dirty)
 *   2. merge into local (record-level, newest wins)
 *   3. push merged doc with CAS; on conflict merge again and retry (max 4)
 * `dirty` = local shared data changed since the last successful cycle.
 * Returns { enabled, state, rev, changed, realtime, error?, locked?, needsSetup? }.
 */
export async function syncCycle(localState, knownRev, passcode, { dirty = true, meta = {} } = {}) {
  const base = { state: localState, rev: knownRev, changed: false };
  // `since` lets the server skip the document when nothing changed (cheap heartbeat).
  const pulled = await pullRemote(passcode, knownRev > 0 ? knownRev : undefined);
  const bad = outcome(pulled, base);
  if (bad) return bad;

  const realtime = pulled.realtime || null;
  let rev = Number(pulled.rev || 0);
  let remoteDoc = pulled.unchanged ? null : (pulled.doc || null);
  let merged = remoteDoc ? mergeStates(localState, remoteDoc) : localState;
  let changed = remoteDoc ? sig(merged) !== sig(localState) : false;

  if (!dirty && pulled.unchanged) return { enabled: true, state: localState, rev, changed: false, realtime };

  for (let attempt = 0; attempt < 4; attempt++) {
    if (remoteDoc && sig(remoteDoc) === sig(merged)) return { enabled: true, state: merged, rev, changed, realtime };
    const pushed = await pushRemote(sharedSlice(merged), rev, passcode, meta);
    if (pushed.status === 409 && pushed.conflict) {
      rev = Number(pushed.rev || 0);
      remoteDoc = pushed.doc || null;
      merged = remoteDoc ? mergeStates(merged, remoteDoc) : merged;
      changed = true;
      continue;
    }
    const failed = outcome(pushed, { state: merged, rev, changed, realtime });
    if (failed) return failed;
    return { enabled: true, state: merged, rev: Number(pushed.rev ?? rev + 1), changed, realtime, live: pushed.live };
  }
  return { enabled: true, state: merged, rev, changed, realtime, error: 'Too many conflicts — will retry' };
}
