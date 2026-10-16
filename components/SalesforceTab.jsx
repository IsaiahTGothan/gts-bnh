'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — QUICK LOG (V4)
//  The tab customers see us use. Order number first, a stopwatch on every
//  log, a live 3D stage the customer can watch, a service clock on every
//  ticket (start → done), the walk-in queue, and one card that pushes to
//  Salesforce (Case via the connector) AND to UNIX (scan bridge).
//  Tab id stays `salesforce`.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SERVICE_BY_ID, SERVICE_TYPES, TECHS, serviceLabel, techName } from '../lib/constants';
import { sfPushTicket } from '../lib/salesforce';
import { computeStats, fmtPct } from '../lib/stats';
import { fmtClock, fmtDur, maskName, serviceMs, serviceState, serviceTarget } from '../lib/service';
import { brandById } from '../lib/warranty';
import { copyText, cx, dayKey, downloadText, fmtDateTime, isToday, matches, relTime, toCSV } from '../lib/utils';
import { useStore } from './GTSApp';
import QuickLogScene from './QuickLogScene';
import { Decode, MatrixRain } from './matrix';
import { TicketFields, ticketPayload, useTicketDraft } from './assignment-views';
import { BrandSwatch } from './warranty-ui';
import { Avatar, Btn, Chip, EmptyState, Field, Icon, Input, Modal, Segmented, Select, ServiceIcon, TicketStatusChip } from './ui';

/** Re-renders the caller every `ms` while `on`. Keep it in small leaf components. */
function useTick(ms = 1000, on = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!on) return undefined; const iv = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(iv); }, [ms, on]);
  return now;
}

export default function SalesforceTab() {
  const { state, api, now, toast, sfx, newAssignment, confirm, highlight, openUnixScan, connections, features, can, goal } = useStore();
  const [view, setView] = useState('open');
  const [q, setQ] = useState('');
  const [tech, setTech] = useState('');
  const [type, setType] = useState('');
  const [editing, setEditing] = useState(null);
  const [pushing, setPushing] = useState({});
  const [stagePrefill, setStagePrefill] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const lastPick = useRef(null);
  const searchRef = useRef(null);
  const layout = state.settings.qlLayout || 'cards';

  useEffect(() => {
    const h = () => searchRef.current?.focus();
    window.addEventListener('gts:focus-search', h);
    return () => window.removeEventListener('gts:focus-search', h);
  }, []);

  const everything = state.tickets.filter((t) => !t.deletedAt);
  const all = everything.filter((t) => !t.archivedAt);
  const archived = everything.filter((t) => t.archivedAt);
  const needsUnix = (t) => t.orderNumber && !t.unixLoggedAt && t.status !== 'converted';
  const inService = (t) => serviceState(t) === 'running' || serviceState(t) === 'paused';
  const counts = { open: all.filter((t) => t.status === 'open').length, service: all.filter(inService).length, logged: all.filter((t) => t.status === 'logged').length, unix: all.filter(needsUnix).length, converted: all.filter((t) => t.status === 'converted').length, all: all.length, archived: archived.length };
  const list = useMemo(() => (view === 'archived' ? archived : all)
    .filter((t) => view === 'all' || view === 'archived' || (view === 'unix' ? needsUnix(t) : view === 'service' ? inService(t) : t.status === view))
    .filter((t) => !tech || t.tech === tech)
    .filter((t) => !type || t.serviceType === type)
    .filter((t) => matches(q, t.tag, t.orderNumber, t.customerName, t.description, serviceLabel(t.serviceType), techName(t.tech), t.sfCaseNumber, t.warrantyBrand, t.serial))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [state.tickets, view, tech, type, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = list.slice(0, layout === 'table' ? 400 : 120);

  // ── multi-select (click the box · shift-click for a range · ⌘/Ctrl+A for the view · Esc clears)
  useEffect(() => { setSel(new Set()); lastPick.current = null; }, [view, tech, type]);
  const pick = (id, e) => {
    const idx = shown.findIndex((t) => t.id === id);
    setSel((prev) => {
      const next = new Set(prev);
      if (e?.shiftKey && lastPick.current != null) {
        const [a, b] = [lastPick.current, idx].sort((x, y) => x - y);
        const on = !prev.has(id);
        for (let i = a; i <= b; i++) { if (on) next.add(shown[i].id); else next.delete(shown[i].id); }
      } else if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    lastPick.current = idx;
  };
  const selectAll = () => setSel(new Set(shown.map((t) => t.id)));
  const clearSel = () => { setSel(new Set()); lastPick.current = null; };
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || document.querySelector('.modal, .drawer, .palette')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); }
      else if (e.key === 'Escape' && sel.size) clearSel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // re-binds each render so it sees the current list
  const selected = shown.filter((t) => sel.has(t.id));
  const selecting = sel.size > 0;
  const bulk = async (action, arg) => {
    const ids = selected.map((t) => t.id);
    if (action === 'pushed' && connections.salesforce.configured) {
      const open = selected.filter((t) => t.status === 'open');
      for (const t of open) await push(t); // real Cases, one after another
      clearSel(); return;
    }
    if (action === 'delete') {
      confirm({ title: `Delete ${ids.length} ticket${ids.length === 1 ? '' : 's'}?`, danger: true, confirmLabel: 'Delete', message: 'Removes them from the log. Undo is available for a few seconds.', onConfirm: () => { const n = api.bulkTickets(ids, 'delete'); clearSel(); toast(`${n} deleted`, { tone: 'warning', duration: 8000, action: { label: 'Undo', onClick: () => api.bulkTickets(ids, 'restore') } }); } });
      return;
    }
    const n = api.bulkTickets(ids, action, arg);
    sfx(n ? 'success' : 'click');
    const UNDO = { pushed: 'open', unix: 'unix-clear', 'unix-clear': 'unix', archive: 'unarchive', unarchive: 'archive' };
    toast(n ? `${n} ticket${n === 1 ? '' : 's'} updated` : 'Nothing to change for those tickets', { tone: n ? 'success' : 'info', action: n && UNDO[action] ? { label: 'Undo', onClick: () => api.bulkTickets(ids, UNDO[action]) } : undefined });
    if (n) clearSel();
  };
  const exportSelected = () => {
    downloadText(`gts-tickets-selected-${dayKey()}.csv`, toCSV(selected, [
      { label: 'Tag', value: 'tag' }, { label: 'Created', value: 'createdAt' }, { label: 'Order #', value: 'orderNumber' }, { label: 'Customer', value: 'customerName' }, { label: 'Service type', value: (r) => serviceLabel(r.serviceType) },
      { label: 'Description', value: 'description' }, { label: 'Tech', value: (r) => techName(r.tech) }, { label: 'Status', value: 'status' }, { label: 'Service minutes', value: (r) => (r.serviceStartedAt ? (serviceMs(r) / 60_000).toFixed(1) : '') },
      { label: 'Salesforce at', value: 'loggedAt' }, { label: 'UNIX at', value: 'unixLoggedAt' }, { label: 'Warranty brand', value: 'warrantyBrand' }, { label: 'Archived', value: 'archivedAt' },
    ]), 'text/csv');
    toast(`${selected.length} tickets exported`, { tone: 'success' });
  };

  const loggedToday = all.filter((t) => t.loggedAt && isToday(t.loggedAt, now)).length;
  const st = useMemo(() => computeStats(state, { days: 1, now }), [state, now]);
  const speed30 = useMemo(() => computeStats(state, { days: 30, now }).speed, [state, now]);

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
  const serve = (qrec) => {
    api.serveQueue(qrec.id); sfx('open');
    setStagePrefill({ customerName: qrec.name === 'Walk-up' ? '' : qrec.name, orderNumber: qrec.orderNumber || '', serviceType: qrec.serviceType || null, description: qrec.reason || '', queueId: qrec.id });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const S = st.service;

  return (
    <>
      <div className="page-head ql-head">
        <div>
          <div className="eyebrow">Quick Log · Salesforce + UNIX · service clock</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Log it once. <span className="grad-text">Push it everywhere.</span></h1>
        </div>
        <div className="ql-metrics">
          <Metric icon="users" value={goal?.thisHour ?? 0} label="this hour" hint={`${goal?.lastHour ?? 0} last hour`} tone="accent" />
          <Metric icon="timer" value={S.samples ? fmtDur(S.avgMs) : '—'} label="avg service today" hint={S.samples ? `${S.samples} done · ${fmtPct(S.withinTargetPct)} ≤ ${S.target}m` : 'hit Done to record'} tone="violet" />
          <Metric icon="zap" value={speed30.samples ? `${speed30.avgLogSeconds.toFixed(1)}s` : '—'} label="avg to log" hint="30 days" />
          <Metric icon="check" value={loggedToday} label="pushed today" tone="green" onClick={() => setView('logged')} />
          <Metric icon="hash" value={counts.unix} label="need UNIX" tone={counts.unix ? 'amber' : undefined} onClick={() => setView('unix')} />
        </div>
      </div>

      <QuickLogStage prefill={stagePrefill} onPrefillUsed={() => setStagePrefill(null)} onConvert={toAssignment} onUnix={(t) => openUnixScan(t.id)} />

      <div className={cx('ql-lanes', features.queue === false && 'is-single')}>
        <NowServing onEdit={setEditing} />
        {features.queue !== false && <QueuePanel onServe={serve} />}
      </div>

      <div className="toolbar mt-4">
        <Segmented value={view} onChange={setView} options={[
          { id: 'open', label: 'Open', count: counts.open, hot: true },
          { id: 'service', label: 'In service', count: counts.service, hot: true },
          { id: 'unix', label: 'Needs UNIX', count: counts.unix },
          { id: 'logged', label: 'Pushed', count: counts.logged },
          { id: 'converted', label: 'Moved', count: counts.converted },
          { id: 'all', label: 'All' },
          { id: 'archived', label: 'Archived', icon: 'archive', count: counts.archived },
        ]} />
        <div className="input-wrap"><Icon name="search" /><Input ref={searchRef} placeholder="Search order #, name, case, brand, serial…  ( / )" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={tech} onChange={(e) => setTech(e.target.value)} style={{ width: 140 }}><option value="">All techs</option>{TECHS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 170 }}><option value="">All types</option>{SERVICE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
        <Segmented value={layout} onChange={(v) => api.setSettings({ qlLayout: v })} options={[{ id: 'cards', label: '', icon: 'grid' }, { id: 'table', label: '', icon: 'list' }]} />
        <Btn size="sm" variant={selecting ? 'outline-accent' : 'ghost'} icon="check-circle" onClick={() => (selecting ? clearSel() : selectAll())} title="Select every ticket in this view (⌘/Ctrl + A) · shift-click selects a range">{selecting ? `Clear ${sel.size}` : 'Select all'}</Btn>
      </div>

      {list.length === 0 ? (
        <EmptyState icon="zap" title={view === 'open' ? 'No open tickets' : view === 'unix' ? 'Every order is in UNIX' : view === 'service' ? 'Nobody in service right now' : 'Nothing here'} desc={view === 'open' ? 'Everything has been pushed. Log the next customer above.' : view === 'unix' ? 'Tickets with an order number that still need a UNIX entry show up here.' : view === 'service' ? 'Tickets with a running or paused service clock show up here.' : 'Try another filter or clear the search.'} />
      ) : (
        layout === 'table' ? (
          <TicketTable rows={shown} sel={sel} onPick={pick} onAll={() => (sel.size === shown.length ? clearSel() : selectAll())} now={now} onEdit={setEditing} onUnix={(t) => openUnixScan(t.id)} />
        ) : (
        <div className={cx('list list-3', selecting && 'is-selecting')}>
          {shown.map((t, i) => (
            <TicketCard key={t.id} t={t} i={i} now={now} selected={sel.has(t.id)} onPick={(e) => pick(t.id, e)} highlighted={highlight?.type === 'ticket' && highlight.id === t.id} pushing={!!pushing[t.id]} sfLive={connections.salesforce.configured}
              onPush={() => push(t)} onUnix={() => openUnixScan(t.id)} onReopen={() => { api.reopenTicket(t.id); toast(`${t.tag} reopened`); }} onConvert={() => toAssignment(t)} onEdit={() => setEditing(t)} onDelete={can('techDelete') ? () => remove(t) : null}
              onCopy={async () => { await copyText(t.orderNumber); toast(`Order ${t.orderNumber} copied`); }}
              openAssignment={t.convertedTo} />
          ))}
        </div>
        )
      )}
      {list.length > shown.length && <div className="faint mt-3" style={{ fontSize: 12 }}>Showing the newest {shown.length} of {list.length} — search or filter to find older tickets{layout === 'cards' ? ', or switch to the table layout (400 rows)' : ''}.</div>}

      {selecting && <BulkBar selected={selected} view={view} onAction={bulk} onExport={exportSelected} onClear={clearSel} onAll={selectAll} total={shown.length} canDelete={can('techDelete')} canExport={can('techExport')} sfLive={connections.salesforce.configured} />}

      {editing && <EditTicketModal t={state.tickets.find((x) => x.id === editing.id) || editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function Metric({ icon, value, label, hint, tone, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={cx('metric', tone && `is-${tone}`)} onClick={onClick} title={hint}>
      <span className="metric-icon"><Icon name={icon} size={14} /></span>
      <span className="metric-text"><b>{value}</b><span>{label}</span></span>
    </Tag>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  THE STAGE — form card + live 3D scene + customer-facing HUD
// ═══════════════════════════════════════════════════════════════════════════
function QuickLogStage({ prefill, onPrefillUsed, onConvert, onUnix }) {
  const { state, api, toast, sfx, features, warrantyBrands } = useStore();
  const m = state.management || {};
  const effects = state.settings.effects || 'auto';
  const sceneOn = features.scene3d !== false && effects !== 'off';
  const intensity = effects === 'calm' || (effects !== 'full' && m.sceneIntensity === 'calm') ? 'calm' : 'full';
  const draft = useTicketDraft();
  const sceneApi = useRef(null);
  const anchorRef = useRef(null);
  const stageRef = useRef(null);
  const orderRef = useRef(null);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [last, setLast] = useState(null);
  const [display, setDisplay] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // phones / tablets: don't pop the keyboard (and scroll the stage away) just by opening the tab
  const [touch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);
  const d = draft.d;
  const typed = !!(d.orderNumber || d.customerName || d.description || d.serviceType);

  // stopwatch starts on the first keystroke, resets on save / clear
  useEffect(() => { if (typed && !startedAt) setStartedAt(Date.now()); if (!typed && startedAt) setStartedAt(null); }, [typed, startedAt]);

  // a walk-in was served from the queue → load them into the form
  useEffect(() => {
    if (!prefill) return;
    draft.load(prefill); setStartedAt(Date.now()); setCollapsed(false);
    setTimeout(() => orderRef.current?.focus(), 60);
    sceneApi.current?.pulse(orderRef.current);
    onPrefillUsed?.();
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  // the scene follows the form
  const brand = d.serviceType === 'warranty' ? brandById(warrantyBrands, d.warrantyBrand) : null;
  const matrix = state.settings.theme === 'matrix';
  const rgb = !!state.settings.rgb;
  const tint = brand?.color && brand.color !== '#000000' ? brand.color : SERVICE_BY_ID[d.serviceType]?.color || (matrix ? '#00ff8c' : '#22d3ee');
  const digits = d.orderNumber.replace(/\D/g, '').length;
  useEffect(() => { sceneApi.current?.setProgress(digits); }, [digits]);

  // fullscreen "customer display"
  useEffect(() => {
    const h = () => setDisplay(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  const toggleDisplay = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else stageRef.current?.requestFullscreen?.().catch(() => setDisplay((v) => !v));
    setTimeout(() => orderRef.current?.focus(), 200);
  };

  const save = (then) => {
    if (!draft.valid) {
      draft.attempt();
      toast(Object.values(draft.problems)[0] || 'Check the form', { tone: 'warning' });
      return;
    }
    const t = api.addTicket(ticketPayload(d, startedAt));
    sfx('success'); sceneApi.current?.burst();
    setLast({ tag: t.tag, secs: t.logSeconds, id: t.id, order: t.orderNumber, name: t.customerName, at: Date.now(), done: !!t.serviceEndedAt });
    toast(`${t.tag} logged${t.logSeconds ? ` in ${t.logSeconds}s` : ''}${t.serviceStartedAt && !t.serviceEndedAt ? ' · service clock running' : ''}`, { tone: 'success' });
    draft.reset(); setStartedAt(null);
    if (!touch) setTimeout(() => orderRef.current?.focus(), 30);
    if (then === 'convert') onConvert(t);
    if (then === 'unix') onUnix(t);
  };
  const clear = () => { draft.reset(); setStartedAt(null); orderRef.current?.focus(); };

  const onKey = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
    if (e.key === 'Escape' && typed) { e.preventDefault(); clear(); }
  };
  const pulseFrom = (e) => sceneApi.current?.pulse(e.target);
  const focusFrom = (e) => { if (e.target.matches?.('input, textarea')) sceneApi.current?.focus(e.target); };
  const blurFrom = () => setTimeout(() => { const a = document.activeElement; if (!a?.matches?.('.ql-card input, .ql-card textarea')) sceneApi.current?.focus(null); }, 0);
  const clickFrom = (e) => { const b = e.target.closest?.('button.typebtn, button.wpick-item, button.tpl'); if (b) sceneApi.current?.pulse(b); };

  const live = sceneOn && !sceneFailed;
  return (
    <section ref={stageRef} className={cx('ql-stage', live && 'has-scene', display && 'is-display', collapsed && 'is-collapsed')}>
      <div className="ql-backdrop" aria-hidden="true"><i /><i /><i /></div>
      {effects !== 'off' && <MatrixRain className="ql-rain" opacity={matrix ? 0.34 : 0.16} fontSize={matrix ? 15 : 14} speed={intensity === 'calm' ? 0.6 : 1} />}
      {live && <QuickLogScene apiRef={sceneApi} anchorRef={anchorRef} intensity={intensity} color={tint} rgb={rgb} onFail={() => setSceneFailed(true)} />}
      <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />

      <div className="ql-card">
        <header className="ql-card-head">
          <div>
            <h3 className="panel-title"><Icon name="zap" />Quick log</h3>
            <div className="panel-sub">Order number first — Enter jumps to the next field, ⌘/Ctrl + Enter saves, Esc clears.</div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {startedAt && <Stopwatch startedAt={startedAt} />}
            {last && !startedAt && <Chip size="sm" tone="green" icon="check">{last.tag}{last.secs ? ` · ${last.secs}s` : ''}</Chip>}
            {last?.order && !startedAt && <Btn size="sm" variant="ghost" icon="hash" onClick={() => onUnix({ id: last.id })}>UNIX</Btn>}
            {features.customerDisplay !== false && <Btn size="sm" variant="ghost" icon={display ? 'minimize' : 'maximize'} onClick={toggleDisplay} title="Customer display — full screen stage">{display ? 'Exit' : ''}</Btn>}
            <Btn size="sm" variant="ghost" icon={collapsed ? 'chevron-right' : 'chevron-down'} onClick={() => setCollapsed((v) => !v)} title={collapsed ? 'Show the form' : 'Hide the form'} />
          </div>
        </header>
        {!collapsed && (
          <div onKeyDown={onKey} onInput={pulseFrom} onFocus={focusFrom} onBlur={blurFrom} onClickCapture={clickFrom}>
            <TicketFields draft={draft} orderRef={orderRef} autoFocus={!touch} />
            <div className="ql-actions">
              {typed && <Btn variant="ghost" size="sm" icon="x" onClick={clear}>Clear</Btn>}
              {draft.isBlank && typed && !d.serviceType && !d.description && <Chip size="sm" tone="amber" icon="info">Blank ticket — describe the service</Chip>}
              <span className="grow" />
              <Btn size="sm" icon="clipboard" onClick={() => save('convert')} title="Save the ticket and open the overnight intake pre-filled">+ Check in</Btn>
              <Btn size="sm" icon="hash" onClick={() => save('unix')} disabled={!d.orderNumber.trim()} title="Save the ticket and show the UNIX barcode">+ UNIX</Btn>
              <Btn variant="primary" size="lg" icon="plus" onClick={() => save()} className="ql-save">Add to log</Btn>
            </div>
          </div>
        )}
      </div>

      <div className="ql-viz">
        <StageHUD coreRef={anchorRef} d={d} digits={digits} brand={brand} startedAt={startedAt} last={last} live={live} order={draft.order} />
      </div>
    </section>
  );
}

function Stopwatch({ startedAt }) {
  const now = useTick(100);
  return <Chip size="sm" tone="accent" icon="timer" className="mono stopwatch">{((now - startedAt) / 1000).toFixed(1)}s</Chip>;
}

/** What the customer reads on the stage: their order number assembling, the service, the result. */
function StageHUD({ coreRef, d, digits, brand, startedAt, last, live, order }) {
  const { state } = useStore();
  const now = useTick(startedAt || last ? 200 : 2000);
  const m = state.management || {};
  const justSaved = last && now - last.at < 5200;
  const raw = d.orderNumber.replace(/\D/g, '');
  const slots = Math.max(10, raw.length);
  const svc = SERVICE_BY_ID[d.serviceType];
  const name = d.customerName.trim() ? (m.maskNamesOnDisplay !== false ? maskName(d.customerName) : d.customerName.trim()) : '';
  let status = 'Ready for the next customer';
  let tone = '';
  if (justSaved) { status = `Logged ${last.tag}${last.secs ? ` in ${last.secs}s` : ''}`; tone = 'is-ok'; }
  else if (digits > 0 && digits < 6) status = 'Reading order number…';
  else if (digits >= 6 && order === 'ok') { status = 'Order number recognised'; tone = 'is-ok'; }
  else if (digits >= 6) status = 'Checking order number…';
  else if (d.serviceType) status = `${svc?.label || 'Service'} request`;
  else if (startedAt) status = 'Starting your visit…';
  return (
    <div className={cx('ql-hud', justSaved && 'is-saved', !live && 'no-scene')}>
      <div className="ql-hud-top">
        <span className="ql-rec"><span className="ql-rec-dot" />{startedAt ? 'LIVE INTAKE' : 'STANDING BY'}</span>
        <span className="mono">{startedAt ? `${((now - startedAt) / 1000).toFixed(1)}s` : new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      <div className="ql-hud-core" ref={coreRef} aria-hidden="true">{!live && <span className="ql-hud-orb" />}</div>
      <div className="ql-hud-bottom">
        <div className="ql-digits mono" aria-label={`Order number ${raw}`}>
          {Array.from({ length: slots }).map((_, i) => <span key={i} className={cx('ql-digit', i < raw.length && 'is-on', i === raw.length - 1 && 'is-new')}>{raw[i] || ''}</span>)}
        </div>
        <div className={cx('ql-status', tone)}>{justSaved ? <Icon name="check-circle" size={16} /> : <span className="ql-status-dot" />}<Decode text={status} /></div>
        <div className="ql-hud-chips">
          {svc && <span className="ql-chip" style={{ '--c': svc.color }}><ServiceIcon type={svc.id} size={12} />{svc.label}</span>}
          {brand && <span className="ql-chip" style={{ '--c': brand.color === '#000000' ? '#e8eef6' : brand.color }}><Icon name="shield-check" size={12} />{brand.name} warranty</span>}
          {name && <span className="ql-chip"><Icon name="user" size={12} />{name}</span>}
          {justSaved && last.name && <span className="ql-chip is-ok">Thanks, {(last.name.split(' ')[0] || '').slice(0, 20)}!</span>}
        </div>
        <div className="ql-hud-foot">{state.settings.storeLabel || 'B&H'} · Guest Technical Services</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  NOW SERVING — every running / paused service clock, big and tappable
// ═══════════════════════════════════════════════════════════════════════════
function NowServing({ onEdit }) {
  const { state } = useStore();
  const active = state.tickets.filter((t) => !t.deletedAt && (serviceState(t) === 'running' || serviceState(t) === 'paused')).sort((a, b) => new Date(a.serviceStartedAt) - new Date(b.serviceStartedAt));
  return (
    <section className="lane">
      <header className="lane-head">
        <h3 className="panel-title"><Icon name="timer" />Now serving</h3>
        <span className="faint" style={{ fontSize: 12 }}>{active.length ? `${active.length} clock${active.length === 1 ? '' : 's'} running` : 'Clocks start when you log a customer'}</span>
      </header>
      {active.length === 0 ? (
        <div className="lane-empty"><Icon name="timer" size={18} /> Nobody in service. Log a customer and their clock starts here — hit <b>Done</b> when they walk away.</div>
      ) : (
        <div className="serving">
          {active.map((t) => <ServingTile key={t.id} t={t} onEdit={() => onEdit(t)} />)}
        </div>
      )}
    </section>
  );
}

function ServingTile({ t, onEdit }) {
  const { api, state, sfx, toast } = useStore();
  const st = serviceState(t);
  const now = useTick(1000, st === 'running');
  const ms = serviceMs(t, now);
  const target = serviceTarget(state.management, t.serviceType) * 60_000;
  const over = ms > target ? (ms > target * 2 ? 'is-bad' : 'is-warn') : '';
  const svc = SERVICE_BY_ID[t.serviceType];
  const done = () => { api.serviceAction(t.id, 'finish'); sfx('success'); toast(`${t.tag} done in ${fmtDur(ms)}`, { tone: 'success', action: { label: 'Undo', onClick: () => api.serviceAction(t.id, 'resume') } }); };
  return (
    <div className={cx('serve', `is-${st}`, over)} style={{ '--c': svc?.color || 'var(--accent)' }}>
      <div className="serve-top">
        <span className="tag">{t.tag}</span>
        <span className="truncate serve-who">{t.customerName || (t.orderNumber ? `#${t.orderNumber}` : 'Walk-up')}</span>
        <Avatar tech={t.tech} size="sm" />
      </div>
      <div className="serve-clock mono">{fmtClock(ms)}</div>
      <div className="serve-bar"><i style={{ width: `${Math.min(100, (ms / target) * 100)}%` }} /></div>
      <div className="serve-meta">{svc ? <><ServiceIcon type={svc.id} size={11} />{svc.label}</> : 'Service'} · target {Math.round(target / 60_000)}m{st === 'paused' ? ' · paused' : ''}</div>
      <div className="serve-actions">
        {st === 'running' ? <Btn size="sm" variant="ghost" icon="pause" onClick={() => api.serviceAction(t.id, 'pause')} title="Pause the clock">Pause</Btn> : <Btn size="sm" variant="ghost" icon="play" onClick={() => api.serviceAction(t.id, 'resume')}>Resume</Btn>}
        <Btn size="sm" variant="success" icon="check" onClick={done}>Done</Btn>
        <Btn size="xs" variant="ghost" icon="edit" onClick={onEdit} title="Edit ticket / times" aria-label="Edit" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  WALK-IN QUEUE — who's waiting, how long, one tap to serve
// ═══════════════════════════════════════════════════════════════════════════
function QueuePanel({ onServe }) {
  const { state, api, toast, sfx } = useStore();
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [type, setType] = useState('');
  const nameRef = useRef(null);
  useEffect(() => { const h = () => nameRef.current?.focus(); window.addEventListener('gts:add-walkin', h); return () => window.removeEventListener('gts:add-walkin', h); }, []);
  const waiting = (state.queue || []).filter((x) => !x.deletedAt && x.status === 'waiting').sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
  const add = () => {
    if (!name.trim() && !reason.trim()) { nameRef.current?.focus(); return; }
    api.addQueue({ name, reason, serviceType: type || null }); sfx('click');
    toast(`${name.trim() || 'Walk-up'} added — #${waiting.length + 1} in line`, { tone: 'success' });
    setName(''); setReason(''); setType(''); nameRef.current?.focus();
  };
  return (
    <section className="lane">
      <header className="lane-head">
        <h3 className="panel-title"><Icon name="users" />Walk-in queue</h3>
        <span className="faint" style={{ fontSize: 12 }}>{waiting.length ? `${waiting.length} waiting` : 'Nobody waiting'} · <kbd className="kbd">W</kbd></span>
      </header>
      <div className="queue-add" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}>
        <Input ref={nameRef} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="What do they need?" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 130 }}><option value="">Type…</option>{SERVICE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
        <Btn variant="primary" icon="user-plus" onClick={add} aria-label="Add to queue" />
      </div>
      {waiting.length > 0 && (
        <div className="queue">
          {waiting.map((x, i) => <QueueRow key={x.id} x={x} n={i + 1} onServe={() => onServe(x)} />)}
        </div>
      )}
    </section>
  );
}

function QueueRow({ x, n, onServe }) {
  const { api, toast } = useStore();
  const now = useTick(1000);
  const wait = now - new Date(x.joinedAt).getTime();
  const mins = wait / 60_000;
  return (
    <div className={cx('qrow fade-up', mins >= 30 ? 'is-bad' : mins >= 15 ? 'is-warn' : '')}>
      <span className="qrow-n mono">{n}</span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="qrow-name truncate">{x.name}{x.serviceType && <span className="faint"> · {serviceLabel(x.serviceType)}</span>}</div>
        {x.reason && <div className="qrow-reason truncate">{x.reason}</div>}
      </div>
      <span className="qrow-wait mono" title="Waiting">{fmtClock(wait)}</span>
      <Btn size="sm" variant="primary" icon="play" onClick={onServe}>Serve</Btn>
      <Btn size="xs" variant="ghost" icon="x" title="Left without service" onClick={() => { api.leaveQueue(x.id); toast(`${x.name} marked as left`, { action: { label: 'Undo', onClick: () => api.requeue(x.id) } }); }} aria-label="Left" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  TICKET CARD
// ═══════════════════════════════════════════════════════════════════════════
function TicketCard({ t, i, now, selected, onPick, highlighted, pushing, sfLive, onPush, onUnix, onReopen, onConvert, onEdit, onDelete, onCopy, openAssignment }) {
  const { openAssignment: goAsg, warrantyBrands, openWarranty } = useStore();
  const svc = SERVICE_BY_ID[t.serviceType];
  const unixNeeded = t.orderNumber && !t.unixLoggedAt && t.status !== 'converted';
  const brand = t.warrantyBrand ? brandById(warrantyBrands, t.warrantyBrand) : null;
  return (
    <article id={`ticket-${t.id}`} className={cx('ticket fade-up', t.status !== 'open' && 'is-logged', highlighted && 'flash', selected && 'is-selected', t.archivedAt && 'is-archived')} style={{ '--i': Math.min(i, 12), '--c': svc?.color || 'var(--accent)', borderColor: highlighted ? 'var(--accent)' : undefined }}
      onClick={(e) => { if (e.target.closest('button, a, input')) return; if (e.currentTarget.closest('.is-selecting')) onPick?.(e); }}>
      <div className="ticket-top">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" role="checkbox" aria-checked={!!selected} aria-label={`Select ${t.tag}`} className={cx('checkbox ticket-check', selected && 'is-on')} onClick={(e) => { e.stopPropagation(); onPick?.(e); }}><Icon name="check" /></button>
            <span className="tag">{t.tag}</span>
            {t.archivedAt && <Chip size="sm" icon="archive">Archived</Chip>}
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
      {brand && (
        <button type="button" className="ticket-brand" onClick={() => openWarranty(brand.id)} title={`Open the ${brand.name} warranty helper`}>
          <BrandSwatch brand={brand} size={20} /><span><b>{brand.name}</b> warranty{t.serial ? <span className="faint mono"> · S/N {t.serial}</span> : null}</span><Icon name="external" size={12} />
        </button>
      )}
      {t.description && <p className="ticket-desc">{t.description}</p>}
      <ServiceRow t={t} />
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
        {onDelete && <Btn size="xs" variant="ghost" icon="trash" onClick={onDelete} aria-label="Delete" title="Delete" />}
      </div>
      <div className="ticket-actions">
        {t.status === 'open' && <>
          <Btn size="sm" variant="success" icon="cloud" onClick={onPush} loading={pushing} title={sfLive ? 'Creates the Case in Salesforce' : 'Marks the ticket as entered in Salesforce'}>Push to Salesforce</Btn>
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

/** Sticky action bar for the current selection. */
function BulkBar({ selected, view, onAction, onExport, onClear, onAll, total, canDelete, canExport, sfLive }) {
  const n = selected.length;
  const anyOpen = selected.some((t) => t.status === 'open');
  const anyPushed = selected.some((t) => t.status === 'logged');
  const anyNeedsUnix = selected.some((t) => t.orderNumber && !t.unixLoggedAt);
  const anyUnix = selected.some((t) => t.unixLoggedAt);
  const anyRunning = selected.some((t) => serviceState(t) === 'running' || serviceState(t) === 'paused');
  const allArchived = selected.length && selected.every((t) => t.archivedAt);
  // Portalled to <body>: the animated tab pane is transformed, which would trap position: fixed.
  return createPortal(
    <div className="bulkbar" role="toolbar" aria-label="Bulk actions">
      <div className="bulkbar-count"><b>{n}</b> selected{n < total && <button type="button" className="linkish" onClick={onAll}>select all {total}</button>}</div>
      <div className="bulkbar-actions">
        {anyOpen && <Btn size="sm" variant="success" icon="cloud" onClick={() => onAction('pushed')} title={sfLive ? 'Creates a Case for each open ticket' : 'Mark as entered in Salesforce'}>Pushed</Btn>}
        {anyPushed && <Btn size="sm" icon="undo" onClick={() => onAction('open')} title="Move back to Open">To Open</Btn>}
        {anyNeedsUnix && <Btn size="sm" variant="outline-accent" icon="hash" onClick={() => onAction('unix')} title="Mark as entered in UNIX">In UNIX</Btn>}
        {anyUnix && <Btn size="sm" variant="ghost" icon="hash" onClick={() => onAction('unix-clear')} title="Back to Needs UNIX">Not in UNIX</Btn>}
        {anyRunning && <Btn size="sm" icon="check" onClick={() => onAction('done')} title="Stop every running service clock">Service done</Btn>}
        {allArchived
          ? <Btn size="sm" icon="undo" onClick={() => onAction('unarchive')}>Unarchive</Btn>
          : <Btn size="sm" icon="archive" onClick={() => onAction('archive')} title="Hide from every list (still counted in Stats)">Archive</Btn>}
        <Select value="" onChange={(e) => { if (e.target.value) onAction('tech', e.target.value === '__none' ? null : e.target.value); }} style={{ width: 130 }} aria-label="Assign to">
          <option value="">Assign to…</option>{TECHS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="__none">Unassigned</option>
        </Select>
        <Select value="" onChange={(e) => { if (e.target.value) onAction('type', e.target.value); }} style={{ width: 130 }} aria-label="Set type">
          <option value="">Set type…</option>{SERVICE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        {canExport && <Btn size="sm" variant="ghost" icon="download" onClick={onExport}>CSV</Btn>}
        {canDelete && <Btn size="sm" variant="ghost" icon="trash" onClick={() => onAction('delete')} aria-label="Delete selected" title="Delete" />}
      </div>
      <Btn size="sm" variant="ghost" icon="x" onClick={onClear} title="Clear selection (Esc)" aria-label="Clear selection" />
    </div>,
    document.body,
  );
}

/** Dense layout: 400 rows, checkboxes, every column sortable at a glance. */
function TicketTable({ rows, sel, onPick, onAll, now, onEdit, onUnix }) {
  const { state } = useStore();
  return (
    <div className="table-wrap ticket-table">
      <table className="table">
        <thead><tr>
          <th style={{ width: 34 }}><button type="button" role="checkbox" aria-checked={rows.length > 0 && sel.size === rows.length} aria-label="Select all" className={cx('checkbox', rows.length > 0 && sel.size === rows.length && 'is-on')} onClick={onAll}><Icon name="check" /></button></th>
          <th>Ticket</th><th>Order #</th><th>Customer</th><th>Type</th><th>Tech</th><th>Service</th><th>SF</th><th>UNIX</th><th>Logged</th><th />
        </tr></thead>
        <tbody>
          {rows.map((t) => {
            const st = serviceState(t);
            const svc = SERVICE_BY_ID[t.serviceType];
            const on = sel.has(t.id);
            return (
              <tr key={t.id} className={cx(on && 'is-selected', t.archivedAt && 'is-archived')} onClick={(e) => { if (!e.target.closest('button, a')) onPick(t.id, e); }}>
                <td><button type="button" role="checkbox" aria-checked={on} aria-label={`Select ${t.tag}`} className={cx('checkbox', on && 'is-on')} onClick={(e) => { e.stopPropagation(); onPick(t.id, e); }}><Icon name="check" /></button></td>
                <td><span className="tag">{t.tag}</span>{t.archivedAt && <Icon name="archive" size={11} style={{ display: 'inline', marginLeft: 6, color: 'var(--text-3)' }} />}</td>
                <td className="mono">{t.orderNumber || <span className="faint">—</span>}</td>
                <td className="truncate" style={{ maxWidth: 180 }}>{t.customerName || <span className="faint">walk-up</span>}</td>
                <td>{svc ? <span className="row" style={{ gap: 6, color: svc.color }}><ServiceIcon type={svc.id} size={12} />{svc.label}</span> : <span className="faint">—</span>}</td>
                <td><span className="row" style={{ gap: 6 }}><Avatar tech={t.tech} size="sm" />{techName(t.tech)}</span></td>
                <td className="mono">{st === 'none' ? <span className="faint">—</span> : <span className={cx('svc-cell', `is-${st}`)}>{st === 'done' ? fmtDur(serviceMs(t, now)) : st === 'paused' ? '‖ paused' : '● live'}</span>}</td>
                <td>{t.loggedAt ? <span style={{ color: 'var(--green)' }}>✓</span> : t.status === 'converted' ? <span className="faint">job</span> : <span className="faint">—</span>}</td>
                <td>{!t.orderNumber ? <span className="faint">n/a</span> : t.unixLoggedAt ? <span style={{ color: 'var(--green)' }}>✓</span> : <button type="button" className="linkish" onClick={() => onUnix(t)} style={{ color: 'var(--amber)' }}>scan</button>}</td>
                <td className="faint" title={fmtDateTime(t.createdAt)} style={{ whiteSpace: 'nowrap' }}>{relTime(t.createdAt, now)}</td>
                <td><Btn size="xs" variant="ghost" icon="edit" onClick={() => onEdit(t)} aria-label="Edit" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {state.settings.qlLayout === 'table' && <div className="faint" style={{ fontSize: 11.5, padding: '8px 10px' }}>Click a row to select · shift-click for a range · ⌘/Ctrl + A selects the view · Esc clears</div>}
    </div>
  );
}

/** Service clock strip on a ticket card: start / pause / resume / done, live time vs target. */
function ServiceRow({ t }) {
  const { api, state, sfx } = useStore();
  const st = serviceState(t);
  const now = useTick(1000, st === 'running');
  const ms = serviceMs(t, now);
  const target = serviceTarget(state.management, t.serviceType) * 60_000;
  const tone = st === 'done' ? (ms <= target ? 'is-ok' : 'is-warn') : ms > target ? 'is-warn' : '';
  return (
    <div className={cx('svcrow', `is-${st}`, tone)}>
      <span className="svcrow-icon">{st === 'running' ? <span className="svc-live" /> : <Icon name={st === 'paused' ? 'pause' : st === 'done' ? 'check' : 'timer'} size={12} />}</span>
      {st === 'none' && <span className="svcrow-text faint">No service clock</span>}
      {st !== 'none' && <span className="svcrow-text"><b className="mono">{st === 'done' ? fmtDur(ms) : fmtClock(ms)}</b> <span className="faint">{st === 'done' ? `service time${t.serviceEndedAt ? ` · done ${relTime(t.serviceEndedAt, now)}` : ''}` : st === 'paused' ? 'paused' : 'in service'}</span></span>}
      {st !== 'none' && st !== 'done' && <span className="svcrow-bar"><i style={{ width: `${Math.min(100, (ms / target) * 100)}%` }} /></span>}
      <span className="grow" />
      {st === 'none' && <Btn size="xs" variant="ghost" icon="play" onClick={() => { api.serviceAction(t.id, 'start'); sfx('click'); }}>Start</Btn>}
      {st === 'running' && <Btn size="xs" variant="ghost" icon="pause" onClick={() => api.serviceAction(t.id, 'pause')} aria-label="Pause" title="Pause" />}
      {st === 'paused' && <Btn size="xs" variant="ghost" icon="play" onClick={() => api.serviceAction(t.id, 'resume')} aria-label="Resume" title="Resume" />}
      {(st === 'running' || st === 'paused') && <Btn size="xs" variant="success" icon="check" onClick={() => { api.serviceAction(t.id, 'finish'); sfx('success'); }}>Done</Btn>}
      {st === 'done' && <Btn size="xs" variant="ghost" icon="undo" onClick={() => api.serviceAction(t.id, 'resume')} title="Resume the clock (customer came back)">Resume</Btn>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  EDIT — fields + full control over the times
// ═══════════════════════════════════════════════════════════════════════════
const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);

function EditTicketModal({ t, onClose }) {
  const { api, toast, can } = useStore();
  const draft = useTicketDraft({ id: t.id, orderNumber: t.orderNumber || '', customerName: t.customerName || '', serviceType: t.serviceType, description: t.description || '', tech: t.tech ?? null, warrantyBrand: t.warrantyBrand || null, serial: t.serial || '' });
  const canTimes = can('techEditTimes');
  const [times, setTimes] = useState(() => ({ createdAt: toLocal(t.createdAt), start: toLocal(t.serviceStartedAt), end: toLocal(t.serviceEndedAt), paused: Math.round((Number(t.servicePausedMs) || 0) / 60_000) }));
  const preview = { serviceStartedAt: fromLocal(times.start), serviceEndedAt: fromLocal(times.end), servicePausedMs: Math.max(0, Number(times.paused) || 0) * 60_000, servicePausedAt: times.end ? null : t.servicePausedAt };
  const bad = preview.serviceStartedAt && preview.serviceEndedAt && new Date(preview.serviceEndedAt) < new Date(preview.serviceStartedAt);
  const save = () => {
    if (!draft.valid) { draft.attempt(); return; }
    if (bad) { toast('The end time is before the start time', { tone: 'warning' }); return; }
    const { clock, id, ...fields } = draft.d;
    api.updateTicket(t.id, { ...fields, warrantyBrand: fields.serviceType === 'warranty' ? fields.warrantyBrand : null });
    if (canTimes) {
      const changed = toLocal(t.serviceStartedAt) !== times.start || toLocal(t.serviceEndedAt) !== times.end || Math.round((Number(t.servicePausedMs) || 0) / 60_000) !== Number(times.paused) || toLocal(t.createdAt) !== times.createdAt;
      if (changed) api.setServiceTimes(t.id, { ...preview, ...(times.createdAt && toLocal(t.createdAt) !== times.createdAt ? { createdAt: fromLocal(times.createdAt) } : {}) });
    }
    toast(`${t.tag} updated`, { tone: 'success' }); onClose();
  };
  const nowLocal = () => toLocal(new Date().toISOString());
  return (
    <Modal title={`Edit ${t.tag}`} onClose={onClose} icon="edit" size="lg"
      footer={<><span className="faint" style={{ fontSize: 12 }}>Every change is stamped in Activity.</span><div className="row"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon="check" onClick={save}>Save</Btn></div></>}>
      <TicketFields draft={draft} autoFocus showClock={false} />
      <div className="form-section mt-4">Service times {canTimes ? '' : '· locked by Management'}</div>
      <div className="form-grid times-grid">
        <Field label="Service started">
          <div className="row" style={{ gap: 6 }}><Input type="datetime-local" value={times.start} disabled={!canTimes} onChange={(e) => setTimes((x) => ({ ...x, start: e.target.value }))} /><Btn size="sm" variant="ghost" disabled={!canTimes} onClick={() => setTimes((x) => ({ ...x, start: nowLocal() }))}>Now</Btn></div>
        </Field>
        <Field label="Service finished" hint="Empty = still running">
          <div className="row" style={{ gap: 6 }}><Input type="datetime-local" value={times.end} disabled={!canTimes} onChange={(e) => setTimes((x) => ({ ...x, end: e.target.value }))} /><Btn size="sm" variant="ghost" disabled={!canTimes} onClick={() => setTimes((x) => ({ ...x, end: nowLocal(), start: x.start || nowLocal() }))}>Now</Btn></div>
        </Field>
        <Field label="Paused (minutes)" hint="Subtracted from the service time">
          <Input type="number" min={0} className="mono" value={times.paused} disabled={!canTimes} onChange={(e) => setTimes((x) => ({ ...x, paused: e.target.value }))} />
        </Field>
        <Field label="Ticket created" hint="Counts toward that hour / day">
          <Input type="datetime-local" value={times.createdAt} disabled={!canTimes} onChange={(e) => setTimes((x) => ({ ...x, createdAt: e.target.value }))} />
        </Field>
        <div className="span-2 row wrap" style={{ gap: 10 }}>
          <Chip tone={bad ? 'red' : 'accent'} icon="timer">{bad ? 'End is before start' : preview.serviceStartedAt ? `Service time: ${fmtDur(serviceMs(preview))}${preview.serviceEndedAt ? '' : ' (running)'}` : 'No service clock'}</Chip>
          {canTimes && preview.serviceStartedAt && <Btn size="sm" variant="ghost" icon="x" onClick={() => setTimes((x) => ({ ...x, start: '', end: '', paused: 0 }))}>Clear the clock</Btn>}
        </div>
      </div>
    </Modal>
  );
}
