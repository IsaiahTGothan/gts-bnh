// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — TEAM SYNC CLIENT
//  Talks to /api/sync. Pull → merge → push with compare-and-set retries.
//  Everything here is optional: if the API says { enabled: false } the app
//  simply stays local.
// ═══════════════════════════════════════════════════════════════════════════
import { mergeStates, sharedSlice } from './store';

const ENDPOINT = '/api/sync';

function headers(passcode) {
  const h = { 'content-type': 'application/json' };
  if (passcode) h['x-gts-key'] = passcode;
  return h;
}

/** @returns {{enabled:boolean, rev?:number, doc?:object, error?:string, status:number}} */
export async function pullRemote(passcode) {
  const res = await fetch(ENDPOINT, { headers: headers(passcode), cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  return { ...data, status: res.status };
}

export async function pushRemote(doc, baseRev, passcode) {
  const res = await fetch(ENDPOINT, { method: 'PUT', headers: headers(passcode), body: JSON.stringify({ baseRev, doc }) });
  const data = await res.json().catch(() => ({}));
  return { ...data, status: res.status };
}

/**
 * One full sync cycle.
 *   1. pull remote doc
 *   2. merge into local (record-level, newest wins)
 *   3. push merged doc with CAS; on conflict merge again and retry (max 3)
 * Returns { state, rev, changed, enabled, error }.
 */
export async function syncCycle(localState, knownRev, passcode) {
  const pulled = await pullRemote(passcode);
  if (pulled.status === 401) return { enabled: true, error: 'Passcode rejected', state: localState, rev: knownRev };
  if (!pulled.enabled) return { enabled: false, state: localState, rev: knownRev };
  if (pulled.error) return { enabled: true, error: pulled.error, state: localState, rev: knownRev };

  let rev = pulled.rev || 0;
  let merged = mergeStates(localState, pulled.doc);
  let changed = JSON.stringify(sharedSlice(merged)) !== JSON.stringify(sharedSlice(localState));

  for (let attempt = 0; attempt < 3; attempt++) {
    const remoteStr = JSON.stringify(sharedSlice(pulled.doc || {}));
    const mergedStr = JSON.stringify(sharedSlice(merged));
    if (pulled.doc && remoteStr === mergedStr) return { enabled: true, state: merged, rev, changed };

    const pushed = await pushRemote(sharedSlice(merged), rev, passcode);
    if (pushed.status === 401) return { enabled: true, error: 'Passcode rejected', state: merged, rev, changed };
    if (pushed.status === 409 && pushed.doc) {
      rev = pushed.rev;
      merged = mergeStates(merged, pushed.doc);
      changed = true;
      continue;
    }
    if (pushed.error) return { enabled: true, error: pushed.error, state: merged, rev, changed };
    return { enabled: true, state: merged, rev: pushed.rev ?? rev + 1, changed };
  }
  return { enabled: true, state: merged, rev, changed, error: 'Too many conflicts — will retry' };
}
