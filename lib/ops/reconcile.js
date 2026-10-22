// ═══════════════════════════════════════════════════════════════════════════
//  GTS OPS — RECONCILIATION (Phase 2)
//
//  GtsOrder[] + SalesforceRecord[] → ReconRecord[]
//
//  Rules that never bend:
//   • Pair only on an exact normalised order number (or exact Case number).
//   • Several tickets/tasks on one order pair only when each side has exactly
//     one same-day partner; otherwise the whole order is a CONFLICT.
//   • Near-identical order numbers (typo, leading zero, swapped digits) are
//     flagged as a CONFLICT — never merged.
//   • A record is VERIFIED only when it is MATCHED *and* a person (or a live,
//     read-back-verified Clawson run) confirmed this exact version of it.
// ═══════════════════════════════════════════════════════════════════════════
import { ACTIONS, RECON, RECON_META, canonical, dayIn, hash, known, ms, nearMatch } from './schema.js';

const DAY = 86_400_000;

export const ISSUE_TEXT = {
  no_task: 'Order is in Salesforce but has no GTS task on it.',
  claimed_pushed: 'GTS shows this as pushed to Salesforce, but no task is there.',
  sf_task_open: 'Salesforce task is still open.',
  gts_not_finished: 'Service is still running in GTS (clock never stopped).',
  gts_no_description: 'GTS ticket has no description of the work.',
  no_service_clock: 'No service clock on the GTS ticket — duration unknown.',
  no_salesforce_record: 'Nothing in the Salesforce export for this order.',
  no_gts_ticket: 'No GTS ticket for this order.',
  no_order_number: 'No order number — can’t be matched.',
  unreadable_order_number: 'Order number can’t be read exactly — a person must check it.',
  excel_scientific: 'Order number was mangled by Excel (1.09E+09 style).',
  duplicate_order: 'Several tickets/tasks on this order and they don’t pair up cleanly.',
  near_match: 'Order numbers are almost identical — possible typo. Not merged.',
  timeline: 'Salesforce shows it completed before GTS opened it.',
  case_mismatch: 'GTS and Salesforce show different Case numbers.',
  other_visit: 'Same order has another visit that did pair up.',
  ambiguous_characters: 'Order number mixes letters like O/I/L with digits.',
  pattern_mismatch: 'Order number doesn’t match the store’s order format.',
};

const issue = (code, side, extra) => ({ code, side, message: ISSUE_TEXT[code] || code, ...(extra || {}) });

/** Fingerprint of the GTS side — a verification only counts for the version a person actually saw. */
export function gtsFingerprint(g) {
  if (!g) return null;
  return hash(canonical({ id: g.id, k: g.orderKey, d: g.description, t: g.serviceType, e: g.serviceEndedAt, s: g.serviceStartedAt }));
}
export function sfFingerprint(s) {
  if (!s) return null;
  return hash(canonical({ id: s.id, k: s.orderKey, st: s.taskStatus, c: s.completedAt, task: s.taskId || s.taskSubject }));
}

function finishedState(g) {
  if (g.serviceEndedAt) return true;
  if (g.serviceStartedAt) return false;
  return null; // no clock — unknown
}

function evalPair(g, s) {
  const issues = [];
  let status = RECON.MATCHED;
  const fin = finishedState(g);
  if (!s.hasTask) {
    status = RECON.MISSING_TASK;
    issues.push(issue('no_task', 'salesforce'));
    if (g.status === 'logged') issues.push(issue('claimed_pushed', 'gts'));
  } else if (!s.completed) {
    status = RECON.INCOMPLETE; issues.push(issue('sf_task_open', 'salesforce'));
  }
  if (fin === false) { if (status === RECON.MATCHED) status = RECON.INCOMPLETE; issues.push(issue('gts_not_finished', 'gts')); }
  if (fin === null) issues.push(issue('no_service_clock', 'gts'));
  if ((g.description || '').length < 3) { if (status === RECON.MATCHED) status = RECON.INCOMPLETE; issues.push(issue('gts_no_description', 'gts')); }
  const sDone = ms(s.completedAt); const gOpen = ms(g.createdAt);
  if (known(sDone) && known(gOpen) && sDone < gOpen - DAY) { status = RECON.CONFLICT; issues.push(issue('timeline', 'both')); }
  if (g.caseNumber && s.caseNumber && g.caseNumber !== s.caseNumber) { status = RECON.CONFLICT; issues.push(issue('case_mismatch', 'both')); }
  for (const c of g.orderIssues || []) if (ISSUE_TEXT[c] && c !== 'excel_decimal') issues.push(issue(c, 'gts'));
  return { status, issues };
}

function proposalFor(rec, g, s, labelOf) {
  if (!g || !g.orderKey) return null;
  const fin = finishedState(g);
  let action = null;
  if (rec.status === RECON.MISSING_TASK || rec.status === RECON.GTS_ONLY) action = ACTIONS.CREATE_TASK;
  else if (rec.status === RECON.INCOMPLETE && s?.hasTask && !s.completed && rec.issues.every((i) => i.code === 'sf_task_open' || i.code === 'no_service_clock')) action = ACTIONS.COMPLETE_TASK;
  if (!action) return null;
  const blockers = [];
  if (fin === false) blockers.push('Service is still running in GTS — finish it first.');
  if ((g.description || '').length < 3) blockers.push('No description of the work in GTS — nothing true to put in Salesforce.');
  return {
    action,
    orderNumber: g.orderKey,
    sfTaskId: s?.taskId || null,
    sfCaseNumber: s?.caseNumber || g.caseNumber || null,
    subject: `GTS ${labelOf(g.serviceType)} — ${g.tag || g.orderKey}`.slice(0, 255),
    description: g.description,
    serviceType: g.serviceType,
    tech: g.tech,
    completedAt: g.serviceEndedAt || null, // never filled in with a guess
    laborMinutes: g.laborMs != null ? Math.round(g.laborMs / 60000) : null,
    blockers,
  };
}

const mkId = (...parts) => `rc_${hash(parts.map((p) => p || '-').join('|'))}`;

function base(status, { g = null, s = null, gList, sList, issues = [], key }) {
  const synthetic = [g, s, ...(gList || []), ...(sList || [])].some((x) => x?.synthetic);
  return {
    id: gList || sList ? mkId('grp', ...[...(gList || []), ...(sList || [])].map((x) => x.id).sort()) : mkId(key || g?.orderKey || s?.orderKey, g?.id, s?.id),
    status,
    orderKey: key ?? g?.orderKey ?? s?.orderKey ?? null,
    orderNumber: g?.orderNumber || s?.orderNumber || gList?.[0]?.orderNumber || sList?.[0]?.orderNumber || '',
    gts: g, sf: s,
    group: gList || sList ? { gts: gList || [], sf: sList || [] } : null,
    issues,
    synthetic,
  };
}

/**
 * @param gts  GtsOrder[]          (ingest.gtsOrderFromTicket)
 * @param sf   SalesforceRecord[]  (ingest.importSalesforce)
 * @param opts { timeZone, verifications: Verification[], serviceLabel(id) }
 */
export function reconcile(gts, sf, opts = {}) {
  const { timeZone = 'America/New_York', verifications = [], serviceLabel = (id) => id || 'service' } = opts;
  const out = [];
  const byKey = new Map();
  const add = (k, side, x) => { if (!byKey.has(k)) byKey.set(k, { g: [], s: [] }); byKey.get(k)[side].push(x); };
  const looseG = []; const looseS = [];
  for (const g of gts) (g.orderKey ? add(g.orderKey, 'g', g) : looseG.push(g));
  for (const s of sf) (s.orderKey ? add(s.orderKey, 's', s) : looseS.push(s));

  const pair = (g, s) => { const r = base(RECON.MATCHED, { g, s }); Object.assign(r, evalPair(g, s)); out.push(r); };
  const gOnly = (g, extra = []) => out.push(base(RECON.GTS_ONLY, { g, issues: [issue('no_salesforce_record', 'salesforce'), ...extra] }));
  const sOnly = (s, extra = []) => out.push(base(RECON.SALESFORCE_ONLY, { s, issues: [issue('no_gts_ticket', 'gts'), ...extra] }));

  for (const [key, { g: G, s: S }] of byKey) {
    if (G.length && !S.length) { G.forEach((g) => gOnly(g, G.length > 1 ? [issue('other_visit', 'gts')] : [])); continue; }
    if (S.length && !G.length) { S.forEach((s) => sOnly(s)); continue; }
    if (G.length === 1 && S.length === 1) { pair(G[0], S[0]); continue; }
    // several on one order — pair only when each side has exactly one same-day partner
    const day = (x) => dayIn(x.createdAt || x.openedAt || x.completedAt, timeZone);
    const cand = new Map(G.map((g) => [g.id, S.filter((s) => day(s) && day(s) === day(g))]));
    const claimed = new Map();
    for (const s of S) claimed.set(s.id, G.filter((g) => cand.get(g.id).includes(s)).length);
    const clean = G.every((g) => cand.get(g.id).length <= 1) && S.every((s) => claimed.get(s.id) <= 1);
    const pairs = clean ? G.filter((g) => cand.get(g.id).length === 1).map((g) => [g, cand.get(g.id)[0]]) : [];
    if (!clean || !pairs.length) {
      out.push(base(RECON.CONFLICT, { key, gList: G, sList: S, issues: [issue('duplicate_order', 'both')] }));
      continue;
    }
    const usedS = new Set(pairs.map(([, s]) => s.id));
    pairs.forEach(([g, s]) => pair(g, s));
    G.filter((g) => !pairs.some(([pg]) => pg === g)).forEach((g) => gOnly(g, [issue('other_visit', 'gts')]));
    S.filter((s) => !usedS.has(s.id)).forEach((s) => sOnly(s, [issue('other_visit', 'salesforce')]));
  }

  // no usable order number — try an exact Case number, otherwise hand to a person
  const caseIdx = new Map();
  for (const s of sf) if (s.caseNumber) caseIdx.set(s.caseNumber, [...(caseIdx.get(s.caseNumber) || []), s]);
  const pairedS = new Set(out.filter((r) => r.sf).map((r) => r.sf.id));
  for (const g of looseG) {
    const hit = g.caseNumber ? (caseIdx.get(g.caseNumber) || []).filter((s) => !pairedS.has(s.id)) : [];
    if (hit.length === 1) { pairedS.add(hit[0].id); pair(g, hit[0]); continue; }
    if (g.orderNumber) out.push(base(RECON.CONFLICT, { g, issues: [issue('unreadable_order_number', 'gts'), ...(g.orderIssues || []).filter((c) => ISSUE_TEXT[c]).map((c) => issue(c, 'gts'))] }));
    else out.push(base(RECON.GTS_ONLY, { g, issues: [issue('no_order_number', 'gts')] }));
  }
  for (const s of looseS) {
    if (pairedS.has(s.id)) continue;
    if (s.orderNumber) out.push(base(RECON.CONFLICT, { s, issues: [issue('unreadable_order_number', 'salesforce'), ...(s.issues || []).filter((c) => c === 'excel_scientific').map((c) => issue(c, 'salesforce'))] }));
    else sOnly(s, [issue('no_order_number', 'salesforce')]);
  }

  // near-identical order numbers on the two unpaired sides → one CONFLICT, not two orphans
  const gO = out.filter((r) => r.status === RECON.GTS_ONLY && r.gts?.orderKey);
  const sO = out.filter((r) => r.status === RECON.SALESFORCE_ONLY && r.sf?.orderKey);
  const absorbed = new Set();
  for (const gr of gO) {
    const gDay = dayIn(gr.gts.createdAt, timeZone);
    const hits = sO.filter((sr) => !absorbed.has(sr.id) && nearMatch(gr.gts.orderKey, sr.sf.orderKey)
      && (nearMatch(gr.gts.orderKey, sr.sf.orderKey) === 'leading_zeros' || !gDay || dayIn(sr.sf.openedAt || sr.sf.completedAt, timeZone) === gDay));
    if (!hits.length) continue;
    absorbed.add(gr.id); hits.forEach((h) => absorbed.add(h.id));
    const kinds = [...new Set(hits.map((h) => nearMatch(gr.gts.orderKey, h.sf.orderKey)))];
    out.push(base(RECON.CONFLICT, { key: gr.gts.orderKey, gList: [gr.gts], sList: hits.map((h) => h.sf), issues: [issue('near_match', 'both', { kinds, candidates: hits.map((h) => h.sf.orderKey) })] }));
  }
  const records = out.filter((r) => !absorbed.has(r.id));

  // verification + proposals
  const vByGts = new Map();
  for (const v of verifications) if (v?.gtsId) vByGts.set(v.gtsId, [...(vByGts.get(v.gtsId) || []), v]);
  for (const r of records) {
    r.gtsFingerprint = gtsFingerprint(r.gts);
    r.sfFingerprint = sfFingerprint(r.sf);
    if (r.status === RECON.MATCHED && r.gts) {
      const v = (vByGts.get(r.gts.id) || []).find((x) => x.gtsFingerprint === r.gtsFingerprint
        && (!x.sfFingerprint || x.sfFingerprint === r.sfFingerprint)
        && (!x.synthetic || r.synthetic));
      if (v) { r.status = RECON.VERIFIED; r.verifiedBy = v.by || null; r.verifiedAt = v.at || null; r.verifiedVia = v.via || 'human'; }
    }
    r.proposal = proposalFor(r, r.gts, r.sf, serviceLabel);
  }
  records.sort((a, b) => RECON_META[a.status].rank - RECON_META[b.status].rank || String(a.orderKey || '').localeCompare(String(b.orderKey || '')));
  return records;
}

export function summarize(records) {
  const counts = Object.fromEntries(Object.keys(RECON).map((k) => [k, 0]));
  for (const r of records) counts[r.status] += 1;
  const total = records.length;
  const ok = counts.MATCHED + counts.VERIFIED;
  return { total, counts, matchRate: total ? ok / total : null, exceptions: total - ok, proposable: records.filter((r) => r.proposal && !r.proposal.blockers.length).length };
}
