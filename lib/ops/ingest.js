// ═══════════════════════════════════════════════════════════════════════════
//  GTS OPS — INGESTION (Phase 2)
//
//  Two inputs, one shape:
//    • GTS Hub tickets (already in the store)          → gtsOrderFromTicket()
//    • A Salesforce report exported as CSV (or JSON)    → importSalesforce()
//
//  There is no live Salesforce read here on purpose: the CSV is whatever a
//  person with Salesforce access exported, so nothing reaches past their own
//  permissions. Customer names / contact details in the export are dropped on
//  import — reconciliation runs on order numbers, tasks and times only.
// ═══════════════════════════════════════════════════════════════════════════
import { hash, isCompletedStatus, ms, normalizeOrderNumber, parseWhen, known } from './schema.js';

// ─── CSV ───────────────────────────────────────────────────────────────────
/** RFC 4180 CSV → array of string arrays. Handles quotes, "" escapes, CRLF, BOM, embedded newlines. */
export function parseCSV(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const delim = sniffDelimiter(s);
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

function sniffDelimiter(s) {
  const first = s.split(/\r?\n/, 1)[0] || '';
  const count = (ch) => first.split(ch).length - 1;
  return [',', '\t', ';'].sort((a, b) => count(b) - count(a))[0];
}

// ─── Column mapping ────────────────────────────────────────────────────────
//  Salesforce report column names depend on how the report was built, so we
//  match on aliases. Anything not listed is ignored (and not stored).
export const SF_COLUMNS = {
  orderNumber: ['order number', 'order #', 'order no', 'order no.', 'order', 'order_number', 'ordernumber', 'order id', 'sales order', 'b&h order', 'b&h order number', 'web order'],
  caseNumber: ['case number', 'case #', 'case', 'case_number', 'casenumber'],
  taskId: ['task id', 'activity id', 'task_id', 'taskid', 'activity_id'],
  taskSubject: ['subject', 'task subject', 'task', 'activity subject'],
  taskStatus: ['status', 'task status', 'activity status', 'case status'],
  taskType: ['type', 'task type', 'activity type', 'service type', 'case reason', 'reason'],
  openedAt: ['created date', 'date/time opened', 'opened date', 'date opened', 'created', 'opened', 'createddate', 'start date', 'start'],
  completedAt: ['completed date', 'completed date/time', 'date completed', 'completion date', 'date/time closed', 'closed date', 'date closed', 'completed', 'closed', 'completeddatetime', 'end date', 'end'],
  owner: ['assigned', 'assigned to', 'owner', 'task owner', 'case owner', 'owner name', 'assigned to: full name', 'created by'],
};
const DROPPED_HINT = /name|email|phone|address|contact|account/i;

const norm = (h) => String(h || '').replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, ' ');

export function mapColumns(header, overrides = {}) {
  const h = header.map(norm);
  const map = {};
  for (const [field, aliases] of Object.entries(SF_COLUMNS)) {
    const forced = overrides[field] ? h.indexOf(norm(overrides[field])) : -1;
    if (forced >= 0) { map[field] = forced; continue; }
    const idx = aliases.map((a) => h.indexOf(a)).find((i) => i >= 0);
    if (idx != null && idx >= 0) map[field] = idx;
  }
  // a bare "Id" column is a Task id only when nothing better was found
  if (map.taskId == null) { const i = h.indexOf('id'); if (i >= 0) map.taskId = i; }
  const used = new Set(Object.values(map));
  const dropped = header.filter((col, i) => !used.has(i) && DROPPED_HINT.test(col));
  return { map, dropped, missing: ['orderNumber'].filter((f) => map[f] == null) };
}

/**
 * Salesforce export text (CSV or JSON array) → { records, errors, columns, stats }.
 * `records` are SalesforceRecord objects (see docs/ops/CONTRACT.md).
 */
export function importSalesforce(text, opts = {}) {
  const { timeZone = 'America/New_York', orderPattern, batchId = `sfb_${Date.now().toString(36)}`, synthetic = false, columns: overrides = {}, importedAt = new Date().toISOString() } = opts;
  const errors = [];
  let header; let body;
  const trimmed = String(text || '').trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    let arr;
    try { const j = JSON.parse(trimmed); arr = Array.isArray(j) ? j : Array.isArray(j.records) ? j.records : null; } catch (e) { return { records: [], errors: [{ row: 0, message: `Not valid JSON: ${e.message}` }], columns: null, stats: { rows: 0 } }; }
    if (!arr) return { records: [], errors: [{ row: 0, message: 'JSON must be an array of rows or { records: [...] }' }], columns: null, stats: { rows: 0 } };
    header = [...new Set(arr.flatMap((r) => Object.keys(r || {})))];
    body = arr.map((r) => header.map((k) => (r?.[k] == null ? '' : String(r[k]))));
  } else {
    const rows = parseCSV(trimmed);
    if (!rows.length) return { records: [], errors: [{ row: 0, message: 'The file is empty.' }], columns: null, stats: { rows: 0 } };
    // Salesforce "formatted" report exports put a title block above the header — find the real header row.
    const hi = rows.slice(0, 15).findIndex((r) => mapColumns(r, overrides).missing.length === 0);
    if (hi < 0) return { records: [], errors: [{ row: 1, message: 'Could not find an order-number column. Rename it to "Order Number" or pick it under Columns.' }], columns: { header: rows[0], map: {}, missing: ['orderNumber'] }, stats: { rows: rows.length } };
    header = rows[hi];
    body = rows.slice(hi + 1).filter((r) => !/^(grand )?totals?\b|^count\b/i.test(String(r[0] || '').trim()));
  }
  const columns = { header, ...mapColumns(header, overrides) };
  if (columns.missing.length) return { records: [], errors: [{ row: 1, message: 'No order-number column found.' }], columns, stats: { rows: body.length } };

  const get = (r, f) => (columns.map[f] == null ? '' : String(r[columns.map[f]] ?? '').trim());
  const records = []; const seen = new Map();
  body.forEach((r, i) => {
    const line = i + 2;
    const on = normalizeOrderNumber(get(r, 'orderNumber'), { pattern: orderPattern });
    const opened = parseWhen(get(r, 'openedAt'), timeZone);
    const completed = parseWhen(get(r, 'completedAt'), timeZone);
    const issues = [...on.issues];
    if (!on.key) issues.push(on.raw ? 'unreadable_order_number' : 'no_order_number');
    if (opened.issue) issues.push(`opened_${opened.issue}`);
    if (completed.issue) issues.push(`completed_${completed.issue}`);
    const taskId = get(r, 'taskId');
    const taskSubject = get(r, 'taskSubject');
    const taskStatus = get(r, 'taskStatus');
    const caseNumber = get(r, 'caseNumber');
    const naturalKey = taskId || [on.key || on.raw, caseNumber, taskSubject, opened.iso].join('|');
    const id = `sf_${hash(naturalKey)}`;
    if (seen.has(id)) { errors.push({ row: line, message: `Duplicate of row ${seen.get(id)} — kept the first.` }); return; }
    seen.set(id, line);
    if (on.issues.includes('excel_scientific')) errors.push({ row: line, message: `Order number "${on.raw}" was mangled by Excel (scientific notation). Re-export as CSV without opening it in Excel.` });
    records.push({
      id, source: 'salesforce', batchId, row: line, synthetic: !!synthetic, importedAt,
      orderNumber: on.raw, orderKey: on.key, orderLoose: on.loose,
      caseNumber: caseNumber || null,
      taskId: taskId || null,
      taskSubject: taskSubject || null,
      taskStatus: taskStatus || null,
      taskType: get(r, 'taskType') || null,
      hasTask: !!(taskId || taskSubject),
      completed: isCompletedStatus(taskStatus) || (!taskStatus && !!completed.iso),
      openedAt: opened.iso, openedPrecision: opened.precision,
      completedAt: completed.iso, completedPrecision: completed.precision,
      owner: get(r, 'owner') || null,
      issues,
      updatedAt: importedAt,
    });
  });
  return { records, errors, columns, stats: { rows: body.length, imported: records.length, dropped: columns.dropped } };
}

// ─── GTS tickets → GtsOrder ────────────────────────────────────────────────
/** Active service time (clock minus pauses). null when the clock never ran or never stopped. */
export function laborMs(t) {
  const a = ms(t.serviceStartedAt); const b = ms(t.serviceEndedAt);
  if (!known(a) || !known(b) || b < a) return null;
  return Math.max(0, b - a - (Number(t.servicePausedMs) || 0));
}

export function gtsOrderFromTicket(t, { orderPattern } = {}) {
  const on = normalizeOrderNumber(t.orderNumber, { pattern: orderPattern });
  const finished = !!t.serviceEndedAt || (!t.serviceStartedAt && t.status === 'logged');
  return {
    id: t.id, source: 'gts', tag: t.tag || null, synthetic: !!t.demo,
    orderNumber: on.raw, orderKey: on.key, orderLoose: on.loose, orderIssues: on.issues,
    caseNumber: t.sfCaseNumber || null,
    serviceType: t.serviceType || null,
    warrantyBrand: t.warrantyBrand || null,
    description: (t.description || '').trim(),
    tech: t.tech || null,
    status: t.status || 'open',
    createdAt: t.createdAt || null,
    serviceStartedAt: t.serviceStartedAt || null,
    serviceEndedAt: t.serviceEndedAt || null,
    servicePausedAt: t.servicePausedAt || null,
    laborMs: laborMs(t),
    loggedAt: t.loggedAt || null,          // "pushed" in GTS — a claim, not proof
    unixLoggedAt: t.unixLoggedAt || null,  // read-only here; UNIX is never automated
    archived: !!t.archivedAt,
    finished,
    inService: !!t.serviceStartedAt && !t.serviceEndedAt,
    updatedAt: t.updatedAt || t.createdAt || null,
  };
}

/** Tickets in [from, to) by createdAt (ISO bounds, either optional). Deleted tickets and assignments are excluded. */
export function gtsOrdersFromState(state, { from, to, orderPattern } = {}) {
  const f = from ? ms(from) : -Infinity; const tt = to ? ms(to) : Infinity;
  return (state?.tickets || [])
    .filter((t) => !t.deletedAt && (t.kind || 'sf') === 'sf' && t.status !== 'converted')
    .filter((t) => { const c = ms(t.createdAt); return !known(c) || (c >= f && c < tt); })
    .map((t) => gtsOrderFromTicket(t, { orderPattern }));
}
