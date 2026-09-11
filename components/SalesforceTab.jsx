'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — SALESFORCE TAB
//  Quick Log (inline, fast) + ticket list with Push-to-Assignments and
//  Push-to-Salesforce (= logged) actions.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SERVICE_TYPES, TECHS, serviceLabel, techName } from '../lib/constants';
import { copyText, fmtDateTime, isToday, matches, relTime } from '../lib/utils';
import { useStore } from './GTSApp';
import { TicketFields, useTicketDraft } from './assignment-views';
import { Avatar, Btn, Chip, EmptyState, Icon, Input, Modal, Panel, Segmented, Select, ServiceIcon, TicketStatusChip } from './ui';

export default function SalesforceTab() {
  const { state, api, now, toast, sfx, newAssignment, confirm, highlight } = useStore();
  const [view, setView] = useState('open');
  const [q, setQ] = useState('');
  const [tech, setTech] = useState('');
  const [type, setType] = useState('');
  const [editing, setEditing] = useState(null);
  const [quickOpen, setQuickOpen] = useState(true);
  const searchRef = useRef(null);

  useEffect(() => {
    const h = () => searchRef.current?.focus();
    window.addEventListener('gts:focus-search', h);
    return () => window.removeEventListener('gts:focus-search', h);
  }, []);

  const all = state.tickets.filter((t) => !t.deletedAt);
  const counts = { open: all.filter((t) => t.status === 'open').length, logged: all.filter((t) => t.status === 'logged').length, converted: all.filter((t) => t.status === 'converted').length, all: all.length };
  const list = useMemo(() => all
    .filter((t) => view === 'all' || t.status === view)
    .filter((t) => !tech || t.tech === tech)
    .filter((t) => !type || t.serviceType === type)
    .filter((t) => matches(q, t.tag, t.orderNumber, t.customerName, t.description, serviceLabel(t.serviceType), techName(t.tech)))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [all, view, tech, type, q]);

  const loggedToday = all.filter((t) => t.loggedAt && isToday(t.loggedAt, now)).length;

  const push = (t) => { api.logTicket(t.id); sfx('success'); toast(`${t.tag} marked as pushed to Salesforce`, { tone: 'success', action: { label: 'Undo', onClick: () => api.reopenTicket(t.id) } }); };
  const toAssignment = (t) => newAssignment({ customerName: t.customerName, orderNumber: t.orderNumber, serviceType: t.serviceType, issue: t.description, tech: t.tech }, t.id);
  const remove = (t) => confirm({ title: `Delete ${t.tag}?`, danger: true, confirmLabel: 'Delete', message: 'Removes the ticket from the log. Undo is available for a few seconds.', onConfirm: () => { api.deleteTicket(t.id); toast(`${t.tag} deleted`, { tone: 'warning', duration: 7000, action: { label: 'Undo', onClick: () => api.restoreTicket(t.id) } }); } });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Salesforce · manual log</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Ticket log</h1>
          <p className="page-sub">Capture the interaction in seconds. “Push to Salesforce” marks it as entered in the real system; “Push to Assignments” turns it into an overnight job.</p>
        </div>
        <div className="row wrap">
          <Chip tone="green" icon="check">{loggedToday} pushed today</Chip>
          <Chip tone={counts.open ? 'accent' : undefined} icon="clock">{counts.open} open</Chip>
        </div>
      </div>

      <QuickLog open={quickOpen} onToggle={() => setQuickOpen((o) => !o)} onConvert={toAssignment} />

      <div className="toolbar mt-4">
        <Segmented value={view} onChange={setView} options={[
          { id: 'open', label: 'Open', count: counts.open, hot: true },
          { id: 'logged', label: 'Logged', count: counts.logged },
          { id: 'converted', label: 'Moved', count: counts.converted },
          { id: 'all', label: 'All' },
        ]} />
        <div className="input-wrap"><Icon name="search" /><Input ref={searchRef} placeholder="Search order #, name, description…  ( / )" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={tech} onChange={(e) => setTech(e.target.value)} style={{ width: 140 }}><option value="">All techs</option>{TECHS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 170 }}><option value="">All types</option>{SERVICE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
      </div>

      {list.length === 0 ? (
        <EmptyState icon="cloud" title={view === 'open' ? 'No open tickets' : 'Nothing here'} desc={view === 'open' ? 'Everything has been pushed. Log the next interaction above.' : 'Try another filter or clear the search.'} />
      ) : (
        <div className="list list-3">
          {list.map((t, i) => (
            <TicketCard key={t.id} t={t} i={i} now={now} highlighted={highlight?.type === 'ticket' && highlight.id === t.id}
              onPush={() => push(t)} onReopen={() => { api.reopenTicket(t.id); toast(`${t.tag} reopened`); }} onConvert={() => toAssignment(t)} onEdit={() => setEditing(t)} onDelete={() => remove(t)}
              onCopy={async () => { await copyText(t.orderNumber); toast(`Order ${t.orderNumber} copied`); }}
              openAssignment={t.convertedTo} />
          ))}
        </div>
      )}

      {editing && <EditTicketModal t={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

// ─── Quick Log (inline) ────────────────────────────────────────────────────
function QuickLog({ open, onToggle, onConvert }) {
  const { api, toast, sfx } = useStore();
  const draft = useTicketDraft();
  const [lastTag, setLastTag] = useState(null);
  const [focusKey, setFocusKey] = useState(0);

  const save = (thenConvert) => {
    if (!draft.valid) { draft.attempt(); toast('Blank tickets need a service type or a description', { tone: 'warning' }); return; }
    const t = api.addTicket(draft.d);
    sfx('success'); setLastTag(t.tag);
    toast(`${t.tag} added to the log`, { tone: 'success' });
    draft.reset(); setFocusKey((k) => k + 1);
    if (thenConvert) onConvert(t);
  };

  const onKey = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(false); } };

  return (
    <Panel title="Quick log" icon="zap" corners glow sub="Order number first — everything else is optional. ⌘/Ctrl + Enter saves."
      actions={<>{lastTag && <Chip size="sm" tone="green" icon="check">Last: {lastTag}</Chip>}<Btn variant="ghost" size="sm" icon={open ? 'chevron-down' : 'chevron-right'} onClick={onToggle}>{open ? 'Hide' : 'Show'}</Btn></>}>
      {open && (
        <div onKeyDown={onKey}>
          <TicketFields draft={draft} autoFocus={focusKey > 0} key={focusKey} />
          <div className="row wrap mt-4" style={{ justifyContent: 'flex-end' }}>
            {draft.isBlank && <Chip size="sm" tone="amber" icon="info">Blank ticket — describe the service</Chip>}
            <Btn icon="arrow-right" onClick={() => save(true)} title="Save the ticket and open the overnight intake pre-filled">Add &amp; push to Assignments</Btn>
            <Btn variant="primary" icon="plus" onClick={() => save(false)} disabled={!draft.valid}>Add to log</Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ─── Ticket card ───────────────────────────────────────────────────────────
function TicketCard({ t, i, now, highlighted, onPush, onReopen, onConvert, onEdit, onDelete, onCopy, openAssignment }) {
  const { openAssignment: goAsg } = useStore();
  const svc = SERVICE_TYPES.find((s) => s.id === t.serviceType);
  return (
    <article id={`ticket-${t.id}`} className={`ticket fade-up ${t.status !== 'open' ? 'is-logged' : ''} ${highlighted ? 'flash' : ''}`} style={{ '--i': Math.min(i, 12), borderColor: highlighted ? 'var(--accent)' : undefined }}>
      <div className="ticket-top">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="tag">{t.tag}</span>
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
          <Btn size="sm" icon="clipboard" onClick={onConvert}>Push to Assignments</Btn>
          <Btn size="sm" variant="success" icon="cloud" onClick={onPush}>Push to Salesforce</Btn>
        </>}
        {t.status === 'logged' && <Btn size="sm" variant="ghost" icon="undo" onClick={onReopen}>Reopen</Btn>}
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
