// ═══════════════════════════════════════════════════════════════════════════
//  GTS OPS — HUMAN REVIEW QUEUE (Phase 3)
//
//  Every exception a reconciliation finds lands here. Nothing leaves GTS Hub
//  for Salesforce unless a named person approved this exact version of it.
//
//  Review record (synced in state.opsReviews, one per GTS ticket):
//    { id, gtsId, reconId, orderKey, status, proposal, approvedFingerprint,
//      verification?, history: [{ at, by, action, note, before, after }], updatedAt }
//
//  If the GTS ticket changes after approval (fingerprint differs) the
//  approval is void and the item drops back to pending — no stale pushes.
// ═══════════════════════════════════════════════════════════════════════════
import { RECON, REVIEW, hash } from './schema.js';

const QUEUE_STATUSES = new Set([RECON.MISSING_TASK, RECON.GTS_ONLY, RECON.INCOMPLETE, RECON.CONFLICT, RECON.SALESFORCE_ONLY]);
export const DESC_MIN = 3;

export const reviewIdFor = (rec) => `rv_${rec.gts?.id ? `g_${rec.gts.id}` : hash(rec.id)}`;

/** Join reconciliation output with saved decisions → the queue a person works through. */
export function reviewQueue(records, reviews = []) {
  const byId = new Map(reviews.filter((r) => !r.deletedAt).map((r) => [r.id, r]));
  return records.filter((r) => QUEUE_STATUSES.has(r.status)).map((rec) => {
    const id = reviewIdFor(rec);
    const saved = byId.get(id) || null;
    let status = saved?.status || REVIEW.PENDING;
    const approved = status === REVIEW.APPROVED || status === REVIEW.EDITED;
    const stale = !!(approved && saved.approvedFingerprint && saved.approvedFingerprint !== rec.gtsFingerprint);
    if (stale) status = REVIEW.PENDING;
    return {
      id, rec, saved, status, stale,
      proposal: approved && !stale && saved.proposal ? saved.proposal : rec.proposal,
      canApprove: !!rec.proposal && !rec.proposal.blockers.length,
    };
  });
}

function entry(by, action, extra = {}) {
  return { at: extra.at || new Date().toISOString(), by, action, ...(extra.note ? { note: extra.note } : {}), ...(extra.before ? { before: extra.before } : {}), ...(extra.after ? { after: extra.after } : {}) };
}

/**
 * Apply a decision. Returns { ok, review } or { ok:false, error }. Never mutates `prev`.
 *  action: 'approve' | 'edit' | 'reject' | 'investigate' | 'reopen' | 'verify'
 */
export function decide(prev, rec, action, { by, note = '', edits = null, at } = {}) {
  if (!by) return { ok: false, error: 'Pick who you are first — every decision is signed.' };
  const id = reviewIdFor(rec);
  const base = prev || { id, gtsId: rec.gts?.id || null, reconId: rec.id, orderKey: rec.orderKey, status: REVIEW.PENDING, history: [] };
  const now = at || new Date().toISOString();
  const next = { ...base, reconId: rec.id, orderKey: rec.orderKey, updatedAt: now, history: [...(base.history || [])] };
  const n = String(note || '').trim();

  switch (action) {
    case 'approve': {
      if (!rec.proposal) return { ok: false, error: 'Nothing to approve — this record has no proposed Salesforce change.' };
      if (rec.proposal.blockers.length) return { ok: false, error: rec.proposal.blockers.join(' ') };
      next.status = REVIEW.APPROVED; next.proposal = { ...rec.proposal }; next.approvedFingerprint = rec.gtsFingerprint;
      next.history.push(entry(by, 'approve', { at: now, note: n }));
      break;
    }
    case 'edit': {
      if (!rec.proposal) return { ok: false, error: 'Nothing to edit — this record has no proposed Salesforce change.' };
      if (rec.proposal.blockers.length) return { ok: false, error: rec.proposal.blockers.join(' ') };
      const subject = String(edits?.subject ?? rec.proposal.subject).trim();
      const description = String(edits?.description ?? rec.proposal.description).trim();
      if (!subject) return { ok: false, error: 'Subject can’t be empty.' };
      if (description.length < DESC_MIN) return { ok: false, error: 'Describe the work that was actually done.' };
      if (!n) return { ok: false, error: 'Say why you edited it (one line is fine).' };
      const before = { subject: rec.proposal.subject, description: rec.proposal.description };
      next.status = REVIEW.EDITED; next.proposal = { ...rec.proposal, subject, description, editedBy: by }; next.approvedFingerprint = rec.gtsFingerprint;
      next.history.push(entry(by, 'edit', { at: now, note: n, before, after: { subject, description } }));
      break;
    }
    case 'reject':
    case 'investigate': {
      if (!n) return { ok: false, error: action === 'reject' ? 'Say why it’s rejected.' : 'Say what needs investigating.' };
      next.status = action === 'reject' ? REVIEW.REJECTED : REVIEW.INVESTIGATING;
      next.proposal = null; next.approvedFingerprint = null;
      next.history.push(entry(by, action, { at: now, note: n }));
      break;
    }
    case 'reopen': {
      next.status = REVIEW.PENDING; next.proposal = null; next.approvedFingerprint = null;
      next.history.push(entry(by, 'reopen', { at: now, note: n }));
      break;
    }
    case 'verify': {
      if (rec.status !== RECON.MATCHED) return { ok: false, error: 'Only a Matched record can be verified.' };
      next.verification = { gtsId: rec.gts.id, gtsFingerprint: rec.gtsFingerprint, sfFingerprint: rec.sfFingerprint, by, at: now, via: 'human', synthetic: !!rec.synthetic };
      next.history.push(entry(by, 'verify', { at: now, note: n }));
      break;
    }
    case 'unverify': {
      next.verification = null;
      next.history.push(entry(by, 'unverify', { at: now, note: n }));
      break;
    }
    default: return { ok: false, error: `Unknown action ${action}` };
  }
  return { ok: true, review: next };
}

/** Human verifications in the shape reconcile() expects. */
export function verificationsFromReviews(reviews = []) {
  return reviews.filter((r) => !r.deletedAt && r.verification).map((r) => r.verification);
}
