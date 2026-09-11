// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — CONSTANTS
//  Techs, service types, statuses, priorities, lookup helpers.
// ═══════════════════════════════════════════════════════════════════════════

export const APP_VERSION = '1.0.0';
export const STORAGE_KEY = 'gts-hub:state';
export const STATE_VERSION = 1;

// ─── Techs ─────────────────────────────────────────────────────────────────
export const TECHS = [
  { id: 'isaiah', name: 'Isaiah', initials: 'IS', color: '#22d3ee' },
  { id: 'keeshon', name: 'Keeshon', initials: 'KE', color: '#a78bfa' },
  { id: 'mike', name: 'Mike', initials: 'MI', color: '#43b56a' },
];
export const TECH_BY_ID = Object.fromEntries(TECHS.map((t) => [t.id, t]));
export const techName = (id) => TECH_BY_ID[id]?.name || 'Unassigned';

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
export const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'salesforce', label: 'Salesforce', icon: 'cloud' },
  { id: 'assignments', label: 'Assignments', icon: 'clipboard' },
  { id: 'catalog', label: 'Catalog', icon: 'book' },
  { id: 'station', label: 'Station', icon: 'toolbox' },
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
};
