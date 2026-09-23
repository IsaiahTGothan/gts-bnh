// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — STATS ENGINE (V3)
//  Everything the Stats tab, the Home hero and Management read comes from
//  here so the numbers agree everywhere. Pure functions, no React.
// ═══════════════════════════════════════════════════════════════════════════
import { SERVICE_TYPES, TECHS, TECH_BY_ID, isTerminal } from './constants';
import { dayKey } from './utils';

const DAY = 86_400_000;
const t = (iso) => (iso ? new Date(iso).getTime() || 0 : 0);

/** Records that count as "a customer served": every ticket + every drop-off that did not start as a ticket. */
export function customerEvents(state) {
  const out = [];
  for (const x of state.tickets || []) if (!x.deletedAt) out.push({ kind: 'ticket', at: x.createdAt, rec: x });
  for (const a of state.assignments || []) if (!a.deletedAt && !a.fromTicketId) out.push({ kind: 'assignment', at: a.receivedAt || a.createdAt, rec: a });
  return out;
}

/** Customers served on a given day (default today). */
export function dayProgress(state, now = Date.now(), key = dayKey(new Date(now))) {
  let n = 0;
  for (const e of customerEvents(state)) if (dayKey(new Date(e.at)) === key) n++;
  return n;
}

export function goalInfo(state, now = Date.now()) {
  const m = state.management || {};
  const perDay = Math.max(1, Number(m.goalPerDay) || 20);
  const today = dayProgress(state, now);
  const pct = Math.min(1, today / perDay);
  const hour = new Date(now).getHours();
  // "on pace" assumes a 9–7 counter day
  const dayFrac = Math.min(1, Math.max(0, (hour + new Date(now).getMinutes() / 60 - 9) / 10));
  const expected = Math.round(perDay * dayFrac);
  return { perDay, today, pct, remaining: Math.max(0, perDay - today), expected, onPace: today >= expected, label: m.goalLabel || 'customers', emphasis: m.goalEmphasis || 'subtle' };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}
const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
const median = (arr) => percentile([...arr].sort((a, b) => a - b), 0.5);

/**
 * The big one. `days` = 1 (today), 7, 30, 90 or 0 (all time).
 */
export function computeStats(state, { days = 7, now = Date.now() } = {}) {
  const start = days ? new Date(now) : null;
  if (start) { start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1)); }
  const inRange = (iso) => !start || t(iso) >= start.getTime();

  const tickets = (state.tickets || []).filter((x) => !x.deletedAt && inRange(x.createdAt));
  const assignments = (state.assignments || []).filter((a) => !a.deletedAt && inRange(a.receivedAt || a.createdAt));
  const allActive = (state.assignments || []).filter((a) => !a.deletedAt && !isTerminal(a.status));
  const th = state.settings?.overdueDays ?? 3;

  const withOrder = tickets.filter((x) => x.orderNumber);
  const withoutOrder = tickets.filter((x) => !x.orderNumber && x.customerName);
  const blank = tickets.filter((x) => !x.orderNumber && !x.customerName);
  const pushed = tickets.filter((x) => x.loggedAt);
  const viaApi = pushed.filter((x) => x.sfCaseNumber);
  const unixLogged = tickets.filter((x) => x.unixLoggedAt);
  const needsUnix = tickets.filter((x) => x.orderNumber && !x.unixLoggedAt && x.status !== 'converted');
  const converted = tickets.filter((x) => x.status === 'converted');
  const pickedUp = assignments.filter((a) => a.status === 'picked_up');
  const cancelled = assignments.filter((a) => a.status === 'cancelled');
  const overdueNow = allActive.filter((a) => (now - t(a.receivedAt)) / DAY >= th);

  // ── daily series ──────────────────────────────────────────────────────
  const nDays = days || Math.max(14, Math.ceil((now - Math.min(...tickets.map((x) => t(x.createdAt)), ...assignments.map((a) => t(a.receivedAt || a.createdAt)), now)) / DAY) + 1);
  const perDay = Math.max(1, Number(state.management?.goalPerDay) || 20);
  const daily = [];
  for (let i = nDays - 1; i >= 0; i--) {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    daily.push({ key: dayKey(d), date: d, label: d.toLocaleDateString([], { weekday: 'short' }), short: d.toLocaleDateString([], { month: 'short', day: 'numeric' }), tickets: 0, assignments: 0, withOrder: 0, pushed: 0, unix: 0, total: 0 });
  }
  const dIdx = Object.fromEntries(daily.map((d, i) => [d.key, i]));
  for (const x of tickets) { const k = dayKey(new Date(x.createdAt)); const d = daily[dIdx[k]]; if (!d) continue; d.tickets++; d.total++; if (x.orderNumber) d.withOrder++; if (x.loggedAt) d.pushed++; if (x.unixLoggedAt) d.unix++; }
  // A drop-off that started life as a ticket is the same customer → counted once, as the ticket (keeps tickets + drop-offs === total).
  for (const a of assignments) { const k = dayKey(new Date(a.receivedAt || a.createdAt)); const d = daily[dIdx[k]]; if (!d || a.fromTicketId) continue; d.assignments++; d.total++; }
  for (const d of daily) d.goalHit = d.total >= perDay;

  // ── by service type ───────────────────────────────────────────────────
  const byType = SERVICE_TYPES.map((s) => {
    const tk = tickets.filter((x) => x.serviceType === s.id).length;
    const as = assignments.filter((a) => a.serviceType === s.id).length;
    return { id: s.id, label: s.label, color: s.color, icon: s.icon, tickets: tk, assignments: as, total: tk + as };
  }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const untyped = tickets.filter((x) => !x.serviceType).length + assignments.filter((a) => !a.serviceType).length;

  // ── by tech ───────────────────────────────────────────────────────────
  const techIds = new Set([...TECHS.map((x) => x.id), ...tickets.map((x) => x.tech), ...assignments.map((a) => a.tech)].filter(Boolean));
  const byTech = [...techIds].map((id) => {
    const tk = tickets.filter((x) => x.tech === id);
    const as = assignments.filter((a) => a.tech === id);
    const logSecs = tk.map((x) => x.logSeconds).filter((v) => Number.isFinite(v) && v > 0);
    const pushMins = tk.filter((x) => x.loggedAt).map((x) => (t(x.loggedAt) - t(x.createdAt)) / 60_000).filter((v) => v >= 0 && v < 24 * 60);
    return {
      tech: TECH_BY_ID[id] || { id, name: id, initials: '?', color: '#9aa8bb' },
      tickets: tk.length, withOrder: tk.filter((x) => x.orderNumber).length, pushed: tk.filter((x) => x.loggedAt).length, unix: tk.filter((x) => x.unixLoggedAt).length,
      assignments: as.length, pickedUp: as.filter((a) => a.status === 'picked_up').length,
      customers: tk.length + as.filter((a) => !a.fromTicketId).length,
      avgLogSeconds: avg(logSecs), avgPushMinutes: avg(pushMins),
    };
  }).sort((a, b) => b.customers - a.customers);
  const unassigned = tickets.filter((x) => !x.tech).length + assignments.filter((a) => !a.tech).length;

  // ── time-of-day / weekday ─────────────────────────────────────────────
  const hours = Array.from({ length: 24 }, () => 0);
  const weekday = Array.from({ length: 7 }, () => 0);
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const e of [...tickets.map((x) => x.createdAt), ...assignments.map((a) => a.receivedAt || a.createdAt)]) {
    const d = new Date(e); hours[d.getHours()]++; weekday[d.getDay()]++; heat[d.getDay()][d.getHours()]++;
  }
  const peakHour = hours.indexOf(Math.max(...hours));

  // ── speed ─────────────────────────────────────────────────────────────
  const logSecs = tickets.map((x) => x.logSeconds).filter((v) => Number.isFinite(v) && v > 0);
  const pushMins = pushed.map((x) => (t(x.loggedAt) - t(x.createdAt)) / 60_000).filter((v) => v >= 0 && v < 24 * 60);
  const unixMins = unixLogged.map((x) => (t(x.unixLoggedAt) - t(x.createdAt)) / 60_000).filter((v) => v >= 0 && v < 24 * 60);
  const speed = {
    samples: logSecs.length, avgLogSeconds: avg(logSecs), medianLogSeconds: median(logSecs), fastestLog: logSecs.length ? Math.min(...logSecs) : 0,
    avgPushMinutes: avg(pushMins), medianPushMinutes: median(pushMins), avgUnixMinutes: avg(unixMins),
    // vs. the old double-entry way (typing an order twice ≈ 45 s per customer)
    minutesSaved: Math.round((withOrder.length * 45 + tickets.length * 20) / 60),
  };

  // ── hold times (drop-offs) ────────────────────────────────────────────
  const holdHours = pickedUp.map((a) => (t(a.pickedUpAt || a.completedAt || a.updatedAt) - t(a.receivedAt)) / 3_600_000).filter((v) => v >= 0);
  const readyHours = assignments.filter((a) => a.readyAt).map((a) => (t(a.readyAt) - t(a.receivedAt)) / 3_600_000).filter((v) => v >= 0);
  const hold = { avgHoldHours: avg(holdHours), medianHoldHours: median(holdHours), avgToReadyHours: avg(readyHours), withinLimit: holdHours.filter((h) => h <= th * 24).length, samples: holdHours.length, longestOpen: allActive.length ? Math.max(...allActive.map((a) => (now - t(a.receivedAt)) / DAY)) : 0 };

  // ── goal ──────────────────────────────────────────────────────────────
  const past = daily.filter((d) => d.key !== dayKey(new Date(now)));
  const hitDays = past.filter((d) => d.goalHit).length;
  let streak = 0; for (let i = daily.length - 1; i >= 0; i--) { if (daily[i].goalHit) streak++; else if (daily[i].key !== dayKey(new Date(now))) break; }
  const best = daily.reduce((b, d) => (d.total > (b?.total ?? -1) ? d : b), null);
  const goal = { perDay, today: daily[daily.length - 1]?.total || 0, hitDays, missDays: Math.max(0, past.length - hitDays), streak, best, avgPerDay: avg(daily.map((d) => d.total)) };

  return {
    days, from: start, to: new Date(now),
    totals: {
      tickets: tickets.length, withOrder: withOrder.length, withoutOrder: withoutOrder.length, blank: blank.length,
      pushed: pushed.length, viaApi: viaApi.length, unixLogged: unixLogged.length, needsUnix: needsUnix.length, converted: converted.length,
      assignments: assignments.length, pickedUp: pickedUp.length, cancelled: cancelled.length, active: allActive.length, overdueNow: overdueNow.length,
      customers: daily.reduce((s, d) => s + d.total, 0), untyped, unassigned,
    },
    rates: {
      orderPct: tickets.length ? withOrder.length / tickets.length : 0,
      sfPct: tickets.length ? pushed.length / tickets.length : 0,
      unixPct: withOrder.length ? unixLogged.length / withOrder.length : 0,
      pickupPct: assignments.length ? pickedUp.length / assignments.length : 0,
      withinLimitPct: hold.samples ? hold.withinLimit / hold.samples : 0,
    },
    daily, byType, byTech, hours, weekday, heat, peakHour, speed, hold, goal,
  };
}

export const fmtPct = (x) => `${Math.round((x || 0) * 100)}%`;
export const fmtMins = (m) => (!m ? '—' : m < 1 ? `${Math.round(m * 60)}s` : m < 60 ? `${Math.round(m)}m` : `${(m / 60).toFixed(1)}h`);
export const fmtHours = (h) => (!h ? '—' : h < 24 ? `${Math.round(h)}h` : `${(h / 24).toFixed(1)}d`);
