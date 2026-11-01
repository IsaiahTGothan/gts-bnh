// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — SALESFORCE COPY SHEET (V5.1)
//  Every Quick Log ticket that is still open (not pushed) as one plain table a
//  person — or a browser bot — copies into Salesforce, plus the rules for
//  doing it. The bot only ADDS guests + services; it never completes anything.
//  Pure module: rows, TSV, rules. The page is components/SalesforceSheet.jsx.
// ═══════════════════════════════════════════════════════════════════════════
import { inferFromDescription, resolveService, searchServices, SEP } from './sf-services.js';

export const SF_QUEUE_TECH = 'Guest Technical Services Queue';
export const SF_QUEUE_VIEW = 'Customers In Queue';
export const SHEET_HASH = '#salesforce-sheet';

/** The steps, in order. Shown on the page and copied with "Copy instructions". */
export const BOT_STEPS = [
  'Open Salesforce with the “Open Salesforce” button on this page. If it asks you to log in, stop and let the person at the counter log in — never type a password you were not given.',
  `Work only in “${SF_QUEUE_VIEW}”. Do not open or change anything outside it.`,
  'Go through the table below from top to bottom, one row at a time.',
  'Click “New Guest”.',
  'Order # column filled → enter that order number. When Salesforce lists the orders for it, select ALL of them so every order is associated with the service. Order # empty → leave the order field empty (walk-up).',
  `Tech / owner → always “${SF_QUEUE_TECH}”. Never a person’s name.`,
  'Description → copy the Description column exactly as written (same words, same spelling). Do not shorten, reword or add anything.',
  'Add the service — every row gets one, including walk-ups and “Other” tickets: click “Take”, then “Select a Service” and choose the Service column (Group › Service). If the row says “Pick the closest”, choose the closest service in that group; if nothing fits, skip the row.',
  'Save the guest. Then come back to this page and click “Copied” on that row.',
  'If anything does not line up (order not found, service missing, an error, a duplicate already in the queue), click “Skipped” on that row and type why.',
  'When every row is marked Copied or Skipped, click “Confirm results” at the bottom of this page.',
];

/** The hard rules. Shown in red on the page. */
export const BOT_NEVER = [
  'NEVER complete, close, resolve or finish any ticket, guest or case in Salesforce — not even one that looks done — unless the person at the counter explicitly tells you to in this session. Adding a service is NOT completing.',
  'Never delete, merge or edit existing Salesforce records. Only create the new guest and add its service.',
  'Never invent order numbers, names, descriptions or services. Copy only what is in the table.',
  `Never work outside “${SF_QUEUE_VIEW}”.`,
  'Never mark a row “Copied” unless the guest and its service were actually saved in Salesforce.',
  'In GTS Hub, only use the Copied / Skipped buttons and “Confirm results”. Do not edit or delete tickets here.',
];

export function botInstructionsText({ salesforceUrl, count } = {}) {
  return [
    `GTS Hub → Salesforce copy sheet${count != null ? ` (${count} ticket${count === 1 ? '' : 's'})` : ''}`,
    salesforceUrl ? `Salesforce: ${salesforceUrl}` : null,
    '',
    'DO, IN ORDER:',
    ...BOT_STEPS.map((s, i) => `${i + 1}. ${s}`),
    '',
    'NEVER:',
    ...BOT_NEVER.map((s) => `- ${s}`),
  ].filter((l) => l !== null).join('\n');
}

const isOpenUnpushed = (t) => !t.deletedAt && !t.archivedAt && (t.kind || 'sf') === 'sf' && t.status === 'open';

/**
 * Open, not-yet-pushed tickets → sheet rows, oldest first.
 * match: 'exact' (ticket already has its Salesforce service), 'suggested' (worked out from
 * the description), 'none' (the bot picks the closest — shown as such, never invented).
 */
export function buildSheetRows(tickets, { catalog, typeLabel = (x) => x || '', techName = (x) => x || '' } = {}) {
  return (tickets || []).filter(isOpenUnpushed)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((t) => {
      const opts = catalog ? { catalog, type: t.serviceType || null } : { type: t.serviceType || null };
      let path = t.sfService || null; let match = path ? 'exact' : 'none';
      if (!path) { const s = resolveService(t.description || '', opts) || inferFromDescription(t.description || '', opts).service || searchServices(t.description || '', { ...opts, limit: 1 })[0]; if (s) { path = s.path; match = 'suggested'; } }
      const [group, service] = path ? path.split(SEP) : ['', ''];
      return {
        id: t.id,
        tag: t.tag || '',
        order: (t.orderNumber || '').trim(),
        customer: (t.customerName || '').trim() || 'Walk-up',
        group: group || '',
        service: service || '',
        path: path || '',
        match,
        type: typeLabel(t.serviceType),
        description: (t.description || '').trim(),
        gtsTech: t.tech ? techName(t.tech) : '',
        sfTech: SF_QUEUE_TECH,
        createdAt: t.createdAt || null,
        warranty: t.warrantyBrand || '',
        skipReason: t.sfSkipReason || '',
      };
    });
}

export const SHEET_COLUMNS = [
  ['tag', 'GTS ticket'], ['order', 'Order #'], ['customer', 'Customer'], ['group', 'Service group'], ['service', 'Service'],
  ['description', 'Description (copy exactly)'], ['sfTech', 'Salesforce tech'], ['type', 'GTS type'], ['gtsTech', 'Logged by'],
];

/** Tab-separated — pastes straight into Excel / Sheets. */
export function sheetTSV(rows) {
  const clean = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  const cell = (r, k) => (k === 'service' && r.match === 'none' ? `Pick the closest (${r.type || 'any'})` : clean(r[k]));
  return [SHEET_COLUMNS.map(([, h]) => h).join('\t'), ...rows.map((r) => SHEET_COLUMNS.map(([k]) => cell(r, k)).join('\t'))].join('\n');
}

/** Copied / Skipped marks → what Confirm applies. Rows without a mark stay open and untouched. */
export function planConfirm(rows, marks = {}) {
  const copied = []; const skipped = []; const unmarked = [];
  for (const r of rows) {
    const m = marks[r.id];
    if (m?.status === 'copied') copied.push(r.id);
    else if (m?.status === 'skipped') skipped.push({ id: r.id, reason: String(m.reason || '').trim() || 'No reason given' });
    else unmarked.push(r.id);
  }
  return { copied, skipped, unmarked };
}
