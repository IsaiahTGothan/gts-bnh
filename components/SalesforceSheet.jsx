'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — SALESFORCE COPY SHEET (V5.1)
//  Full-screen page (also at /#salesforce-sheet) with every open, unpushed
//  Quick Log ticket in one plain table, the rules for copying them into
//  Salesforce, and Copied / Skipped marks → "Confirm results".
//  Written to be read by a person or a browser bot: real <table>, stable
//  labels, one row per ticket, the rules first. Nothing here touches
//  Salesforce itself — and the rules forbid completing anything there.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useState } from 'react';
import { serviceLabel, techName } from '../lib/constants';
import { BOT_NEVER, BOT_STEPS, SF_QUEUE_TECH, SF_QUEUE_VIEW, botInstructionsText, buildSheetRows, planConfirm, sheetTSV, SHEET_COLUMNS } from '../lib/sf-sheet';
import { copyText, cx, downloadText, fmtDateTime, toCSV } from '../lib/utils';
import { useStore } from './GTSApp';
import { useServiceCatalog } from './ServiceInput';
import { Btn, Icon, Input, Portal } from './ui';

const MARKS_KEY = 'gts-sf-sheet-marks';
const loadMarks = () => { try { return JSON.parse(localStorage.getItem(MARKS_KEY) || '{}') || {}; } catch { return {}; } };
const saveMarks = (m) => { try { localStorage.setItem(MARKS_KEY, JSON.stringify(m)); } catch { /* private mode — marks live in memory */ } };

export function salesforceLink(state, connections) {
  const m = state.management || {};
  if (m.sfUrl) return m.sfUrl;
  if (connections?.salesforce?.host) return `https://${connections.salesforce.host}`;
  return 'https://login.salesforce.com';
}

export default function SalesforceSheet({ onClose }) {
  const { state, api, toast, isManager, connections } = useStore();
  const catalog = useServiceCatalog();
  const rows = useMemo(() => buildSheetRows(state.tickets, { catalog, typeLabel: serviceLabel, techName }), [state.tickets, catalog]);
  const [marks, setMarksState] = useState(loadMarks);
  const [done, setDone] = useState(null); // result of the last Confirm
  const [editLink, setEditLink] = useState(false);
  const sfUrl = salesforceLink(state, connections);
  const [linkDraft, setLinkDraft] = useState(sfUrl);

  // marks for tickets that are no longer on the sheet are dropped
  useEffect(() => {
    const ids = new Set(rows.map((r) => r.id));
    const kept = Object.fromEntries(Object.entries(marks).filter(([id]) => ids.has(id)));
    if (Object.keys(kept).length !== Object.keys(marks).length) { setMarksState(kept); saveMarks(kept); }
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const k = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
    window.addEventListener('keydown', k);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', k); };
  }, [onClose]);

  const setMark = (id, patch) => setMarksState((m) => { const next = { ...m, [id]: { ...(m[id] || {}), ...patch } }; if (patch.status === null) delete next[id]; saveMarks(next); return next; });
  const plan = planConfirm(rows, marks);
  const marked = plan.copied.length + plan.skipped.length;

  const confirm = () => {
    if (!marked) { toast('Mark rows Copied or Skipped first', { tone: 'warning' }); return; }
    const byId = new Map(rows.map((r) => [r.id, r]));
    api.sfSheetConfirm(plan);
    setDone({ at: new Date().toISOString(), copied: plan.copied.map((id) => byId.get(id)), skipped: plan.skipped.map((x) => ({ ...byId.get(x.id), reason: x.reason })), left: plan.unmarked.length });
    const left = Object.fromEntries(Object.entries(marks).filter(([id]) => plan.unmarked.includes(id)));
    setMarksState(left); saveMarks(left);
    toast(`${plan.copied.length} marked pushed · ${plan.skipped.length} skipped`, { tone: 'success' });
  };
  const undo = () => { api.sfSheetUndo(done.copied.map((r) => r.id)); toast(`${done.copied.length} back to open`, { tone: 'info' }); setDone(null); };
  const copyTable = async () => { await copyText(sheetTSV(rows)); toast(`Copied ${rows.length} rows — paste into Excel or Sheets`, { tone: 'success' }); };
  const copyRules = async () => { await copyText(botInstructionsText({ salesforceUrl: sfUrl, count: rows.length })); toast('Instructions copied', { tone: 'success' }); };
  const csv = () => downloadText(`gts-salesforce-sheet-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows, SHEET_COLUMNS.map(([k, h]) => ({ label: h, value: (r) => (k === 'service' && r.match === 'none' ? `Pick the closest (${r.type || 'any'})` : r[k]) }))), 'text/csv');

  return (
    <Portal>
      <div className="sfs" role="dialog" aria-modal="true" aria-label="Salesforce copy sheet" id="salesforce-copy-sheet">
        <header className="sfs-head">
          <span className="sfs-logo"><Icon name="send" size={20} /></span>
          <div className="sfs-titles">
            <h1>Salesforce copy sheet</h1>
            <p>{rows.length ? `${rows.length} open Quick Log ticket${rows.length === 1 ? '' : 's'} not pushed yet · oldest first` : 'Nothing waiting — every Quick Log ticket is pushed.'}</p>
          </div>
          <div className="sfs-actions">
            <a className="btn btn-primary" href={sfUrl} target="_blank" rel="noopener noreferrer" id="open-salesforce"><Icon name="external" size={15} />Open Salesforce</a>
            <Btn icon="copy" onClick={copyTable} disabled={!rows.length} title="Tab-separated — pastes into Excel / Sheets">Copy table</Btn>
            <Btn icon="download" onClick={csv} disabled={!rows.length}>CSV</Btn>
            <Btn variant="ghost" icon="x" onClick={onClose} aria-label="Close the sheet" title="Close (Esc)" />
          </div>
        </header>

        <div className="sfs-body">
          <div className="sfs-banner" role="note">
            <Icon name="alert-triangle" size={18} />
            <div><b>Copy only. Never complete tickets in Salesforce.</b> This sheet is for creating guests and adding services in <b>{SF_QUEUE_VIEW}</b>. Completing, closing or resolving anything in Salesforce is not part of this job — only do it if the person at the counter tells you to.</div>
          </div>

          <section className="sfs-rules" aria-label="Instructions for the bot">
            <div className="sfs-rules-col">
              <h2><span className="sfs-num is-do"><Icon name="check" size={13} /></span>Do — in this order</h2>
              <ol>{BOT_STEPS.map((x, i) => <li key={i}>{x}</li>)}</ol>
            </div>
            <div className="sfs-rules-col is-never">
              <h2><span className="sfs-num is-never"><Icon name="x" size={13} /></span>Never</h2>
              <ul>{BOT_NEVER.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <div className="sfs-facts">
                <div><span>Queue</span><b>{SF_QUEUE_VIEW}</b></div>
                <div><span>Tech, every row</span><b>{SF_QUEUE_TECH}</b></div>
                <div><span>Salesforce</span>
                  {editLink ? (
                    <span className="row" style={{ gap: 6 }}><Input value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder="https://…" style={{ height: 30, fontSize: 12.5 }} />
                      <Btn size="xs" variant="primary" onClick={() => { const v = linkDraft.trim(); if (v && !/^https:\/\//i.test(v)) { toast('Use an https:// link', { tone: 'warning' }); return; } api.setManagement({ sfUrl: v || null }, { action: 'management.update', label: 'Salesforce link', detail: v || 'default' }); setEditLink(false); }}>Save</Btn></span>
                  ) : <b className="mono">{sfUrl.replace(/^https:\/\//, '')} {isManager && <button type="button" className="linkish" onClick={() => setEditLink(true)}>change</button>}</b>}
                </div>
              </div>
              <Btn size="sm" variant="ghost" icon="copy" onClick={copyRules}>Copy instructions</Btn>
            </div>
          </section>

          {done && (
            <section className="sfs-done" aria-live="polite">
              <div className="sfs-done-head"><Icon name="check-circle" size={20} /><b>Results confirmed</b><span>{done.copied.length} copied → marked pushed in GTS Hub · {done.skipped.length} skipped → still open{done.left ? ` · ${done.left} not marked → untouched` : ''}</span>
                {done.copied.length > 0 && <Btn size="xs" variant="ghost" icon="undo" onClick={undo}>Undo</Btn>}</div>
              {done.copied.length > 0 && <div className="sfs-done-list"><span>Copied</span>{done.copied.map((r) => <code key={r.id}>{r.tag}{r.order ? ` · ${r.order}` : ''}</code>)}</div>}
              {done.skipped.length > 0 && <div className="sfs-done-list is-skip"><span>Skipped</span>{done.skipped.map((r) => <code key={r.id} title={r.reason}>{r.tag} — {r.reason}</code>)}</div>}
            </section>
          )}

          {rows.length ? (
            <div className="sfs-tablewrap">
              <table className="sfs-table" id="gts-salesforce-queue" aria-label="Tickets to copy into Salesforce">
                <thead>
                  <tr><th>#</th><th>Mark</th><th>GTS ticket</th><th>Order #</th><th>Customer</th><th>Service (Group › Service)</th><th>Description — copy exactly</th><th>Salesforce tech</th><th>GTS type</th><th>Logged</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const m = marks[r.id] || {};
                    return (
                      <tr key={r.id} className={cx(m.status && `is-${m.status}`)} data-row={i + 1} data-ticket={r.tag} data-order={r.order} data-status={m.status || 'pending'}>
                        <td className="sfs-n">{i + 1}</td>
                        <td className="sfs-mark">
                          <div className="sfs-mark-btns">
                            <button type="button" className={cx('sfs-btn is-copy', m.status === 'copied' && 'is-on')} aria-pressed={m.status === 'copied'} aria-label={`Mark ${r.tag} as copied`} onClick={() => setMark(r.id, { status: m.status === 'copied' ? null : 'copied' })}><Icon name="check" size={13} />Copied</button>
                            <button type="button" className={cx('sfs-btn is-skip', m.status === 'skipped' && 'is-on')} aria-pressed={m.status === 'skipped'} aria-label={`Mark ${r.tag} as skipped`} onClick={() => setMark(r.id, { status: m.status === 'skipped' ? null : 'skipped' })}><Icon name="x" size={13} />Skipped</button>
                          </div>
                          {m.status === 'skipped' && <input className="input sfs-reason" placeholder="Why skipped?" aria-label={`Why ${r.tag} was skipped`} value={m.reason || ''} onChange={(e) => setMark(r.id, { reason: e.target.value })} />}
                          {!m.status && r.skipReason && <div className="sfs-prev">Skipped before: {r.skipReason}</div>}
                        </td>
                        <td className="mono sfs-tag">{r.tag}</td>
                        <td className="mono">{r.order ? <CopyCell value={r.order} label={`order ${r.order}`} /> : <span className="faint">— walk-up</span>}</td>
                        <td>{r.customer}</td>
                        <td className="sfs-svc">
                          {r.match === 'none'
                            ? <><span className="sfs-pill is-pick">Pick the closest</span><div className="faint">GTS type: {r.type || 'none'}</div></>
                            : <><div className="sfs-group">{r.group}</div><div className="sfs-service">{r.service}</div>{r.match === 'suggested' && <span className="sfs-pill is-sugg" title="Worked out from the description — double-check it">suggested</span>}</>}
                        </td>
                        <td className="sfs-desc"><CopyCell value={r.description} label="description" block /></td>
                        <td className="sfs-tech">{r.sfTech}</td>
                        <td>{r.type || <span className="faint">—</span>}</td>
                        <td className="sfs-when">{r.createdAt ? fmtDateTime(r.createdAt) : ''}{r.gtsTech && <div className="faint">{r.gtsTech}</div>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="sfs-empty"><Icon name="check-circle" size={34} /><b>All caught up</b><span>Every Quick Log ticket has been pushed to Salesforce.</span></div>
          )}
        </div>

        {rows.length > 0 && (
          <footer className="sfs-foot">
            <div className="sfs-progress">
              <span className="sfs-bar"><i className="is-copy" style={{ width: `${(plan.copied.length / rows.length) * 100}%` }} /><i className="is-skip" style={{ width: `${(plan.skipped.length / rows.length) * 100}%` }} /></span>
              <span><b>{plan.copied.length}</b> copied · <b>{plan.skipped.length}</b> skipped · <b>{plan.unmarked.length}</b> not marked</span>
            </div>
            <Btn variant="ghost" size="sm" onClick={() => { setMarksState({}); saveMarks({}); }} disabled={!marked}>Clear marks</Btn>
            <Btn variant="primary" icon="check-circle" onClick={confirm} disabled={!marked} id="confirm-results">Confirm results</Btn>
          </footer>
        )}
      </div>
    </Portal>
  );
}

function CopyCell({ value, label, block }) {
  const { toast } = useStore();
  return (
    <span className={cx('sfs-copy', block && 'is-block')}>
      <span className="sfs-copy-text">{value}</span>
      <button type="button" className="sfs-copy-btn" onClick={async () => { await copyText(value); toast(`Copied ${label}`, { tone: 'success', duration: 1600 }); }} aria-label={`Copy ${label}`} title="Copy"><Icon name="copy" size={12} /></button>
    </span>
  );
}
