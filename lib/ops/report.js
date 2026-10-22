// ═══════════════════════════════════════════════════════════════════════════
//  GTS OPS — END-OF-DAY REPORT (Phase 6)
//
//  One report object → JSON, CSV, Excel (SpreadsheetML — opens in Excel with
//  three sheets, no library needed) and a print page (Save as PDF from the
//  print dialog). History keeps the summary + exceptions (small enough to
//  sync); the full row list is in the downloaded files.
// ═══════════════════════════════════════════════════════════════════════════
import { CONTRACT, RECON_META, dayIn, hash } from './schema.js';
import { summarize } from './reconcile.js';
import { fmtMs, turnaround } from './turnaround.js';

export const REPORT_HISTORY_CAP = 120;

const ROW_COLS = [
  ['status', 'Status'], ['orderNumber', 'Order'], ['tag', 'GTS ticket'], ['tech', 'Tech'], ['serviceType', 'Service'],
  ['sfCase', 'SF Case'], ['sfTask', 'SF Task'], ['sfStatus', 'SF Status'],
  ['elapsed', 'Elapsed'], ['labor', 'Labor'], ['sfElapsed', 'SF elapsed'], ['review', 'Review'], ['issues', 'Issues'], ['synthetic', 'Synthetic'],
];

export function buildEodReport({ day, records, queue = [], results = [], by, store = 'B&H', station = 'GTS Counter', timeZone = 'America/New_York', techName = (x) => x, serviceLabel = (x) => x, at }) {
  const ta = turnaround(records, { timeZone, filters: { from: day, to: day } });
  const ids = new Set(ta.rows.map((r) => r.reconId));
  const dayRecords = records.filter((r) => ids.has(r.id));
  const qById = new Map(queue.map((q) => [q.rec.id, q]));
  const taById = new Map(ta.rows.map((r) => [r.reconId, r]));
  const rows = dayRecords.map((r) => {
    const t = taById.get(r.id); const q = qById.get(r.id);
    return {
      reconId: r.id, status: RECON_META[r.status].label, orderNumber: r.orderKey || r.orderNumber || '', tag: r.gts?.tag || '',
      tech: r.gts?.tech ? techName(r.gts.tech) : (r.sf?.owner || ''), serviceType: r.gts?.serviceType ? serviceLabel(r.gts.serviceType) : (r.sf?.taskType || ''),
      sfCase: r.sf?.caseNumber || '', sfTask: r.sf?.taskId || r.sf?.taskSubject || '', sfStatus: r.sf?.taskStatus || '',
      elapsed: fmtMs(t?.elapsedMs ?? null), labor: fmtMs(t?.laborMs ?? null), sfElapsed: fmtMs(t?.sfElapsedMs ?? null),
      review: q ? q.status : '', issues: r.issues.map((i) => i.message).join(' · '), synthetic: r.synthetic ? 'yes' : '',
    };
  });
  const summary = summarize(dayRecords);
  const exceptions = rows.filter((r) => r.status !== RECON_META.MATCHED.label && r.status !== RECON_META.VERIFIED.label);
  const dayResults = results.filter((x) => dayIn(x.finishedAt || x.importedAt, timeZone) === day);
  const generatedAt = at || new Date().toISOString();
  const synthetic = dayRecords.some((r) => r.synthetic);
  return {
    contract: CONTRACT, kind: 'eod-report', id: `eod_${day}_${hash(generatedAt)}`, day, generatedAt, generatedBy: by || null, store, station, timeZone,
    synthetic, allSynthetic: dayRecords.length > 0 && dayRecords.every((r) => r.synthetic),
    summary,
    turnaround: { elapsed: ta.elapsed, labor: ta.labor, sfElapsed: ta.sfElapsed, byTech: ta.byTech.map((g) => ({ ...g, key: g.key === '—' ? '—' : techName(g.key) })), byType: ta.byType.map((g) => ({ ...g, key: g.key === '—' ? '—' : serviceLabel(g.key) })) },
    review: {
      pending: queue.filter((q) => ids.has(q.rec.id) && q.status === 'pending').length,
      approved: queue.filter((q) => ids.has(q.rec.id) && (q.status === 'approved' || q.status === 'edited')).length,
      rejected: queue.filter((q) => ids.has(q.rec.id) && q.status === 'rejected').length,
      investigating: queue.filter((q) => ids.has(q.rec.id) && q.status === 'investigating').length,
    },
    finalization: { runs: [...new Set(dayResults.map((x) => x.runId))].length, verified: dayResults.filter((x) => x.mode === 'live' && x.outcome === 'verified').length, failed: dayResults.filter((x) => x.outcome === 'failed' || x.outcome === 'unverified').length },
    exceptions,
    rows,
  };
}

/** What goes into the synced history — no per-row list. */
export function compactReport(r) {
  const { rows, ...rest } = r;
  return { ...rest, rowCount: rows.length, updatedAt: r.generatedAt };
}

export function searchReports(reports, q) {
  const s = String(q || '').trim().toLowerCase();
  const list = reports.filter((r) => !r.deletedAt).sort((a, b) => String(b.day).localeCompare(String(a.day)) || String(b.generatedAt).localeCompare(String(a.generatedAt)));
  if (!s) return list;
  return list.filter((r) => [r.day, r.generatedBy, r.station, ...(r.exceptions || []).flatMap((e) => [e.orderNumber, e.tag, e.status, e.issues, e.tech])]
    .some((x) => String(x || '').toLowerCase().includes(s)));
}

// ─── Exports ───────────────────────────────────────────────────────────────
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s; };

export function reportCSV(r) {
  const lines = [ROW_COLS.map(([, h]) => h).join(',')];
  for (const row of r.rows || r.exceptions || []) lines.push(ROW_COLS.map(([k]) => csvCell(row[k])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xRow = (cells, style) => `<Row>${cells.map((c) => `<Cell${style ? ` ss:StyleID="${style}"` : ''}><Data ss:Type="${typeof c === 'number' ? 'Number' : 'String'}">${xml(c)}</Data></Cell>`).join('')}</Row>`;

export function reportExcelXML(r) {
  const sum = [
    ['GTS end-of-day report', r.day], ['Store', `${r.store} · ${r.station}`], ['Generated', r.generatedAt], ['By', r.generatedBy || ''],
    ...(r.synthetic ? [['DATA', r.allSynthetic ? 'SYNTHETIC — test data only' : 'Contains synthetic test records']] : []),
    [''], ['Records', r.summary.total], ['Exceptions', r.summary.exceptions], ['Match rate', r.summary.matchRate == null ? 'n/a' : `${Math.round(r.summary.matchRate * 100)}%`],
    ...Object.entries(r.summary.counts).map(([k, v]) => [RECON_META[k].label, v]),
    [''], ['Elapsed median', fmtMs(r.turnaround.elapsed.median)], ['Elapsed p90', fmtMs(r.turnaround.elapsed.p90)], ['Elapsed unknown', r.turnaround.elapsed.unknown],
    ['Labor median', fmtMs(r.turnaround.labor.median)], ['Labor unknown', r.turnaround.labor.unknown],
    ['SF elapsed median', fmtMs(r.turnaround.sfElapsed.median)], ['SF elapsed unknown', r.turnaround.sfElapsed.unknown],
    [''], ['Review pending', r.review.pending], ['Approved', r.review.approved], ['Rejected', r.review.rejected], ['Investigating', r.review.investigating],
  ];
  const sheet = (name, head, rows) => `<Worksheet ss:Name="${xml(name)}"><Table>${head ? xRow(head, 'h') : ''}${rows.map((x) => xRow(x)).join('')}</Table></Worksheet>`;
  const asRows = (list) => list.map((row) => ROW_COLS.map(([k]) => row[k] ?? ''));
  return `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>${sheet('Summary', null, sum)}${sheet('Exceptions', ROW_COLS.map(([, h]) => h), asRows(r.exceptions))}${sheet('All records', ROW_COLS.map(([, h]) => h), asRows(r.rows || []))}</Workbook>`;
}

export function reportPrintHTML(r) {
  const tone = { Conflict: '#c0392b', 'Missing task': '#c0392b', 'GTS only': '#b7791f', Incomplete: '#b7791f', 'Salesforce only': '#6b46c1', Matched: '#2f855a', Verified: '#2b6cb0' };
  const rows = (list) => list.map((x) => `<tr><td style="color:${tone[x.status] || '#333'};font-weight:600">${xml(x.status)}</td><td>${xml(x.orderNumber)}</td><td>${xml(x.tag)}</td><td>${xml(x.tech)}</td><td>${xml(x.serviceType)}</td><td>${xml(x.elapsed)}</td><td>${xml(x.labor)}</td><td>${xml(x.review)}</td><td class="iss">${xml(x.issues)}</td></tr>`).join('');
  const kpi = (l, v) => `<div class="k"><b>${xml(v)}</b><span>${xml(l)}</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>GTS EOD ${xml(r.day)}</title><style>
  body{font:12px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px}
  .sub{color:#555}.ks{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.k{border:1px solid #ddd;border-radius:6px;padding:6px 10px;min-width:92px}.k b{display:block;font-size:16px}.k span{color:#666;font-size:11px}
  table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e5e5e5;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f6f6f6;font-size:11px}.iss{color:#555;font-size:11px}
  .syn{background:#fff3cd;border:1px solid #e0b100;padding:6px 10px;border-radius:6px;margin-top:10px;font-weight:600}@media print{body{margin:10mm}}</style></head><body>
  <h1>GTS end-of-day report — ${xml(r.day)}</h1><div class="sub">${xml(r.store)} · ${xml(r.station)} · generated ${xml(new Date(r.generatedAt).toLocaleString())}${r.generatedBy ? ` by ${xml(r.generatedBy)}` : ''}</div>
  ${r.synthetic ? `<div class="syn">${r.allSynthetic ? 'SYNTHETIC TEST DATA — not real orders.' : 'Contains synthetic test records (marked in the table).'}</div>` : ''}
  <div class="ks">${kpi('records', r.summary.total)}${kpi('exceptions', r.summary.exceptions)}${kpi('match rate', r.summary.matchRate == null ? 'n/a' : `${Math.round(r.summary.matchRate * 100)}%`)}${kpi('elapsed median', fmtMs(r.turnaround.elapsed.median))}${kpi('labor median', fmtMs(r.turnaround.labor.median))}${kpi('elapsed unknown', r.turnaround.elapsed.unknown)}${kpi('review pending', r.review.pending)}${kpi('SF verified', r.finalization.verified)}</div>
  <h2>By status</h2><div class="ks">${Object.entries(r.summary.counts).map(([k, v]) => kpi(RECON_META[k].label, v)).join('')}</div>
  <h2>Exceptions (${r.exceptions.length})</h2>${r.exceptions.length ? `<table><tr><th>Status</th><th>Order</th><th>Ticket</th><th>Tech</th><th>Service</th><th>Elapsed</th><th>Labor</th><th>Review</th><th>Issues</th></tr>${rows(r.exceptions)}</table>` : '<p>None — everything matched.</p>'}
  <h2>By tech</h2><table><tr><th>Tech</th><th>Tickets</th><th>Elapsed median</th><th>Labor median</th><th>Unknown</th></tr>${r.turnaround.byTech.map((g) => `<tr><td>${xml(g.key)}</td><td>${g.count}</td><td>${fmtMs(g.elapsed.median)}</td><td>${fmtMs(g.labor.median)}</td><td>${g.elapsed.unknown}</td></tr>`).join('')}</table>
  </body></html>`;
}

