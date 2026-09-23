'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — HOME TAB
//  Overview (KPIs · alerts · tech load · charts) · Activity · Settings
// ═══════════════════════════════════════════════════════════════════════════
import React, { useMemo, useRef, useState } from 'react';
import { APP_VERSION, ASG_STATUS_BY_ID, DEFAULT_CHECKLIST, SERVICE_TYPES, TECHS, TECH_BY_ID, isTerminal, serviceLabel, techName } from '../lib/constants';
import { ageLevel, buildAlerts, copyText, countBy, dayKey, downloadText, fmtDateTime, fmtElapsed, greeting, isToday, relTime, techLoad, toCSV } from '../lib/utils';
import { checkOn } from '../lib/store';
import { computeStats } from '../lib/stats';
import { onlineOthers, useStore } from './GTSApp';
import { AgeBadge, Avatar, BarList, Btn, Chip, Donut, EmptyState, Field, HoverChart, Icon, Input, KPI, Panel, Ring, Segmented, Select, StatusChip, Toggle } from './ui';

export default function HomeTab() {
  const { homeTab, setHomeTab, counts } = useStore();
  return (
    <>
      <div className="page-head">
        <HomeGreeting />
        <Segmented value={homeTab} onChange={setHomeTab} options={[
          { id: 'overview', label: 'Overview', icon: 'grid', count: counts.alerts, hot: true },
          { id: 'activity', label: 'Activity', icon: 'activity' },
          { id: 'settings', label: 'Settings', icon: 'settings' },
        ]} />
      </div>
      {homeTab === 'overview' && <Overview />}
      {homeTab === 'activity' && <Activity />}
      {homeTab === 'settings' && <Settings />}
    </>
  );
}

function HomeGreeting() {
  const { state, now } = useStore();
  const tech = TECH_BY_ID[state.settings.currentTech];
  return (
    <div>
      <div className="eyebrow">{state.settings.stationName} · {new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      <h1 className="page-title" style={{ marginTop: 6 }}>{greeting(now)}{tech ? `, ${tech.name}` : ''}.</h1>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  OVERVIEW (V3: hero with the daily goal, hoverable intake, then the board)
// ═══════════════════════════════════════════════════════════════════════════
function Overview() {
  const { state, now, goTo, openRef, newAssignment, newTicket, openAssignment, api, goal, sync } = useStore();
  const th = state.settings.overdueDays;
  const live = state.assignments.filter((a) => !a.deletedAt);
  const active = live.filter((a) => !isTerminal(a.status));
  const tickets = state.tickets.filter((t) => !t.deletedAt);
  const openTickets = tickets.filter((t) => t.status === 'open');
  const alerts = useMemo(() => buildAlerts(state, now), [state, now]);
  const overdue = active.filter((a) => ageLevel(a.receivedAt, th, now).isOverdue);
  const ready = active.filter((a) => a.status === 'ready');
  const doneToday = live.filter((a) => a.pickedUpAt && isToday(a.pickedUpAt, now)).length + tickets.filter((t) => t.loggedAt && isToday(t.loggedAt, now)).length;
  const avgHold = active.length ? active.reduce((s, a) => s + (now - new Date(a.receivedAt).getTime()), 0) / active.length / 3600_000 : 0;
  const stats7 = useMemo(() => computeStats(state, { days: 14, now }), [state, now]);
  const todayTk = tickets.filter((t) => isToday(t.createdAt, now));
  const todayPushed = todayTk.filter((t) => t.loggedAt).length;
  const todayOrders = todayTk.filter((t) => t.orderNumber);
  const todayUnix = todayOrders.filter((t) => t.unixLoggedAt).length;
  const needsUnix = tickets.filter((t) => t.orderNumber && !t.unixLoggedAt && t.status !== 'converted').length;

  const loads = techLoad(state);
  const maxLoad = Math.max(1, ...loads.map((l) => l.assignments.length + l.tickets.length));

  const mix = useMemo(() => {
    const c = countBy([...tickets, ...live].filter((x) => x.serviceType), (x) => x.serviceType);
    return SERVICE_TYPES.map((s) => ({ label: s.label, value: c[s.id] || 0, color: s.color, icon: s.icon })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  }, [tickets, live]);

  const pipeline = useMemo(() => {
    const c = countBy(active, (a) => a.status);
    return Object.entries(ASG_STATUS_BY_ID).filter(([id, s]) => !s.terminal).map(([id, s]) => ({ label: s.label, value: c[id] || 0, color: s.color })).filter((x) => x.value > 0);
  }, [active]);

  const today = dayKey(new Date(now));
  const checksRaw = state.checklist[today] || {};
  const checks = DEFAULT_CHECKLIST.map((_, i) => checkOn(checksRaw[i]));
  const checksDone = checks.filter(Boolean).length;
  const speed = stats7.speed;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* ── Hero: goal + speed + quick actions ─────────────────────── */}
      <section className="hero corners-neon">
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
        <div className="hero-main">
          <div className="eyebrow">Today at the counter</div>
          <div className="hero-numbers">
            <div className="hero-num"><b>{goal?.today ?? 0}</b><span>customers<br />served</span></div>
            <div className="hero-num"><b>{todayPushed}<small>/{todayTk.length}</small></b><span>pushed to<br />Salesforce</span></div>
            <div className="hero-num"><b>{todayUnix}<small>/{todayOrders.length}</small></b><span>orders in<br />UNIX</span></div>
            <div className="hero-num"><b>{speed.samples ? `${speed.avgLogSeconds.toFixed(1)}s` : '—'}</b><span>avg time<br />to log</span></div>
          </div>
          <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
            <Btn variant="primary" icon="zap" onClick={() => newTicket()}>Quick log</Btn>
            <Btn icon="plus" onClick={() => newAssignment()}>Check in device</Btn>
            <Btn variant="ghost" icon="handoff" onClick={() => goTo('station')}>Shift handoff</Btn>
            {needsUnix > 0 && <Chip tone="amber" icon="hash" onClick={() => goTo('salesforce')}>{needsUnix} order{needsUnix > 1 ? 's' : ''} not in UNIX</Chip>}
            {!state.settings.currentTech && <Chip tone="amber" icon="alert-circle">No tech selected — pick yours</Chip>}
            {state.settings.demoLoaded && <Chip tone="violet" icon="sparkles">Demo data loaded</Chip>}
            {sync.status === 'idle' && sync.live && <Chip tone="green" icon="zap">Live board</Chip>}
          </div>
        </div>
        <div className="hero-goal" onClick={() => goTo('stats')} role="button" tabIndex={0} title="Open Stats">
          <Ring value={goal?.pct || 0} size={118} stroke={9} color={goal?.pct >= 1 ? 'var(--green)' : goal?.onPace ? 'var(--accent)' : 'var(--amber)'} label={goal?.today ?? 0} sub={`OF ${goal?.perDay ?? 20}`} />
          <div className="hero-goal-text">
            <div className="hero-goal-title">Daily goal</div>
            <div className="hero-goal-sub">{goal?.pct >= 1 ? 'Reached — keep it rolling' : goal?.onPace ? `On pace · ${goal.remaining} to go` : `${goal?.remaining} to go · ~${goal?.expected} expected by now`}</div>
            <div className="hero-goal-streak">{stats7.goal.streak > 0 ? `${stats7.goal.streak}-day streak` : `${stats7.goal.hitDays}/${Math.max(1, stats7.daily.length - 1)} days hit this fortnight`}</div>
          </div>
        </div>
      </section>

      {/* ── KPI row ─────────────────────────────────────────────────── */}
      <div className="grid cols-5">
        <KPI label="Open tickets" value={openTickets.length} icon="zap" onClick={() => goTo('salesforce')} delta={<span>{todayPushed} pushed today</span>} />
        <KPI label="In house" value={active.length} icon="clipboard" tone="violet" onClick={() => goTo('assignments')} delta={<span>avg hold {avgHold >= 24 ? `${(avgHold / 24).toFixed(1)}d` : `${Math.round(avgHold)}h`}</span>} />
        <KPI label={`Over ${th} days`} value={overdue.length} icon="alert-triangle" tone={overdue.length ? 'red' : 'green'} onClick={() => goTo('assignments')} delta={<span>{overdue.length ? <><span className="dot is-bad" /> needs attention</> : <><span className="dot is-live" /> all within limit</>}</span>} />
        <KPI label="Ready for pickup" value={ready.length} icon="check-circle" tone="green" onClick={() => goTo('assignments')} delta={<span>{ready.filter((a) => a.readyAt && (now - new Date(a.readyAt)) > 86_400_000).length} waiting 1d+</span>} />
        <KPI label="Closed today" value={doneToday} icon="check" tone="amber" onClick={() => goTo('stats')} delta={<span>pickups + SF pushes</span>} />
      </div>

      <div className="grid cols-3">
        {/* ── Intake (hoverable) ─────────────────────────────────────── */}
        <Panel className="span-2" title="Intake · last 14 days" icon="activity" sub="Hover any day for the exact count — tickets, drop-offs and orders" corners
          actions={<><Chip size="sm" icon="calendar">{stats7.daily[stats7.daily.length - 1]?.total ?? 0} today</Chip><Btn size="sm" variant="ghost" iconRight="arrow-right" onClick={() => goTo('stats')}>All stats</Btn></>}>
          <HoverChart series={stats7.daily} goal={goal?.perDay} height={190} onPick={() => goTo('stats')} />
          <div className="row wrap" style={{ gap: 14, marginTop: 8, fontSize: 11.5, color: 'var(--text-3)' }}>
            <span className="row" style={{ gap: 6 }}><i className="legend-swatch" style={{ background: 'var(--accent)' }} />tickets</span>
            <span className="row" style={{ gap: 6 }}><i className="legend-swatch" style={{ background: 'var(--violet)' }} />drop-offs</span>
            <span className="row" style={{ gap: 6 }}><i className="legend-swatch" style={{ background: 'transparent', borderTop: '2px dashed var(--green)', height: 0 }} />goal {goal?.perDay}</span>
            <span className="grow" />
            <span>{stats7.totals.customers} this fortnight · best {stats7.goal.best?.total ?? 0}</span>
          </div>
        </Panel>

        {/* ── Shift checklist ──────────────────────────────────────── */}
        <Panel title="Today’s checklist" icon="check-circle" sub={`${checksDone}/${DEFAULT_CHECKLIST.length} done`} actions={<div className="progress" style={{ width: 80 }}><i style={{ width: `${(checksDone / DEFAULT_CHECKLIST.length) * 100}%` }} /></div>}>
          <div className="checklist">
            {DEFAULT_CHECKLIST.map((item, i) => (
              <button key={i} className={`task ${checks[i] ? 'is-done' : ''}`} onClick={() => api.toggleCheck(i)} style={{ textAlign: 'left' }}>
                <span className={`checkbox ${checks[i] ? 'is-on' : ''}`}><Icon name="check" size={11} /></span>
                <span className="task-title">{item}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid cols-3">
        {/* ── Alerts ──────────────────────────────────────────────── */}
        <Panel className="span-2" title="Needs attention" icon="bell" corners glow={alerts.some((a) => a.severity === 'critical')}
          sub={alerts.length ? `${alerts.filter((a) => a.severity === 'critical').length} critical · ${alerts.filter((a) => a.severity === 'warning').length} warnings · ${alerts.filter((a) => a.severity === 'info').length} notes` : 'Nothing is over the limit right now'}
          actions={<Chip size="sm" tone={overdue.length ? 'red' : 'green'} icon="clock">{th}-day rule</Chip>}>
          {alerts.length === 0 ? (
            <EmptyState icon="shield" title="All clear" desc={`No device has been here longer than ${th} days, nothing is waiting on pickup and every job has an owner.`} />
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {alerts.slice(0, 8).map((a, i) => (
                <div key={a.id} className={`alert is-${a.severity} fade-up`} style={{ '--i': i }}>
                  <span className="alert-icon"><Icon name={a.severity === 'critical' ? 'alert-triangle' : a.severity === 'warning' ? 'clock' : 'info'} /></span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="alert-title truncate">{a.title}</div>
                    <div className="alert-desc truncate">{a.desc}</div>
                  </div>
                  <div className="alert-actions">
                    {a.kind === 'ready' && a.ref.type === 'assignment' && (() => { const asg = state.assignments.find((x) => x.id === a.ref.id); return asg?.phone ? <a className="btn btn-sm btn-success" href={`tel:${asg.phone.replace(/\D/g, '')}`}><Icon name="call" />Call</a> : null; })()}
                    <Btn size="sm" iconRight="arrow-right" onClick={() => openRef(a.ref)}>Open</Btn>
                  </div>
                </div>
              ))}
              {alerts.length > 8 && <div className="faint" style={{ fontSize: 12 }}>+{alerts.length - 8} more — see the Assignments tab.</div>}
            </div>
          )}
        </Panel>

        {/* ── Pipeline donut ───────────────────────────────────────── */}
        <Panel title="Pipeline" icon="layers" sub="Active assignments by stage">
          {active.length ? <Donut parts={pipeline} centerLabel={active.length} centerSub="IN HOUSE" /> : <EmptyState icon="clipboard" title="Nothing in house" desc="Check in a device and the pipeline lights up." />}
        </Panel>
      </div>

      <div className="grid cols-3">
        {/* ── Tech board ──────────────────────────────────────────── */}
        <Panel className="span-2" title="Who has what" icon="users" sub="Live load per tech — click a job to open it">
          <div className="techboard" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, loads.length))}, minmax(0, 1fr))` }}>
            {loads.map(({ tech, assignments, tickets: tk }) => {
              const load = assignments.length + tk.length;
              return (
                <div key={tech.id} className="techcol" style={{ '--c': tech.color }}>
                  <div className="techcol-head">
                    <div className="row"><Avatar tech={tech} /><div><div style={{ fontWeight: 700 }}>{tech.name}</div><div className="faint mono" style={{ fontSize: 10.5, letterSpacing: '0.08em' }}>{assignments.length} IN HOUSE · {tk.length} OPEN</div></div></div>
                    {state.settings.currentTech === tech.id && <Chip size="sm" tone="accent">you</Chip>}
                  </div>
                  <div className="techcol-load"><i style={{ width: `${(load / maxLoad) * 100}%` }} /></div>
                  {assignments.length === 0 && <div className="faint" style={{ fontSize: 12 }}>No devices in house.</div>}
                  {assignments.sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt)).slice(0, 4).map((a) => (
                    <div key={a.id} className="mini" onClick={() => openAssignment(a.id)}>
                      <span className="truncate"><span className="tag" style={{ fontSize: 10.5, marginRight: 6 }}>{a.tag}</span>{a.customerName}</span>
                      <AgeBadge receivedAt={a.receivedAt} threshold={th} now={now} compact />
                    </div>
                  ))}
                  {assignments.length > 4 && <div className="faint mt-2" style={{ fontSize: 11.5 }}>+{assignments.length - 4} more</div>}
                </div>
              );
            })}
          </div>
        </Panel>

        {/* ── Service mix ──────────────────────────────────────────── */}
        <Panel title="Service mix" icon="filter" sub="What comes to the counter">
          {mix.length ? <BarList items={mix.slice(0, 6)} /> : <EmptyState icon="filter" title="No data yet" />}
        </Panel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ACTIVITY
// ═══════════════════════════════════════════════════════════════════════════
const ACTION_META = {
  'ticket.create': ['cloud', 'logged a ticket', 'accent'],
  'ticket.logged': ['check-circle', 'pushed to Salesforce', 'green'],
  'ticket.reopen': ['undo', 'reopened a ticket', 'amber'],
  'ticket.delete': ['trash', 'deleted a ticket', 'red'],
  'assignment.create': ['clipboard', 'checked in a device', 'accent'],
  'assignment.status': ['arrow-right', 'changed status', 'violet'],
  'assignment.log': ['edit', 'added a log entry', 'violet'],
  'assignment.update': ['edit', 'edited details', null],
  'assignment.delete': ['trash', 'deleted an assignment', 'red'],
  'inventory.add': ['box', 'added inventory', null],
  'inventory.out': ['upload', 'checked out gear', 'amber'],
  'inventory.in': ['download', 'returned gear', 'green'],
  'inventory.quarantine': ['alert-triangle', 'quarantined gear', 'red'],
  'inventory.adjust': ['hash', 'adjusted stock', null],
  'inventory.delete': ['trash', 'removed inventory', 'red'],
  'tech.switch': ['user', 'signed in', null],
  'data.demo': ['sparkles', 'loaded demo data', 'violet'],
  'data.reset': ['alert-triangle', 'reset the board', 'red'],
  'ticket.unix': ['hash', 'entered an order in UNIX', 'green'],
  'team.add': ['users', 'added a tech', 'accent'],
  'team.remove': ['users', 'removed a tech', 'red'],
  'broadcast.post': ['bell', 'posted a team alert', 'amber'],
  'broadcast.remove': ['bell', 'cleared a team alert', null],
  'goal.set': ['star', 'changed the daily goal', 'accent'],
  'management.update': ['shield', 'updated management settings', null],
  'management.pin': ['lock', 'changed the manager PIN', 'amber'],
};

function Activity() {
  const { state, now, openRef } = useStore();
  const [filter, setFilter] = useState('all');
  const [tech, setTech] = useState('');
  const items = state.activity.filter((a) => (filter === 'all' || a.action.startsWith(filter)) && (!tech || a.tech === tech));
  const findRef = (a) => {
    if (a.action.startsWith('assignment')) { const x = state.assignments.find((r) => r.tag === a.label); return x ? { type: 'assignment', id: x.id } : null; }
    if (a.action.startsWith('ticket')) { const x = state.tickets.find((r) => r.tag === a.label); return x ? { type: 'ticket', id: x.id } : null; }
    if (a.action.startsWith('inventory')) { const x = state.inventory.find((r) => r.name === a.label); return x ? { type: 'inventory', id: x.id } : null; }
    return null;
  };
  return (
    <Panel title="Activity feed" icon="activity" sub={`${state.activity.length} events on record (last 400 kept)`}
      actions={<>
        <Segmented value={filter} onChange={setFilter} options={[{ id: 'all', label: 'All' }, { id: 'assignment', label: 'Assignments' }, { id: 'ticket', label: 'Tickets' }, { id: 'inventory', label: 'Station' }, { id: 'team', label: 'Team' }, { id: 'broadcast', label: 'Alerts' }]} />
        <Select value={tech} onChange={(e) => setTech(e.target.value)} style={{ width: 140 }}><option value="">Everyone</option>{TECHS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
      </>}>
      {items.length === 0 ? <EmptyState icon="activity" title="Quiet so far" desc="Every ticket, status change and note shows up here with who did it." /> : (
        <div className="log">
          {items.slice(0, 120).map((a) => {
            const [icon, verb, tone] = ACTION_META[a.action] || ['dots', a.action, null];
            const ref = findRef(a);
            return (
              <div key={a.id} className={`log-item ${tone ? '' : 'is-system'}`} style={tone ? { '--c': `var(--${tone === 'red' ? 'red-2' : tone})` } : undefined}>
                <span className="log-dot"><Icon name={icon} /></span>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div className="log-text"><b>{techName(a.tech)}</b> {verb}{a.label ? <> · <button className="tag" onClick={() => ref && openRef(ref)} style={{ cursor: ref ? 'pointer' : 'default' }}>{a.label}</button></> : null}{a.detail ? <span className="muted"> — {a.detail}</span> : null}</div>
                    <div className="log-meta">{fmtDateTime(a.ts)} · {relTime(a.ts, now)}</div>
                  </div>
                  <Avatar tech={a.tech} size="sm" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
function Settings() {
  const { state, api, toast, sync, confirm, sfx } = useStore();
  const s = state.settings;
  const set = (patch) => api.setSettings(patch);
  const fileRef = useRef(null);

  const exportJson = () => { downloadText(`gts-hub-backup-${dayKey()}.json`, api.exportJSON(), 'application/json'); toast('Backup downloaded', { tone: 'success' }); };
  const exportCsv = () => {
    const rows = state.assignments.filter((a) => !a.deletedAt);
    const csv = toCSV(rows, [
      { label: 'Tag', value: 'tag' }, { label: 'Customer', value: 'customerName' }, { label: 'Phone', value: 'phone' }, { label: 'Email', value: 'email' },
      { label: 'Order #', value: 'orderNumber' }, { label: 'Service type', value: (r) => serviceLabel(r.serviceType) }, { label: 'Device', value: 'deviceDesc' }, { label: 'Issue', value: 'issue' },
      { label: 'Tech', value: (r) => techName(r.tech) }, { label: 'Status', value: (r) => ASG_STATUS_BY_ID[r.status]?.label }, { label: 'Received', value: 'receivedAt' }, { label: 'Ready', value: 'readyAt' }, { label: 'Picked up', value: 'pickedUpAt' }, { label: 'Location', value: 'location' },
    ]);
    downloadText(`gts-assignments-${dayKey()}.csv`, csv, 'text/csv');
    const t = state.tickets.filter((x) => !x.deletedAt);
    downloadText(`gts-salesforce-log-${dayKey()}.csv`, toCSV(t, [
      { label: 'Tag', value: 'tag' }, { label: 'Order #', value: 'orderNumber' }, { label: 'Customer', value: 'customerName' }, { label: 'Service type', value: (r) => serviceLabel(r.serviceType) },
      { label: 'Description', value: 'description' }, { label: 'Tech', value: (r) => techName(r.tech) }, { label: 'Status', value: 'status' }, { label: 'Created', value: 'createdAt' }, { label: 'Logged', value: 'loggedAt' },
    ]), 'text/csv');
    toast('Two CSV files downloaded (assignments + Salesforce log)', { tone: 'success' });
  };
  const importFile = (file) => {
    const r = new FileReader();
    r.onload = () => { try { api.importState(String(r.result)); toast('Backup restored', { tone: 'success' }); } catch (e) { toast(`Import failed: ${e.message}`, { tone: 'error' }); } };
    r.readAsText(file);
  };

  return (
    <div className="settings-grid">
      <Panel title="Who are you?" icon="user" sub="Auto-fills the tech on every ticket and assignment created on this device.">
        <div className="stack" style={{ gap: 8 }}>
          {TECHS.map((t) => (
            <button key={t.id} className={`techcard ${s.currentTech === t.id ? 'is-active' : ''}`} style={{ '--c': t.color }} onClick={() => { api.setTech(t.id); sfx('success'); toast(`Signed in as ${t.name}`, { tone: 'success' }); }}>
              <Avatar tech={t} size="lg" />
              <span className="grow"><div className="techcard-name">{t.name}</div><div className="techcard-sub">GTS TECHNICIAN</div></span>
              {s.currentTech === t.id ? <Chip tone="accent" icon="check">Active</Chip> : <Icon name="chevron-right" style={{ color: 'var(--text-3)' }} />}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Station" icon="sliders" sub="Rules and labels for this counter.">
        <div className="stack" style={{ gap: 0 }}>
          <div className="setting">
            <div><div className="setting-title">Overdue threshold</div><div className="setting-desc">Devices held this long turn red and raise an alert.</div></div>
            <Select value={s.overdueDays} onChange={(e) => set({ overdueDays: Number(e.target.value) })} style={{ width: 120 }}>
              {[1, 2, 3, 4, 5, 7, 10, 14].map((n) => <option key={n} value={n}>{n} day{n > 1 ? 's' : ''}</option>)}
            </Select>
          </div>
          <div className="setting">
            <div><div className="setting-title">Station name</div><div className="setting-desc">Shown on the home screen and printed tags.</div></div>
            <Input value={s.stationName} onChange={(e) => set({ stationName: e.target.value })} style={{ width: 180 }} />
          </div>
          <div className="setting">
            <div><div className="setting-title">Store label</div><div className="setting-desc">Footer and printouts.</div></div>
            <Input value={s.storeLabel} onChange={(e) => set({ storeLabel: e.target.value })} style={{ width: 180 }} />
          </div>
          <div className="setting">
            <div><div className="setting-title">Counter phone</div><div className="setting-desc">Printed on claim tickets so customers can call back.</div></div>
            <Input value={s.counterPhone} onChange={(e) => set({ counterPhone: e.target.value })} placeholder="(212) 555-0100" style={{ width: 180 }} className="mono" />
          </div>
          <div className="setting">
            <div><div className="setting-title">Theme</div><div className="setting-desc">Dark is the console look; light is friendlier for a bright counter.</div></div>
            <Segmented value={s.theme} onChange={(v) => set({ theme: v })} options={[{ id: 'dark', label: 'Dark', icon: 'moon' }, { id: 'light', label: 'Light', icon: 'sun' }]} />
          </div>
          <div className="setting">
            <div><div className="setting-title">UI sounds</div><div className="setting-desc">Subtle blips on actions. Off by default for the sales floor.</div></div>
            <Toggle on={s.sounds} onChange={(v) => { set({ sounds: v }); if (v) setTimeout(() => sfx('success'), 50); }} label="UI sounds" />
          </div>
        </div>
      </Panel>

      <TeamSyncPanel sync={sync} settings={s} set={set} toast={toast} sfx={sfx} confirm={confirm} />


      <Panel title="Data" icon="database" sub={sync.status === 'idle' ? 'Shared with the team and cached in this browser. Back it up now and then.' : 'Everything is stored in this browser. Back it up.'}>
        <div className="stack" style={{ gap: 0 }}>
          <div className="setting">
            <div><div className="setting-title">Backup</div><div className="setting-desc">Full JSON snapshot you can restore anywhere.</div></div>
            <div className="row"><Btn size="sm" icon="download" onClick={exportJson}>JSON</Btn><Btn size="sm" icon="download" onClick={exportCsv}>CSV</Btn></div>
          </div>
          <div className="setting">
            <div><div className="setting-title">Restore</div><div className="setting-desc">Replaces the records on this device with a backup file.</div></div>
            <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) confirm({ title: 'Restore backup?', message: `Replace everything on this device with “${f.name}”?`, confirmLabel: 'Restore', danger: true, onConfirm: () => importFile(f) }); e.target.value = ''; }} />
            <Btn size="sm" icon="upload" onClick={() => fileRef.current?.click()}>Import JSON</Btn>
          </div>
          <div className="setting">
            <div><div className="setting-title">Demo data</div><div className="setting-desc">Synthetic tickets, drop-offs and gear to explore the app. Clear before real use.</div></div>
            {s.demoLoaded
              ? <Btn size="sm" variant="danger" icon="trash" onClick={() => { api.clearDemo(); toast('Demo records removed', { tone: 'success' }); }}>Clear demo</Btn>
              : <Btn size="sm" icon="sparkles" onClick={() => { api.loadDemo(); toast('Demo data loaded — look at the Home alerts', { tone: 'success' }); }}>Load demo</Btn>}
          </div>
          <div className="setting">
            <div><div className="setting-title">Reset</div><div className="setting-desc">{sync.status === 'idle' ? 'Delete every record on the shared board — for all three devices. Settings stay.' : 'Delete every record on this device. Settings stay.'}</div></div>
            <Btn size="sm" variant="danger" icon="alert-triangle" onClick={() => confirm({ title: sync.status === 'idle' ? 'Delete the whole team board?' : 'Delete all data?', danger: true, confirmLabel: 'Delete everything', message: sync.status === 'idle' ? 'Team sync is on, so this wipes tickets, assignments, inventory and activity for everyone — Mike’s and Keeshon’s screens too. Export a backup first if you might need it.' : 'This wipes tickets, assignments, inventory and activity from this browser. Export a backup first if you might need it.', onConfirm: () => { api.clearAll(); toast('All records deleted', { tone: 'warning' }); } })}>Reset</Btn>
          </div>
          <div className="setting">
            <div><div className="setting-title">About</div><div className="setting-desc">GTS Hub v{APP_VERSION} · built for the B&amp;H GTS counter by ZAYS.</div></div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  TEAM SYNC (Settings card) — create / enter passcode, live status, who's online
// ═══════════════════════════════════════════════════════════════════════════
function TeamSyncPanel({ sync, settings: s, set, toast, sfx, confirm }) {
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [showChange, setShowChange] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');

  const others = onlineOthers(sync);
  const me = TECH_BY_ID[s.currentTech];
  const status = sync.status;
  const tone = status === 'idle' ? (sync.live ? 'green' : 'accent') : status === 'error' ? 'red' : status === 'setup' || status === 'locked' ? 'amber' : undefined;
  const chipLabel = { idle: sync.live ? 'Live' : 'Connected', error: 'Error', setup: 'Needs passcode', locked: 'Locked', unconfigured: 'Local mode', off: 'Off', probing: 'Checking…' }[status] || status;

  const doSetup = async () => {
    setErr(null);
    if (pass.length < 4) return setErr('Use at least 4 characters.');
    if (pass !== pass2) return setErr('The two passcodes don’t match.');
    setBusy(true);
    const r = await sync.setup(pass);
    setBusy(false);
    if (r.ok) { setPass(''); setPass2(''); sfx('success'); }
    else setErr(r.error);
  };
  const doConnect = async () => {
    setErr(null);
    if (!pass) return setErr('Enter the team passcode.');
    setBusy(true);
    await sync.connect(pass);
    setBusy(false);
    setPass('');
  };
  const doChange = async () => {
    setErr(null);
    if (next.length < 4) return setErr('New passcode: at least 4 characters.');
    setBusy(true);
    const r = await sync.change(cur, next);
    setBusy(false);
    if (r.ok) { setShowChange(false); setCur(''); setNext(''); toast('Team passcode changed — the other devices will ask for it', { tone: 'success' }); }
    else setErr(r.error);
  };
  const onEnter = (fn) => (e) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } };

  const hero = (cls, icon, title, sub) => (
    <div className={`sync-hero ${cls || ''}`}>
      <div className="sync-hero-icon"><Icon name={icon} size={20} /></div>
      <div className="grow"><div className="sync-hero-title">{title}</div><div className="sync-hero-sub">{sub}</div></div>
    </div>
  );

  return (
    <Panel title="Team sync" icon="users" sub="One live board for Mike, Keeshon and Isaiah — every edit shows up on the other screens within a second."
      actions={<Chip size="sm" tone={tone} icon={status === 'idle' ? (sync.live ? 'zap' : 'check') : status === 'error' ? 'alert-circle' : status === 'setup' || status === 'locked' ? 'lock' : 'info'}>{chipLabel}</Chip>}>
      <div className="stack" style={{ gap: 0 }}>

        {status === 'probing' && hero('', 'refresh', 'Checking team sync…', 'Looking for the shared database.')}

        {status === 'unconfigured' && (
          <>
            {hero('', 'database', 'Local mode', 'No team database is attached to this deployment yet, so records live in this browser only.')}
            <ol className="steps">
              <li>In Vercel open the <b>gts-hub</b> project → <b>Storage</b> → <b>Create Database</b> → <b>Supabase</b> (free plan).</li>
              <li>Connect it to the project (all environments) and <b>redeploy</b>.</li>
              <li>Reload this page — the first device creates the team passcode right here.</li>
            </ol>
          </>
        )}

        {status === 'setup' && (
          <>
            {hero('is-warn', 'lock', 'Create the team passcode', 'The database is ready. Pick a passcode the three of you will share — Mike and Keeshon type it once on their devices and they’re in.')}
            <div className="sync-form" style={{ padding: '6px 0 4px' }}>
              <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Team passcode" className="mono" autoComplete="new-password" onKeyDown={onEnter(doSetup)} />
              <Input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="Repeat it" className="mono" autoComplete="new-password" onKeyDown={onEnter(doSetup)} />
              <Btn variant="primary" icon="zap" onClick={doSetup} loading={busy}>Create & connect</Btn>
            </div>
            {err && <div style={{ color: 'var(--red-2)', fontSize: 12.5, paddingBottom: 6 }}>{err}</div>}
          </>
        )}

        {status === 'locked' && (
          <>
            {hero('is-warn', 'lock', 'Enter the team passcode', 'This device isn’t on the shared board yet. Type the passcode the team set up (ask Isaiah) and you’ll see the same tickets and drop-offs as everyone else.')}
            <div className="sync-form" style={{ padding: '6px 0 4px' }}>
              <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Team passcode" className="mono" autoComplete="current-password" onKeyDown={onEnter(doConnect)} autoFocus />
              <Btn variant="primary" icon="arrow-right" onClick={doConnect} loading={busy || sync.busy}>Connect</Btn>
            </div>
            {(err || sync.error) && <div style={{ color: 'var(--red-2)', fontSize: 12.5, paddingBottom: 6 }}>{err || sync.error}</div>}
          </>
        )}

        {status === 'error' && (
          <>
            {hero('is-bad', 'alert-triangle', 'Sync problem', sync.error || 'Unknown error')}
            {sync.needsTable && sync.sql && (
              <div style={{ paddingBottom: 8 }}>
                <div className="setting-desc">Paste this into Supabase → SQL editor → Run, then hit Retry.</div>
                <pre className="sql-box">{sync.sql}</pre>
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <Btn size="sm" icon="copy" onClick={async () => { await copyText(sync.sql); toast('SQL copied', { tone: 'success' }); }}>Copy SQL</Btn>
                  <Btn size="sm" icon="refresh" onClick={sync.run} loading={sync.busy}>Retry</Btn>
                </div>
              </div>
            )}
            {!sync.needsTable && <div className="row" style={{ gap: 8, paddingBottom: 8 }}><Btn size="sm" icon="refresh" onClick={sync.run} loading={sync.busy}>Retry</Btn></div>}
          </>
        )}

        {status === 'off' && hero('', 'power', 'Sync is off on this device', 'This browser is working on its own copy. Turn sync back on below to rejoin the team board.')}

        {status === 'idle' && (
          <>
            {hero(sync.live ? 'is-live' : '', sync.live ? 'zap' : 'refresh',
              sync.live ? 'Live — shared with the team' : 'Connected — catching up every 30 s',
              sync.live ? 'Edits from any device appear here instantly. Presence shows who has the board open.' : 'The live channel isn’t connected right now (it reconnects on its own); changes still sync on a timer.')}
            <div className="setting" style={{ alignItems: 'flex-start' }}>
              <div><div className="setting-title">Online now</div><div className="setting-desc">Devices with the board open.</div></div>
              <div className="online-list" style={{ justifyContent: 'flex-end', maxWidth: 320 }}>
                <span className="online-pill is-me"><Avatar tech={me} size="sm" /><span>{me ? me.name : 'You'} <span className="faint">· this device</span></span></span>
                {others.map((o, i) => (
                  <span key={o.tech || i} className="online-pill"><span className="dot is-live" /><Avatar tech={o.tech} size="sm" /><span>{techName(o.tech) === 'Unassigned' ? 'Someone (no tech picked)' : techName(o.tech)}{o.count > 1 ? <span className="faint"> ×{o.count}</span> : null}{o.station ? <span className="faint"> · {o.station}</span> : null}</span></span>
                ))}
                {sync.live && others.length === 0 && <span className="faint" style={{ fontSize: 12.5, alignSelf: 'center' }}>Nobody else right now</span>}
              </div>
            </div>
            <div className="setting">
              <div><div className="setting-title">Last sync</div><div className="setting-desc">{sync.lastAt ? relTime(new Date(sync.lastAt).toISOString()) : 'Never'}{sync.rev ? <span className="faint"> · rev {sync.rev}</span> : null}</div></div>
              <Btn size="sm" icon="refresh" onClick={sync.run} loading={sync.busy}>Sync now</Btn>
            </div>
            <div className="setting" style={{ flexWrap: 'wrap' }}>
              <div><div className="setting-title">Team passcode</div><div className="setting-desc">Saved on this device. Change it for everyone, or forget it here.</div></div>
              <div className="row" style={{ gap: 8 }}>
                <Btn size="sm" icon="lock" onClick={() => { setShowChange((v) => !v); setErr(null); }}>{showChange ? 'Cancel' : 'Change'}</Btn>
                <Btn size="sm" variant="ghost" icon="x" onClick={() => confirm({ title: 'Forget the passcode on this device?', message: 'This device leaves the shared board until the passcode is entered again. Nothing is deleted.', confirmLabel: 'Forget', onConfirm: () => { sync.forget(); toast('Passcode forgotten on this device', { tone: 'warning' }); } })}>Forget</Btn>
              </div>
              {showChange && (
                <div className="sync-form" style={{ width: '100%', paddingTop: 10 }}>
                  <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current passcode" className="mono" autoComplete="current-password" />
                  <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New passcode" className="mono" autoComplete="new-password" onKeyDown={onEnter(doChange)} />
                  <Btn variant="primary" size="sm" icon="check" onClick={doChange} loading={busy}>Save for everyone</Btn>
                  {err && <div style={{ color: 'var(--red-2)', fontSize: 12.5, width: '100%' }}>{err}</div>}
                </div>
              )}
            </div>
          </>
        )}

        {status !== 'unconfigured' && status !== 'probing' && (
          <div className="setting" style={{ borderBottom: 0 }}>
            <div><div className="setting-title">Sync on this device</div><div className="setting-desc">Turn off to keep this browser isolated from the team board.</div></div>
            <Toggle on={s.syncEnabled !== false} onChange={(v) => set({ syncEnabled: v })} label="Sync enabled" />
          </div>
        )}
      </div>
    </Panel>
  );
}
