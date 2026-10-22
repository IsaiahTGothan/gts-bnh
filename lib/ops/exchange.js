// ═══════════════════════════════════════════════════════════════════════════
//  GTS OPS — EXCHANGE WITH CLAWSON (Phase 7)
//
//  GTS Hub → Clawson : "finalization-request"  (approved review items only)
//  Clawson → GTS Hub : "finalization-result"   (what it did, read-back verified)
//
//  Files, not a live link: a person carries the JSON between the two apps, so
//  neither side needs credentials for the other. Import is idempotent — the
//  same result file imported twice changes nothing.
// ═══════════════════════════════════════════════════════════════════════════
import { ACTIONS, CONTRACT, OUTCOME, REVIEW, hash, validateBundle } from './schema.js';

/**
 * @param queue  reviewQueue() output
 * @param meta   { by, store, station }
 */
export function buildFinalizationRequest(queue, { by, store = 'B&H', station = 'GTS Counter', at } = {}) {
  const ready = queue.filter((q) => (q.status === REVIEW.APPROVED || q.status === REVIEW.EDITED) && !q.stale && q.proposal && !q.proposal.blockers?.length);
  const createdAt = at || new Date().toISOString();
  const items = ready.map((q) => {
    const p = q.proposal; const sf = q.rec.sf;
    const approvals = (q.saved?.history || []).filter((h) => h.action === 'approve' || h.action === 'edit').map((h) => ({ by: h.by, at: h.at, action: h.action }));
    return {
      itemId: q.id,
      gtsId: q.rec.gts.id,
      gtsTag: q.rec.gts.tag,
      gtsFingerprint: q.rec.gtsFingerprint,
      reconStatus: q.rec.status,
      action: p.action,
      orderNumber: p.orderNumber,
      sfCaseNumber: p.sfCaseNumber || null,
      sfTaskId: p.sfTaskId || null,
      subject: p.subject,
      description: p.description,
      serviceType: p.serviceType,
      tech: p.tech,
      completedAt: p.completedAt,
      laborMinutes: p.laborMinutes,
      // what Salesforce must look like before Clawson touches it — anything else = stale, skip
      expected: p.action === ACTIONS.COMPLETE_TASK
        ? { taskExists: true, taskId: sf?.taskId || null, taskCompleted: false }
        : { taskExists: false },
      approvals,
      synthetic: !!q.rec.synthetic,
    };
  });
  const id = `fr_${hash(`${createdAt}|${items.map((i) => `${i.itemId}:${i.gtsFingerprint}`).join(',')}`)}`;
  return {
    contract: CONTRACT, kind: 'finalization-request', id, createdAt, createdBy: by || null, store, station,
    synthetic: items.length > 0 && items.every((i) => i.synthetic),
    containsSynthetic: items.some((i) => i.synthetic),
    rules: { requireDryRunFirst: true, unix: 'never', maxItems: 50 },
    items,
  };
}

/** Validates a Clawson result file. */
export function validateResult(b) {
  const errors = validateBundle(b, 'finalization-result');
  if (errors.length) return errors;
  if (!b.runId) errors.push('missing runId');
  if (!['dry-run', 'live'].includes(b.mode)) errors.push('mode must be dry-run or live');
  b.items.forEach((it, i) => {
    if (!it.itemId) errors.push(`items[${i}] missing itemId`);
    if (!Object.values(OUTCOME).includes(it.outcome)) errors.push(`items[${i}] bad outcome ${JSON.stringify(it.outcome)}`);
  });
  return errors;
}

/**
 * Merge a result file into the stored results (state.opsResults). Idempotent.
 * Returns { ok, results, added, duplicates, errors }.
 */
export function importFinalizationResult(bundle, existing = [], { importedBy, at } = {}) {
  const errors = validateResult(bundle);
  if (errors.length) return { ok: false, errors, results: existing, added: 0, duplicates: 0 };
  const have = new Set(existing.map((r) => r.id));
  const now = at || new Date().toISOString();
  const fresh = [];
  let duplicates = 0;
  for (const it of bundle.items) {
    const id = `${bundle.runId}:${it.itemId}`;
    if (have.has(id)) { duplicates += 1; continue; }
    have.add(id);
    fresh.push({
      id, runId: bundle.runId, requestId: bundle.requestId || null, mode: bundle.mode, driver: bundle.driver || 'unknown',
      synthetic: !!(bundle.synthetic || it.synthetic || bundle.driver === 'synthetic'),
      itemId: it.itemId, gtsId: it.gtsId || null, gtsFingerprint: it.gtsFingerprint || null, orderNumber: it.orderNumber || null,
      action: it.action || null, outcome: it.outcome, message: it.message || '',
      before: it.before || null, after: it.after || null, verifiedAt: it.verifiedAt || null,
      operator: bundle.operator || null, finishedAt: bundle.finishedAt || null,
      importedAt: now, importedBy: importedBy || null, updatedAt: now,
    });
  }
  return { ok: true, errors: [], results: [...existing, ...fresh], added: fresh.length, duplicates };
}

/** Live, read-back-verified Clawson results → verifications for reconcile(). Dry runs never verify anything. */
export function verificationsFromResults(results = []) {
  return results
    .filter((r) => !r.deletedAt && r.mode === 'live' && r.outcome === OUTCOME.VERIFIED && r.gtsId && r.gtsFingerprint)
    .map((r) => ({ gtsId: r.gtsId, gtsFingerprint: r.gtsFingerprint, by: r.operator || 'Clawson', at: r.verifiedAt || r.finishedAt, via: `clawson:${r.driver}`, synthetic: r.synthetic }));
}

/** Latest result per review item, for the queue UI. */
export function latestResultByItem(results = []) {
  const m = new Map();
  for (const r of results) if (!r.deletedAt) { const p = m.get(r.itemId); if (!p || String(r.importedAt) > String(p.importedAt)) m.set(r.itemId, r); }
  return m;
}
