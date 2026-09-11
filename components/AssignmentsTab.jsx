'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — ASSIGNMENTS TAB
//  Overnight drop-offs. Board (drag between stages) · List · Archive.
//  Every card carries the live days/hours-kept badge (red past the limit).
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ASG_STATUSES, ASG_STATUS_BY_ID, SERVICE_TYPES, TECHS, isTerminal, serviceLabel, techName } from '../lib/constants';
import { ageLevel, effectivePriority, fmtDateTime, matches, priorityRank, relTime } from '../lib/utils';
import { useStore } from './GTSApp';
import { AgeBadge, Avatar, Btn, Chip, EmptyState, Icon, Input, PriorityChip, Segmented, Select, ServiceIcon, StatusChip } from './ui';

const ACTIVE = ASG_STATUSES.filter((s) => !s.terminal);

export default function AssignmentsTab() {
  const { state, api, now, openAssignment, newAssignment, toast, sfx } = useStore();
  const th = state.settings.overdueDays;
  const [view, setView] = useState('board');
  const [q, setQ] = useState('');
  const [tech, setTech] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('age');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const h = () => searchRef.current?.focus();
    window.addEventListener('gts:focus-search', h);
    return () => window.removeEventListener('gts:focus-search', h);
  }, []);

  const all = state.assignments.filter((a) => !a.deletedAt);
  const active = all.filter((a) => !isTerminal(a.status));
  const archive = all.filter((a) => isTerminal(a.status));
  const overdueCount = active.filter((a) => ageLevel(a.receivedAt, th, now).isOverdue).length;

  const filtered = useMemo(() => {
    const src = view === 'archive' ? archive : active;
    const list = src
      .filter((a) => !tech || a.tech === tech || (tech === 'none' && !a.tech))
      .filter((a) => !type || a.serviceType === type)
      .filter((a) => !onlyOverdue || ageLevel(a.receivedAt, th, now).isOverdue)
      .filter((a) => matches(q, a.tag, a.customerName, a.phone, a.email, a.orderNumber, a.deviceDesc, a.issue, techName(a.tech), a.location));
    const pri = (a) => priorityRank(effectivePriority(a, { now, thresholdDays: th }).id);
    const sorters = {
      age: (a, b) => new Date(a.receivedAt) - new Date(b.receivedAt),
      newest: (a, b) => new Date(b.receivedAt) - new Date(a.receivedAt),
      priority: (a, b) => pri(b) - pri(a) || new Date(a.receivedAt) - new Date(b.receivedAt),
      name: (a, b) => (a.customerName || '').localeCompare(b.customerName || ''),
      closed: (a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt),
    };
    return list.sort(sorters[view === 'archive' ? 'closed' : sort] || sorters.age);
  }, [view, archive, active, tech, type, onlyOverdue, q, sort, now, th]);

  const move = (id, status) => {
    const a = state.assignments.find((x) => x.id === id);
    if (!a || a.status === status) return;
    if (status === 'waiting') { openAssignment(id); toast('Pick a waiting reason in the drawer', { tone: 'info' }); return; }
    api.setAsgStatus(id, status); sfx('click');
    toast(`${a.tag} → ${ASG_STATUS_BY_ID[status].label}`, { tone: 'success' });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Overnight · {active.length} in house</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Assignments</h1>
          <p className="page-sub">Devices customers left with us. The badge in each corner is the live hold time — it turns red at {th} days.</p>
        </div>
        <div className="row wrap">
          {overdueCount > 0 && <Chip tone="red" icon="alert-triangle" onClick={() => setOnlyOverdue((v) => !v)} title="Toggle overdue filter">{overdueCount} over {th}d</Chip>}
          <Btn variant="primary" icon="plus" onClick={() => newAssignment()}>Check in device <span className="kbd hidden-mobile" style={{ marginLeft: 4 }}>N</span></Btn>
        </div>
      </div>

      <div className="toolbar">
        <Segmented value={view} onChange={setView} options={[
          { id: 'board', label: 'Board', icon: 'board' },
          { id: 'list', label: 'List', icon: 'list' },
          { id: 'archive', label: 'Archive', icon: 'archive', count: archive.length },
        ]} />
        <div className="input-wrap"><Icon name="search" /><Input ref={searchRef} placeholder="Search name, phone, tag, device…  ( / )" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={tech} onChange={(e) => setTech(e.target.value)} style={{ width: 150 }}>
          <option value="">All techs</option>{TECHS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="none">Unassigned</option>
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 170 }}><option value="">All types</option>{SERVICE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
        {view !== 'archive' && (
          <Select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 160 }}>
            <option value="age">Oldest first</option><option value="newest">Newest first</option><option value="priority">Criticality</option><option value="name">Customer A–Z</option>
          </Select>
        )}
        <button className={`check ${onlyOverdue ? 'is-on' : ''}`} onClick={() => setOnlyOverdue((v) => !v)}><span className="check-box">{onlyOverdue && <Icon name="check" size={10} />}</span>Overdue only</button>
      </div>

      {view === 'board' && <Board items={filtered} onMove={move} />}
      {view === 'list' && <ListView items={filtered} />}
      {view === 'archive' && <ListView items={filtered} archive />}
    </>
  );
}

// ─── Board with drag & drop ────────────────────────────────────────────────
function Board({ items, onMove }) {
  const { state, now } = useStore();
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const th = state.settings.overdueDays;

  const drop = (status) => (e) => { e.preventDefault(); if (dragId) onMove(dragId, status); setDragId(null); setOver(null); };

  return (
    <div className="board">
      {ACTIVE.map((s) => {
        const col = items.filter((a) => a.status === s.id);
        return (
          <div key={s.id} className={`board-col ${over === s.id ? 'is-over' : ''}`} style={{ '--c': s.color }}
            onDragOver={(e) => { e.preventDefault(); if (over !== s.id) setOver(s.id); }} onDragLeave={() => setOver(null)} onDrop={drop(s.id)}>
            <div className="board-col-head">
              <div className="board-col-title"><span className="dot" />{s.label}</div>
              <span className="badge is-neutral">{col.length}</span>
            </div>
            <div className="board-col-body">
              {col.map((a, i) => <AsgCard key={a.id} a={a} i={i} now={now} th={th} dragging={dragId === a.id} onDragStart={() => setDragId(a.id)} onDragEnd={() => { setDragId(null); setOver(null); }} />)}
              {col.length === 0 && <div className="board-drop">{s.hint}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AsgCard({ a, i, now, th, dragging, onDragStart, onDragEnd }) {
  const { openAssignment } = useStore();
  const age = ageLevel(a.receivedAt, th, now);
  const pri = effectivePriority(a, { now, thresholdDays: th });
  const tasks = a.tasks || [];
  const done = tasks.filter((t) => t.done).length;
  const svc = SERVICE_TYPES.find((s) => s.id === a.serviceType);
  return (
    <article className={`asg-card fade-up ${age.isOverdue ? 'is-overdue' : age.level === 'aging' ? 'is-aging' : ''} ${dragging ? 'is-dragging' : ''}`} style={{ '--i': Math.min(i, 8), '--c': age.isOverdue ? 'var(--red-2)' : age.level === 'aging' ? 'var(--amber)' : (svc?.color || 'var(--accent)') }}
      draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', a.id); onDragStart(); }} onDragEnd={onDragEnd}
      onClick={() => openAssignment(a.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') openAssignment(a.id); }}>
      <div className="asg-head">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}><span className="tag">{a.tag}</span>{a.demo && <Chip size="sm">DEMO</Chip>}</div>
          <div className="asg-name truncate">{a.customerName}</div>
          <div className="asg-device truncate"><ServiceIcon type={a.serviceType} />{a.deviceDesc || serviceLabel(a.serviceType)}</div>
        </div>
        <AgeBadge receivedAt={a.receivedAt} threshold={th} now={now} />
      </div>
      {a.issue && <p className="asg-issue">{a.issue}</p>}
      {a.status === 'waiting' && a.waitReason && <div className="row" style={{ gap: 6, fontSize: 12, color: 'var(--amber)' }}><Icon name="clock" size={12} />{a.waitReason}</div>}
      {tasks.length > 0 && <div className="row" style={{ gap: 8 }}><div className="progress grow"><i style={{ width: `${(done / tasks.length) * 100}%` }} /></div><span className="asg-tasks">{done}/{tasks.length}</span></div>}
      <div className="asg-foot">
        <div className="row" style={{ gap: 6 }}><Avatar tech={a.tech} size="sm" /><span style={{ fontSize: 12, color: a.tech ? 'var(--text-2)' : 'var(--amber)' }}>{techName(a.tech)}</span></div>
        <PriorityChip priority={pri.id} manual={pri.manual} size="sm" title={pri.reasons.join(' · ')} />
      </div>
    </article>
  );
}

// ─── List / archive table ──────────────────────────────────────────────────
function ListView({ items, archive }) {
  const { state, now, openAssignment, api, toast } = useStore();
  const th = state.settings.overdueDays;
  if (items.length === 0) return <EmptyState icon={archive ? 'archive' : 'clipboard'} title={archive ? 'No closed jobs yet' : 'No devices match'} desc={archive ? 'Picked-up and cancelled jobs land here with their full history.' : 'Clear a filter or check in a device.'} />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Tag</th><th>Customer</th><th>Device</th><th>Status</th><th>Tech</th><th>{archive ? 'Closed' : 'Hold time'}</th><th>Criticality</th><th>Location</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => {
            const pri = effectivePriority(a, { now, thresholdDays: th });
            return (
              <tr key={a.id} className="is-clickable" onClick={() => openAssignment(a.id)}>
                <td><span className="tag">{a.tag}</span></td>
                <td><div style={{ fontWeight: 600 }}>{a.customerName}</div><div className="faint mono" style={{ fontSize: 11.5 }}>{a.phone}</div></td>
                <td><div className="row" style={{ gap: 6 }}><ServiceIcon type={a.serviceType} /><span className="truncate" style={{ maxWidth: 220 }}>{a.deviceDesc || serviceLabel(a.serviceType)}</span></div></td>
                <td><StatusChip status={a.status} size="sm" /></td>
                <td><div className="row" style={{ gap: 6 }}><Avatar tech={a.tech} size="sm" />{techName(a.tech)}</div></td>
                <td>{archive ? <span className="muted" title={a.completedAt ? fmtDateTime(a.completedAt) : ''}>{a.completedAt ? relTime(a.completedAt, now) : '—'}</span> : <AgeBadge receivedAt={a.receivedAt} threshold={th} now={now} compact />}</td>
                <td><PriorityChip priority={pri.id} manual={pri.manual} size="sm" /></td>
                <td className="muted">{a.location || '—'}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="row end" style={{ gap: 4 }}>
                    <a className="btn btn-xs btn-ghost" href={`tel:${(a.phone || '').replace(/\D/g, '')}`} title="Call"><Icon name="call" /></a>
                    {!archive && a.status !== 'ready' && <Btn size="xs" variant="ghost" icon="check" title="Mark ready" onClick={() => { api.setAsgStatus(a.id, 'ready'); toast(`${a.tag} ready for pickup`, { tone: 'success' }); }} />}
                    {archive && <Btn size="xs" variant="ghost" icon="undo" title="Reopen" onClick={() => api.setAsgStatus(a.id, 'received')} />}
                    <Btn size="xs" variant="ghost" icon="chevron-right" onClick={() => openAssignment(a.id)} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
