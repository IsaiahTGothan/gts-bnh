// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — STATS ENGINE (V3)
//  Everything the Stats tab, the Home hero and Management read comes from
//  here so the numbers agree everywhere. Pure functions, no React.
// ═══════════════════════════════════════════════════════════════════════════
import { SERVICE_BY_ID, SERVICE_TYPES, TECHS, TECH_BY_ID, isTerminal } from './constants';
import { dayFraction, hoursFor, openHoursBetween, serviceMs, serviceState, serviceTarget } from './service';
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
  // "on pace" follows the store hours set in Management → System
  const dayFrac = dayFraction(m, now);
  const expected = Math.round(perDay * dayFrac);
  // customers this clock hour + the hour before (for the live "per hour" pulse)
  const h0 = new Date(now); h0.setMinutes(0, 0, 0);
  let thisHour = 0, lastHour = 0;
  for (const e of customerEvents(state)) {
    const at = t(e.at);
    if (at >= h0.getTime() && at <= now) thisHour++;
    else if (at >= h0.getTime() - 3_600_000 && at < h0.getTime()) lastHour++;
  }
  const openToday = hoursFor(m, now);
  const openSoFar = openToday ? openHoursBetween(m, new Date(now).setHours(0, 0, 0, 0), now) : 0;
  return { perDay, today, pct, remaining: Math.max(0, perDay - today), expected, onPace: today >= expected, label: m.goalLabel || 'customers', emphasis: m.goalEmphasis || 'subtle', thisHour, lastHour, perHourToday: openSoFar >= 0.25 ? today / openSoFar : null, open: !!openToday };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}
export const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
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
    const svc = tk.filter((x) => serviceState(x) === 'done').map((x) => serviceMs(x, now)).filter((v) => v > 0 && v < 12 * 3_600_000);
    return {
      avgServiceMs: avg(svc), serviceSamples: svc.length, serviceTotalMs: svc.reduce((a, b) => a + b, 0),
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
  const events = [...tickets.map((x) => x.createdAt), ...assignments.filter((a) => !a.fromTicketId).map((a) => a.receivedAt || a.createdAt)];
  for (const e of events) {
    const d = new Date(e); hours[d.getHours()]++; weekday[d.getDay()]++; heat[d.getDay()][d.getHours()]++;
  }
  const peakHour = hours.indexOf(Math.max(...hours));

  // ── customers per hour ────────────────────────────────────────────────
  const m = state.management || {};
  const firstAt = events.length ? Math.min(...events.map(t)) : now;
  const fromTs = start ? start.getTime() : firstAt;
  const openHours = openHoursBetween(m, fromTs, now);
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayHours = Array.from({ length: 24 }, () => 0);
  for (const e of customerEvents(state)) { const at = t(e.at); if (at >= todayStart.getTime() && at <= now) todayHours[new Date(at).getHours()]++; }
  const daysWithTraffic = new Set(events.map((e) => dayKey(new Date(e)))).size || 1;
  const perHour = {
    openHours,
    perOpenHour: openHours > 0.25 ? events.length / openHours : 0,
    avgByHour: hours.map((n) => n / daysWithTraffic),      // typical customers in each clock hour on a working day
    today: todayHours,
    peakAvg: Math.max(0, ...hours) / daysWithTraffic,
    busiestDayHour: (() => { let best = null; const byDH = {}; for (const e of events) { const d = new Date(e); const k = `${dayKey(d)}|${d.getHours()}`; byDH[k] = (byDH[k] || 0) + 1; if (!best || byDH[k] > best.n) best = { n: byDH[k], key: k }; } return best ? { n: best.n, day: best.key.split('|')[0], hour: Number(best.key.split('|')[1]) } : null; })(),
  };

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

  // ── service time (ticket start → done, pauses excluded) ───────────────
  const done = tickets.filter((x) => serviceState(x) === 'done');
  const durs = done.map((x) => serviceMs(x, now)).filter((v) => v > 0 && v < 12 * 3_600_000);
  const sortedDurs = [...durs].sort((a, b) => a - b);
  const within = done.filter((x) => serviceMs(x, now) <= serviceTarget(m, x.serviceType) * 60_000).length;
  const BUCKETS = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 30], [30, 45], [45, 60], [60, Infinity]];
  const service = {
    samples: durs.length, avgMs: avg(durs), medianMs: percentile(sortedDurs, 0.5), p90Ms: percentile(sortedDurs, 0.9),
    fastestMs: sortedDurs[0] || 0, longestMs: sortedDurs[sortedDurs.length - 1] || 0, totalMs: durs.reduce((a, b) => a + b, 0),
    withinTargetPct: done.length ? within / done.length : 0, target: Number(m.serviceTargetMin) || 15,
    running: (state.tickets || []).filter((x) => !x.deletedAt && (serviceState(x) === 'running' || serviceState(x) === 'paused')).length,
    hist: BUCKETS.map(([a, b]) => ({ label: b === Infinity ? `${a}m+` : `${a}–${b}m`, value: durs.filter((d) => d >= a * 60_000 && d < b * 60_000).length })),
    byType: SERVICE_TYPES.map((st) => {
      const ds = done.filter((x) => x.serviceType === st.id).map((x) => serviceMs(x, now)).filter((v) => v > 0 && v < 12 * 3_600_000);
      return { id: st.id, label: st.label, color: st.color, icon: st.icon, n: ds.length, avgMs: avg(ds), target: serviceTarget(m, st.id) };
    }).filter((r) => r.n > 0).sort((a, b) => b.avgMs - a.avgMs),
  };

  // ── walk-in queue (wait before service) ───────────────────────────────
  const q = (state.queue || []).filter((x) => !x.deletedAt && inRange(x.joinedAt || x.createdAt));
  const waits = q.filter((x) => x.servedAt).map((x) => t(x.servedAt) - t(x.joinedAt)).filter((v) => v >= 0 && v < 6 * 3_600_000);
  const queue = { joined: q.length, served: q.filter((x) => x.servedAt).length, left: q.filter((x) => x.status === 'left').length, avgWaitMs: avg(waits), medianWaitMs: median(waits), waitingNow: (state.queue || []).filter((x) => !x.deletedAt && x.status === 'waiting').length };

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
    daily, byType, byTech, hours, weekday, heat, peakHour, speed, hold, goal, perHour, service, queue,
  };
}

export const fmtPct = (x) => `${Math.round((x || 0) * 100)}%`;
export const fmtMins = (m) => (!m ? '—' : m < 1 ? `${Math.round(m * 60)}s` : m < 60 ? `${Math.round(m)}m` : `${(m / 60).toFixed(1)}h`);
export const fmtHours = (h) => (!h ? '—' : h < 24 ? `${Math.round(h)}h` : `${(h / 24).toFixed(1)}d`);
