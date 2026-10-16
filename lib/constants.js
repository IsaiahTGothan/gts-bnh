// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — CONSTANTS
//  Techs, service types, statuses, priorities, lookup helpers.
// ═══════════════════════════════════════════════════════════════════════════

export const APP_VERSION = '4.0.0';
export const APP_MAJOR = 4;
export const STORAGE_KEY = 'gts-hub:state';
export const STATE_VERSION = 4;

// ─── Techs (live registry) ─────────────────────────────────────────────────
// V3: the team is data (Management → Team). `TECHS` / `TECH_BY_ID` are kept as
// live objects that `syncTeam()` refills in place, so every module that
// imported them keeps working while the roster changes at runtime.
const SEED_TS = '2026-01-01T00:00:00.000Z';
export const DEFAULT_TEAM = [
  { id: 'isaiah', name: 'Isaiah', initials: 'IS', color: '#22d3ee', role: 'manager', order: 0, createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'keeshon', name: 'Keeshon', initials: 'KE', color: '#a78bfa', role: 'tech', order: 1, createdAt: SEED_TS, updatedAt: SEED_TS },
  { id: 'mike', name: 'Mike', initials: 'MI', color: '#43b56a', role: 'tech', order: 2, createdAt: SEED_TS, updatedAt: SEED_TS },
];
export const TECH_COLORS = ['#22d3ee', '#a78bfa', '#43b56a', '#f5b942', '#f472b6', '#60a5fa', '#fb923c', '#34d399', '#e879f9', '#facc15'];
export const TECHS = [];          // active techs, display order
export const TECH_BY_ID = {};     // every tech ever (removed ones carry `removed: true`)
export function syncTeam(team) {
  const list = Array.isArray(team) && team.length ? team : DEFAULT_TEAM;
  TECHS.length = 0;
  for (const k of Object.keys(TECH_BY_ID)) delete TECH_BY_ID[k];
  const sorted = [...list].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || String(a.name).localeCompare(String(b.name)));
  for (const t of sorted) {
    const rec = { ...t, initials: t.initials || initialsOf(t.name), color: t.color || TECH_COLORS[0], removed: !!t.deletedAt };
    TECH_BY_ID[t.id] = rec;
    if (!t.deletedAt) TECHS.push(rec);
  }
  return TECHS;
}
export const initialsOf = (name = '') => (name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2) || '?').toUpperCase();
export const techName = (id) => TECH_BY_ID[id]?.name || 'Unassigned';
export const isManager = (id) => TECH_BY_ID[id]?.role === 'manager';
syncTeam(DEFAULT_TEAM);

// ─── Service types (the dropdown Isaiah asked for) ─────────────────────────
// `cats` links each type to catalog work areas for task suggestions.
export const SERVICE_TYPES = [
  { id: 'computer', label: 'Computer', icon: 'desktop', color: '#60a5fa', cats: ['PC', 'SW', 'DAT', 'REC', 'MED'] },
  { id: 'laptop', label: 'Laptop', icon: 'laptop', color: '#38bdf8', cats: ['PC', 'SW', 'DAT', 'REC', 'MED'] },
  { id: 'phone', label: 'Phone', icon: 'phone', color: '#a78bfa', cats: ['MOB', 'DAT', 'SW'] },
  { id: 'tablet', label: 'Tablet', icon: 'tablet', color: '#c084fc', cats: ['MOB', 'DAT', 'SW'] },
  { id: 'camera', label: 'Camera', icon: 'camera', color: '#43b56a', cats: ['CAM', 'FWC', 'FWA', 'MOB', 'REC'] },
  { id: 'printer', label: 'Printers', icon: 'printer', color: '#f472b6', cats: ['PRN'] },
  { id: 'lighting', label: 'Lighting', icon: 'flash', color: '#f5b942', cats: ['LGT'] },
  { id: 'monitor', label: 'Monitors', icon: 'monitor', color: '#fb923c', cats: ['VID', 'FWA', 'PC'] },
  { id: 'firmware', label: 'Firmware Updates', icon: 'chip', color: '#22d3ee', cats: ['FWC', 'FWA'] },
  { id: 'warranty', label: 'Warranty', icon: 'shield', color: '#34d399', cats: ['INT', 'RES'] },
  { id: 'other', label: 'Other', icon: 'dots', color: '#9aa8bb', cats: ['INT', 'RES', 'AUD', 'VID', 'MED'] },
];
export const SERVICE_BY_ID = Object.fromEntries(SERVICE_TYPES.map((s) => [s.id, s]));
export const serviceLabel = (id) => SERVICE_BY_ID[id]?.label || 'Unspecified';

// ─── Salesforce ticket statuses ────────────────────────────────────────────
export const TICKET_STATUSES = [
  { id: 'open', label: 'Open', color: 'accent' },
  { id: 'logged', label: 'Logged in Salesforce', color: 'green' },
  { id: 'converted', label: 'Moved to Assignments', color: 'violet' },
];

// ─── Assignment (overnight) pipeline ───────────────────────────────────────
export const ASG_STATUSES = [
  { id: 'received', label: 'Received', short: 'Received', color: '#9aa8bb', hint: 'Device checked in, not started' },
  { id: 'diagnosing', label: 'Diagnosing', short: 'Diagnosing', color: '#22d3ee', hint: 'Finding the fault' },
  { id: 'in_progress', label: 'In Progress', short: 'Working', color: '#a78bfa', hint: 'Actively being serviced' },
  { id: 'waiting', label: 'Waiting', short: 'Waiting', color: '#f5b942', hint: 'Blocked — customer, parts, download…' },
  { id: 'ready', label: 'Ready for Pickup', short: 'Ready', color: '#43b56a', hint: 'Done — call the customer' },
  { id: 'picked_up', label: 'Picked Up', short: 'Picked up', color: '#66748a', terminal: true },
  { id: 'cancelled', label: 'Cancelled', short: 'Cancelled', color: '#66748a', terminal: true },
];
export const ASG_STATUS_BY_ID = Object.fromEntries(ASG_STATUSES.map((s) => [s.id, s]));
export const ACTIVE_STATUSES = ASG_STATUSES.filter((s) => !s.terminal).map((s) => s.id);
export const isTerminal = (status) => !!ASG_STATUS_BY_ID[status]?.terminal;

export const WAIT_REASONS = [
  'Customer decision',
  'Customer callback',
  'Parts / accessory needed',
  'Download or transfer running',
  'Scan running (unattended)',
  'Software access / permissions',
  'Another tech',
  'Manufacturer support',
];

export const ACCESSORIES = [
  'Charger / power adapter',
  'Bag / case',
  'Cables',
  'Memory card',
  'Mouse / keyboard',
  'Battery',
  'Lens / lens cap',
  'Other',
];

export const STORAGE_SPOTS = ['Shelf A', 'Shelf B', 'Shelf C', 'Locker 1', 'Locker 2', 'Bench', 'Cabinet', 'Under counter'];

export const NOTE_TEMPLATES = [
  { label: 'Called — no answer', text: 'Called customer — no answer, left voicemail.', type: 'call' },
  { label: 'Customer notified', text: 'Customer notified device is ready for pickup.', type: 'call' },
  { label: 'Diagnosis done', text: 'Diagnosis complete: ', type: 'note' },
  { label: 'Backup verified', text: 'Backup verified — opened representative files on destination.', type: 'note' },
  { label: 'Transfer running', text: 'Unattended transfer running — check progress at ', type: 'note' },
  { label: 'Needs approval', text: 'Waiting on customer approval before proceeding with: ', type: 'note' },
];

// ─── Priority ──────────────────────────────────────────────────────────────
export const PRIORITIES = [
  { id: 'low', label: 'Low', rank: 0 },
  { id: 'normal', label: 'Normal', rank: 1 },
  { id: 'high', label: 'High', rank: 2 },
  { id: 'critical', label: 'Critical', rank: 3 },
];
export const PRIORITY_BY_ID = Object.fromEntries(PRIORITIES.map((p) => [p.id, p]));

// ─── Tabs ──────────────────────────────────────────────────────────────────
// (`salesforce` keeps its id for saved links/shortcuts; it is the Quick Log.)
export const TABS = [
  { id: 'home', label: 'Home', icon: 'home', key: '1', hint: 'Today, alerts, who has what' },
  { id: 'salesforce', label: 'Quick Log', icon: 'zap', key: '2', hint: 'Log a customer in seconds · Salesforce + UNIX' },
  { id: 'assignments', label: 'Assignments', icon: 'clipboard', key: '3', hint: 'Overnight drop-offs' },
  { id: 'stats', label: 'Stats', icon: 'activity', key: '4', hint: 'Every number on one page' },
  { id: 'catalog', label: 'Catalog', icon: 'book', key: '5', hint: '124 service types' },
  { id: 'station', label: 'Station', icon: 'toolbox', key: '6', hint: 'Inventory + shift handoff' },
  { id: 'warranty', label: 'Warranty', icon: 'shield-check', key: '9', hint: 'Pick a brand → official warranty & repair page, QR for the customer' },
  { id: 'firmware', label: 'Firmware', icon: 'chip', key: '8', hint: 'Update / install firmware — cameras, lenses, flashes, Windows ISOs' },
  { id: 'management', label: 'Management', icon: 'shield', key: '7', hint: 'Team, goal, alerts, system settings', manager: true },
];
// Sections of the Firmware page (Camera Firmware Hub, embedded from /public/firmware). Shown as a
// dropdown under the Firmware rail item; ids match the hub's own views.
export const FIRMWARE_VIEWS = [
  { id: 'camera', label: 'Cameras', hint: 'Latest firmware for the cameras we sell — search by name or model code.' },
  { id: 'lens', label: 'Lenses', hint: 'Native and third-party lens firmware: through the body, a dock or the maker\'s app.' },
  { id: 'flash', label: 'Flashes & Lighting', hint: 'Godox, Profoto, Westcott, Aputure, Nanlite and the camera-brand speedlites.' },
  { id: 'accessory', label: 'Accessories', hint: 'Card tools, monitors, mics, gimbals and companion software.' },
  { id: 'windows', label: 'Windows ISO', hint: 'Official Windows install media, tools, and how to make a bootable drive.' },
  { id: 'about', label: 'About', hint: 'What the hub does, safety rules, and where the desktop app adds more.' },
];
export const MOBILE_TABS = ['home', 'salesforce', 'assignments', 'stats'];

// ─── Management defaults ───────────────────────────────────────────────────
// Store hours per weekday (0 = Sunday). Drive "on pace", customers per hour and
// the open-hours maths in Stats. `null` = closed. Editable in Management → System.
export const DEFAULT_HOURS = [
  { open: '10:00', close: '18:00' }, // Sun
  { open: '09:00', close: '19:00' }, // Mon
  { open: '09:00', close: '19:00' }, // Tue
  { open: '09:00', close: '19:00' }, // Wed
  { open: '09:00', close: '19:00' }, // Thu
  { open: '09:00', close: '14:00' }, // Fri
  null,                              // Sat
];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const DEFAULT_TEMPLATES = [
  'Firmware update — checked path, updated, tested',
  'Data transfer old → new device',
  'New device setup + account sign-in',
  'Pairing / connectivity troubleshooting',
  'Warranty question — sent to manufacturer page',
  'Card / drive not detected — tested on known-good reader',
];

export const DEFAULT_MANAGEMENT = {
  goalPerDay: 20,          // customers per day (Isaiah: "our goal for customers is 20 a day")
  goalLabel: 'customers',
  goalEmphasis: 'subtle',  // subtle | bold — how loudly the goal is shown
  pinHash: null,           // SHA-256 of the manager PIN; null = management open until a PIN is set
  unixMode: 'scan',        // scan (barcode bridge) | manual | bridge

  // ── V4: System settings (Management → System) ─────────────────────────
  storeCode: 'NYC-SS',              // location code on exports / webhooks (multi-store ready)
  timezone: 'America/New_York',
  hours: DEFAULT_HOURS,
  // Service clock — how long a ticket takes, start → done
  serviceClock: 'start',            // start: new tickets start the clock running · done: log as finished
  serviceTargetMin: 15,             // target minutes per ticket (Stats + live timers turn amber past it)
  serviceTargets: {},               // per service type overrides { camera: 20, … }
  staleServiceHours: 3,             // a clock running longer than this raises an alert
  // Ticket rules
  requireServiceType: false,
  requireOrderNumber: false,
  orderPattern: '^\\d{6,12}$',      // what an order number looks like
  orderCheck: 'warn',               // warn | block | off
  duplicateWindowHours: 24,         // warn when the same order # was logged recently
  templates: DEFAULT_TEMPLATES,
  // Features
  features: { scene3d: true, queue: true, warranty: true, customerDisplay: true, celebrate: true },
  sceneIntensity: 'full',           // full | calm
  // Privacy & retention
  maskNamesOnDisplay: true,         // the Quick Log stage shows "D. Carter", never the full name
  purgeAfterDays: 0,                // 0 = keep · N = anonymise customer names / phones after N days
  // Security & permissions
  autoLockMinutes: 15,              // re-lock Management after N idle minutes (0 = never)
  perms: { techDelete: true, techEditTimes: true, techExport: true, techReset: false },
  // Integrations
  webhookUrl: '',                   // HTTPS endpoint (Teams / Slack / Power Automate / internal)
  webhookEvents: ['ticket.create', 'ticket.done', 'assignment.create'],
  warrantyBrands: [],               // custom / overridden warranty links
  updatedAt: '2026-01-01T00:00:00.000Z',
};
export const BROADCAST_TONES = [
  { id: 'info', label: 'Heads-up', color: 'accent' },
  { id: 'warning', label: 'Attention', color: 'amber' },
  { id: 'critical', label: 'Urgent', color: 'red' },
];

export const DEFAULT_CHECKLIST = [
  'Workstations awake, updates not pending',
  'Card readers + known-good cables on the bench',
  'Overnight devices reconciled with tags',
  'Overdue alerts reviewed (Home tab)',
  'Salesforce log pushed for yesterday',
  'Bench wiped, loaners returned',
];

export const DEFAULT_SETTINGS = {
  currentTech: null,
  stationName: 'GTS Counter',
  storeLabel: 'B&H NYC SuperStore',
  counterPhone: '',
  overdueDays: 3,
  theme: 'dark',
  sounds: false,
  compact: false,
  syncPasscode: '',
  syncEnabled: true,
  demoLoaded: false,
  onboarded: false,
  railCollapsed: false,       // V3 sidebar
  dismissedBroadcasts: [],    // ids hidden on this device
  managerUnlocked: false,     // PIN entered on this device
  whatsNewSeen: 0,            // APP_MAJOR last acknowledged
  effects: 'auto',            // V4: 3D stage on this device — auto | full | calm | off
  lastPurgeDay: null,
};
