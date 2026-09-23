'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — ROOT
//  Owns state (store + persistence + optional team sync), the shell
//  (top bar, tabs, footer, mobile nav), global overlays (intake modal,
//  assignment drawer, command palette, toasts, shortcuts) and keyboard
//  shortcuts. Tabs live in their own files.
// ═══════════════════════════════════════════════════════════════════════════
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { APP_MAJOR, APP_VERSION, ASG_STATUS_BY_ID, MOBILE_TABS, TABS, TECHS, TECH_BY_ID, TECH_COLORS, initialsOf, isTerminal, serviceLabel, syncTeam, techName } from '../lib/constants';
import { goalInfo } from '../lib/stats';
import { connectionsStatus } from '../lib/salesforce';
import { buildDemoData, checkOn, defaultState, exportJSON, loadState, mergeStates, migrate, parseImport, saveState, sharedSignature } from '../lib/store';
import { changePasscode, setupPasscode, syncCycle } from '../lib/sync';
import { openLiveChannel } from '../lib/realtime';
import { play } from '../lib/sounds';
import { intakeTagHTML, printHTML } from '../lib/print';
import { buildAlerts, dayKey, downloadText, greeting, matches, nextTag, nowISO, relTime, uid } from '../lib/utils';
import { UnixScanModal } from './UnixScan';
import { Avatar, Btn, Chip, ConfirmDialog, GTSLogo, GTSMark, Icon, Kbd, Modal, Ring, ZaysLogo } from './ui';
import HomeTab from './HomeTab';
import StatsTab from './StatsTab';
import ManagementTab from './ManagementTab';
import SalesforceTab from './SalesforceTab';
import AssignmentsTab from './AssignmentsTab';
import CatalogTab from './CatalogTab';
import StationTab from './StationTab';
import { AssignmentDrawer, AssignmentForm, TicketForm } from './assignment-views';

// ─── Context ───────────────────────────────────────────────────────────────
const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

const ACTIVITY_CAP = 400;

// ═══════════════════════════════════════════════════════════════════════════
//  STORE HOOK — every mutation goes through here so it can stamp
//  updatedAt, attribute the tech and append to the activity feed.
// ═══════════════════════════════════════════════════════════════════════════
function useGTSStore() {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const stateRef = useRef(state);
  stateRef.current = state;

  // clock for live counters
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // load once on mount (client only)
  useEffect(() => { setState(loadState()); }, []);

  // persist (debounced)
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => saveState(state), 250);
    return () => clearTimeout(t);
  }, [state]);

  // theme
  useEffect(() => {
    if (!state) return;
    document.documentElement.setAttribute('data-theme', state.settings.theme || 'dark');
  }, [state?.settings.theme]);

  const mutate = useCallback((fn) => setState((prev) => (prev ? fn(prev) : prev)), []);

  const act = (prev, action, label, detail, extra = {}) => ({
    ...prev,
    activity: [
      { id: uid('ac'), ts: nowISO(), tech: prev.settings.currentTech, action, label, detail, ...extra },
      ...prev.activity,
    ].slice(0, ACTIVITY_CAP),
  });

  const stamp = (rec, patch) => ({ ...rec, ...patch, updatedAt: nowISO() });

  const api = useMemo(() => ({
    // ── settings ────────────────────────────────────────────────────────
    setSettings: (patch) => mutate((p) => ({ ...p, settings: { ...p.settings, ...patch } })),
    setTech: (id) => mutate((p) => act({ ...p, settings: { ...p.settings, currentTech: id, onboarded: true } }, 'tech.switch', TECH_BY_ID[id]?.name || '—', 'Signed in at the counter', { tech: id })),

    // ── Salesforce tickets ──────────────────────────────────────────────
    addTicket: (data) => {
      // Built from the latest state (ref) so the caller gets the record synchronously.
      const cur = stateRef.current;
      const ts = nowISO();
      const created = {
        id: uid('tk'), kind: 'sf', tag: nextTag(cur.tickets, 'SF'),
        orderNumber: (data.orderNumber || '').trim(), customerName: (data.customerName || '').trim(),
        serviceType: data.serviceType || null, description: (data.description || '').trim(),
        tech: data.tech === undefined ? cur.settings.currentTech : data.tech,
        status: 'open', createdAt: ts, updatedAt: ts,
        logSeconds: Number.isFinite(data.logSeconds) && data.logSeconds > 0 ? Math.round(data.logSeconds * 10) / 10 : null,
        unixLoggedAt: null, unixBy: null,
      };
      mutate((p) => act({ ...p, tickets: [created, ...p.tickets] }, 'ticket.create', created.tag, created.orderNumber ? `Order ${created.orderNumber}` : created.customerName || serviceLabel(created.serviceType)));
      return created;
    },
    updateTicket: (id, patch) => mutate((p) => ({ ...p, tickets: p.tickets.map((t) => (t.id === id ? stamp(t, patch) : t)) })),
    logTicket: (id, extra = {}) => mutate((p) => {
      const t = p.tickets.find((x) => x.id === id); if (!t) return p;
      const next = { ...p, tickets: p.tickets.map((x) => (x.id === id ? stamp(x, { status: 'logged', loggedAt: nowISO(), loggedBy: p.settings.currentTech, ...extra }) : x)) };
      return act(next, 'ticket.logged', t.tag, extra.sfCaseNumber ? `Salesforce Case ${extra.sfCaseNumber}` : 'Pushed to Salesforce');
    }),
    unixTicket: (id, on = true) => mutate((p) => {
      const t = p.tickets.find((x) => x.id === id); if (!t) return p;
      const next = { ...p, tickets: p.tickets.map((x) => (x.id === id ? stamp(x, on ? { unixLoggedAt: nowISO(), unixBy: p.settings.currentTech } : { unixLoggedAt: null, unixBy: null }) : x)) };
      return on ? act(next, 'ticket.unix', t.tag, t.orderNumber ? `Order ${t.orderNumber} entered in UNIX` : 'Entered in UNIX') : next;
    }),
    reopenTicket: (id) => mutate((p) => {
      const t = p.tickets.find((x) => x.id === id); if (!t) return p;
      return act({ ...p, tickets: p.tickets.map((x) => (x.id === id ? stamp(x, { status: 'open', loggedAt: null, loggedBy: null, sfCaseNumber: null, sfCaseId: null, sfUrl: null }) : x)) }, 'ticket.reopen', t.tag, 'Reopened');
    }),
    deleteTicket: (id) => mutate((p) => {
      const t = p.tickets.find((x) => x.id === id); if (!t) return p;
      return act({ ...p, tickets: p.tickets.map((x) => (x.id === id ? stamp(x, { deletedAt: nowISO() }) : x)) }, 'ticket.delete', t.tag, 'Deleted');
    }),
    restoreTicket: (id) => mutate((p) => ({ ...p, tickets: p.tickets.map((x) => (x.id === id ? stamp(x, { deletedAt: null }) : x)) })),

    // ── Assignments ─────────────────────────────────────────────────────
    addAssignment: (data, fromTicketId) => {
      const cur = stateRef.current;
      const ts = nowISO();
      const tech = data.tech === undefined ? cur.settings.currentTech : data.tech;
      const created = {
          id: uid('as'), kind: 'asg', tag: nextTag(cur.assignments, 'ASG'),
          customerName: (data.customerName || '').trim(), phone: data.phone || '', email: (data.email || '').trim(), orderNumber: (data.orderNumber || '').trim(),
          serviceType: data.serviceType || null, deviceDesc: (data.deviceDesc || '').trim(), issue: (data.issue || '').trim(),
          accessories: data.accessories || [], location: data.location || '', accessProvided: !!data.accessProvided,
          promisedAt: data.promisedAt || null,
          tech, status: 'received', priorityMode: data.priorityMode || 'auto', priority: data.priority || 'normal',
          tasks: (data.tasks || []).map((t) => ({ id: uid('tk'), done: false, ...t })),
          log: [{ id: uid('lg'), ts, tech: cur.settings.currentTech, type: 'system', text: fromTicketId ? 'Created from a Salesforce-tab ticket and checked in at the counter.' : 'Checked in at the counter.' }],
          fromTicketId: fromTicketId || null, receivedAt: data.receivedAt || ts, createdAt: ts, updatedAt: ts,
      };
      mutate((p) => {
        const next = { ...p, assignments: [created, ...p.assignments] };
        if (fromTicketId) next.tickets = next.tickets.map((t) => (t.id === fromTicketId ? stamp(t, { status: 'converted', convertedTo: created.id }) : t));
        return act(next, 'assignment.create', created.tag, `${created.customerName} · ${created.deviceDesc || serviceLabel(created.serviceType)}`);
      });
      return created;
    },
    updateAssignment: (id, patch, activity) => mutate((p) => {
      const a = p.assignments.find((x) => x.id === id); if (!a) return p;
      const next = { ...p, assignments: p.assignments.map((x) => (x.id === id ? stamp(x, patch) : x)) };
      return activity ? act(next, 'assignment.update', a.tag, activity) : next;
    }),
    setAsgStatus: (id, status, opts = {}) => mutate((p) => {
      const a = p.assignments.find((x) => x.id === id); if (!a || a.status === status) return p;
      const ts = nowISO();
      const patch = { status };
      if (status === 'ready') patch.readyAt = ts;
      if (status === 'picked_up') { patch.pickedUpAt = ts; patch.completedAt = ts; }
      if (status === 'cancelled') patch.completedAt = ts;
      if (status === 'waiting') patch.waitReason = opts.reason || a.waitReason || '';
      else patch.waitReason = '';
      const label = ASG_STATUS_BY_ID[status]?.label || status;
      const text = `Status → ${label}${opts.reason ? `: ${opts.reason}` : ''}${opts.note ? ` — ${opts.note}` : ''}`;
      const log = [...(a.log || []), { id: uid('lg'), ts, tech: p.settings.currentTech, type: 'status', text }];
      const next = { ...p, assignments: p.assignments.map((x) => (x.id === id ? stamp(x, { ...patch, log }) : x)) };
      return act(next, 'assignment.status', a.tag, label);
    }),
    addLog: (id, entry) => mutate((p) => {
      const a = p.assignments.find((x) => x.id === id); if (!a) return p;
      const e = { id: uid('lg'), ts: nowISO(), tech: p.settings.currentTech, type: entry.type || 'note', text: entry.text };
      const next = { ...p, assignments: p.assignments.map((x) => (x.id === id ? stamp(x, { log: [...(x.log || []), e] }) : x)) };
      return act(next, 'assignment.log', a.tag, entry.type === 'call' ? 'Customer contact logged' : 'Note added');
    }),
    addTask: (id, task) => mutate((p) => ({ ...p, assignments: p.assignments.map((x) => (x.id === id ? stamp(x, { tasks: [...(x.tasks || []), { id: uid('tk'), done: false, ...task }] }) : x)) })),
    toggleTask: (id, taskId) => mutate((p) => ({ ...p, assignments: p.assignments.map((x) => (x.id === id ? stamp(x, { tasks: (x.tasks || []).map((t) => (t.id === taskId ? { ...t, done: !t.done, doneAt: !t.done ? nowISO() : null } : t)) }) : x)) })),
    removeTask: (id, taskId) => mutate((p) => ({ ...p, assignments: p.assignments.map((x) => (x.id === id ? stamp(x, { tasks: (x.tasks || []).filter((t) => t.id !== taskId) }) : x)) })),
    deleteAssignment: (id) => mutate((p) => {
      const a = p.assignments.find((x) => x.id === id); if (!a) return p;
      return act({ ...p, assignments: p.assignments.map((x) => (x.id === id ? stamp(x, { deletedAt: nowISO() }) : x)) }, 'assignment.delete', a.tag, 'Deleted');
    }),
    restoreAssignment: (id) => mutate((p) => ({ ...p, assignments: p.assignments.map((x) => (x.id === id ? stamp(x, { deletedAt: null }) : x)) })),

    // ── Inventory ───────────────────────────────────────────────────────
    addItem: (data) => mutate((p) => {
      const ts = nowISO();
      const item = { id: uid('inv'), kind: data.kind || 'asset', status: 'available', qty: Number(data.qty ?? 1), ...data, createdAt: ts, updatedAt: ts };
      return act({ ...p, inventory: [item, ...p.inventory] }, 'inventory.add', item.name, item.category || '');
    }),
    updateItem: (id, patch) => mutate((p) => ({ ...p, inventory: p.inventory.map((x) => (x.id === id ? stamp(x, patch) : x)) })),
    checkOut: (id, { tech, assignmentId }) => mutate((p) => {
      const it = p.inventory.find((x) => x.id === id); if (!it) return p;
      const asg = p.assignments.find((a) => a.id === assignmentId);
      return act({ ...p, inventory: p.inventory.map((x) => (x.id === id ? stamp(x, { status: 'checked_out', holder: tech || p.settings.currentTech, assignmentId: assignmentId || null, checkedOutAt: nowISO() }) : x)) }, 'inventory.out', it.name, `Checked out${asg ? ` for ${asg.tag}` : ''}`);
    }),
    checkIn: (id, { quarantine, note } = {}) => mutate((p) => {
      const it = p.inventory.find((x) => x.id === id); if (!it) return p;
      return act({ ...p, inventory: p.inventory.map((x) => (x.id === id ? stamp(x, { status: quarantine ? 'quarantined' : 'available', holder: null, assignmentId: null, checkedOutAt: null, notes: note ? `${note}${x.notes ? ` · ${x.notes}` : ''}` : x.notes }) : x)) }, quarantine ? 'inventory.quarantine' : 'inventory.in', it.name, quarantine ? `Quarantined${note ? `: ${note}` : ''}` : 'Returned');
    }),
    adjustQty: (id, delta, reason) => mutate((p) => {
      const it = p.inventory.find((x) => x.id === id); if (!it) return p;
      const qty = Math.max(0, Number(it.qty || 0) + delta);
      return act({ ...p, inventory: p.inventory.map((x) => (x.id === id ? stamp(x, { qty }) : x)) }, 'inventory.adjust', it.name, `${delta > 0 ? '+' : ''}${delta} → ${qty}${reason ? ` (${reason})` : ''}`);
    }),
    deleteItem: (id) => mutate((p) => {
      const it = p.inventory.find((x) => x.id === id); if (!it) return p;
      return act({ ...p, inventory: p.inventory.map((x) => (x.id === id ? stamp(x, { deletedAt: nowISO() }) : x)) }, 'inventory.delete', it.name, 'Removed');
    }),

    // ── Checklist ───────────────────────────────────────────────────────
    toggleCheck: (index) => mutate((p) => {
      const k = dayKey();
      const day = { ...(p.checklist[k] || {}) };
      day[index] = { on: !checkOn(day[index]), at: nowISO(), by: p.settings.currentTech || null };
      return { ...p, checklist: { ...p.checklist, [k]: day } };
    }),

    // ── Team (V3: managed from the Management tab) ─────────────────────
    addTech: ({ name, role = 'tech', color }) => {
      const cur = stateRef.current;
      const clean = String(name || '').trim();
      if (!clean) return null;
      const base = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tech';
      let id = base; let n = 2;
      while ((cur.team || []).some((t) => t.id === id && !t.deletedAt)) id = `${base}-${n++}`;
      const existing = (cur.team || []).find((t) => t.id === id);
      const ts = nowISO();
      const used = new Set((cur.team || []).filter((t) => !t.deletedAt).map((t) => t.color));
      const rec = { id, name: clean, initials: initialsOf(clean), color: color || TECH_COLORS.find((c) => !used.has(c)) || TECH_COLORS[(cur.team || []).length % TECH_COLORS.length], role, order: Math.max(-1, ...(cur.team || []).map((t) => t.order ?? 0)) + 1, createdAt: existing?.createdAt || ts, updatedAt: ts, deletedAt: null };
      mutate((p) => act({ ...p, team: [...(p.team || []).filter((t) => t.id !== id), rec] }, 'team.add', rec.name, role === 'manager' ? 'Added as manager' : 'Added to the team'));
      return rec;
    },
    updateTech: (id, patch) => mutate((p) => ({ ...p, team: (p.team || []).map((t) => (t.id === id ? stamp(t, { ...patch, ...(patch.name ? { initials: patch.initials || initialsOf(patch.name) } : {}) }) : t)) })),
    removeTech: (id) => mutate((p) => {
      const t = (p.team || []).find((x) => x.id === id); if (!t) return p;
      const next = { ...p, team: p.team.map((x) => (x.id === id ? stamp(x, { deletedAt: nowISO() }) : x)), settings: p.settings.currentTech === id ? { ...p.settings, currentTech: null } : p.settings };
      return act(next, 'team.remove', t.name, 'Removed from the team');
    }),
    restoreTech: (id) => mutate((p) => ({ ...p, team: (p.team || []).map((x) => (x.id === id ? stamp(x, { deletedAt: null }) : x)) })),

    // ── Broadcasts (manager alerts on every screen) ────────────────────
    postBroadcast: ({ text, tone = 'info', expiresAt = null }) => {
      const cur = stateRef.current; const ts = nowISO();
      const rec = { id: uid('bc'), text: String(text || '').trim(), tone, by: cur.settings.currentTech || null, createdAt: ts, updatedAt: ts, expiresAt: expiresAt || null, deletedAt: null };
      if (!rec.text) return null;
      mutate((p) => act({ ...p, broadcasts: [rec, ...(p.broadcasts || [])] }, 'broadcast.post', tone === 'critical' ? 'Urgent alert' : 'Team alert', rec.text.slice(0, 80)));
      return rec;
    },
    removeBroadcast: (id) => mutate((p) => {
      const b = (p.broadcasts || []).find((x) => x.id === id); if (!b) return p;
      return act({ ...p, broadcasts: p.broadcasts.map((x) => (x.id === id ? stamp(x, { deletedAt: nowISO() }) : x)) }, 'broadcast.remove', 'Team alert', 'Cleared');
    }),
    dismissBroadcast: (id) => mutate((p) => ({ ...p, settings: { ...p.settings, dismissedBroadcasts: [...new Set([...(p.settings.dismissedBroadcasts || []), id])].slice(-50) } })),

    // ── Management doc (goal, PIN, connection prefs) ───────────────────
    setManagement: (patch, note) => mutate((p) => {
      const next = { ...p, management: { ...p.management, ...patch, updatedAt: nowISO() } };
      return note ? act(next, note.action || 'management.update', note.label || 'Management', note.detail || '') : next;
    }),

    // ── Data management ─────────────────────────────────────────────────
    loadDemo: () => mutate((p) => {
      const d = buildDemoData();
      return act({ ...p, tickets: [...d.tickets, ...p.tickets], assignments: [...d.assignments, ...p.assignments], inventory: [...d.inventory, ...p.inventory], broadcasts: [...(d.broadcasts || []), ...(p.broadcasts || [])], activity: [...d.activity, ...p.activity].slice(0, ACTIVITY_CAP), settings: { ...p.settings, demoLoaded: true } }, 'data.demo', 'Demo data', 'Synthetic records loaded');
    }),
    // Demo / reset use tombstones (not hard deletes) so the removal also
    // reaches the other devices when team sync is on.
    clearDemo: () => mutate((p) => {
      const ts = nowISO();
      const gone = (x) => (x.demo && !x.deletedAt ? { ...x, deletedAt: ts, updatedAt: ts } : x);
      return { ...p, tickets: p.tickets.map(gone), assignments: p.assignments.map(gone), inventory: p.inventory.map(gone), broadcasts: (p.broadcasts || []).map(gone), activity: p.activity.filter((x) => !x.demo), settings: { ...p.settings, demoLoaded: false } };
    }),
    clearAll: () => mutate((p) => {
      const ts = nowISO();
      const gone = (x) => (x.deletedAt ? x : { ...x, deletedAt: ts, updatedAt: ts });
      const next = { ...p, tickets: p.tickets.map(gone), assignments: p.assignments.map(gone), inventory: p.inventory.map(gone), broadcasts: (p.broadcasts || []).map(gone), activity: [], checklist: {}, settings: { ...p.settings, demoLoaded: false } };
      return act(next, 'data.reset', 'Board reset', 'All records deleted');
    }),
    importState: (text) => {
      const incoming = parseImport(text);
      mutate((p) => ({ ...incoming, settings: { ...p.settings, demoLoaded: incoming.settings?.demoLoaded ?? p.settings.demoLoaded }, meta: p.meta }));
    },
    // Team sync hands us the merged shared slice; merge again into the *current*
    // state so edits made while the cycle was in flight are never lost.
    replaceShared: (shared) => mutate((p) => migrate(mergeStates(p, shared))),
    exportJSON: () => state && exportJSON(state),
  }), [mutate, state]);

  return { state, api, now };
}

// ═══════════════════════════════════════════════════════════════════════════
//  TEAM SYNC LOOP (optional)
// ═══════════════════════════════════════════════════════════════════════════
//  status: probing → unconfigured (no database) | setup (database, no passcode yet)
//          | locked (this device has no / a wrong passcode) | idle (connected)
//          | error | off (turned off on this device)
//  live:   true while the Realtime channel is subscribed (edits arrive in ~1 s;
//          otherwise a 30 s poll + focus/visibility pulls keep things fresh).
const PUSH_DEBOUNCE_MS = 700;
const POLL_LIVE_MS = 120_000;
const POLL_FALLBACK_MS = 30_000;

/** Each open tab gets its own id (device id + tab session) so two tabs on one PC still hear each other's pings. */
function tabSessionId() {
  try {
    let id = sessionStorage.getItem('gts-tab');
    if (!id) { id = Math.random().toString(36).slice(2, 8); sessionStorage.setItem('gts-tab', id); }
    return id;
  } catch { return 'tab'; }
}

const SYNC_INITIAL = { status: 'probing', busy: false, live: false, online: [], lastAt: null, error: null, needsTable: false, sql: null, rev: 0, realtime: null, lastPing: null };

function useTeamSync(state, api, toast) {
  const [sync, setSync] = useState(SYNC_INITIAL);
  const ref = useRef({ rev: 0, lastSig: null, busy: false, pending: null, mode: 'unknown', realtime: null, channel: null, pingTimer: null });
  const stateRef = useRef(state);
  stateRef.current = state;
  const apiRef = useRef(api);
  apiRef.current = api;

  const patch = useCallback((p) => setSync((x) => ({ ...x, ...(typeof p === 'function' ? p(x) : p) })), []);
  const disconnect = useCallback((mode, extra) => {
    ref.current.mode = mode;
    ref.current.realtime = null;
    patch({ realtime: null, live: false, online: [], ...extra });
  }, [patch]);

  const run = useCallback(async (reason, opts = {}) => {
    const s = stateRef.current;
    if (!s) return;
    if (s.settings.syncEnabled === false && reason !== 'connect') { disconnect('off', { status: 'off' }); return; }
    if (ref.current.busy) { ref.current.pending = reason; return; }
    const passcode = opts.passcode ?? s.settings.syncPasscode ?? '';
    ref.current.busy = true;
    patch({ busy: true });
    try {
      const dirty = ref.current.lastSig === null || sharedSignature(s) !== ref.current.lastSig;
      const res = await syncCycle(s, ref.current.rev, passcode, { dirty, meta: { by: s.settings.currentTech || null, device: ref.current.clientId || s.meta?.deviceId || null } });
      if (!res.enabled) { disconnect('local', { status: 'unconfigured', error: null }); return; }
      if (res.needsSetup) { disconnect('setup', { status: 'setup', error: null }); return; }
      if (res.locked) { disconnect('locked', { status: 'locked', error: passcode ? res.error : null }); return; }
      if (res.error) {
        if (ref.current.mode !== 'connected') ref.current.mode = 'error';
        patch({ status: 'error', error: res.error, needsTable: !!res.needsTable, sql: res.sql || null });
        return;
      }
      ref.current.mode = 'connected';
      ref.current.rev = res.rev;
      if (res.changed) apiRef.current.replaceShared(res.state);
      ref.current.lastSig = sharedSignature(res.state);
      if (res.realtime && (res.realtime.url !== ref.current.realtime?.url || res.realtime.anonKey !== ref.current.realtime?.anonKey)) {
        ref.current.realtime = res.realtime;
        patch({ realtime: res.realtime });
      }
      patch({ status: 'idle', lastAt: Date.now(), error: null, needsTable: false, sql: null, rev: res.rev });
      if (reason === 'manual') toast('Synced with the team', { tone: 'success' });
      if (reason === 'connect') toast('Connected — the board is now shared live', { tone: 'success' });
    } catch (e) {
      patch({ status: 'error', error: String(e?.message || e) });
    } finally {
      ref.current.busy = false;
      patch({ busy: false });
      const again = ref.current.pending;
      ref.current.pending = null;
      if (again) setTimeout(() => run(again), 60);
    }
  }, [toast, patch, disconnect]);

  // probe on mount
  useEffect(() => { if (state) run('probe'); }, [!!state]); // eslint-disable-line react-hooks/exhaustive-deps

  // re-probe when sync is switched back on for this device
  const enabledFlag = state?.settings.syncEnabled !== false;
  useEffect(() => { if (enabledFlag && ref.current.mode === 'off') run('probe'); }, [enabledFlag, run]);

  // push (debounced) when shared data changes
  useEffect(() => {
    if (!state || ref.current.mode !== 'connected') return;
    if (sharedSignature(state) === ref.current.lastSig) return;
    const t = setTimeout(() => run('change'), PUSH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [state, run]);

  // periodic pull (slow when live, faster as a fallback) + on focus / visibility
  useEffect(() => {
    const tick = () => { if (ref.current.mode === 'connected' || ref.current.mode === 'error') run('interval'); };
    const iv = setInterval(tick, sync.live ? POLL_LIVE_MS : POLL_FALLBACK_MS);
    const onFocus = () => { if (ref.current.mode === 'connected') run('focus'); };
    const onVis = () => { if (document.visibilityState === 'visible') onFocus(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVis); };
  }, [run, sync.live]);

  // live channel: open once connected and the server told us where
  const deviceId = state?.meta?.deviceId || null;
  const clientId = useMemo(() => (deviceId ? `${deviceId}:${tabSessionId()}` : null), [deviceId]);
  ref.current.clientId = clientId;
  const rtUrl = sync.realtime?.url; const rtKey = sync.realtime?.anonKey; const rtChannel = sync.realtime?.channel;
  const connected = sync.status === 'idle' || (sync.status === 'error' && ref.current.mode === 'connected');
  useEffect(() => {
    if (!connected || !rtUrl || !rtKey || !clientId) return;
    const presence = () => {
      const s = stateRef.current;
      return { tech: s?.settings.currentTech || null, station: s?.settings.stationName || '', device: deviceId, client: clientId };
    };
    const handle = openLiveChannel({
      url: rtUrl, anonKey: rtKey, channel: rtChannel || 'gts-sync', presenceKey: clientId, presence,
      onPing: (p) => {
        patch({ lastPing: { ...p, receivedAt: Date.now() } });
        if (p.passcodeChanged) { run('ping'); return; }
        if (p.device && p.device === clientId) return;                       // our own write (this tab)
        if (typeof p.rev === 'number' && p.rev <= ref.current.rev) return;   // already seen
        clearTimeout(ref.current.pingTimer);
        ref.current.pingTimer = setTimeout(() => run('ping'), 120);
      },
      onPresence: (list) => patch({ online: list }),
      onStatus: (st) => patch((x) => ({ live: st === 'SUBSCRIBED', online: st === 'SUBSCRIBED' ? x.online : [] })),
    });
    ref.current.channel = handle;
    return () => { clearTimeout(ref.current.pingTimer); handle.close(); ref.current.channel = null; patch({ live: false, online: [] }); };
  }, [connected, rtUrl, rtKey, rtChannel, deviceId, clientId, run, patch]);

  // keep our presence payload fresh when the tech / station changes
  const tech = state?.settings.currentTech || null;
  const station = state?.settings.stationName || '';
  useEffect(() => { ref.current.channel?.track({ tech, station, device: deviceId, client: clientId }); }, [tech, station, deviceId, clientId]);

  const setup = useCallback(async (passcode) => {
    let res;
    try { res = await setupPasscode(passcode); } catch (e) { return { ok: false, error: String(e?.message || e) }; }
    if (res.status === 200 && res.ok) {
      apiRef.current.setSettings({ syncPasscode: passcode, syncEnabled: true });
      ref.current.lastSig = null;
      await run('connect', { passcode });
      return { ok: true };
    }
    return { ok: false, error: res.error || `Setup failed (${res.status})`, exists: !!res.exists };
  }, [run]);

  const connect = useCallback(async (passcode) => {
    apiRef.current.setSettings({ syncPasscode: passcode, syncEnabled: true });
    ref.current.lastSig = null;
    await run('connect', { passcode });
  }, [run]);

  const change = useCallback(async (current, next) => {
    let res;
    try { res = await changePasscode(current, next); } catch (e) { return { ok: false, error: String(e?.message || e) }; }
    if (res.status === 200 && res.ok) { apiRef.current.setSettings({ syncPasscode: next }); return { ok: true }; }
    return { ok: false, error: res.error || (res.status === 401 ? 'Current passcode is wrong' : `Failed (${res.status})`) };
  }, []);

  const forget = useCallback(() => {
    apiRef.current.setSettings({ syncPasscode: '' });
    disconnect('locked', { status: 'locked', error: null });
  }, [disconnect]);

  return { ...sync, deviceId, run: () => run('manual'), setup, connect, change, forget };
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONNECTIONS (Salesforce connector status — fetched once, refreshable)
// ═══════════════════════════════════════════════════════════════════════════
function useConnections() {
  const [conn, setConn] = useState({ loaded: false, salesforce: { configured: false }, unix: { mode: 'scan', bridge: false } });
  const refresh = useCallback(async () => {
    const r = await connectionsStatus();
    setConn({ loaded: true, salesforce: { configured: !!r.configured, host: r.host || null, missing: r.missing || [], apiVersion: r.apiVersion, error: r.error || null }, unix: r.unix || { mode: 'scan', bridge: false } });
    return r;
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { ...conn, refresh };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ROOT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function GTSApp() {
  const { state, api, now } = useGTSStore();
  const [booting, setBooting] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [tab, setTab] = useState('home');
  const [homeTab, setHomeTab] = useState('overview');
  const [modal, setModal] = useState(null);       // { type, props }
  const [drawerId, setDrawerId] = useState(null); // assignment id
  const [palette, setPalette] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [highlight, setHighlight] = useState(null); // { type, id }

  // Keep the live tech registry in step with the shared roster (render-phase,
  // idempotent — children must see the new team on this same render).
  const teamRef = useRef(null);
  if (state && state.team !== teamRef.current) { teamRef.current = state.team; syncTeam(state.team); }

  // ── toasts ───────────────────────────────────────────────────────────
  const toast = useCallback((message, { tone = 'info', action, duration = 4200 } = {}) => {
    const id = uid('to');
    setToasts((t) => [...t, { id, message, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
  }, []);
  const dismissToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  const sync = useTeamSync(state, api, toast);
  const connections = useConnections();

  // ── boot splash (once per browser session) ───────────────────────────
  useEffect(() => {
    if (!state) return;
    let skip = false;
    try { skip = sessionStorage.getItem('gts-booted') === '1'; } catch { /* ignore */ }
    const t = setTimeout(() => {
      setLeaving(true);
      setTimeout(() => { setBooting(false); try { sessionStorage.setItem('gts-booted', '1'); } catch { /* ignore */ } }, 420);
    }, skip ? 120 : 1500);
    return () => clearTimeout(t);
  }, [!!state]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── sound helper ─────────────────────────────────────────────────────
  const sfx = useCallback((name) => play(name, state?.settings.sounds), [state?.settings.sounds]);

  // ── navigation helpers ───────────────────────────────────────────────
  const goTo = useCallback((t, sub) => { setTab(t); if (t === 'home' && sub) setHomeTab(sub); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const openAssignment = useCallback((id) => { setDrawerId(id); sfx('open'); }, [sfx]);
  const openTicket = useCallback((id) => { setTab('salesforce'); setHighlight({ type: 'ticket', id }); setTimeout(() => setHighlight(null), 2500); }, []);
  const openInventory = useCallback((id) => { setTab('station'); setHighlight({ type: 'inventory', id }); setTimeout(() => setHighlight(null), 2500); }, []);
  const openRef = useCallback((ref) => {
    if (!ref) return;
    if (ref.type === 'assignment') openAssignment(ref.id);
    else if (ref.type === 'ticket') openTicket(ref.id);
    else if (ref.type === 'inventory') openInventory(ref.id);
  }, [openAssignment, openTicket, openInventory]);

  const newAssignment = useCallback((prefill, fromTicketId) => setModal({ type: 'assignment', props: { prefill, fromTicketId } }), []);
  const newTicket = useCallback((prefill) => setModal({ type: 'ticket', props: { prefill } }), []);
  const confirm = useCallback((props) => setModal({ type: 'confirm', props }), []);
  const closeModal = useCallback(() => setModal(null), []);
  const openUnixScan = useCallback((ticketId) => setModal({ type: 'unix', props: { ticketId } }), []);

  // ── keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); return; }
      const tag = (e.target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;
      if (typing || meta || e.altKey) return;
      if (modal || drawerId || palette) return;
      const k = e.key;
      const byKey = TABS.find((t) => t.key === k);
      if (byKey) { goTo(byKey.id, byKey.id === 'home' ? 'overview' : undefined); return; }
      if (k === 'n' || k === 'N') { e.preventDefault(); newAssignment(); return; }
      if (k === 't' || k === 'T') { e.preventDefault(); newTicket(); return; }
      if (k === '/') { e.preventDefault(); window.dispatchEvent(new CustomEvent('gts:focus-search')); return; }
      if (k === '?') { setModal({ type: 'shortcuts' }); return; }
      if (k === 'h' || k === 'H') { goTo('home', 'overview'); return; }
      if (k === '[') { api.setSettings({ railCollapsed: !state?.settings.railCollapsed }); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, drawerId, palette, goTo, newAssignment, newTicket, api, state?.settings.railCollapsed]);

  // ── derived counts for nav badges ────────────────────────────────────
  const counts = useMemo(() => {
    if (!state) return {};
    const alerts = buildAlerts(state, now);
    return {
      alerts: alerts.filter((a) => a.severity === 'critical').length,
      openTickets: state.tickets.filter((t) => !t.deletedAt && t.status === 'open').length,
      needsUnix: state.tickets.filter((t) => !t.deletedAt && t.orderNumber && !t.unixLoggedAt && t.status !== 'converted').length,
      activeAsg: state.assignments.filter((a) => !a.deletedAt && !isTerminal(a.status)).length,
      outItems: state.inventory.filter((i) => !i.deletedAt && i.status === 'checked_out').length,
      broadcasts: activeBroadcasts(state, now).length,
    };
  }, [state, now]);

  const goal = useMemo(() => (state ? goalInfo(state, now) : null), [state, now]);
  const isManager = !!state && (state.management?.pinHash ? !!state.settings.managerUnlocked : true);

  const ctx = useMemo(() => ({
    state, api, now, toast, sfx, sync, connections, goal, isManager,
    tab, goTo, homeTab, setHomeTab,
    openAssignment, openTicket, openInventory, openRef, newAssignment, newTicket, confirm, highlight, openUnixScan,
    openPalette: () => setPalette(true), openShortcuts: () => setModal({ type: 'shortcuts' }), openAbout: () => setModal({ type: 'about' }),
    openWhatsNew: () => setModal({ type: 'whatsnew' }), openTechPicker: () => setModal({ type: 'tech' }), openMore: () => setModal({ type: 'more' }),
    counts,
  }), [state, api, now, toast, sfx, sync, connections, goal, isManager, tab, goTo, homeTab, openAssignment, openTicket, openInventory, openRef, newAssignment, newTicket, confirm, highlight, openUnixScan, counts]);

  // ── server / pre-hydration render ────────────────────────────────────
  if (!state || booting) return <BootSplash leaving={leaving} />;

  const drawerAsg = drawerId ? state.assignments.find((a) => a.id === drawerId) : null;
  const tech = TECH_BY_ID[state.settings.currentTech];
  const showWhatsNew = state.settings.onboarded && (state.settings.whatsNewSeen || 0) < APP_MAJOR && !modal;

  return (
    <StoreContext.Provider value={ctx}>
      <div className="bg-layer bg-grid" />
      <div className="bg-layer bg-glow" />
      <div className={`app app-v3 ${state.settings.railCollapsed ? 'is-collapsed' : ''}`}>
        <Rail tech={tech} />
        <div className="app-main">
          <Strip tech={tech} />
          <BroadcastBar />
          <main className="main" key={tab}>
            <div className="tabpane">
              {tab === 'home' && <HomeTab />}
              {tab === 'salesforce' && <SalesforceTab />}
              {tab === 'assignments' && <AssignmentsTab />}
              {tab === 'stats' && <StatsTab />}
              {tab === 'catalog' && <CatalogTab />}
              {tab === 'station' && <StationTab />}
              {tab === 'management' && <ManagementTab />}
            </div>
          </main>
          <Footer />
        </div>
      </div>
      <MobileNav />

      {/* ── overlays ─────────────────────────────────────────────────── */}
      {drawerAsg && !drawerAsg.deletedAt && <AssignmentDrawer asg={drawerAsg} onClose={() => { setDrawerId(null); sfx('close'); }} />}

      {modal?.type === 'assignment' && (
        <AssignmentForm
          prefill={modal.props?.prefill}
          onClose={closeModal}
          onSave={(data, andPrint) => {
            const created = api.addAssignment(data, modal.props?.fromTicketId);
            closeModal(); sfx('success');
            toast(`${created.tag} checked in for ${created.customerName}`, { tone: 'success', action: { label: 'Open', onClick: () => openAssignment(created.id) } });
            if (modal.props?.fromTicketId) setTab('assignments');
            if (andPrint) setTimeout(() => printHTML(intakeTagHTML(created, state.settings)), 150);
          }}
        />
      )}
      {modal?.type === 'ticket' && (
        <TicketForm prefill={modal.props?.prefill} onClose={closeModal}
          onSave={(data) => { const t = api.addTicket(data); closeModal(); sfx('success'); toast(`${t.tag} logged${t.logSeconds ? ` in ${t.logSeconds}s` : ''}`, { tone: 'success' }); setTab('salesforce'); }} />
      )}
      {modal?.type === 'confirm' && <ConfirmDialog {...modal.props} onClose={closeModal} />}
      {modal?.type === 'tech' && <TechPickerModal onClose={closeModal} />}
      {modal?.type === 'shortcuts' && <ShortcutsModal onClose={closeModal} />}
      {modal?.type === 'about' && <AboutModal onClose={closeModal} />}
      {modal?.type === 'whatsnew' && <WhatsNewModal onClose={closeModal} />}
      {modal?.type === 'more' && <MoreSheet onClose={closeModal} />}
      {modal?.type === 'unix' && <UnixScanModal ticketId={modal.props?.ticketId} onClose={closeModal} />}
      {!state.settings.onboarded && !modal && !booting && <TechPickerModal onClose={() => api.setSettings({ onboarded: true })} first />}
      {showWhatsNew && <WhatsNewModal onClose={() => api.setSettings({ whatsNewSeen: APP_MAJOR })} first />}

      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </StoreContext.Provider>
  );
}

/** Broadcasts that should be on screen right now (not expired, not cleared, not dismissed here). */
export function activeBroadcasts(state, now = Date.now()) {
  const dismissed = new Set(state.settings?.dismissedBroadcasts || []);
  return (state.broadcasts || [])
    .filter((b) => !b.deletedAt && (!b.expiresAt || new Date(b.expiresAt).getTime() > now) && !(b.tone !== 'critical' && dismissed.has(b.id)))
    .sort((a, b) => (a.tone === 'critical' ? 0 : 1) - (b.tone === 'critical' ? 0 : 1) || new Date(b.createdAt) - new Date(a.createdAt));
}

// ═══════════════════════════════════════════════════════════════════════════
//  SHELL PIECES (V3: sidebar rail + command strip + broadcast bar)
// ═══════════════════════════════════════════════════════════════════════════
function BootSplash({ leaving }) {
  return (
    <div className={`boot ${leaving ? 'is-leaving' : ''}`}>
      <div className="boot-inner">
        <GTSMark size={84} />
        <div style={{ textAlign: 'center' }}>
          <div className="brand-name" style={{ fontSize: 18, letterSpacing: '0.06em' }}>GUEST TECHNICAL SERVICES</div>
          <div className="brand-sub" style={{ marginTop: 6 }}>GTS HUB · <span className="boot-v3">V3</span> · BUILT FOR SPEED</div>
        </div>
        <div className="boot-bar"><i /></div>
        <div className="boot-lines">
          <span>▸ loading the shared board</span>
          <span>▸ counting today’s customers</span>
          <span>▸ arming alerts + live channel</span>
          <span>● systems online</span>
        </div>
      </div>
    </div>
  );
}

function Clock({ compact }) {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const iv = setInterval(() => setT(new Date()), 1000); return () => clearInterval(iv); }, []);
  return (
    <div className={`clock ${compact ? 'is-compact' : ''}`}>
      <div className="clock-time">{t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: compact ? undefined : '2-digit' })}</div>
      {!compact && <div className="clock-date">{t.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>}
    </div>
  );
}

function Rail({ tech }) {
  const { state, api, tab, goTo, counts, sync, isManager, openTechPicker, openAbout } = useStore();
  const collapsed = !!state.settings.railCollapsed;
  const badge = (id) => (id === 'home' && counts.alerts) || (id === 'salesforce' && counts.openTickets) || (id === 'assignments' && counts.activeAsg) || (id === 'station' && counts.outItems) || (id === 'management' && counts.broadcasts) || 0;
  return (
    <aside className="rail" aria-label="Navigation">
      <button className="rail-brand" onClick={() => goTo('home', 'overview')} title="GTS Hub V3 — Home">
        <GTSMark size={40} />
        <span className="rail-brand-text">
          <span className="brand-name">GTS HUB</span>
          <span className="brand-sub">V3 · B&amp;H GUEST TECH</span>
        </span>
      </button>
      <nav className="rail-nav">
        {TABS.map((t) => {
          const n = badge(t.id);
          const locked = t.manager && !isManager;
          return (
            <button key={t.id} className={`rail-item ${tab === t.id ? 'is-active' : ''} ${t.manager ? 'is-manager' : ''}`} onClick={() => goTo(t.id, t.id === 'home' ? 'overview' : undefined)} title={collapsed ? `${t.label} · ${t.key}` : t.hint}>
              <span className="rail-icon"><Icon name={t.icon} size={18} /></span>
              <span className="rail-label">{t.label}</span>
              {n > 0 && <span className={`badge ${t.id === 'home' ? '' : t.id === 'management' ? 'is-accent' : 'is-neutral'}`}>{n}</span>}
              {locked && n === 0 && <Icon name="lock" size={12} className="rail-lock" />}
              <span className="rail-key">{t.key}</span>
            </button>
          );
        })}
      </nav>
      <div className="rail-foot">
        <SyncDot sync={sync} onClick={() => goTo('home', 'settings')} rail />
        <button className={`railtech ${tech ? '' : 'is-empty'}`} onClick={openTechPicker} title="Switch tech">
          <Avatar tech={tech} />
          <span className="railtech-text">
            <span className="techchip-name">{tech ? tech.name : 'Pick tech'}</span>
            <span className="techchip-role">{tech ? (tech.role === 'manager' ? 'Manager' : 'Technician') : 'Not signed in'}</span>
          </span>
          <Icon name="chevron-right" size={14} style={{ color: 'var(--text-3)' }} />
        </button>
        <div className="rail-tools">
          <button className="rail-mini" onClick={() => api.setSettings({ railCollapsed: !collapsed })} title={collapsed ? 'Expand sidebar  [' : 'Collapse sidebar  ['}><Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={14} /></button>
          <button className="rail-mini rail-version" onClick={openAbout} title="About GTS Hub">v{APP_VERSION}</button>
        </div>
      </div>
    </aside>
  );
}

function GoalRing({ size = 44, compact }) {
  const { goal, goTo } = useStore();
  if (!goal) return null;
  const hidden = goal.emphasis === 'off';
  if (hidden) return null;
  const tone = goal.pct >= 1 ? 'var(--green)' : goal.onPace ? 'var(--accent)' : 'var(--amber)';
  return (
    <button className={`goalpill ${goal.emphasis === 'bold' ? 'is-bold' : ''}`} onClick={() => goTo('stats')} title={`${goal.today} of ${goal.perDay} ${goal.label} today · ${goal.pct >= 1 ? 'goal reached' : goal.onPace ? 'on pace' : `expected ~${goal.expected} by now`}`}>
      <Ring value={goal.pct} size={size} stroke={5} color={tone} label={goal.pct >= 1 ? '✓' : goal.today} />
      {!compact && (
        <span className="goalpill-text">
          <span className="goalpill-main"><b>{goal.today}</b> / {goal.perDay}</span>
          <span className="goalpill-sub">{goal.pct >= 1 ? 'DAILY GOAL HIT' : goal.onPace ? 'ON PACE · TODAY' : `${goal.remaining} TO GO`}</span>
        </span>
      )}
    </button>
  );
}

function Strip({ tech }) {
  const { tab, goTo, openPalette, newTicket, counts, sync, openTechPicker, openMore } = useStore();
  const t = TABS.find((x) => x.id === tab) || TABS[0];
  const others = onlineOthers(sync);
  return (
    <header className="strip">
      <div className="strip-inner">
        <button className="strip-brand hidden-desktop" onClick={() => goTo('home', 'overview')}><GTSMark size={32} /></button>
        <div className="strip-title hidden-mobile">
          <div className="eyebrow">{t.hint}</div>
          <div className="strip-h">{t.label}</div>
        </div>
        <div className="strip-center">
          <GoalRing />
          {others.length > 0 && (
            <span className="strip-presence hidden-mobile" title={`${others.map((o) => techName(o.tech)).join(', ')} online`}>
              {others.slice(0, 4).map((o, i) => <Avatar key={o.tech || i} tech={o.tech} size="sm" />)}
              <span className="faint mono" style={{ fontSize: 10.5, letterSpacing: '0.08em' }}>{others.length} ONLINE</span>
            </span>
          )}
        </div>
        <div className="strip-right">
          <Clock />
          <button className="searchbtn hidden-mobile" onClick={openPalette} title="Command palette (⌘K)"><Icon name="search" size={15} /><span>Search</span><Kbd>⌘K</Kbd></button>
          <Btn variant="primary" icon="zap" onClick={() => newTicket()} className="strip-cta" title="Quick log (T)"><span className="hidden-mobile">Quick log</span></Btn>
          {counts.broadcasts > 0 && <button className="strip-bell hidden-mobile" onClick={() => goTo('management')} title={`${counts.broadcasts} team alert${counts.broadcasts > 1 ? 's' : ''} posted`}><Icon name="bell" size={16} /><span className="badge">{counts.broadcasts}</span></button>}
          <button className="strip-avatar hidden-desktop" onClick={openTechPicker} title="Switch tech"><Avatar tech={tech} /></button>
          <button className="strip-more hidden-desktop" onClick={openMore} title="More"><Icon name="dots" size={18} /></button>
        </div>
      </div>
    </header>
  );
}

const TONE_ICON = { info: 'bell', warning: 'alert-triangle', critical: 'alert-circle' };
function BroadcastBar() {
  const { state, api, now, isManager, confirm } = useStore();
  const list = activeBroadcasts(state, now);
  if (!list.length) return null;
  return (
    <div className="bcasts">
      {list.slice(0, 3).map((b, i) => (
        <div key={b.id} className={`bcast is-${b.tone} fade-up`} style={{ '--i': i }} role="status">
          <span className="bcast-icon"><Icon name={TONE_ICON[b.tone] || 'bell'} /></span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="bcast-text">{b.text}</div>
            <div className="bcast-meta">{b.tone === 'critical' ? 'URGENT · ' : ''}{techName(b.by) === 'Unassigned' ? 'Management' : techName(b.by)} · {relTimeSafe(b.createdAt, now)}{b.expiresAt ? ` · until ${new Date(b.expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}</div>
          </div>
          <div className="row" style={{ gap: 4 }}>
            {isManager && <Btn size="xs" variant="ghost" icon="trash" title="Clear for everyone" onClick={() => confirm({ title: 'Clear this alert for everyone?', message: b.text, confirmLabel: 'Clear', onConfirm: () => api.removeBroadcast(b.id) })} />}
            {b.tone !== 'critical' && <Btn size="xs" variant="ghost" icon="x" title="Hide on this device" onClick={() => api.dismissBroadcast(b.id)} />}
          </div>
        </div>
      ))}
      {list.length > 3 && <div className="faint" style={{ fontSize: 11.5, padding: '0 4px' }}>+{list.length - 3} more in Management</div>}
    </div>
  );
}
function relTimeSafe(iso, now) { try { return relTime(iso, now); } catch { return ''; } }

/** Other devices currently on the channel, one entry per tech (unknown techs collapse into one). */
export function onlineOthers(sync) {
  const seen = new Map();
  for (const p of sync.online || []) {
    if (p.device === sync.deviceId || (sync.deviceId && String(p.key || '').startsWith(sync.deviceId))) continue; // any tab of this device
    const id = p.tech || '?';
    if (!seen.has(id)) seen.set(id, { tech: p.tech || null, station: p.station || '', count: 0 });
    seen.get(id).count += 1;
  }
  return [...seen.values()];
}

function SyncDot({ sync, onClick, rail }) {
  const others = onlineOthers(sync);
  const map = {
    idle: sync.live ? ['live', `Live — ${others.length ? `${others.map((o) => techName(o.tech) || 'Someone').join(', ')} online` : 'nobody else online right now'}`] : ['accent', 'Connected — polling (live channel reconnecting…)'],
    error: ['bad', `Sync error: ${sync.error || ''}`],
    setup: ['warn', 'Team database ready — create the team passcode in Settings'],
    locked: ['warn', 'Enter the team passcode in Settings to join the shared board'],
    unconfigured: [null, 'Local mode — no team database attached (see Settings)'],
    off: [null, 'Team sync turned off on this device'],
    probing: ['accent', 'Checking team sync…'],
  };
  const [tone, title] = map[sync.status] || [null, ''];
  const label = sync.status === 'idle' ? (sync.live ? 'LIVE' : 'SYNC') : sync.status === 'error' ? 'SYNC!' : sync.status === 'setup' ? 'SETUP' : sync.status === 'locked' ? 'LOCKED' : sync.status === 'probing' ? '…' : sync.status === 'off' ? 'OFF' : 'LOCAL';
  return (
    <button type="button" className={`syncdot ${rail ? 'is-rail' : 'hidden-mobile'} ${sync.busy ? 'is-busy' : ''}`} title={title} onClick={onClick}>
      <span className={`dot ${tone ? `is-${tone}` : ''}`} />
      <span className="syncdot-label">{label}</span>
      {sync.status === 'idle' && others.length > 0 && (
        <span className="presence" aria-label={`${others.length} online`}>
          {others.slice(0, 3).map((o, i) => <Avatar key={o.tech || i} tech={o.tech} size="sm" title={`${techName(o.tech) || 'Unknown tech'} · ${o.station || 'online'}`} />)}
          {others.length > 3 && <span className="presence-more">+{others.length - 3}</span>}
        </span>
      )}
    </button>
  );
}

function MobileNav() {
  const { tab, goTo, counts, openMore } = useStore();
  const badge = (id) => (id === 'home' && counts.alerts) || (id === 'salesforce' && counts.openTickets) || (id === 'assignments' && counts.activeAsg) || 0;
  const items = TABS.filter((t) => MOBILE_TABS.includes(t.id));
  const moreActive = !MOBILE_TABS.includes(tab);
  return (
    <nav className="mobilenav" aria-label="Main (mobile)">
      <div className="mobilenav-inner">
        {items.map((t) => {
          const n = badge(t.id);
          return (
            <button key={t.id} className={`mtab ${tab === t.id ? 'is-active' : ''}`} onClick={() => goTo(t.id, t.id === 'home' ? 'overview' : undefined)}>
              <Icon name={t.icon} size={20} />{t.id === 'salesforce' ? 'Log' : t.label}
              {n > 0 && <span className={`badge ${t.id === 'home' ? '' : 'is-neutral'}`}>{n}</span>}
            </button>
          );
        })}
        <button className={`mtab ${moreActive ? 'is-active' : ''}`} onClick={openMore}><Icon name="grid" size={20} />More</button>
      </div>
    </nav>
  );
}

function Footer() {
  const { state, openAbout, openShortcuts, openWhatsNew } = useStore();
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <GTSMark size={22} animated={false} />
          <span>Guest Technical Services · {state.settings.storeLabel || 'B&H Photo Video'} · <button className="mono" style={{ color: 'var(--text-3)' }} onClick={openAbout}>GTS Hub v{APP_VERSION}</button> · <button className="mono" style={{ color: 'var(--accent)' }} onClick={openWhatsNew}>what’s new</button></span>
        </div>
        <div className="row" style={{ gap: 18 }}>
          <button className="mono hidden-mobile" style={{ color: 'var(--text-3)', fontSize: 11, letterSpacing: '0.08em' }} onClick={openShortcuts}>KEYBOARD <Kbd>?</Kbd></button>
          <a className="footer-zays" href="https://zays.us" target="_blank" rel="noreferrer" title="Built by ZAYS">
            <span>Powered by</span>
            <ZaysLogo height={20} />
          </a>
        </div>
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  GLOBAL MODALS
// ═══════════════════════════════════════════════════════════════════════════
function TechPickerModal({ onClose, first }) {
  const { state, api, sfx, toast, goTo } = useStore();
  const pick = (id) => {
    api.setTech(id); sfx('success'); onClose();
    toast(`${greeting()}, ${TECH_BY_ID[id].name} — new tickets will be assigned to you`, { tone: 'success' });
  };
  return (
    <Modal title={first ? 'Who’s on the counter?' : 'Switch tech'} sub="Your name auto-fills on every ticket and assignment you create on this device." onClose={onClose} size="sm" icon="users"
      footer={<><span className="faint" style={{ fontSize: 12 }}>You can change this any time from the top-right chip.</span>{first && <Btn variant="ghost" size="sm" onClick={onClose}>Skip</Btn>}</>}>
      <div className="stack" style={{ gap: 8 }}>
        {TECHS.map((t, i) => (
          <button key={t.id} className={`techcard fade-up ${state.settings.currentTech === t.id ? 'is-active' : ''}`} style={{ '--c': t.color, '--i': i }} onClick={() => pick(t.id)}>
            <Avatar tech={t} size="lg" />
            <span className="grow">
              <div className="techcard-name">{t.name}</div>
              <div className="techcard-sub">{t.role === 'manager' ? 'GTS MANAGER' : 'GTS TECHNICIAN'}</div>
            </span>
            {state.settings.currentTech === t.id ? <Chip tone="accent" icon="check">Active</Chip> : <Icon name="chevron-right" style={{ color: 'var(--text-3)' }} />}
          </button>
        ))}
        <button className="techcard is-add" onClick={() => { onClose(); goTo('management'); }}>
          <span className="avatar is-empty avatar-lg">+</span>
          <span className="grow"><div className="techcard-name">Add or remove techs</div><div className="techcard-sub">MANAGEMENT → TEAM</div></span>
          <Icon name="chevron-right" style={{ color: 'var(--text-3)' }} />
        </button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  WHAT'S NEW (V3) + MOBILE "MORE" SHEET
// ═══════════════════════════════════════════════════════════════════════════
const V3_HIGHLIGHTS = [
  ['zap', 'Quick Log with a stopwatch', 'Every ticket shows how fast it was logged. Average is single-digit seconds — the number directors care about.'],
  ['activity', 'Stats — every number on one page', 'Order # vs no order #, per-tech, per-type, busiest hours, hold times, goal history. All hoverable.'],
  ['shield', 'Management tab', 'Add or remove techs, post alerts that appear on every screen, set the daily goal, connect Salesforce and UNIX.'],
  ['hash', 'UNIX scan bridge', 'Push to UNIX shows the order number as a barcode. Scan it at the WYSE terminal — no retyping, no firewall problem.'],
  ['cloud', 'Salesforce connector', 'When the Connected App is set up, Push to Salesforce creates the real Case and stores its number here.'],
  ['grid', 'New command-center layout', 'Sidebar rail, live goal ring, presence, team alerts. Same colors, same neon — more room to work.'],
];
function WhatsNewModal({ onClose, first }) {
  return (
    <Modal title="GTS Hub V3" sub="Built for speed. Built to be shown to the directors." onClose={onClose} icon="sparkles" size="lg"
      footer={<><span className="faint" style={{ fontSize: 12 }}>Keyboard: 1–7 switch tabs · T quick log · N check-in · [ sidebar</span><Btn variant="primary" icon="arrow-right" onClick={onClose} autoFocus>{first ? 'Let’s go' : 'Close'}</Btn></>}>
      <div className="whatsnew">
        {V3_HIGHLIGHTS.map(([icon, title, desc], i) => (
          <div key={title} className="wn-item fade-up" style={{ '--i': i }}>
            <span className="wn-icon"><Icon name={icon} /></span>
            <div><div className="wn-title">{title}</div><div className="wn-desc">{desc}</div></div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function MoreSheet({ onClose }) {
  const { goTo, openShortcuts, openAbout, openWhatsNew, isManager, counts } = useStore();
  const items = [
    ...TABS.filter((t) => !MOBILE_TABS.includes(t.id)).map((t) => ({ icon: t.icon, label: t.label, hint: t.hint, run: () => goTo(t.id), badge: t.id === 'management' ? counts.broadcasts : 0, lock: t.manager && !isManager })),
    { icon: 'settings', label: 'Settings', hint: 'Tech, sync, theme, backups', run: () => goTo('home', 'settings') },
    { icon: 'activity', label: 'Activity', hint: 'Who did what', run: () => goTo('home', 'activity') },
    { icon: 'sparkles', label: 'What’s new in V3', hint: 'Release notes', run: openWhatsNew },
    { icon: 'keyboard', label: 'Keyboard shortcuts', hint: '', run: openShortcuts },
    { icon: 'info', label: 'About', hint: `GTS Hub v${APP_VERSION}`, run: openAbout },
  ];
  return (
    <Modal title="More" onClose={onClose} size="sm" icon="grid">
      <div className="stack" style={{ gap: 6 }}>
        {items.map((it) => (
          <button key={it.label} className="more-item" onClick={() => { onClose(); it.run(); }}>
            <span className="kpi-icon" style={{ '--c': 'var(--accent)' }}><Icon name={it.icon} /></span>
            <span className="grow" style={{ textAlign: 'left' }}><div style={{ fontWeight: 600 }}>{it.label}</div>{it.hint && <div className="faint" style={{ fontSize: 12 }}>{it.hint}</div>}</span>
            {it.badge > 0 && <span className="badge is-accent">{it.badge}</span>}
            {it.lock && <Icon name="lock" size={14} style={{ color: 'var(--text-3)' }} />}
            <Icon name="chevron-right" size={14} style={{ color: 'var(--text-3)' }} />
          </button>
        ))}
      </div>
    </Modal>
  );
}

function ShortcutsModal({ onClose }) {
  const rows = [
    ['⌘ K', 'Command palette — search tickets, assignments, inventory, actions'],
    ['N', 'New overnight assignment (intake)'],
    ['T', 'Quick log a ticket'],
    ['/', 'Focus the search box on the current tab'],
    ['1 – 7', 'Home · Quick Log · Assignments · Stats · Catalog · Station · Management'],
    ['[', 'Collapse / expand the sidebar'],
    ['H', 'Home'],
    ['Esc', 'Close any panel'],
    ['?', 'This list'],
  ];
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} size="sm" icon="keyboard">
      <div className="stack" style={{ gap: 6 }}>
        {rows.map(([k, d]) => (
          <div key={k} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span className="muted" style={{ fontSize: 13 }}>{d}</span>
            <Kbd>{k}</Kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function AboutModal({ onClose }) {
  const { state, sync } = useStore();
  const n = { t: state.tickets.filter((x) => !x.deletedAt).length, a: state.assignments.filter((x) => !x.deletedAt).length, i: state.inventory.filter((x) => !x.deletedAt).length };
  const storage = sync.status === 'idle' ? `Shared team board (${sync.live ? 'live' : 'polling'}, rev ${sync.rev}) · cached in this browser` : 'This browser';
  return (
    <Modal title="GTS Hub V3" sub={`Version ${APP_VERSION} · Guest Technical Services command center`} onClose={onClose} size="sm" icon="sparkles">
      <div className="stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 14 }}><GTSMark size={56} /><p className="muted" style={{ lineHeight: 1.6 }}>Quick Log with a stopwatch, Salesforce + UNIX push, live team board, overnight assignments with hold timers and auto-criticality, stats, management alerts and a daily goal — built for the B&amp;H GTS counter.</p></div>
        <dl className="dl">
          <dt>Records</dt><dd>{n.t} tickets · {n.a} assignments · {n.i} inventory items</dd>
          <dt>Storage</dt><dd>{storage}{state.settings.demoLoaded ? ' · demo data loaded' : ''}. Export a backup from Settings.</dd>
          <dt>Built by</dt><dd><a href="https://zays.us" target="_blank" rel="noreferrer" className="row" style={{ gap: 8, display: 'inline-flex' }}><ZaysLogo height={14} /> ZAYS</a></dd>
        </dl>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  COMMAND PALETTE (⌘K)
// ═══════════════════════════════════════════════════════════════════════════
function CommandPalette({ onClose }) {
  const { state, api, goTo, openAssignment, openTicket, openInventory, newAssignment, newTicket, toast, sfx, openWhatsNew } = useStore();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const items = useMemo(() => {
    const out = [];
    const cmd = (label, icon, run, hint) => out.push({ group: 'Actions', label, icon, run, hint });
    if (matches(q, 'new assignment intake overnight drop off check in')) cmd('New overnight assignment', 'plus', () => newAssignment(), 'N');
    if (matches(q, 'new ticket salesforce log appointment quick')) cmd('Quick log a ticket', 'zap', () => newTicket(), 'T');
    for (const t of TABS) if (matches(q, `go ${t.label} tab`)) cmd(`Go to ${t.label}`, t.icon, () => goTo(t.id));
    if (matches(q, 'settings tech switch')) cmd('Open Settings', 'settings', () => goTo('home', 'settings'));
    if (matches(q, 'stats numbers report goal')) cmd('Open Stats', 'activity', () => goTo('stats'));
    if (matches(q, 'management alert broadcast team goal connections')) cmd('Open Management', 'shield', () => goTo('management'));
    if (matches(q, 'whats new v3 release notes')) cmd('What’s new in V3', 'sparkles', () => openWhatsNew());
    if (matches(q, 'theme dark light toggle')) cmd(`Switch to ${state.settings.theme === 'dark' ? 'light' : 'dark'} theme`, state.settings.theme === 'dark' ? 'sun' : 'moon', () => api.setSettings({ theme: state.settings.theme === 'dark' ? 'light' : 'dark' }));
    for (const t of TECHS) if (matches(q, `sign in as ${t.name} tech switch`)) cmd(`Sign in as ${t.name}`, 'user', () => { api.setTech(t.id); toast(`Signed in as ${t.name}`, { tone: 'success' }); });
    if (matches(q, 'export backup json download')) cmd('Export backup (JSON)', 'download', () => downloadText(`gts-hub-backup-${dayKey()}.json`, api.exportJSON(), 'application/json'));

    if (q.trim()) {
      for (const a of state.assignments) {
        if (a.deletedAt) continue;
        if (matches(q, a.tag, a.customerName, a.phone, a.orderNumber, a.deviceDesc, a.issue, techName(a.tech), ASG_STATUS_BY_ID[a.status]?.label)) {
          out.push({ group: 'Assignments', label: `${a.tag} · ${a.customerName}`, icon: 'clipboard', hint: ASG_STATUS_BY_ID[a.status]?.label, sub: a.deviceDesc || serviceLabel(a.serviceType), run: () => openAssignment(a.id) });
        }
      }
      for (const t of state.tickets) {
        if (t.deletedAt) continue;
        if (matches(q, t.tag, t.orderNumber, t.customerName, t.description, serviceLabel(t.serviceType), techName(t.tech))) {
          out.push({ group: 'Quick Log tickets', label: `${t.tag} · ${t.orderNumber ? `Order ${t.orderNumber}` : t.customerName || 'Blank ticket'}`, icon: 'zap', hint: `${t.status}${t.unixLoggedAt ? ' · unix' : ''}`, sub: t.description?.slice(0, 80), run: () => openTicket(t.id) });
        }
      }
      for (const i of state.inventory) {
        if (i.deletedAt) continue;
        if (matches(q, i.name, i.serial, i.location, i.category, i.status)) out.push({ group: 'Station inventory', label: i.name, icon: 'box', hint: i.status.replace('_', ' '), sub: i.location, run: () => openInventory(i.id) });
      }
    }
    return out.slice(0, 40);
  }, [q, state, api, goTo, openAssignment, openTicket, openInventory, newAssignment, newTicket, toast, openWhatsNew]);

  useEffect(() => { setIdx(0); }, [q]);

  const run = (it) => { if (!it) return; sfx('click'); onClose(); it.run(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(items[idx]); }
    else if (e.key === 'Escape') { onClose(); }
  };

  let lastGroup = null;
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="palette-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="palette" role="dialog" aria-label="Command palette">
          <div className="palette-input">
            <Icon name="search" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search tickets, customers, order numbers, inventory… or type an action" />
            <Kbd>esc</Kbd>
          </div>
          <div className="palette-list">
            {items.length === 0 && <div className="empty" style={{ border: 0 }}>No matches for “{q}”</div>}
            {items.map((it, i) => {
              const header = it.group !== lastGroup ? <div className="palette-group" key={`g${i}`}>{it.group}</div> : null;
              lastGroup = it.group;
              return (
                <React.Fragment key={`${it.group}-${it.label}-${i}`}>
                  {header}
                  <div className={`palette-item ${i === idx ? 'is-active' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => run(it)}>
                    <Icon name={it.icon} />
                    <span className="grow"><span className="truncate" style={{ display: 'block' }}>{it.label}</span>{it.sub && <small className="truncate">{it.sub}</small>}</span>
                    {it.hint && <span className="faint mono" style={{ fontSize: 11 }}>{it.hint}</span>}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          <div className="palette-foot"><span><Kbd>↑↓</Kbd> navigate</span><span><Kbd>↵</Kbd> open</span><span><Kbd>esc</Kbd> close</span></div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOASTS
// ═══════════════════════════════════════════════════════════════════════════
function ToastHost({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  const icon = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle', info: 'info' };
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast is-${t.tone}`}>
          <span className="toast-icon"><Icon name={icon[t.tone] || 'info'} /></span>
          <span className="grow">{t.message}</span>
          {t.action && <button className="toast-action" onClick={() => { t.action.onClick(); onDismiss(t.id); }}>{t.action.label}</button>}
          <Btn variant="ghost" size="xs" icon="x" onClick={() => onDismiss(t.id)} aria-label="Dismiss" />
        </div>
      ))}
    </div>
  );
}
