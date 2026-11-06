// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — REAL NUMBERS (V5.2)
//  One number per day: how many GTS customers/orders Salesforce really shows
//  for that day (what was already there + what GTS Hub put in). Entered by the
//  copy-sheet bot when it finishes, or by hand in Stats → Real numbers.
//  Kept apart from GTS Hub's own logging so a missed Quick Log never fakes
//  the totals. No times — just the day — so it answers "which days are busy".
//  Pure module (no React) — tested in tests/real-counts.test.mjs.
// ═══════════════════════════════════════════════════════════════════════════

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MAX_TOTAL = 2000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const realId = (day) => `rc_${day}`;
export const localDay = (d = new Date()) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
export const weekdayOf = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
export const addDays = (day, n) => { const [y, m, d] = day.split('-').map(Number); return localDay(new Date(y, m - 1, d + n)); };

/** Why an entry can't be saved, or null. */
export function entryError({ day, total }, today = localDay()) {
  if (!DAY_RE.test(String(day || ''))) return 'Pick a day.';
  if (day > today) return 'That day hasn’t happened yet.';
  const n = Number(total);
  if (String(total ?? '').trim() === '' || !Number.isFinite(n)) return 'Type the total as a number.';
  if (!Number.isInteger(n) || n < 0) return 'Use a whole number, 0 or more.';
  if (n > MAX_TOTAL) return `That’s more than ${MAX_TOTAL} — check the number.`;
  return null;
}

/**
 * New or updated record for a day. Re-entering a day replaces the total (the
 * latest count wins) and keeps every earlier value in `history`.
 */
export function upsertDailyCount(prev, { day, total, source = 'manual', by = null, note = '', gtsLogged = null, at = new Date().toISOString() }) {
  const entry = { at, by, total: Number(total), source };
  return {
    ...(prev || {}),
    id: realId(day),
    day,
    total: Number(total),
    source,
    by,
    note: String(note || '').trim().slice(0, 240),
    gtsLogged: gtsLogged == null ? (prev?.gtsLogged ?? null) : gtsLogged,
    enteredAt: at,
    createdAt: prev?.createdAt || at,
    updatedAt: at,
    deletedAt: null,
    history: [...(prev?.history || []), entry].slice(-20),
  };
}

/** Customers GTS Hub itself logged per local day (tickets + drop-offs that didn't start as a ticket). */
export function gtsLoggedByDay(state) {
  const m = new Map();
  const bump = (iso) => { if (!iso) return; const k = localDay(iso); m.set(k, (m.get(k) || 0) + 1); };
  for (const t of state?.tickets || []) if (!t.deletedAt) bump(t.createdAt);
  for (const a of state?.assignments || []) if (!a.deletedAt && !a.fromTicketId) bump(a.receivedAt || a.createdAt);
  return m;
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = Math.floor(s.length / 2); return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };

/**
 * Everything the Real numbers view shows, for days in [from, to] (inclusive, YYYY-MM-DD; either optional).
 * capture = how much of the real traffic GTS Hub logged (gts / real) on days that have both.
 */
export function realStats(counts, { from, to, gtsByDay = new Map() } = {}) {
  const live = (counts || []).filter((c) => c && !c.deletedAt && DAY_RE.test(c.day) && (!from || c.day >= from) && (!to || c.day <= to));
  const days = live.map((c) => {
    const gts = gtsByDay.get(c.day) ?? 0;
    return { ...c, weekday: weekdayOf(c.day), gts, gap: c.total - gts, capture: c.total > 0 ? Math.min(1, gts / c.total) : null };
  }).sort((a, b) => b.day.localeCompare(a.day));
  // a 0 is a closed day: it counts as counted, but not toward averages or "quietest"
  const totals = days.filter((d) => d.total > 0).map((d) => d.total);
  const byWeekday = WEEKDAYS_SHORT.map((label, wd) => { const all = days.filter((d) => d.weekday === wd); const v = all.filter((d) => d.total > 0).map((d) => d.total); return { wd, label, n: v.length, closed: all.length - v.length, avg: avg(v), max: v.length ? Math.max(...v) : null }; });
  const ranked = byWeekday.filter((w) => w.n).sort((a, b) => b.avg - a.avg);
  const best = days.reduce((b, d) => (!b || d.total > b.total ? d : b), null);
  const slowest = days.filter((d) => d.total > 0).reduce((b, d) => (!b || d.total < b.total ? d : b), null);
  const withBoth = days.filter((d) => d.total > 0);
  const realSum = withBoth.reduce((s, d) => s + d.total, 0);
  const gtsSum = withBoth.reduce((s, d) => s + Math.min(d.gts, d.total), 0);
  // last 7 recorded days vs the 7 before them
  const openDays = days.filter((d) => d.total > 0);
  const recent = openDays.slice(0, 7).map((d) => d.total); const before = openDays.slice(7, 14).map((d) => d.total);
  return {
    days,
    recorded: days.length,
    total: totals.reduce((s, v) => s + v, 0),
    closedDays: days.length - totals.length,
    avg: avg(totals),
    median: median(totals),
    best, slowest,
    byWeekday,
    busiest: ranked[0] || null,
    quietest: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    capture: realSum ? gtsSum / realSum : null,
    missed: Math.max(0, realSum - gtsSum),
    trend: recent.length >= 3 && before.length >= 3 ? (avg(recent) - avg(before)) / Math.max(1, avg(before)) : null,
  };
}

/**
 * The next `n` days, each with what that weekday usually brings (average of the same
 * weekday over the last `weeks` weeks of real numbers). null when there's no history.
 */
export function forecast(counts, { today = localDay(), n = 7, weeks = 8 } = {}) {
  const since = addDays(today, -weeks * 7);
  const live = (counts || []).filter((c) => c && !c.deletedAt && DAY_RE.test(c.day) && c.day >= since && c.day < today);
  const out = [];
  for (let i = 0; i < n; i++) {
    const day = addDays(today, i); const wd = weekdayOf(day);
    const same = live.filter((c) => weekdayOf(c.day) === wd);
    const v = same.filter((c) => c.total > 0).map((c) => c.total);
    // a weekday that was 0 every time it was counted is a closed day, not a slow one
    const closed = same.length > 0 && v.length === 0;
    out.push({ day, weekday: wd, label: WEEKDAYS_SHORT[wd], expected: v.length ? Math.round(avg(v)) : closed ? 0 : null, samples: same.length, closed });
  }
  return out;
}

/** A month as weeks of 7 cells (null outside the month) for the calendar heat map. */
export function monthGrid(year, month /* 0-11 */) {
  const first = new Date(year, month, 1); const daysIn = new Date(year, month + 1, 0).getDate();
  const cells = Array(first.getDay()).fill(null);
  for (let d = 1; d <= daysIn; d++) cells.push(localDay(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** A short weekly recap to paste into Teams / email (last 7 days ending today). */
export function weeklySummaryText(counts, { today = localDay(), gtsByDay = new Map(), store = 'GTS Counter' } = {}) {
  const from = addDays(today, -6);
  const s = realStats(counts, { from, to: today, gtsByDay });
  const prev = realStats(counts, { from: addDays(today, -13), to: addDays(today, -7), gtsByDay });
  const fmt = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };
  if (!s.recorded) return `${store} — real numbers, week of ${fmt(from)}: no days counted yet.`;
  const lines = [
    `${store} — real numbers (Salesforce), ${fmt(from)} → ${fmt(today)}`,
    `• ${s.total} customers over ${s.recorded} counted day${s.recorded === 1 ? '' : 's'} (avg ${s.avg.toFixed(1)}/day)`,
    s.best ? `• Busiest: ${fmt(s.best.day)} with ${s.best.total}` : null,
    prev.recorded ? `• vs the week before: ${s.total - prev.total >= 0 ? '+' : ''}${s.total - prev.total} (${prev.total} → ${s.total})` : null,
    s.capture != null ? `• GTS Hub captured ${Math.round(s.capture * 100)}% (${s.missed} not logged in GTS Hub)` : null,
    '',
    ...[...s.days].reverse().map((d) => `${fmt(d.day)}: ${d.total}`),
  ];
  return lines.filter((l) => l !== null).join('\n');
}
