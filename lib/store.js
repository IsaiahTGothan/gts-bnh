// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — STORE
//  Persistence (browser storage), migrations, demo data, import/export and
//  the record-level merge used by team sync.
// ═══════════════════════════════════════════════════════════════════════════
import { DEFAULT_SETTINGS, STATE_VERSION, STORAGE_KEY } from './constants';
import { nowISO, uid } from './utils';

// ─── Shape ─────────────────────────────────────────────────────────────────
export function defaultState() {
  return {
    version: STATE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    tickets: [],      // Salesforce-tab tickets / appointments
    assignments: [],  // overnight drop-offs
    inventory: [],    // station equipment + consumables
    activity: [],     // audit feed (capped)
    checklist: {},    // { 'YYYY-MM-DD': { [index]: true } }
    meta: { createdAt: nowISO(), deviceId: uid('dev') },
  };
}

// ─── Persistence ───────────────────────────────────────────────────────────
export function loadState() {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('[gts] could not read saved state, starting fresh', e);
    return defaultState();
  }
}

export function saveState(state) {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('[gts] could not save state', e);
    return false;
  }
}

export function migrate(raw) {
  const base = defaultState();
  const s = { ...base, ...raw };
  s.settings = { ...base.settings, ...(raw.settings || {}) };
  for (const k of ['tickets', 'assignments', 'inventory', 'activity']) if (!Array.isArray(s[k])) s[k] = [];
  if (!s.checklist || typeof s.checklist !== 'object') s.checklist = {};
  s.meta = { ...base.meta, ...(raw.meta || {}) };
  // v0 → v1: nothing structural yet; bump the number.
  s.version = STATE_VERSION;
  return s;
}

// ─── Import / export ───────────────────────────────────────────────────────
export function exportJSON(state) {
  return JSON.stringify({ app: 'gts-hub', exportedAt: nowISO(), state }, null, 2);
}

export function parseImport(text) {
  const data = JSON.parse(text);
  const inner = data?.state && data?.app === 'gts-hub' ? data.state : data;
  if (!inner || typeof inner !== 'object' || !Array.isArray(inner.assignments || [])) throw new Error('Not a GTS Hub export');
  return migrate(inner);
}

// ─── Merge (team sync) ─────────────────────────────────────────────────────
// Records carry `updatedAt` and optional `deletedAt` tombstones. Newest wins
// per record; the union keeps records the other side never saw. Settings
// are per-device and never merged. Activity is unioned by id and capped.
//
// The output is CANONICAL (deterministic order) so that two devices merging
// the same records always produce byte-identical documents — otherwise they
// would push "changes" back and forth forever. Views sort for display anyway.
const ACTIVITY_CAP = 400;
const TOMBSTONE_DAYS = 30;
const CHECKLIST_DAYS = 60;

const t = (iso) => (iso ? new Date(iso).getTime() || 0 : 0);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const recordTime = (r) => t(r.createdAt || r.receivedAt || r.updatedAt);

function mergeCollection(a = [], b = []) {
  const map = new Map();
  for (const r of a || []) if (r && r.id) map.set(r.id, r);
  for (const r of b || []) {
    if (!r || !r.id) continue;
    const cur = map.get(r.id);
    if (!cur) { map.set(r.id, r); continue; }
    const tA = t(cur.updatedAt);
    const tB = t(r.updatedAt);
    if (tB !== tA) { map.set(r.id, tB > tA ? r : cur); continue; }
    // Same stamp: pick deterministically (a tombstone wins, then the longer JSON, then string order).
    if (!!r.deletedAt !== !!cur.deletedAt) { map.set(r.id, r.deletedAt ? r : cur); continue; }
    const sa = JSON.stringify(cur); const sb = JSON.stringify(r);
    map.set(r.id, sb.length > sa.length || (sb.length === sa.length && sb < sa) ? r : cur);
  }
  const cutoff = Date.now() - TOMBSTONE_DAYS * 86_400_000;
  return [...map.values()]
    .filter((r) => !(r.deletedAt && t(r.deletedAt) < cutoff))
    .sort((x, y) => recordTime(y) - recordTime(x) || byId(x, y));
}

// Checklist entries: legacy `true/false` or `{ on, at, by }`. Newest `at` wins;
// between two legacy values "done" wins.
export const checkOn = (v) => (v && typeof v === 'object' ? !!v.on : !!v);
const checkTime = (v) => (v && typeof v === 'object' ? t(v.at) : 0);
function pickCheck(x, y) {
  if (x === undefined) return y;
  if (y === undefined) return x;
  const tx = checkTime(x); const ty = checkTime(y);
  if (tx !== ty) return tx > ty ? x : y;
  if (checkOn(x) !== checkOn(y)) return checkOn(x) ? x : y;
  const sx = JSON.stringify(x); const sy = JSON.stringify(y);
  return sx <= sy ? x : y;
}

function mergeChecklist(a = {}, b = {}) {
  const keep = new Date(Date.now() - CHECKLIST_DAYS * 86_400_000).toISOString().slice(0, 10);
  const days = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((d) => d >= keep).sort();
  const out = {};
  for (const day of days) {
    const da = (a && a[day]) || {}; const db = (b && b[day]) || {};
    const idx = [...new Set([...Object.keys(da), ...Object.keys(db)])].sort((x, y) => Number(x) - Number(y));
    const d = {};
    for (const i of idx) d[i] = pickCheck(da[i], db[i]);
    out[day] = d;
  }
  return out;
}

/** Merge `remote` into `local` (either may be partial/empty). Always returns a canonical shared slice on top of `local`. */
export function mergeStates(local, remote) {
  const r = remote || {};
  const activity = mergeCollection(local.activity, r.activity)
    .sort((x, y) => t(y.ts) - t(x.ts) || byId(x, y))
    .slice(0, ACTIVITY_CAP);
  return {
    ...local,
    tickets: mergeCollection(local.tickets, r.tickets),
    assignments: mergeCollection(local.assignments, r.assignments),
    inventory: mergeCollection(local.inventory, r.inventory),
    activity,
    checklist: mergeChecklist(local.checklist, r.checklist),
  };
}

/** The part of state that is shared between stations. */
export function sharedSlice(state) {
  const { tickets, assignments, inventory, activity, checklist } = state;
  return { version: state.version, tickets, assignments, inventory, activity, checklist };
}

/** Quick structural signature — lets the sync loop skip no-op pushes. */
export function sharedSignature(state) {
  const s = sharedSlice(state);
  let h = 0;
  const str = JSON.stringify(s);
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return `${str.length}:${h}`;
}

// ─── Demo data (clearly synthetic) ─────────────────────────────────────────
const H = 3600_000;
const ago = (hours) => new Date(Date.now() - hours * H).toISOString();

export function buildDemoData() {
  const t = nowISO();
  const mk = (extra) => ({ id: uid('dm'), demo: true, updatedAt: t, ...extra });

  const tickets = [
    mk({ tag: 'SF-0101', kind: 'sf', orderNumber: '1095847721', customerName: 'Devon Carter', serviceType: 'camera', description: 'Sony A7R V firmware — checked update path, 2.00 → 3.01 via card. Customer wanted phone pairing too.', tech: 'isaiah', status: 'open', createdAt: ago(1.2) }),
    mk({ tag: 'SF-0100', kind: 'sf', orderNumber: '', customerName: '', serviceType: 'phone', description: 'Walk-up: iPhone 14 Pro to DJI Mic Mini with Anker adapter — no audio in Camera app. Fixed by switching receiver output mode.', tech: 'keeshon', status: 'open', createdAt: ago(3) }),
    mk({ tag: 'SF-0099', kind: 'sf', orderNumber: '1095832210', customerName: 'Priya Nair', serviceType: 'computer', description: 'Windows 11 Pro setup, updates, Office sign-in.', tech: 'mike', status: 'logged', loggedAt: ago(5), loggedBy: 'mike', createdAt: ago(6) }),
    mk({ tag: 'SF-0098', kind: 'sf', orderNumber: '1095829901', customerName: 'Luis Ortega', serviceType: 'printer', description: 'Canon SELPHY CP1500 — paper/ink cassette mismatch, showed correct KP-108IN set.', tech: 'isaiah', status: 'logged', loggedAt: ago(26), loggedBy: 'isaiah', createdAt: ago(27) }),
    mk({ tag: 'SF-0097', kind: 'sf', orderNumber: '1095811502', customerName: 'Hannah Blum', serviceType: 'laptop', description: 'Surface Laptop 5 clean install — setup could not see SSD or keyboard. Needs driver USB; left overnight.', tech: 'mike', status: 'converted', createdAt: ago(50) }),
    mk({ tag: 'SF-0096', kind: 'sf', orderNumber: '', customerName: 'Walk-up', serviceType: 'lighting', description: 'Godox trigger not firing Yongnuo flash — channel/group mismatch, set both to CH1/GrA.', tech: 'keeshon', status: 'logged', loggedAt: ago(30), loggedBy: 'keeshon', createdAt: ago(31) }),
  ];

  const asg = (extra) => mk({ kind: 'asg', priorityMode: 'auto', tasks: [], accessories: [], log: [], ...extra });
  const assignments = [
    asg({
      tag: 'ASG-0207', customerName: 'Hannah Blum', phone: '(917) 555-0142', email: 'hannah.b@example.com', orderNumber: '1095811502',
      serviceType: 'laptop', deviceDesc: 'Microsoft Surface Laptop 5 (Model 1979)', issue: 'Clean Windows 11 reinstall. Setup could not detect SSD / keyboard — needs Intel RST VMD + Surface input drivers on USB. Preserve nothing, customer has backup.',
      tech: 'mike', status: 'in_progress', receivedAt: ago(4.4 * 24), location: 'Shelf B', accessories: ['Charger / power adapter', 'Bag / case'], accessProvided: true,
      tasks: [
        { id: uid('tk'), catalogId: 'PC-02', title: 'Install or reinstall an operating system', done: false },
        { id: uid('tk'), catalogId: 'PC-03', title: 'Resolve missing installation drivers or devices', done: true, doneAt: ago(20) },
        { id: uid('tk'), title: 'Confirm Windows activation (digital license)', done: false },
      ],
      log: [
        { id: uid('lg'), ts: ago(4.4 * 24), tech: 'mike', type: 'system', text: 'Received from Salesforce ticket SF-0097.' },
        { id: uid('lg'), ts: ago(3.2 * 24), tech: 'mike', type: 'note', text: 'Setup media boots but no SSD / keyboard. Building $WinPEDriver$ USB with Intel RST VMD.' },
        { id: uid('lg'), ts: ago(20), tech: 'mike', type: 'status', text: 'Status → In Progress. Drivers loaded, SSD visible, install running.' },
      ],
    }),
    asg({
      tag: 'ASG-0206', customerName: 'Marcus Webb', phone: '(646) 555-0188', email: '', orderNumber: '',
      serviceType: 'camera', deviceDesc: 'SanDisk Extreme Pro 128GB SD (from Canon R7)', issue: 'Card shows unallocated in Windows. ~600 wedding photos, no backup. Recovery scan with DMDE, export to customer SSD.',
      tech: 'isaiah', status: 'waiting', waitReason: 'Scan running (unattended)', receivedAt: ago(2.6 * 24), location: 'Locker 1', accessories: ['Other'],
      tasks: [
        { id: uid('tk'), catalogId: 'REC-01', title: 'Diagnose a drive or card that is not detected', done: true, doneAt: ago(40) },
        { id: uid('tk'), catalogId: 'REC-04', title: 'Run an authorized recovery scan', done: false },
        { id: uid('tk'), catalogId: 'REC-06', title: 'Export recovered files to a separate destination', done: false },
        { id: uid('tk'), catalogId: 'REC-07', title: 'Check recovered files for actual usability', done: false },
      ],
      log: [
        { id: uid('lg'), ts: ago(2.6 * 24), tech: 'isaiah', type: 'system', text: 'Checked in at counter.' },
        { id: uid('lg'), ts: ago(40), tech: 'isaiah', type: 'note', text: 'Card enumerates on known-good reader; partition table gone. Imaging before scan.' },
        { id: uid('lg'), ts: ago(9), tech: 'isaiah', type: 'status', text: 'Status → Waiting: full DMDE scan running on bench PC, ETA ~6h.' },
      ],
    }),
    asg({
      tag: 'ASG-0205', customerName: 'Grace Lin', phone: '(718) 555-0121', email: 'glin@example.com', orderNumber: '1095799330',
      serviceType: 'computer', deviceDesc: 'MacBook Pro 14" (2021) → MacBook Pro 16" (M4)', issue: 'Migrate everything to the new Mac with Migration Assistant. Verify Photos library and Lightroom catalog open.',
      tech: 'keeshon', status: 'ready', receivedAt: ago(3.3 * 24), readyAt: ago(1.4 * 24), location: 'Shelf A', accessories: ['Charger / power adapter', 'Cables'],
      tasks: [
        { id: uid('tk'), catalogId: 'DAT-03', title: 'Migrate data between computers', done: true, doneAt: ago(36) },
        { id: uid('tk'), catalogId: 'DAT-09', title: 'Verify a transfer or migration', done: true, doneAt: ago(34) },
      ],
      log: [
        { id: uid('lg'), ts: ago(3.3 * 24), tech: 'keeshon', type: 'system', text: 'Checked in at counter.' },
        { id: uid('lg'), ts: ago(34), tech: 'keeshon', type: 'status', text: 'Status → Ready for Pickup. 410 GB migrated, Photos + LrC verified.' },
        { id: uid('lg'), ts: ago(30), tech: 'keeshon', type: 'call', text: 'Called customer — no answer, left voicemail.' },
      ],
    }),
    asg({
      tag: 'ASG-0204', customerName: 'Tomás Reyes', phone: '(347) 555-0177', email: '', orderNumber: '1095802214',
      serviceType: 'firmware', deviceDesc: 'Sony A7R V + Tamron 28-75 G2', issue: 'Body to 3.01 (needs 2.00 intermediate), lens via Tamron Lens Utility. Test AF after.',
      tech: 'isaiah', status: 'diagnosing', receivedAt: ago(9), location: 'Bench', accessories: ['Battery', 'Lens / lens cap'],
      tasks: [
        { id: uid('tk'), catalogId: 'FWC-01', title: 'Check firmware eligibility and update path', done: true, doneAt: ago(7) },
        { id: uid('tk'), catalogId: 'FWC-04', title: 'Perform a computer/USB firmware update', done: false },
        { id: uid('tk'), catalogId: 'FWA-01', title: 'Update compatible lens firmware', done: false },
        { id: uid('tk'), catalogId: 'FWC-07', title: 'Run a post-update functional check', done: false },
      ],
      log: [
        { id: uid('lg'), ts: ago(9), tech: 'isaiah', type: 'system', text: 'Checked in at counter.' },
        { id: uid('lg'), ts: ago(7), tech: 'isaiah', type: 'note', text: 'Body on 1.02 — Sony requires 2.00 before 3.01. Both packages downloaded from Sony support.' },
      ],
    }),
    asg({
      tag: 'ASG-0203', customerName: 'Aisha Rahman', phone: '(212) 555-0109', email: 'aisha.r@example.com', orderNumber: '',
      serviceType: 'phone', deviceDesc: 'Samsung Galaxy S23 → S25 Ultra', issue: 'Smart Switch transfer keeps failing at 80%. Customer flying Sunday — needs it back by Saturday.',
      tech: null, status: 'received', receivedAt: ago(1.5), location: 'Under counter', accessories: ['Cables'],
      tasks: [{ id: uid('tk'), catalogId: 'DAT-06', title: 'Transfer data between phones or tablets', done: false }],
      log: [{ id: uid('lg'), ts: ago(1.5), tech: 'keeshon', type: 'system', text: 'Checked in at counter.' }],
    }),
    asg({
      tag: 'ASG-0202', customerName: 'Owen Fitzgerald', phone: '(929) 555-0133', email: '', orderNumber: '1095781120',
      serviceType: 'computer', deviceDesc: 'Lenovo Legion 5 + Samsung 990 Pro 2TB', issue: 'Clone existing 1TB to new 2TB NVMe and install.',
      tech: 'mike', status: 'picked_up', receivedAt: ago(6 * 24), readyAt: ago(4.5 * 24), pickedUpAt: ago(4.1 * 24), completedAt: ago(4.1 * 24), location: 'Shelf C', accessories: ['Charger / power adapter'],
      tasks: [{ id: uid('tk'), catalogId: 'PC-08', title: 'Assess RAM or SSD compatibility and upgrade needs', done: true, doneAt: ago(5 * 24) }],
      log: [
        { id: uid('lg'), ts: ago(6 * 24), tech: 'mike', type: 'system', text: 'Checked in at counter.' },
        { id: uid('lg'), ts: ago(4.5 * 24), tech: 'mike', type: 'status', text: 'Status → Ready for Pickup.' },
        { id: uid('lg'), ts: ago(4.1 * 24), tech: 'mike', type: 'status', text: 'Picked up by customer. ID verified.' },
      ],
    }),
  ];

  const inv = (extra) => mk({ kind: 'asset', qty: 1, status: 'available', ...extra });
  const inventory = [
    inv({ name: 'CFexpress Type B reader (ProGrade)', category: 'reader', serial: 'PG-CFXB-01', location: 'Bench drawer 1', notes: 'Known-good. USB-C 10Gbps.' }),
    inv({ name: 'SD / microSD reader (Sony MRW-G2)', category: 'reader', serial: 'SNY-G2-02', location: 'Bench drawer 1', status: 'checked_out', holder: 'isaiah', assignmentId: assignments[1].id, checkedOutAt: ago(40) }),
    inv({ name: 'USB-C ↔ USB-C 10Gbps cable 1m', category: 'usb_cable', kind: 'pool', qty: 4, location: 'Cable bin A' }),
    inv({ name: 'USB-A → Micro-B camera cable', category: 'usb_cable', kind: 'pool', qty: 2, location: 'Cable bin A' }),
    inv({ name: 'Recovery / working SSD — Samsung T7 2TB', category: 'working_storage', serial: 'T7-GTS-01', location: 'Locker 2', notes: 'Wipe after every job.' }),
    inv({ name: 'Windows 11 install USB (24H2)', category: 'working_storage', serial: 'USB-W11-01', location: 'Bench drawer 2', status: 'checked_out', holder: 'mike', assignmentId: assignments[0].id, checkedOutAt: ago(30) }),
    inv({ name: 'Surface driver USB ($WinPEDriver$)', category: 'working_storage', serial: 'USB-SURF-01', location: 'Bench drawer 2' }),
    inv({ name: 'HDMI 2.1 cable 2m', category: 'video_cable', kind: 'pool', qty: 3, location: 'Cable bin B' }),
    inv({ name: 'Loaner USB-C 100W charger', category: 'power', serial: 'PWR-100W-01', location: 'Bench', status: 'quarantined', notes: 'Cable frayed near connector — do not lend.' }),
    inv({ name: 'Canon SELPHY KP-108IN paper/ink', category: 'consumable', kind: 'consumable', qty: 2, minQty: 1, unit: 'sets', location: 'Cabinet' }),
    inv({ name: 'Asset tags (roll)', category: 'consumable', kind: 'consumable', qty: 1, minQty: 1, unit: 'rolls', location: 'Cabinet' }),
    inv({ name: 'Test lens — Sony FE 28-70 kit', category: 'test_equipment', serial: 'LENS-2870-01', location: 'Locker 2' }),
  ];

  const activity = [
    { id: uid('ac'), ts: ago(0.5), tech: 'isaiah', action: 'ticket.create', label: 'SF-0101', detail: 'Order 1095847721 · Camera' },
    { id: uid('ac'), ts: ago(7), tech: 'isaiah', action: 'assignment.log', label: 'ASG-0204', detail: 'Note added' },
    { id: uid('ac'), ts: ago(9), tech: 'isaiah', action: 'assignment.status', label: 'ASG-0206', detail: 'Waiting — scan running' },
    { id: uid('ac'), ts: ago(20), tech: 'mike', action: 'assignment.status', label: 'ASG-0207', detail: 'In Progress' },
    { id: uid('ac'), ts: ago(30), tech: 'keeshon', action: 'assignment.log', label: 'ASG-0205', detail: 'Called customer' },
    { id: uid('ac'), ts: ago(34), tech: 'keeshon', action: 'assignment.status', label: 'ASG-0205', detail: 'Ready for Pickup' },
  ].map((a) => ({ ...a, demo: true }));

  return { tickets, assignments, inventory, activity };
}
