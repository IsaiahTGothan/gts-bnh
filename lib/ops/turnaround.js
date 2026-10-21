// ═══════════════════════════════════════════════════════════════════════════
//  GTS OPS — TURNAROUND ANALYTICS (Phase 5)
//
//  Three different clocks, never blended:
//    elapsed   GTS: service start (or ticket open) → service end. Includes pauses.
//    labor     GTS: the service clock minus pauses — hands-on time.
//    sfElapsed Salesforce: task opened → task completed (minute precision only).
//  Any missing timestamp → null → shown as "unknown". Nothing is estimated.
// ═══════════════════════════════════════════════════════════════════════════
import { dayIn, known, ms } from './schema.js';

function span(a, b) {
  const x = ms(a); const y = ms(b);
  if (!known(x) || !known(y) || y < x) return null;
  return y - x;
}

export function turnaroundRow(rec, timeZone = 'America/New_York') {
  const g = rec.gts; const s = rec.sf;
  const elapsedMs = g && g.serviceEndedAt ? span(g.serviceStartedAt || g.createdAt, g.serviceEndedAt) : null;
  const sfElapsedMs = s && s.openedPrecision === 'minute' && s.completedPrecision === 'minute' ? span(s.openedAt, s.completedAt) : null;
  // grouped conflicts have no single side — date them by their earliest member so they still land on a day
  const members = rec.group ? [...rec.group.gts.map((x) => x.serviceStartedAt || x.createdAt), ...rec.group.sf.map((x) => x.openedAt || x.completedAt)].filter(Boolean).sort() : [];
  const opened = g?.serviceStartedAt || g?.createdAt || s?.openedAt || s?.completedAt || members[0] || null;
  return {
    reconId: rec.id,
    orderKey: rec.orderKey,
    tag: g?.tag || null,
    status: rec.status,
    day: dayIn(opened, timeZone),
    hour: opened ? Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(opened))) : null,
    tech: g?.tech || rec.group?.gts?.[0]?.tech || null,
    owner: s?.owner || null,
    serviceType: g?.serviceType || null,
    elapsedMs,
    laborMs: g?.laborMs ?? null,
    sfElapsedMs,
    synthetic: !!rec.synthetic,
  };
}

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

export function describe(values) {
  const v = values.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  const unknown = values.length - v.length;
  if (!v.length) return { n: 0, unknown, median: null, p90: null, mean: null, min: null, max: null };
  return { n: v.length, unknown, median: quantile(v, 0.5), p90: quantile(v, 0.9), mean: Math.round(v.reduce((a, b) => a + b, 0) / v.length), min: v[0], max: v[v.length - 1] };
}

export function filterRows(rows, f = {}) {
  return rows.filter((r) => (!f.from || (r.day && r.day >= f.from))
    && (!f.to || (r.day && r.day <= f.to))
    && (!f.tech || r.tech === f.tech)
    && (!f.serviceType || r.serviceType === f.serviceType)
    && (!f.status || r.status === f.status)
    && (f.includeSynthetic !== false || !r.synthetic));
}

function groupStats(rows, key) {
  const m = new Map();
  for (const r of rows) { const k = r[key] ?? '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return [...m.entries()].map(([k, list]) => ({ key: k, count: list.length, elapsed: describe(list.map((r) => r.elapsedMs)), labor: describe(list.map((r) => r.laborMs)), sfElapsed: describe(list.map((r) => r.sfElapsedMs)) }))
    .sort((a, b) => b.count - a.count);
}

export function turnaround(records, { timeZone = 'America/New_York', filters = {} } = {}) {
  const all = records.map((r) => turnaroundRow(r, timeZone));
  const rows = filterRows(all, filters);
  return {
    rows,
    total: rows.length,
    elapsed: describe(rows.map((r) => r.elapsedMs)),
    labor: describe(rows.map((r) => r.laborMs)),
    sfElapsed: describe(rows.map((r) => r.sfElapsedMs)),
    byTech: groupStats(rows, 'tech'),
    byType: groupStats(rows, 'serviceType'),
    byDay: groupStats(rows, 'day').sort((a, b) => String(a.key).localeCompare(String(b.key))),
    byHour: groupStats(rows.filter((r) => r.hour != null), 'hour').sort((a, b) => a.key - b.key),
    synthetic: rows.some((r) => r.synthetic),
  };
}

export function fmtMs(v) {
  if (v == null) return 'unknown';
  const m = Math.round(v / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.round(h / 24)}d`;
}
