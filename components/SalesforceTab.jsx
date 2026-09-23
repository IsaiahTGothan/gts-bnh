'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — QUICK LOG (V3)
//  The tab customers see us use. Order number first, a stopwatch on every
//  log, and one card that pushes to Salesforce (Case via the connector when
//  it's set up) AND to UNIX (scan bridge). Tab id stays `salesforce`.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SERVICE_TYPES, TECHS, serviceLabel, techName } from '../lib/constants';
import { sfPushTicket } from '../lib/salesforce';
import { computeStats } from '../lib/stats';
import { copyText, fmtDateTime, isToday, matches, relTime } from '../lib/utils';
import { useStore } from './GTSApp';
import { TicketFields, useTicketDraft } from './assignment-views';
import { Avatar, Btn, Chip, EmptyState, Icon, Input, Modal, Panel, Segmented, Select, ServiceIcon, TicketStatusChip } from './ui';

export default function SalesforceTab() {
  const { state, api, now, toast, sfx, newAssignment, confirm, highlight, openUnixScan, connections } = useStore();
  const [view, setView] = useState('open');
  const [q, setQ] = useState('');
  const [tech, setTech] = useState('');
  const [type, setType] = useState('');
  const [editing, setEditing] = useState(null);
  const [quickOpen, setQuickOpen] = useState(true);
  const [pushing, setPushing] = useState({});
  const searchRef = useRef(null);

  useEffect(() => {
    const h = () => searchRef.current?.focus();
    window.addEventListener('gts:focus-search', h);
    return () => window.removeEventListener('gts:focus-search', h);
  }, []);

  const all = state.tickets.filter((t) => !t.deletedAt);
  const needsUnix = (t) => t.orderNumber && !t.unixLoggedAt && t.status !== 'converted';
  const counts = { open: all.filter((t) => t.status === 'open').length, logged: all.filter((t) => t.status === 'logged').length, unix: all.filter(needsUnix).length, converted: all.filter((t) => t.status === 'converted').length, all: all.length };
  const list = useMemo(() => all
    .filter((t) => view === 'all' || (view === 'unix' ? needsUnix(t) : t.status === view))
    .filter((t) => !tech || t.tech === tech)
    .filter((t) => !type || t.serviceType === type)
    .filter((t) => matches(q, t.tag, t.orderNumber, t.customerName, t.description, serviceLabel(t.serviceType), techName(t.tech), t.sfCaseNumber))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [all, view, tech, type, q]);

  const loggedToday = all.filter((t) => t.loggedAt && isToday(t.loggedAt, now)).length;
  const speed = useMemo(() => computeStats(state, { days: 30, now }).speed, [state, now]);

  // ── Push to Salesforce: real Case when the connector is set up, flag otherwise
  const push = async (t) => {
    const sf = connections.salesforce;
    if (!sf.configured) {
      api.logTicket(t.id, { sfPushedVia: 'manual' }); sfx('success');
      toast(`${t.tag} marked as pushed to Salesforce`, { tone: 'success', action: { label: 'Undo', onClick: () => api.reopenTicket(t.id) } });
      return;
    }
    setPushing((p) => ({ ...p, [t.id]: true }));
    const payload = { tag: t.tag, orderNumber: t.orderNumber, customerName: t.customerName, serviceType: t.serviceType, serviceLabel: serviceLabel(t.serviceType), description: t.description, tech: t.tech, techName: techName(t.tech), createdAt: t.createdAt };
    const res = await sfPushTicket(payload, { stationName: state.settings.stationName, storeLabel: state.settings.storeLabel }, state.settings.syncPasscode).catch((e) => ({ ok: false, error: String(e?.message || e) }));
    setPushing((p) => { const n = { ...p }; delete n[t.id]; return n; });
    if (res.ok) {
      api.logTicket(t.id, { sfCaseNumber: res.caseNumber || null, sfCaseId: res.caseId || null, sfUrl: res.url || null, sfPushedVia: 'api' }); sfx('success');
      toast(`${t.tag} → Salesforce Case ${res.caseNumber || 'created'}`, { tone: 'success', duration: 6000 });
    } else {
      sfx('error');
      toast(`Salesforce: ${res.error || 'push failed'}`, { tone: 'error', duration: 9000, action: { label: 'Mark pushed anyway', onClick: () => api.logTicket(t.id, { sfPushedVia: 'manual' }) } });
    }
  };
  const toAssignment = (t) => newAssignment({ customerName: t.customerName, orderNumber: t.orderNumber, serviceType: t.serviceType, issue: t.description, tech: t.tech }, t.id);
  const remove = (t) => confirm({ title: `Delete ${t.tag}?`, danger: true, confirmLabel: 'Delete', message: 'Removes the ticket from the log. Undo is available for a few seconds.', onConfirm: () => { api.deleteTicket(t.id); toast(`${t.tag} deleted`, { tone: 'warning', duration: 7000, action: { label: 'Undo', onClick: () => api.restoreTicket(t.id) } }); } });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Quick Log · Salesforce + UNIX</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Log it once. <span className="grad-text">Push it everywhere.</span></h1>
          <p className="page-sub">Order number first, everything else optional. One card pushes to Salesforce{connections.salesforce.configured ? ' (live Case)' : ''} and hands the order to UNIX by barcode — no retyping.</p>
        </div>
        <div className="row wrap">
          <Chip tone="accent" icon="timer" title="Average time from first keystroke to saved ticket (last 30 days)">{speed.samples ? `${speed.avgLogSeconds.toFixed(1)}s avg log` : 'stopwatch on'}</Chip>
          <Chip tone="green" icon="check">{loggedToday} pushed today</Chip>
          <Chip tone={counts.unix ? 'amber' : undefined} icon="hash" onClick={() => setView('unix')}>{counts.unix} need UNIX</Chip>
          <Chip tone={counts.open ? 'accent' : undefined} icon="clock">{counts.open} open</Chip>
        </div>
      </div>

      <QuickLog open={quickOpen} onToggle={() => setQuickOpen((o) => !o)} onConvert={toAssignment} onUnix={(t) => openUnixScan(t.id)} />

      <div className="toolbar mt-4">
        <Segmented value={view} onChange={setView} options={[
          { id: 'open', label: 'Open', count: counts.open, hot: true },
          { id: 'unix', label: 'Needs UNIX', count: counts.unix },
          { id: 'logged', label: 'Pushed', count: counts.logged },
          { id: 'converted', label: 'Moved', count: counts.converted },
          { id: 'all', label: 'All' },
        ]} />
        <div className="input-wrap"><Icon name="search" /><Input ref={searchRef} placeholder="Search order #, name, case, description…  ( / )" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={tech} onChange={(e) => setTech(e.target.value)} style={{ width: 140 }}><option value="">All techs</option>{TECHS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 170 }}><option value="">All types</option>{SERVICE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
      </div>

      {list.length === 0 ? (
        <EmptyState icon="zap" title={view === 'open' ? 'No open tickets' : view === 'unix' ? 'Every order is in UNIX' : 'Nothing here'} desc={view === 'open' ? 'Everything has been pushed. Log the next customer above.' : view === 'unix' ? 'Tickets with an order number that still need a UNIX entry show up here.' : 'Try another filter or clear the search.'} />
      ) : (
        <div className="list list-3">
          {list.map((t, i) => (
            <TicketCard key={t.id} t={t} i={i} now={now} highlighted={highlight?.type === 'ticket' && highlight.id === t.id} pushing={!!pushing[t.id]} sfLive={connections.salesforce.configured}
              onPush={() => push(t)} onUnix={() => openUnixScan(t.id)} onReopen={() => { api.reopenTicket(t.id); toast(`${t.tag} reopened`); }} onConvert={() => toAssignment(t)} onEdit={() => setEditing(t)} onDelete={() => remove(t)}
              onCopy={async () => { await copyText(t.orderNumber); toast(`Order ${t.orderNumber} copied`); }}
              openAssignment={t.convertedTo} />
          ))}
        </div>
      )}

      {editing && <EditTicketModal t={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

// ─── Quick Log (inline) with a stopwatch ───────────────────────────────────
function QuickLog({ open, onToggle, onConvert, onUnix }) {
  const { api, toast, sfx } = useStore();
  const draft = useTicketDraft();
  const [last, setLast] = useState(null);
  const [focusKey, setFocusKey] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [tick, setTick] = useState(0);
  const typed = !!(draft.d.orderNumber || draft.d.customerName || draft.d.description || draft.d.serviceType);

  // stopwatch starts on the first keystroke, resets on save
  useEffect(() => { if (typed && !startedAt) setStartedAt(Date.now()); if (!typed && startedAt) setStartedAt(null); }, [typed, startedAt]);
  useEffect(() => { if (!startedAt) return undefined; const iv = setInterval(() => setTick((x) => x + 1), 100); return () => clearInterval(iv); }, [startedAt]);
  const secs = startedAt ? (Date.now() - startedAt) / 1000 : 0;

  const save = (then) => {
    if (!draft.valid) { draft.attempt(); toast('Blank tickets need a service type or a description', { tone: 'warning' }); return; }
    const logSeconds = startedAt ? (Date.now() - startedAt) / 1000 : null;
    const t = api.addTicket({ ...draft.d, logSeconds });
    sfx('success'); setLast({ tag: t.tag, secs: t.logSeconds, id: t.id, order: t.orderNumber });
    toast(`${t.tag} logged${t.logSeconds ? ` in ${t.logSeconds}s` : ''}`, { tone: 'success' });
    draft.reset(); setStartedAt(null); setFocusKey((k) => k + 1);
    if (then === 'convert') onConvert(t);
    if (then === 'unix') onUnix(t);
  };

  const onKey = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } };

  return (
    <Panel title="Quick log" icon="zap" corners glow sub="Order number first — everything else is optional. ⌘/Ctrl + Enter saves." className="quicklog"
      actions={<>
        {startedAt && <Chip size="sm" tone="accent" icon="timer" className="mono stopwatch">{secs.toFixed(1)}s</Chip>}
        {last && !startedAt && <Chip size="sm" tone="green" icon="check">{last.tag}{last.secs ? ` · ${last.secs}s` : ''}</Chip>}
        {last?.order && !startedAt && <Btn size="sm" variant="ghost" icon="hash" onClick={() => onUnix({ id: last.id })}>UNIX</Btn>}
        <Btn variant="ghost" size="sm" icon={open ? 'chevron-down' : 'chevron-right'} onClick={onToggle}>{open ? 'Hide' : 'Show'}</Btn>
      </>}>
      {open && (
        <div onKeyDown={onKey}>
          <TicketFields draft={draft} autoFocus={focusKey > 0} key={focusKey} />
          <div className="row wrap mt-4" style={{ justifyContent: 'flex-end' }}>
            {draft.isBlank && typed && <Chip size="sm" tone="amber" icon="info">Blank ticket — describe the service</Chip>}
            <Btn icon="clipboard" onClick={() => save('convert')} title="Save the ticket and open the overnight intake pre-filled">Add &amp; check in device</Btn>
            <Btn icon="hash" onClick={() => save('unix')} disabled={!draft.d.orderNumber.trim()} title="Save the ticket and show the UNIX barcode">Add &amp; push to UNIX</Btn>
            <Btn variant="primary" icon="plus" onClick={() => save()} disabled={!draft.valid}>Add to log</Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ─── Ticket card ───────────────────────────────────────────────────────────
function TicketCard({ t, i, now, highlighted, pushing, sfLive, onPush, onUnix, onReopen, onConvert, onEdit, onDelete, onCopy, openAssignment }) {
  const { openAssignment: goAsg } = useStore();
  const svc = SERVICE_TYPES.find((s) => s.id === t.serviceType);
  const unixNeeded = t.orderNumber && !t.unixLoggedAt && t.status !== 'converted';
  return (
    <article id={`ticket-${t.id}`} className={`ticket fade-up ${t.status !== 'open' ? 'is-logged' : ''} ${highlighted ? 'flash' : ''}`} style={{ '--i': Math.min(i, 12), borderColor: highlighted ? 'var(--accent)' : undefined }}>
      <div className="ticket-top">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="tag">{t.tag}</span>
            {t.logSeconds ? <span className="faint mono" style={{ fontSize: 10.5 }} title="Time to log">⏱ {t.logSeconds}s</span> : null}
            {t.demo && <Chip size="sm">DEMO</Chip>}
          </div>
          {t.orderNumber ? (
            <div className="ticket-order row" style={{ gap: 8 }}>
              <span>{t.orderNumber}</span>
              <Btn variant="ghost" size="xs" icon="copy" onClick={onCopy} aria-label="Copy order number" />
            </div>
          ) : (
            <div className="ticket-order is-blank">{t.customerName ? 'No order #' : 'Blank ticket'}</div>
          )}
          {t.customerName && <div className="ticket-name">{t.customerName}</div>}
        </div>
        <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
          <TicketStatusChip status={t.status} size="sm" />
          {svc && <Chip size="sm" style={{ color: svc.color, borderColor: `color-mix(in srgb, ${svc.color} 40%, transparent)`, background: `color-mix(in srgb, ${svc.color} 12%, transparent)` }}><ServiceIcon type={t.serviceType} size={11} />{svc.label}</Chip>}
        </div>
      </div>
      {t.description && <p className="ticket-desc">{t.description}</p>}
      <div className="ticket-systems">
        <span className={`sysdot ${t.loggedAt ? 'is-on' : ''}`} title={t.loggedAt ? `Salesforce ${t.sfCaseNumber ? `Case ${t.sfCaseNumber}` : 'pushed'} ${relTime(t.loggedAt, now)}` : 'Not pushed to Salesforce'}><Icon name="cloud" size={12} />SF{t.sfCaseNumber ? ` #${t.sfCaseNumber}` : ''}{t.loggedAt ? ' ✓' : ''}</span>
        {t.orderNumber ? <span className={`sysdot ${t.unixLoggedAt ? 'is-on' : ''}`} title={t.unixLoggedAt ? `Entered in UNIX ${relTime(t.unixLoggedAt, now)}` : 'Order not in UNIX yet'}><Icon name="hash" size={12} />UNIX{t.unixLoggedAt ? ' ✓' : ''}</span> : <span className="sysdot is-na" title="No order number — nothing to enter in UNIX"><Icon name="hash" size={12} />UNIX n/a</span>}
        {t.status === 'converted' && <span className="sysdot is-on"><Icon name="clipboard" size={12} />Job</span>}
      </div>
      <div className="ticket-meta">
        <span className="row" style={{ gap: 6 }}><Avatar tech={t.tech} size="sm" />{techName(t.tech)}</span>
        <span>·</span>
        <span title={fmtDateTime(t.createdAt)}>{relTime(t.createdAt, now)}</span>
        {t.loggedAt && <><span>·</span><span title={fmtDateTime(t.loggedAt)}>pushed {relTime(t.loggedAt, now)}{t.loggedBy ? ` by ${techName(t.loggedBy)}` : ''}</span></>}
        <span className="grow" />
        <Btn size="xs" variant="ghost" icon="edit" onClick={onEdit} aria-label="Edit" title="Edit" />
        <Btn size="xs" variant="ghost" icon="trash" onClick={onDelete} aria-label="Delete" title="Delete" />
      </div>
      <div className="ticket-actions">
        {t.status === 'open' && <>
          <Btn size="sm" variant="success" icon="cloud" onClick={onPush} loading={pushing} title={sfLive ? 'Creates the Case in Salesforce' : 'Marks the ticket as entered in Salesforce'}>{sfLive ? 'Push to Salesforce' : 'Push to Salesforce'}</Btn>
          <Btn size="sm" variant={unixNeeded ? 'outline-accent' : 'default'} icon="hash" onClick={onUnix} disabled={!t.orderNumber} title={t.orderNumber ? 'Show the order barcode for the WYSE terminal' : 'Needs an order number'}>Push to UNIX</Btn>
          <Btn size="sm" icon="clipboard" onClick={onConvert}>Push to Assignments</Btn>
        </>}
        {t.status === 'logged' && <>
          {unixNeeded ? <Btn size="sm" variant="outline-accent" icon="hash" onClick={onUnix}>Push to UNIX</Btn> : t.orderNumber ? <Btn size="sm" variant="ghost" icon="hash" onClick={onUnix}>UNIX barcode</Btn> : null}
          {t.sfUrl && <a className="btn btn-sm" href={t.sfUrl} target="_blank" rel="noreferrer"><Icon name="external" />Open Case</a>}
          <Btn size="sm" variant="ghost" icon="undo" onClick={onReopen}>Reopen</Btn>
        </>}
        {t.status === 'converted' && openAssignment && <Btn size="sm" icon="arrow-right" onClick={() => goAsg(openAssignment)}>Open assignment</Btn>}
      </div>
    </article>
  );
}

function EditTicketModal({ t, onClose }) {
  const { api, toast } = useStore();
  const draft = useTicketDraft({ orderNumber: t.orderNumber || '', customerName: t.customerName || '', serviceType: t.serviceType, description: t.description || '', tech: t.tech ?? null });
  return (
    <Modal title={`Edit ${t.tag}`} onClose={onClose} icon="edit"
      footer={<><span /><div className="row"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon="check" disabled={!draft.valid} onClick={() => { api.updateTicket(t.id, draft.d); toast(`${t.tag} updated`, { tone: 'success' }); onClose(); }}>Save</Btn></div></>}>
      <TicketFields draft={draft} autoFocus />
    </Modal>
  );
}
