// ═══════════════════════════════════════════════════════════════════════════
//  GTS OPS — SHARED SCHEMA  (contract "gts-ops/v1")
//
//  The one vocabulary GTS Hub and Clawson agree on. Clawson lives in its own
//  repository and carries a TypeScript mirror of this file; both sides test
//  against the same fixture (docs/ops/gts-ops-v1.fixture.json) so a change on
//  one side that the other doesn't know about fails a test instead of a shift.
//
//  Pure functions only — no React, no browser APIs — so `node --test` runs it.
// ═══════════════════════════════════════════════════════════════════════════

export const CONTRACT = 'gts-ops/v1';

/** Reconciliation outcome for one order (or one unpaired record). */
export const RECON = Object.freeze({
  MATCHED: 'MATCHED',               // one GTS ticket ↔ one Salesforce task, consistent, both finished
  GTS_ONLY: 'GTS_ONLY',             // GTS served it; Salesforce export has nothing for that order
  SALESFORCE_ONLY: 'SALESFORCE_ONLY', // Salesforce has it; no GTS ticket
  MISSING_TASK: 'MISSING_TASK',     // order is in Salesforce but no GTS task is on it
  INCOMPLETE: 'INCOMPLETE',         // paired, but one side isn't finished / is missing required data
  CONFLICT: 'CONFLICT',             // ambiguous or contradictory — a person must decide
  VERIFIED: 'VERIFIED',             // MATCHED and confirmed (human check or verified finalization)
});

export const RECON_META = {
  MATCHED: { label: 'Matched', tone: 'green', rank: 5 },
  VERIFIED: { label: 'Verified', tone: 'accent', rank: 6 },
  GTS_ONLY: { label: 'GTS only', tone: 'amber', rank: 2 },
  SALESFORCE_ONLY: { label: 'Salesforce only', tone: 'violet', rank: 3 },
  MISSING_TASK: { label: 'Missing task', tone: 'red', rank: 1 },
  INCOMPLETE: { label: 'Incomplete', tone: 'amber', rank: 4 },
  CONFLICT: { label: 'Conflict', tone: 'red', rank: 0 },
};

/** Human review decisions (Phase 3). */
export const REVIEW = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  EDITED: 'edited',           // approved with human-edited proposal text
  REJECTED: 'rejected',
  INVESTIGATING: 'investigating',
});

/** What a finalization request asks Clawson to do in Salesforce. */
export const ACTIONS = Object.freeze({
  CREATE_TASK: 'create_task',     // MISSING_TASK / GTS_ONLY → log the GTS task that wasn't logged
  COMPLETE_TASK: 'complete_task', // INCOMPLETE: task exists in Salesforce, still open, GTS finished
});

/** Per-item outcomes Clawson reports back. */
export const OUTCOME = Object.freeze({
  PLANNED: 'planned',     // dry run: what would happen
  VERIFIED: 'verified',   // live: written AND read back matching
  UNVERIFIED: 'unverified', // live: written but read-back didn't match
  SKIPPED: 'skipped',     // refused by a guard (stale, not approved, UNIX, …)
  FAILED: 'failed',
});

// ─── Order numbers ─────────────────────────────────────────────────────────
//  Normalisation is deliberately conservative: it removes formatting only.
//  It never drops leading zeros, never swaps O↔0, never "repairs" an Excel
//  mangled number. Anything it can't read exactly gets key:null + an issue,
//  and the reconciler routes it to a person.
const LABEL_RE = /^(?:order|ord)\s*(?:number|no\.?|num|#)?\s*[:#-]?\s*/i;

export function normalizeOrderNumber(raw, { pattern } = {}) {
  const out = { raw: raw == null ? '' : String(raw), key: null, loose: null, issues: [] };
  let s = out.raw.normalize('NFKC').trim();
  if (!s) return out;
  s = s.replace(LABEL_RE, '').replace(/^#\s*/, '');
  if (/^\d(?:\.\d+)?e\+?\d+$/i.test(s)) { out.issues.push('excel_scientific'); return out; }
  if (/^\d+\.0+$/.test(s)) { out.issues.push('excel_decimal'); s = s.replace(/\.0+$/, ''); }
  s = s.replace(/[\s\-‐‑–—_.\/]/g, '').toUpperCase();
  if (!s) return out;
  if (!/^[A-Z0-9]+$/.test(s)) { out.issues.push('bad_characters'); return out; }
  if (/[A-Z]/.test(s) && /\d/.test(s) && /[OIL]/.test(s)) out.issues.push('ambiguous_characters');
  if (pattern) {
    let re = null;
    try { re = pattern instanceof RegExp ? pattern : new RegExp(pattern); } catch { re = null; }
    if (re && !re.test(s)) out.issues.push('pattern_mismatch');
  }
  out.key = s;
  out.loose = s.replace(/^0+(?=.)/, '');
  return out;
}

/** Kind of near-miss when two keys differ only the way typos do (leading zeros, swapped neighbours, one extra character), else null. */
export function nearMatch(a, b) {
  if (!a || !b || a === b) return null;
  if (a.replace(/^0+/, '') === b.replace(/^0+/, '')) return 'leading_zeros';
  if (a.length === b.length) {
    const diff = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { diff.push(i); if (diff.length > 2) return null; }
    // a single different digit is NOT flagged: B&H order numbers are sequential,
    // so …003 and …004 are usually two real customers, not a typo.
    if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return 'transposed';
    return null;
  }
  if (Math.abs(a.length - b.length) === 1) {
    const [s, l] = a.length < b.length ? [a, b] : [b, a];
    for (let i = 0; i < l.length; i++) if (l.slice(0, i) + l.slice(i + 1) === s) return 'extra_character';
  }
  return null;
}

// ─── Time ──────────────────────────────────────────────────────────────────
export const ms = (iso) => { if (!iso) return NaN; const v = Date.parse(iso); return Number.isFinite(v) ? v : NaN; };
export const known = (v) => Number.isFinite(v);

function zoneOffsetMs(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
  const g = (t) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - utcMs;
}

/** Wall-clock time in `timeZone` → ISO (UTC). Handles DST by re-checking the offset. */
export function zonedISO(y, mo, d, h = 0, mi = 0, s = 0, timeZone = 'America/New_York') {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = guess - zoneOffsetMs(guess, timeZone);
  t = guess - zoneOffsetMs(t, timeZone);
  return new Date(t).toISOString();
}

/**
 * Parses what Salesforce report exports and spreadsheets actually contain.
 * Returns { iso, precision: 'minute'|'day'|null, issue? }. Date-only values
 * are kept but marked precision:'day' so durations built on them read "unknown".
 */
export function parseWhen(raw, timeZone = 'America/New_York') {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return { iso: null, precision: null };
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s);
    if (hasZone) { const v = Date.parse(s); return Number.isFinite(v) ? { iso: new Date(v).toISOString(), precision: 'minute' } : { iso: null, precision: null, issue: 'unreadable_date' }; }
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
    return { iso: zonedISO(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0), timeZone), precision: 'minute' };
  }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    if (m[4] == null) return { iso: zonedISO(+m[1], +m[2], +m[3], 12, 0, 0, timeZone), precision: 'day' };
    return { iso: zonedISO(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0), timeZone), precision: 'minute' };
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    const mo = +m[1]; const d = +m[2];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return { iso: null, precision: null, issue: 'unreadable_date' };
    if (m[4] == null) return { iso: zonedISO(y, mo, d, 12, 0, 0, timeZone), precision: 'day' };
    let h = +m[4];
    if (m[7]) { const pm = /p/i.test(m[7]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
    if (h > 23 || +m[5] > 59) return { iso: null, precision: null, issue: 'unreadable_date' };
    return { iso: zonedISO(y, mo, d, h, +m[5], +(m[6] || 0), timeZone), precision: 'minute' };
  }
  return { iso: null, precision: null, issue: 'unreadable_date' };
}

/** YYYY-MM-DD of an instant in the store's zone. */
export function dayIn(iso, timeZone = 'America/New_York') {
  const v = ms(iso);
  if (!known(v)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(v));
}

// ─── Small helpers shared by every ops module ──────────────────────────────
/** Stable 32-bit FNV-1a → base36. Enough for ids/fingerprints; not security. */
export function hash(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

export const isCompletedStatus = (s) => /^(completed?|closed|done|resolved|finished)\b/i.test(String(s || '').trim());

// ─── Validators (used by importers on both sides) ──────────────────────────
export function validateBundle(b, kind) {
  const errors = [];
  if (!b || typeof b !== 'object') return ['not an object'];
  if (b.contract !== CONTRACT) errors.push(`contract must be "${CONTRACT}" (got ${JSON.stringify(b.contract)})`);
  if (kind && b.kind !== kind) errors.push(`kind must be "${kind}" (got ${JSON.stringify(b.kind)})`);
  if (!b.id || typeof b.id !== 'string') errors.push('missing id');
  if (!Array.isArray(b.items)) errors.push('items must be an array');
  if (b.items?.length > 500) errors.push('too many items (max 500 per bundle)');
  return errors;
}
