// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — UTILITIES
//  ids · time & elapsed formatting · phone formatting · priority engine ·
//  alerts · csv/download · misc helpers
// ═══════════════════════════════════════════════════════════════════════════
import { ASG_STATUS_BY_ID, isTerminal, PRIORITY_BY_ID, SERVICE_BY_ID, TECHS, techName } from './constants';

// ─── IDs ───────────────────────────────────────────────────────────────────
export function uid(prefix = 'id') {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

/** Sequential, human-readable tag like ASG-0042 (max existing + 1). */
export function nextTag(records, prefix) {
  let max = 0;
  for (const r of records) {
    const m = /^([A-Z]+)-(\d+)$/.exec(r.tag || '');
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

export const cx = (...parts) => parts.filter(Boolean).join(' ');
export const nowISO = () => new Date().toISOString();
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

// ─── Time ──────────────────────────────────────────────────────────────────
const HOUR = 3600_000;
const DAY = 24 * HOUR;

export function elapsed(fromISO, now = Date.now()) {
  const ms = Math.max(0, now - new Date(fromISO).getTime());
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const mins = Math.floor((ms % HOUR) / 60_000);
  return { ms, days, hours, mins, totalHours: ms / HOUR, totalDays: ms / DAY };
}

/** "3d 04h" · "14h 22m" · "8m" */
export function fmtElapsed(fromISO, now = Date.now()) {
  const e = elapsed(fromISO, now);
  if (e.days >= 1) return `${e.days}d ${String(e.hours).padStart(2, '0')}h`;
  if (e.hours >= 1) return `${e.hours}h ${String(e.mins).padStart(2, '0')}m`;
  return `${Math.max(0, e.mins)}m`;
}

/** Long form: "3 days, 4 hours" */
export function fmtElapsedLong(fromISO, now = Date.now()) {
  const e = elapsed(fromISO, now);
  if (e.days >= 1) return `${e.days} day${e.days === 1 ? '' : 's'}, ${e.hours} hr${e.hours === 1 ? '' : 's'}`;
  if (e.hours >= 1) return `${e.hours} hr${e.hours === 1 ? '' : 's'}, ${e.mins} min`;
  return `${e.mins} min`;
}

export function relTime(iso, now = Date.now()) {
  const diff = now - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? 'ago' : 'from now';
  if (abs < 60_000) return 'just now';
  if (abs < HOUR) return `${Math.floor(abs / 60_000)}m ${suffix}`;
  if (abs < DAY) return `${Math.floor(abs / HOUR)}h ${suffix}`;
  if (abs < 7 * DAY) return `${Math.floor(abs / DAY)}d ${suffix}`;
  return fmtDate(iso);
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
export function fmtDateTime(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
export function fmtDateLong(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
export const isToday = (iso, now = Date.now()) => new Date(iso).toDateString() === new Date(now).toDateString();
export const dayKey = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export function greeting(now = new Date()) {
  const h = new Date(now).getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Phone ─────────────────────────────────────────────────────────────────
export const digits = (s) => (s || '').replace(/\D/g, '');
export function formatPhone(value) {
  let d = digits(value);
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
export const isValidPhone = (value) => digits(value).replace(/^1/, '').length === 10;
export const isValidEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const telHref = (v) => `tel:+1${digits(v).replace(/^1/, '')}`;
export const smsHref = (v, body) => `sms:+1${digits(v).replace(/^1/, '')}${body ? `?&body=${encodeURIComponent(body)}` : ''}`;

// ─── Age / overdue level ───────────────────────────────────────────────────
/**
 * How long a device has been with GTS, bucketed against the configurable
 * threshold (default 3 days):
 *   fresh   < threshold-1 days
 *   aging   between threshold-1 and threshold (heads-up)
 *   overdue ≥ threshold (red)
 *   severe  ≥ threshold + 2 (pulsing red)
 */
export function ageLevel(receivedISO, thresholdDays = 3, now = Date.now()) {
  const e = elapsed(receivedISO, now);
  const d = e.totalDays;
  let level = 'fresh';
  if (d >= thresholdDays + 2) level = 'severe';
  else if (d >= thresholdDays) level = 'overdue';
  else if (d >= Math.max(0.5, thresholdDays - 1)) level = 'aging';
  return { ...e, level, isOverdue: level === 'overdue' || level === 'severe', label: fmtElapsed(receivedISO, now) };
}

// ─── Priority engine ───────────────────────────────────────────────────────
const URGENT_WORDS = /\b(urgent|asap|rush|deadline|wedding|flight|travel(l)?ing|tomorrow|tonight|shoot|gig|client|presentation|exam)\b/i;
const DATA_WORDS = /\b(recover(y)?|deleted|lost (photos|files|data)|corrupt|not detected|unallocated|won'?t (boot|turn on|start)|no power|dead|black screen|bricked|water)\b/i;
const TRANSFER_WORDS = /\b(transfer|migrat(e|ion)|backup|back up|clone)\b/i;

/**
 * Auto-criticality. Returns { id, score, reasons[] }.
 * The score climbs with device age, so an ordinary drop-off escalates on its
 * own as it approaches / passes the overdue threshold.
 */
export function computePriority(asg, opts = {}) {
  const { now = Date.now(), thresholdDays = 3 } = opts;
  const reasons = [];
  let score = 1; // baseline "normal"
  const text = `${asg.issue || ''} ${asg.deviceDesc || ''} ${asg.notes || ''}`;

  if (asg.serviceType === 'computer' || asg.serviceType === 'laptop' || asg.serviceType === 'phone') {
    score += 1;
    reasons.push('Customer is without their main device');
  }
  if (DATA_WORDS.test(text)) { score += 2; reasons.push('Data-recovery / no-power symptoms'); }
  if (URGENT_WORDS.test(text)) { score += 2; reasons.push('Customer mentioned a deadline'); }
  if (TRANSFER_WORDS.test(text)) { score += 0.5; reasons.push('Transfer / backup work'); }

  if (asg.promisedAt) {
    const left = new Date(asg.promisedAt).getTime() - now;
    if (left < 0) { score += 3; reasons.push('Promised date has passed'); }
    else if (left < 24 * HOUR) { score += 2; reasons.push('Promised within 24h'); }
  }

  if (asg.receivedAt && !isTerminal(asg.status)) {
    const age = ageLevel(asg.receivedAt, thresholdDays, now);
    if (age.level === 'severe') { score += 4; reasons.push(`Held ${Math.floor(age.totalDays)} days — well past the ${thresholdDays}-day limit`); }
    else if (age.level === 'overdue') { score += 3; reasons.push(`Over the ${thresholdDays}-day limit`); }
    else if (age.level === 'aging') { score += 1; reasons.push('Approaching the limit'); }
  }
  if (asg.status === 'ready' && asg.readyAt) {
    const waitingPickup = elapsed(asg.readyAt, now).totalDays;
    if (waitingPickup >= 2) { score += 1; reasons.push('Ready but not collected'); }
  }

  let id = 'normal';
  if (score >= 5) id = 'critical';
  else if (score >= 3) id = 'high';
  else if (score < 1) id = 'low';
  return { id, score, reasons };
}

/** Effective priority: manual override wins, otherwise the live auto value. */
export function effectivePriority(asg, opts) {
  if (asg.priorityMode === 'manual' && asg.priority) return { id: asg.priority, score: null, reasons: ['Set manually'], manual: true };
  return { ...computePriority(asg, opts), manual: false };
}
export const priorityRank = (id) => PRIORITY_BY_ID[id]?.rank ?? 1;

// ─── Alerts (Home) ─────────────────────────────────────────────────────────
/**
 * Builds the "needs attention" list. Severity: critical > warning > info.
 * Each alert links back to a record so the UI can open it.
 */
export function buildAlerts(state, now = Date.now()) {
  const th = state.settings?.overdueDays ?? 3;
  const alerts = [];
  const live = (state.assignments || []).filter((a) => !a.deletedAt && !isTerminal(a.status));

  for (const a of live) {
    const age = ageLevel(a.receivedAt, th, now);
    const who = a.customerName || 'Customer';
    const dev = a.deviceDesc || SERVICE_BY_ID[a.serviceType]?.label || 'device';
    if (age.isOverdue) {
      alerts.push({
        id: `overdue:${a.id}`, severity: 'critical', kind: 'overdue', ref: { type: 'assignment', id: a.id },
        title: `${a.tag} · ${who}'s ${dev} — ${age.label} in house`,
        desc: `Over the ${th}-day limit${a.tech ? ` · ${techName(a.tech)}` : ' · unassigned'} · ${ASG_STATUS_BY_ID[a.status]?.label || a.status}`,
        sort: 0 - age.totalDays,
      });
    } else if (age.level === 'aging') {
      alerts.push({
        id: `aging:${a.id}`, severity: 'warning', kind: 'aging', ref: { type: 'assignment', id: a.id },
        title: `${a.tag} · ${who}'s ${dev} hits ${th} days ${relTimeUntil(new Date(a.receivedAt).getTime() + th * DAY, now)}`,
        desc: `${age.label} so far${a.tech ? ` · ${techName(a.tech)}` : ' · unassigned'}`,
        sort: 10 - age.totalDays,
      });
    }
    if (a.status === 'ready' && a.readyAt && elapsed(a.readyAt, now).totalDays >= 1) {
      alerts.push({
        id: `ready:${a.id}`, severity: 'warning', kind: 'ready', ref: { type: 'assignment', id: a.id },
        title: `${a.tag} · ${who} hasn't picked up — ready ${fmtElapsed(a.readyAt, now)} ago`,
        desc: a.phone ? `Call ${a.phone}` : 'No phone on file',
        sort: 20 - elapsed(a.readyAt, now).totalDays,
      });
    }
    if (a.status === 'waiting') {
      const last = lastLogTime(a) || a.updatedAt || a.receivedAt;
      if (elapsed(last, now).totalDays >= 1) {
        alerts.push({
          id: `waiting:${a.id}`, severity: 'warning', kind: 'waiting', ref: { type: 'assignment', id: a.id },
          title: `${a.tag} · waiting ${fmtElapsed(last, now)} with no update`,
          desc: a.waitReason ? `Reason: ${a.waitReason}` : 'No waiting reason recorded',
          sort: 25,
        });
      }
    }
    if (!a.tech) {
      alerts.push({
        id: `unassigned:${a.id}`, severity: 'info', kind: 'unassigned', ref: { type: 'assignment', id: a.id },
        title: `${a.tag} · ${who}'s ${dev} has no tech assigned`,
        desc: 'Pick an owner so it doesn’t slip',
        sort: 40,
      });
    }
  }

  const openTickets = (state.tickets || []).filter((t) => !t.deletedAt && t.status === 'open');
  for (const t of openTickets) {
    const age = elapsed(t.createdAt, now);
    if (age.totalHours >= 24) {
      alerts.push({
        id: `ticket:${t.id}`, severity: 'info', kind: 'ticket', ref: { type: 'ticket', id: t.id },
        title: `${t.tag} · ${t.orderNumber ? `Order ${t.orderNumber}` : t.customerName || 'Blank ticket'} not pushed to Salesforce`,
        desc: `Open for ${fmtElapsed(t.createdAt, now)}${t.tech ? ` · ${techName(t.tech)}` : ''}`,
        sort: 50 - age.totalDays,
      });
    }
  }

  const doneIds = new Set((state.assignments || []).filter((a) => isTerminal(a.status) || a.deletedAt).map((a) => a.id));
  for (const item of state.inventory || []) {
    if (item.deletedAt) continue;
    if (item.status === 'checked_out' && item.assignmentId && doneIds.has(item.assignmentId)) {
      alerts.push({
        id: `inv:${item.id}`, severity: 'info', kind: 'inventory', ref: { type: 'inventory', id: item.id },
        title: `${item.name} is still checked out to a closed job`,
        desc: `Holder: ${techName(item.holder)} — check it back in`,
        sort: 60,
      });
    }
  }

  const sev = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => sev[a.severity] - sev[b.severity] || a.sort - b.sort);
}

function relTimeUntil(ts, now) {
  const diff = ts - now;
  if (diff <= 0) return 'now';
  if (diff < HOUR) return `in ${Math.max(1, Math.round(diff / 60_000))}m`;
  if (diff < DAY) return `in ${Math.round(diff / HOUR)}h`;
  return `in ${Math.round(diff / DAY)}d`;
}
export function lastLogTime(asg) {
  const log = asg.log || [];
  return log.length ? log[log.length - 1].ts : null;
}

// ─── Stats ─────────────────────────────────────────────────────────────────
export function countBy(list, keyFn) {
  const out = {};
  for (const x of list) { const k = keyFn(x); out[k] = (out[k] || 0) + 1; }
  return out;
}

/** Per-day counts for the last N days (oldest → newest). */
export function dailySeries(items, dateField, days = 14, now = Date.now()) {
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    series.push({ key: dayKey(d), label: d.toLocaleDateString([], { weekday: 'short' }), count: 0, date: d });
  }
  const idx = Object.fromEntries(series.map((s, i) => [s.key, i]));
  for (const it of items) {
    const k = dayKey(new Date(it[dateField]));
    if (k in idx) series[idx[k]].count++;
  }
  return series;
}

export function techLoad(state) {
  const live = (state.assignments || []).filter((a) => !a.deletedAt && !isTerminal(a.status));
  const open = (state.tickets || []).filter((t) => !t.deletedAt && t.status === 'open');
  return TECHS.map((t) => ({
    tech: t,
    assignments: live.filter((a) => a.tech === t.id),
    tickets: open.filter((x) => x.tech === t.id),
  }));
}

// ─── Search ────────────────────────────────────────────────────────────────
export function matches(query, ...fields) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every((t) => hay.includes(t));
}

// ─── Export helpers ────────────────────────────────────────────────────────
export function toCSV(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','));
  return [head, ...body].join('\n');
}

export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true;
    } catch { return false; }
  }
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function pluralize(n, one, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }
