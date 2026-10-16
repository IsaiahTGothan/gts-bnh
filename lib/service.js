// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — SERVICE CLOCK + STORE HOURS (V4)
//  How long a service ticket takes, start → done, with pauses. Pure helpers
//  shared by the Quick Log cards, Stats, alerts, exports and webhooks.
//
//  Ticket fields:
//    serviceStartedAt   ISO — clock started (first keystroke, or a manual start)
//    serviceEndedAt     ISO — clock stopped (Done); null while running/paused
//    servicePausedAt    ISO — set while paused
//    servicePausedMs    number — total paused time already banked
// ═══════════════════════════════════════════════════════════════════════════
import { DEFAULT_HOURS } from './constants';

const t = (iso) => (iso ? new Date(iso).getTime() || 0 : 0);

/** 'none' | 'running' | 'paused' | 'done' */
export function serviceState(tk) {
  if (!tk?.serviceStartedAt) return 'none';
  if (tk.serviceEndedAt) return 'done';
  if (tk.servicePausedAt) return 'paused';
  return 'running';
}

/** Milliseconds of actual service time (pauses excluded). Live while running. */
export function serviceMs(tk, now = Date.now()) {
  if (!tk?.serviceStartedAt) return 0;
  const end = tk.serviceEndedAt ? t(tk.serviceEndedAt) : tk.servicePausedAt ? t(tk.servicePausedAt) : now;
  return Math.max(0, end - t(tk.serviceStartedAt) - (Number(tk.servicePausedMs) || 0));
}

export const serviceMinutes = (tk, now) => serviceMs(tk, now) / 60_000;

/** Target minutes for a ticket (per-type override → global target). */
export function serviceTarget(management = {}, type) {
  const per = management.serviceTargets || {};
  return Number(per[type]) || Number(management.serviceTargetMin) || 15;
}

/** "0:42" · "12:05" · "1:02:13" — the live clock. */
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** "45s" · "12m" · "1h 05m" — for summaries. */
export function fmtDur(ms) {
  if (!ms || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** Patches for the clock actions (the store stamps updatedAt). */
export const serviceActions = {
  start: (tk, at = new Date().toISOString()) => ({ serviceStartedAt: at, serviceEndedAt: null, servicePausedAt: null, servicePausedMs: 0 }),
  pause: (tk, at = new Date().toISOString()) => (serviceState(tk) === 'running' ? { servicePausedAt: at } : {}),
  resume: (tk, at = new Date().toISOString()) => {
    const st = serviceState(tk);
    if (st === 'paused') return { servicePausedAt: null, servicePausedMs: (Number(tk.servicePausedMs) || 0) + Math.max(0, t(at) - t(tk.servicePausedAt)) };
    // Resume after Done: the time between Done and now counts as a pause.
    if (st === 'done') return { serviceEndedAt: null, servicePausedAt: null, servicePausedMs: (Number(tk.servicePausedMs) || 0) + Math.max(0, t(at) - t(tk.serviceEndedAt)) };
    return {};
  },
  finish: (tk, at = new Date().toISOString()) => {
    const st = serviceState(tk);
    if (st === 'none') return { serviceStartedAt: tk.createdAt || at, serviceEndedAt: at, servicePausedAt: null, servicePausedMs: 0 };
    if (st === 'paused') return { serviceEndedAt: tk.servicePausedAt, servicePausedAt: null };
    if (st === 'running') return { serviceEndedAt: at };
    return {};
  },
  clear: () => ({ serviceStartedAt: null, serviceEndedAt: null, servicePausedAt: null, servicePausedMs: 0 }),
};

// ─── Store hours ───────────────────────────────────────────────────────────
const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? Number(m[1]) + Number(m[2]) / 60 : null; };

export function hoursFor(management, date) {
  const list = Array.isArray(management?.hours) && management.hours.length === 7 ? management.hours : DEFAULT_HOURS;
  const d = list[new Date(date).getDay()];
  if (!d) return null;
  const open = hm(d.open); const close = hm(d.close);
  if (open == null || close == null || close <= open) return null;
  return { open, close, length: close - open };
}

/** Is the counter open at `now`? */
export function isOpenAt(management, now = Date.now()) {
  const h = hoursFor(management, now); if (!h) return false;
  const d = new Date(now); const x = d.getHours() + d.getMinutes() / 60;
  return x >= h.open && x < h.close;
}

/** Fraction of today's open hours already gone (0 before open, 1 after close / closed day). */
export function dayFraction(management, now = Date.now()) {
  const h = hoursFor(management, now); if (!h) return 1;
  const d = new Date(now); const x = d.getHours() + d.getMinutes() / 60;
  return Math.min(1, Math.max(0, (x - h.open) / h.length));
}

/** Open hours elapsed between two timestamps (for customers / open hour). */
export function openHoursBetween(management, from, to) {
  let total = 0;
  const day = new Date(from); day.setHours(0, 0, 0, 0);
  const end = new Date(to);
  for (let guard = 0; day <= end && guard < 800; guard++) {
    const h = hoursFor(management, day);
    if (h) {
      const s = Math.max(new Date(day).setHours(0, 0, 0, 0) + h.open * 3_600_000, new Date(from).getTime());
      const e = Math.min(new Date(day).setHours(0, 0, 0, 0) + h.close * 3_600_000, end.getTime());
      if (e > s) total += (e - s) / 3_600_000;
    }
    day.setDate(day.getDate() + 1);
  }
  return total;
}

export const hourLabel = (h) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);
export const hourShort = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);

/** Order number check against the management pattern. → 'ok' | 'bad' | 'empty' */
export function checkOrder(value, management = {}) {
  const v = String(value || '').trim();
  if (!v) return 'empty';
  if ((management.orderCheck || 'warn') === 'off') return 'ok';
  try { return new RegExp(management.orderPattern || '^\\d{6,12}$').test(v) ? 'ok' : 'bad'; } catch { return 'ok'; }
}

/** "Devon Carter" → "Devon C." for customer-facing screens. */
export function maskName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
