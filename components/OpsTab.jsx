'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — OPS INTELLIGENCE (V4.3)
//  Salesforce export ⇄ GTS tickets → reconciliation → human review queue →
//  turnaround analytics → end-of-day reports → hand-off to Clawson.
//
//  Review-first: nothing here writes to Salesforce. Approved fixes leave as a
//  file for Clawson's supervised runner; its results come back as a file.
//  The Sandbox runs everything on synthetic data that is never saved.
//  Engine + rules: lib/ops/*  ·  contract: docs/ops/CONTRACT.md
// ═══════════════════════════════════════════════════════════════════════════
import React, { useMemo, useRef, useState } from 'react';
import { RECON, RECON_META, REVIEW, dayIn, zonedISO } from '../lib/ops/schema';
import { gtsOrdersFromState, importSalesforce } from '../lib/ops/ingest';
import { reconcile, summarize } from '../lib/ops/reconcile';
import { DESC_MIN, decide, reviewQueue, verificationsFromReviews } from '../lib/ops/review';
import { buildFinalizationRequest, importFinalizationResult, latestResultByItem, verificationsFromResults } from '../lib/ops/exchange';
import { fmtMs, turnaround } from '../lib/ops/turnaround';
import { buildEodReport, compactReport, reportCSV, reportExcelXML, reportPrintHTML, searchReports } from '../lib/ops/report';
import { buildSyntheticDay } from '../lib/ops/fixtures';
import { SERVICE_TYPES, serviceLabel, techName } from '../lib/constants';
import { printHTML } from '../lib/print';
import { downloadText, matches } from '../lib/utils';
import { useStore } from './GTSApp';
import { BarList, Btn, Chip, EmptyState, Field, Icon, Input, KPI, Modal, Panel, Segmented, Select, Textarea } from './ui';

const VIEWS = [
  { id: 'reconcile', label: 'Reconcile', icon: 'layers' },
  { id: 'review', label: 'Review queue', icon: 'check-circle' },
  { id: 'turnaround', label: 'Turnaround', icon: 'timer' },
  { id: 'reports', label: 'EOD reports', icon: 'printer' },
  { id: 'clawson', label: 'Clawson', icon: 'send' },
];
const REVIEW_LABEL = { pending: 'Pending', approved: 'Approved', edited: 'Approved (edited)', rejected: 'Rejected', investigating: 'Needs investigation' };
const REVIEW_TONE = { pending: 'amber', approved: 'green', edited: 'green', rejected: 'red', investigating: 'violet' };

function dayBounds(from, to, tz) {
  const [a, b, c] = from.split('-').map(Number);
  const [x, y, z] = to.split('-').map(Number);
  return { from: zonedISO(a, b, c, 0, 0, 0, tz), to: new Date(Date.parse(zonedISO(x, y, z, 0, 0, 0, tz)) + 86_400_000).toISOString() };
}
const ReconChip = ({ status }) => <Chip size="sm" tone={RECON_META[status]?.tone}>{RECON_META[status]?.label || status}</Chip>;

export default function OpsTab() {
  const { state, api, toast, isManager, now } = useStore();
  const tz = state.management?.timezone || 'America/New_York';
  const today = dayIn(new Date(now).toISOString(), tz);
  const [view, setView] = useState('reconcile');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [sandbox, setSandbox] = useState(false);
  // sandbox keeps its own, never-synced copies
  const [sbx, setSbx] = useState({ reviews: [], results: [], reports: [] });
  const me = state.settings.currentTech;
  const orderPattern = state.management?.orderPattern || undefined;

  const synthetic = useMemo(() => (sandbox ? buildSyntheticDay(today, tz) : null), [sandbox, today, tz]);
  const sbxSf = useMemo(() => (synthetic ? importSalesforce(synthetic.sfCSV, { synthetic: true, timeZone: tz, batchId: 'sandbox' }).records : []), [synthetic, tz]);

  const reviews = sandbox ? sbx.reviews : (state.opsReviews || []).filter((r) => !r.deletedAt);
  const results = sandbox ? sbx.results : (state.opsResults || []).filter((r) => !r.deletedAt);
  const reports = sandbox ? sbx.reports : (state.opsReports || []);
  const sfAll = sandbox ? sbxSf : (state.sfRecords || []).filter((r) => !r.deletedAt);

  const range = useMemo(() => dayBounds(sandbox ? today : from, sandbox ? today : (to < from ? from : to), tz), [from, to, tz, sandbox, today]);
  const data = useMemo(() => {
    const gts = gtsOrdersFromState(sandbox ? { tickets: synthetic.tickets } : state, { ...range, orderPattern });
    const inRange = (s) => { const w = s.openedAt || s.completedAt; return !w || (w >= range.from && w < range.to); };
    const sf = sfAll.filter(inRange);
    const verifications = [...verificationsFromReviews(reviews), ...verificationsFromResults(results)];
    const records = reconcile(gts, sf, { timeZone: tz, verifications, serviceLabel });
    return { gts, sf, records, queue: reviewQueue(records, reviews), summary: summarize(records) };
  }, [state, sandbox, synthetic, sfAll, reviews, results, range, tz, orderPattern]);

  const saveReview = (review, summary) => {
    if (sandbox) setSbx((s) => ({ ...s, reviews: [review, ...s.reviews.filter((r) => r.id !== review.id)] }));
    else api.opsSaveReview(review, summary);
  };
  const pending = data.queue.filter((q) => q.status === REVIEW.PENDING).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Ops intelligence · review-first · nothing here writes to Salesforce</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Reconcile. Review. <span className="grad-text">Report.</span></h1>
          <p className="page-sub">Import the day’s Salesforce export, see every order that doesn’t line up with GTS, decide what to fix, and hand approved fixes to Clawson. Turnaround and end-of-day reports come from the same data.</p>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          {!sandbox && <>
            <Input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value || today)} style={{ width: 150 }} aria-label="From" />
            <span className="faint">→</span>
            <Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value || today)} style={{ width: 150 }} aria-label="To" />
          </>}
          <Btn size="sm" variant={sandbox ? 'primary' : 'default'} icon="sparkles" onClick={() => setSandbox((v) => !v)} title="Run everything on a synthetic test day. Nothing is saved or synced.">{sandbox ? 'Leave sandbox' : 'Sandbox'}</Btn>
        </div>
      </div>

      {sandbox && <div className="ops-banner is-synthetic mb-4"><Icon name="alert-triangle" /> <b>SYNTHETIC SANDBOX</b> — fake orders (99000…) for practice and testing. Decisions here are not saved or synced.</div>}

      <div className="row wrap mb-4" style={{ justifyContent: 'space-between' }}>
        <Segmented value={view} onChange={setView} options={VIEWS.map((v) => (v.id === 'review' ? { ...v, count: pending, hot: pending > 0 } : v))} />
        <span className="faint" style={{ fontSize: 12 }}>{data.gts.length} GTS ticket{data.gts.length === 1 ? '' : 's'} · {data.sf.length} Salesforce row{data.sf.length === 1 ? '' : 's'} in range</span>
      </div>

      {view === 'reconcile' && <ReconcileView data={data} sandbox={sandbox} tz={tz} orderPattern={orderPattern} onReview={() => setView('review')} saveReview={saveReview} me={me} />}
      {view === 'review' && <ReviewView data={data} results={results} saveReview={saveReview} me={me} isManager={isManager} hasPin={!!state.management?.pinHash} />}
      {view === 'turnaround' && <TurnaroundView records={data.records} tz={tz} />}
      {view === 'reports' && <ReportsView data={data} results={results} reports={reports} day={sandbox ? today : (to < from ? from : to)} tz={tz} me={me} sandbox={sandbox}
        onSave={(r) => (sandbox ? setSbx((s) => ({ ...s, reports: [r, ...s.reports] })) : api.opsSaveReport(r))} toast={toast} storeLabel={state.settings.storeLabel} station={state.settings.stationName} />}
      {view === 'clawson' && <ClawsonView data={data} results={results} me={me} sandbox={sandbox} toast={toast}
        setResults={(list, msg) => (sandbox ? setSbx((s) => ({ ...s, results: list })) : api.opsSetResults(list, msg))} storeLabel={state.settings.storeLabel} station={state.settings.stationName} />}
    </>
  );
}

// ─── Reconcile ─────────────────────────────────────────────────────────────
function ReconcileView({ data, sandbox, tz, orderPattern, onReview, saveReview, me }) {
  const { state, api, toast } = useStore();
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [last, setLast] = useState(null);
  const fileRef = useRef(null);
  const S = data.summary;

  const runImport = (raw, name) => {
    const res = importSalesforce(raw, { timeZone: tz, orderPattern, batchId: `sfb_${Date.now().toString(36)}` });
    setLast({ ...res, name });
    if (!res.records.length) { toast(res.errors[0]?.message || 'Nothing imported', { tone: 'error' }); return; }
    api.opsImportSalesforce(res.records.map(({ row, ...r }) => r), name);
    toast(`${res.records.length} Salesforce rows imported${res.errors.length ? ` · ${res.errors.length} warning${res.errors.length === 1 ? '' : 's'}` : ''}`, { tone: res.errors.length ? 'warning' : 'success' });
    setPaste(false); setText('');
  };
  const onFile = async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) runImport(await f.text(), f.name); };

  const rows = data.records.filter((r) => (!filter || r.status === filter) && matches(q, r.orderKey, r.orderNumber, r.gts?.tag, r.gts?.description, r.sf?.caseNumber, r.sf?.taskId, r.sf?.taskSubject, ...(r.group?.gts || []).map((g) => g.tag)));
  const batches = useMemo(() => {
    const m = new Map();
    for (const r of state.sfRecords || []) if (!r.deletedAt) m.set(r.batchId, { id: r.batchId, n: (m.get(r.batchId)?.n || 0) + 1, at: r.importedAt });
    return [...m.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [state.sfRecords]);

  const verify = (rec) => {
    const r = decide(data.queue.find((x) => x.rec.id === rec.id)?.saved || (state.opsReviews || []).find((x) => x.gtsId === rec.gts?.id) || null, rec, rec.status === RECON.VERIFIED ? 'unverify' : 'verify', { by: me ? techName(me) : null });
    if (!r.ok) { toast(r.error, { tone: 'error' }); return; }
    saveReview(r.review, rec.status === RECON.VERIFIED ? 'Verification removed' : 'Verified against Salesforce');
  };

  return (
    <>
      <div className="grid cols-4 mb-4">
        <KPI label="Records" value={S.total} icon="layers" />
        <KPI label="Matched + verified" value={S.counts.MATCHED + S.counts.VERIFIED} icon="check-circle" tone="green" />
        <KPI label="Exceptions" value={S.exceptions} icon="alert-triangle" tone={S.exceptions ? 'amber' : undefined} onClick={() => setFilter('')} />
        <KPI label="Match rate" value={S.matchRate == null ? '—' : `${Math.round(S.matchRate * 100)}%`} icon="activity" />
      </div>

      {!sandbox && (
        <Panel title="Salesforce export" icon="upload" className="mb-4"
          sub="Export a Salesforce report (Tasks or Cases with the order number) as CSV and drop it here. Customer names, emails and phones in the file are ignored — only order, case, task, status, times and owner are kept."
          actions={<div className="row" style={{ gap: 6 }}>
            <input ref={fileRef} type="file" accept=".csv,.txt,.json,text/csv,application/json" hidden onChange={onFile} />
            <Btn size="sm" variant="primary" icon="upload" onClick={() => fileRef.current?.click()}>Import CSV</Btn>
            <Btn size="sm" icon="copy" onClick={() => setPaste((v) => !v)}>Paste</Btn>
          </div>}>
          {paste && <div className="mb-3"><Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Order Number,Case Number,Task ID,Subject,Status,Created Date,Completed Date,Assigned To\n…'} /><div className="row mt-2" style={{ gap: 6 }}><Btn size="sm" variant="primary" disabled={!text.trim()} onClick={() => runImport(text, 'Pasted rows')}>Import pasted rows</Btn></div></div>}
          {last && (
            <div className="ops-import-result">
              <b>{last.name}</b>: {last.records.length} row{last.records.length === 1 ? '' : 's'} read
              {last.columns?.map && <span className="faint"> · columns used: {Object.keys(last.columns.map).join(', ') || 'none'}</span>}
              {last.stats?.dropped?.length > 0 && <div className="faint">Not stored (personal data): {last.stats.dropped.join(', ')}</div>}
              {last.errors.length > 0 && <ul className="ops-errors">{last.errors.slice(0, 8).map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}{last.errors.length > 8 && <li>…and {last.errors.length - 8} more</li>}</ul>}
            </div>
          )}
          {batches.length > 0 ? (
            <div className="row wrap mt-2" style={{ gap: 6 }}>
              {batches.slice(0, 6).map((b) => <Chip key={b.id} size="sm" title={`Imported ${new Date(b.at).toLocaleString()}`}>{b.n} rows · {new Date(b.at).toLocaleDateString()}</Chip>)}
              <Btn size="xs" variant="ghost" icon="trash" onClick={() => api.opsClearSalesforce()}>Clear imported rows</Btn>
              <span className="faint" style={{ fontSize: 12 }}>Kept 7 days, synced to every station.</span>
            </div>
          ) : !last && <div className="faint">No export imported yet — every GTS ticket shows as “GTS only” until one is.</div>}
        </Panel>
      )}

      <div className="row wrap mb-3" style={{ gap: 6 }}>
        <button type="button" className={`chip ${!filter ? 'is-accent' : ''}`} onClick={() => setFilter('')}>All {S.total}</button>
        {Object.keys(RECON).map((k) => (S.counts[k] ? <button type="button" key={k} className={`chip is-${RECON_META[k].tone} ${filter === k ? 'is-on' : ''}`} onClick={() => setFilter(filter === k ? '' : k)}>{RECON_META[k].label} {S.counts[k]}</button> : null))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order, ticket, case, task…" style={{ maxWidth: 260, marginLeft: 'auto' }} />
      </div>

      {rows.length ? (
        <div className="table-wrap">
          <table className="table ops-table">
            <thead><tr><th>Status</th><th>Order</th><th>GTS</th><th>Salesforce</th><th>What’s wrong</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const gList = r.group ? r.group.gts : r.gts ? [r.gts] : [];
                const sList = r.group ? r.group.sf : r.sf ? [r.sf] : [];
                return (
                  <tr key={r.id}>
                    <td><ReconChip status={r.status} />{r.synthetic && <Chip size="sm" tone="amber">synthetic</Chip>}</td>
                    <td className="mono">{r.orderKey || <span className="faint">{r.orderNumber || '—'}</span>}</td>
                    <td>{gList.length ? gList.map((g) => <div key={g.id}><b className="mono">{g.tag}</b> <span className="faint">{serviceLabel(g.serviceType)} · {techName(g.tech)}{g.orderKey && r.orderKey !== g.orderKey ? ` · #${g.orderKey}` : ''}</span></div>) : <span className="faint">—</span>}</td>
                    <td>{sList.length ? sList.map((s) => <div key={s.id}><span className="mono">{s.taskId || s.caseNumber || 'no task'}</span> <span className="faint">{s.taskStatus || ''}{s.orderKey && r.orderKey !== s.orderKey ? ` · #${s.orderKey}` : ''}</span></div>) : <span className="faint">—</span>}</td>
                    <td className="ops-issues">{r.issues.map((i) => <div key={i.code}>{i.message}</div>)}{r.verifiedBy && <div className="faint">Verified by {r.verifiedBy}{r.verifiedVia && r.verifiedVia !== 'human' ? ` (${r.verifiedVia})` : ''}</div>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {(r.status === RECON.MATCHED || (r.status === RECON.VERIFIED && r.verifiedVia === 'human')) && <Btn size="xs" icon={r.status === RECON.VERIFIED ? 'undo' : 'shield-check'} onClick={() => verify(r)} title="You checked this order in Salesforce and it’s right">{r.status === RECON.VERIFIED ? 'Unverify' : 'Verify'}</Btn>}
                      {data.queue.some((x) => x.rec.id === r.id) && <Btn size="xs" icon="arrow-right" onClick={onReview}>Review</Btn>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon="layers" title={data.records.length ? 'Nothing matches that filter' : 'No tickets in this range'} desc={data.records.length ? 'Clear the filter or search.' : 'Pick another day, or try the Sandbox to see how it works.'} />}
    </>
  );
}

// ─── Review queue ──────────────────────────────────────────────────────────
function ReviewView({ data, results, saveReview, me, isManager, hasPin }) {
  const { toast } = useStore();
  const [show, setShow] = useState('open');
  const [modal, setModal] = useState(null); // { item, action }
  const latest = useMemo(() => latestResultByItem(results), [results]);
  const groups = { open: (q) => q.status === REVIEW.PENDING || q.status === REVIEW.INVESTIGATING, approved: (q) => q.status === REVIEW.APPROVED || q.status === REVIEW.EDITED, rejected: (q) => q.status === REVIEW.REJECTED, all: () => true };
  const list = data.queue.filter(groups[show]);
  const count = (k) => data.queue.filter(groups[k]).length;
  const by = me ? techName(me) : null;

  const act = (item, action, extra = {}) => {
    if (!by) { toast('Pick who you are first (top right) — every decision is signed.', { tone: 'error' }); return false; }
    if ((action === 'approve' || action === 'edit' || action === 'reject') && !isManager) { toast('A manager has to approve, edit or reject. Unlock Management first.', { tone: 'error' }); return false; }
    const r = decide(item.saved, item.rec, action, { by, ...extra });
    if (!r.ok) { toast(r.error, { tone: 'error' }); return false; }
    saveReview(r.review, `${REVIEW_LABEL[r.review.status] || action}${extra.note ? ` — ${extra.note}` : ''}`);
    toast(`${REVIEW_LABEL[r.review.status] || 'Saved'} · order ${item.rec.orderKey || '—'}`, { tone: 'success' });
    return true;
  };

  return (
    <>
      {!hasPin && <div className="ops-banner mb-3"><Icon name="lock" /> No manager PIN is set, so anyone at the counter can approve. Set one in Management → System to keep approvals with managers.</div>}
      <div className="row wrap mb-3" style={{ gap: 8 }}>
        <Segmented value={show} onChange={setShow} options={[{ id: 'open', label: 'To review', count: count('open'), hot: true }, { id: 'approved', label: 'Approved', count: count('approved') }, { id: 'rejected', label: 'Rejected', count: count('rejected') }, { id: 'all', label: 'All', count: count('all') }]} />
        <span className="faint" style={{ fontSize: 12 }}>Approving only queues the fix for Clawson — Salesforce is not touched from here.</span>
      </div>
      {list.length ? <div className="ops-queue">{list.map((item) => {
        const p = item.proposal; const res = latest.get(item.id);
        return (
          <div className="ops-card" key={item.id}>
            <div className="row wrap" style={{ gap: 8, justifyContent: 'space-between' }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <ReconChip status={item.rec.status} />
                <Chip size="sm" tone={REVIEW_TONE[item.status]}>{REVIEW_LABEL[item.status]}</Chip>
                {item.stale && <Chip size="sm" tone="amber" title="The GTS ticket changed after it was approved">approval void — ticket changed</Chip>}
                {item.rec.synthetic && <Chip size="sm" tone="amber">synthetic</Chip>}
                <b className="mono">Order {item.rec.orderKey || item.rec.orderNumber || '—'}</b>
                {item.rec.gts && <span className="faint">{item.rec.gts.tag} · {serviceLabel(item.rec.gts.serviceType)} · {techName(item.rec.gts.tech)}</span>}
              </div>
              {res && <Chip size="sm" tone={res.outcome === 'verified' ? 'green' : res.outcome === 'planned' ? 'accent' : 'red'} title={res.message}>Clawson {res.mode}: {res.outcome}</Chip>}
            </div>
            <div className="ops-issues mt-2">{item.rec.issues.map((i) => <div key={i.code}>• {i.message}</div>)}</div>
            {p ? (
              <div className="ops-proposal mt-2">
                <div className="eyebrow">{p.action === 'create_task' ? 'Proposed: log the missing GTS task in Salesforce' : 'Proposed: mark the open Salesforce task complete'}</div>
                <div><b>{p.subject}</b></div>
                <div className="ops-desc">{p.description || <i className="faint">no description</i>}</div>
                <div className="faint" style={{ fontSize: 12 }}>Finished {p.completedAt ? new Date(p.completedAt).toLocaleString() : 'unknown'} · hands-on {p.laborMinutes != null ? `${p.laborMinutes} min` : 'unknown'}{p.sfCaseNumber ? ` · Case ${p.sfCaseNumber}` : ''}{p.sfTaskId ? ` · Task ${p.sfTaskId}` : ''}</div>
                {p.blockers?.length > 0 && <div className="ops-blockers">{p.blockers.map((b) => <div key={b}><Icon name="alert-circle" size={12} /> {b}</div>)}</div>}
              </div>
            ) : <div className="faint mt-2" style={{ fontSize: 13 }}>No automatic fix for this one — check it in Salesforce/GTS by hand, then mark it.</div>}
            <div className="row wrap mt-3" style={{ gap: 6 }}>
              {item.canApprove && item.status !== REVIEW.APPROVED && item.status !== REVIEW.EDITED && <Btn size="sm" variant="primary" icon="check" onClick={() => act(item, 'approve')}>Approve</Btn>}
              {item.canApprove && <Btn size="sm" icon="edit" onClick={() => setModal({ item, action: 'edit' })}>Edit & approve</Btn>}
              {item.status !== REVIEW.INVESTIGATING && <Btn size="sm" icon="search" onClick={() => setModal({ item, action: 'investigate' })}>Needs investigation</Btn>}
              {item.status !== REVIEW.REJECTED && <Btn size="sm" variant="ghost" icon="x" onClick={() => setModal({ item, action: 'reject' })}>Reject</Btn>}
              {item.status !== REVIEW.PENDING && <Btn size="sm" variant="ghost" icon="undo" onClick={() => act(item, 'reopen')}>Reopen</Btn>}
            </div>
            {item.saved?.history?.length > 0 && (
              <details className="ops-history mt-2"><summary>History ({item.saved.history.length})</summary>
                {item.saved.history.slice().reverse().map((h, i) => <div key={i}><span className="mono faint">{new Date(h.at).toLocaleString()}</span> <b>{h.by}</b> {h.action}{h.note ? ` — “${h.note}”` : ''}{h.before ? <div className="faint">was: {h.before.description}</div> : null}</div>)}
              </details>
            )}
          </div>
        );
      })}</div> : <EmptyState icon="check-circle" title={show === 'open' ? 'Nothing to review' : 'Nothing here'} desc={show === 'open' ? 'Every order in range matches, or has been decided.' : 'Switch the filter above.'} />}
      {modal && <DecisionModal {...modal} onClose={() => setModal(null)} onSubmit={(extra) => { if (act(modal.item, modal.action, extra)) setModal(null); }} />}
    </>
  );
}

function DecisionModal({ item, action, onClose, onSubmit }) {
  const p = item.proposal || item.rec.proposal;
  const [subject, setSubject] = useState(p?.subject || '');
  const [description, setDescription] = useState(p?.description || '');
  const [note, setNote] = useState('');
  const title = { edit: 'Edit & approve', reject: 'Reject', investigate: 'Needs investigation' }[action];
  const ok = note.trim() && (action !== 'edit' || (subject.trim() && description.trim().length >= DESC_MIN));
  return (
    <Modal title={title} sub={`Order ${item.rec.orderKey || '—'}`} icon={action === 'edit' ? 'edit' : action === 'reject' ? 'x' : 'search'} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!ok} onClick={() => onSubmit(action === 'edit' ? { edits: { subject, description }, note } : { note })}>{title}</Btn></>}>
      {action === 'edit' && <>
        <Field label="Salesforce subject" required><Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={255} /></Field>
        <Field label="What was done" required hint="Only what actually happened at the counter. The original text is kept in the history."><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </>}
      <Field label={action === 'edit' ? 'Why the edit' : action === 'reject' ? 'Why reject it' : 'What needs checking'} required><Input autoFocus={action !== 'edit'} value={note} onChange={(e) => setNote(e.target.value)} placeholder={action === 'reject' ? 'e.g. customer left before service' : action === 'investigate' ? 'e.g. order number looks wrong — check receipt' : 'e.g. fixed a typo'} /></Field>
    </Modal>
  );
}

// ─── Turnaround ────────────────────────────────────────────────────────────
function TurnaroundView({ records, tz }) {
  const [f, setF] = useState({ tech: '', serviceType: '', status: '', includeSynthetic: true });
  const t = useMemo(() => turnaround(records, { timeZone: tz, filters: f }), [records, tz, f]);
  const techs = [...new Set(records.map((r) => r.gts?.tech).filter(Boolean))];
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const D = ({ label, d, tone }) => <KPI label={label} value={d.median == null ? 'unknown' : fmtMs(d.median)} icon="timer" tone={tone} delta={`p90 ${fmtMs(d.p90)} · ${d.n} timed${d.unknown ? ` · ${d.unknown} unknown` : ''}`} />;
  return (
    <>
      <div className="row wrap mb-3" style={{ gap: 8 }}>
        <Select value={f.tech} onChange={(e) => set('tech', e.target.value)} style={{ width: 160 }}><option value="">All techs</option>{techs.map((x) => <option key={x} value={x}>{techName(x)}</option>)}</Select>
        <Select value={f.serviceType} onChange={(e) => set('serviceType', e.target.value)} style={{ width: 160 }}><option value="">All services</option>{SERVICE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
        <Select value={f.status} onChange={(e) => set('status', e.target.value)} style={{ width: 170 }}><option value="">Any status</option>{Object.keys(RECON).map((k) => <option key={k} value={k}>{RECON_META[k].label}</option>)}</Select>
        <label className="row faint" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={f.includeSynthetic} onChange={(e) => set('includeSynthetic', e.target.checked)} /> include synthetic</label>
        {t.synthetic && <Chip size="sm" tone="amber">includes synthetic data</Chip>}
      </div>
      <div className="grid cols-3 mb-4">
        <D label="Elapsed (start → done, median)" d={t.elapsed} />
        <D label="Hands-on labor (clock minus pauses)" d={t.labor} tone="green" />
        <D label="Salesforce opened → completed" d={t.sfElapsed} tone="violet" />
      </div>
      <p className="faint mb-4" style={{ fontSize: 12 }}>“Unknown” means a timestamp is missing (no service clock, still running, or Salesforce gave a date without a time). Unknowns are counted, never estimated.</p>
      <div className="grid cols-2">
        <Panel title="By tech" icon="users" sub="Median elapsed per tech">
          {t.byTech.length ? <BarList items={t.byTech.map((g) => ({ label: `${g.key === '—' ? 'Unassigned' : techName(g.key)} (${g.count})`, value: Math.round((g.elapsed.median || 0) / 60000), color: 'var(--accent)' }))} formatValue={(v) => (v ? `${v}m` : 'unknown')} /> : <EmptyState icon="users" title="No data" />}
        </Panel>
        <Panel title="By service" icon="filter" sub="Elapsed vs labor, medians">
          {t.byType.length ? (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Service</th><th>Count</th><th>Elapsed</th><th>Labor</th><th>Unknown</th></tr></thead>
              <tbody>{t.byType.map((g) => <tr key={g.key}><td>{g.key === '—' ? 'Unspecified' : serviceLabel(g.key)}</td><td className="mono">{g.count}</td><td className="mono">{fmtMs(g.elapsed.median)}</td><td className="mono">{fmtMs(g.labor.median)}</td><td className="mono">{g.elapsed.unknown}</td></tr>)}</tbody>
            </table></div>
          ) : <EmptyState icon="filter" title="No data" />}
        </Panel>
      </div>
      {t.byDay.length > 1 && (
        <Panel title="By day" icon="calendar" className="mt-4">
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Day</th><th>Count</th><th>Elapsed median</th><th>p90</th><th>Labor median</th><th>Unknown</th></tr></thead>
            <tbody>{t.byDay.map((g) => <tr key={g.key}><td className="mono">{g.key}</td><td className="mono">{g.count}</td><td className="mono">{fmtMs(g.elapsed.median)}</td><td className="mono">{fmtMs(g.elapsed.p90)}</td><td className="mono">{fmtMs(g.labor.median)}</td><td className="mono">{g.elapsed.unknown}</td></tr>)}</tbody>
          </table></div>
        </Panel>
      )}
    </>
  );
}

// ─── Reports ───────────────────────────────────────────────────────────────
function ReportsView({ data, results, reports, day, tz, me, sandbox, onSave, toast, storeLabel, station }) {
  const [q, setQ] = useState('');
  const report = useMemo(() => buildEodReport({ day, records: data.records, queue: data.queue, results, by: me ? techName(me) : null, store: storeLabel || 'B&H', station: station || 'GTS Counter', timeZone: tz, techName, serviceLabel }), [day, data, results, me, storeLabel, station, tz]);
  const base = `gts-eod-${day}${report.synthetic ? '-SYNTHETIC' : ''}`;
  const dl = (r, kind) => {
    if (kind === 'json') downloadText(`${base}.json`, JSON.stringify(r, null, 2), 'application/json');
    if (kind === 'csv') downloadText(`${base}.csv`, reportCSV(r), 'text/csv');
    if (kind === 'xls') downloadText(`${base}.xls`, reportExcelXML(r), 'application/vnd.ms-excel');
    if (kind === 'pdf') printHTML(reportPrintHTML(r));
  };
  const history = searchReports(reports, q);
  return (
    <>
      <Panel title={`End of day — ${day}`} icon="printer" className="mb-4" sub={`${report.summary.total} records · ${report.summary.exceptions} exceptions · elapsed median ${fmtMs(report.turnaround.elapsed.median)} · labor median ${fmtMs(report.turnaround.labor.median)}`}
        actions={<div className="row wrap" style={{ gap: 6 }}>
          <Btn size="sm" variant="primary" icon="archive" onClick={() => { onSave(compactReport(report)); toast(`Report for ${day} saved to history`, { tone: 'success' }); }}>Save to history</Btn>
          <Btn size="sm" icon="printer" onClick={() => dl(report, 'pdf')} title="Opens the print dialog — choose “Save as PDF”">PDF</Btn>
          <Btn size="sm" icon="download" onClick={() => dl(report, 'xls')}>Excel</Btn>
          <Btn size="sm" icon="download" onClick={() => dl(report, 'csv')}>CSV</Btn>
          <Btn size="sm" icon="code" onClick={() => dl(report, 'json')}>JSON</Btn>
        </div>}>
        {report.synthetic && <div className="ops-banner is-synthetic mb-3"><Icon name="alert-triangle" /> {report.allSynthetic ? 'Synthetic test data — every export is labelled SYNTHETIC.' : 'Contains synthetic records — they are marked in every export.'}</div>}
        <div className="row wrap" style={{ gap: 6 }}>{Object.entries(report.summary.counts).map(([k, v]) => <Chip key={k} size="sm" tone={RECON_META[k].tone}>{RECON_META[k].label} {v}</Chip>)}</div>
        <div className="faint mt-2" style={{ fontSize: 12 }}>Review: {report.review.pending} pending · {report.review.approved} approved · {report.review.investigating} investigating · {report.review.rejected} rejected · Clawson verified {report.finalization.verified}</div>
      </Panel>
      <Panel title="Report history" icon="history" sub={sandbox ? 'Sandbox history — not saved' : 'Synced to every station. Search by day, order number, ticket, tech or issue.'} actions={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports…" style={{ width: 220 }} />}>
        {history.length ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Day</th><th>By</th><th>Records</th><th>Exceptions</th><th>Match</th><th>Elapsed median</th><th /></tr></thead>
            <tbody>{history.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.day} {r.synthetic && <Chip size="sm" tone="amber">synthetic</Chip>}</td>
                <td>{r.generatedBy || '—'}<div className="faint" style={{ fontSize: 11 }}>{new Date(r.generatedAt).toLocaleString()}</div></td>
                <td className="mono">{r.summary.total}</td>
                <td className="mono">{r.summary.exceptions}</td>
                <td className="mono">{r.summary.matchRate == null ? '—' : `${Math.round(r.summary.matchRate * 100)}%`}</td>
                <td className="mono">{fmtMs(r.turnaround.elapsed.median)}</td>
                <td style={{ whiteSpace: 'nowrap' }}><Btn size="xs" icon="printer" onClick={() => dl({ ...r, rows: r.exceptions }, 'pdf')}>PDF</Btn> <Btn size="xs" icon="download" onClick={() => dl({ ...r, rows: r.exceptions }, 'csv')}>CSV</Btn> <Btn size="xs" icon="code" onClick={() => dl(r, 'json')}>JSON</Btn></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyState icon="history" title={q ? 'No report matches' : 'No saved reports yet'} desc="Save today’s report above — history keeps the summary and every exception." />}
      </Panel>
    </>
  );
}

// ─── Clawson hand-off ──────────────────────────────────────────────────────
function ClawsonView({ data, results, me, sandbox, toast, setResults, storeLabel, station }) {
  const fileRef = useRef(null);
  const request = useMemo(() => buildFinalizationRequest(data.queue, { by: me ? techName(me) : null, store: storeLabel || 'B&H', station: station || 'GTS Counter' }), [data.queue, me, storeLabel, station]);
  const runs = useMemo(() => {
    const m = new Map();
    for (const r of results) { const x = m.get(r.runId) || { runId: r.runId, mode: r.mode, driver: r.driver, synthetic: r.synthetic, at: r.finishedAt || r.importedAt, outcomes: {} }; x.outcomes[r.outcome] = (x.outcomes[r.outcome] || 0) + 1; m.set(r.runId, x); }
    return [...m.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [results]);
  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    let bundle;
    try { bundle = JSON.parse(await f.text()); } catch { toast('That file isn’t JSON.', { tone: 'error' }); return; }
    const r = importFinalizationResult(bundle, results, { importedBy: me ? techName(me) : null });
    if (!r.ok) { toast(`Not a Clawson result file: ${r.errors[0]}`, { tone: 'error' }); return; }
    if (!r.added) { toast(`Already imported (${r.duplicates} item${r.duplicates === 1 ? '' : 's'}) — nothing changed.`, { tone: 'info' }); return; }
    setResults(r.results, `${r.added} result${r.added === 1 ? '' : 's'} from run ${bundle.runId} (${bundle.mode}${bundle.driver === 'synthetic' ? ', synthetic' : ''})`);
    toast(`${r.added} result${r.added === 1 ? '' : 's'} imported${r.duplicates ? ` · ${r.duplicates} already had` : ''}`, { tone: 'success' });
  };
  return (
    <div className="grid cols-2">
      <Panel title="1 · Send approved fixes to Clawson" icon="send" sub="Downloads a file with only the items a manager approved (current version). Open it in Clawson → GTS Ops: dry run first, then a supervised live run.">
        <div className="row wrap" style={{ gap: 8 }}>
          <Btn variant="primary" icon="download" disabled={!request.items.length} onClick={() => downloadText(`gts-finalize-${request.id}${request.synthetic ? '-SYNTHETIC' : ''}.json`, JSON.stringify(request, null, 2), 'application/json')}>Download request ({request.items.length})</Btn>
          {request.containsSynthetic && <Chip size="sm" tone="amber">synthetic</Chip>}
        </div>
        {request.items.length ? <ul className="ops-list mt-3">{request.items.map((i) => <li key={i.itemId}><span className="mono">{i.orderNumber}</span> — {i.action === 'create_task' ? 'log missing task' : 'complete open task'} · <span className="faint">{i.subject}</span></li>)}</ul>
          : <div className="faint mt-3">Nothing approved yet. Approve items in the Review queue first.</div>}
        <div className="ops-rules mt-3">
          <div><Icon name="shield" size={12} /> Clawson refuses anything not approved, re-checks Salesforce before each write, and reads every change back.</div>
          <div><Icon name="shield" size={12} /> UNIX is never touched.</div>
          <div><Icon name="shield" size={12} /> Live Salesforce writes need B&H authorization. Until then Clawson only runs against its synthetic test org.</div>
        </div>
      </Panel>
      <Panel title="2 · Bring Clawson’s results back" icon="upload" sub="Import the result file Clawson exports. Importing the same file twice changes nothing. Dry runs never mark anything verified." actions={<><input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} /><Btn size="sm" variant="primary" icon="upload" onClick={() => fileRef.current?.click()}>Import result</Btn></>}>
        {runs.length ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Run</th><th>Mode</th><th>Driver</th><th>Outcomes</th></tr></thead>
            <tbody>{runs.map((r) => <tr key={r.runId}><td className="mono">{r.runId}<div className="faint" style={{ fontSize: 11 }}>{r.at ? new Date(r.at).toLocaleString() : ''}</div></td><td>{r.mode}</td><td>{r.driver}{r.synthetic && <> <Chip size="sm" tone="amber">synthetic</Chip></>}</td><td>{Object.entries(r.outcomes).map(([k, v]) => `${v} ${k}`).join(' · ')}</td></tr>)}</tbody>
          </table></div>
        ) : <EmptyState icon="inbox" title="No results yet" desc={sandbox ? 'In the sandbox, import Clawson’s synthetic result file to see it close the loop.' : 'After Clawson runs, import its result file here.'} />}
        <p className="faint mt-3" style={{ fontSize: 12 }}>A live, read-back-verified result marks the order Verified once the next Salesforce export shows it Matched.</p>
      </Panel>
    </div>
  );
}
