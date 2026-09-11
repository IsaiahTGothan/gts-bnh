'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — HOME TAB
//  Overview (KPIs · alerts · tech load · charts) · Activity · Settings
// ═══════════════════════════════════════════════════════════════════════════
import React, { useMemo, useRef, useState } from 'react';
import { APP_VERSION, ASG_STATUS_BY_ID, DEFAULT_CHECKLIST, SERVICE_TYPES, TECHS, TECH_BY_ID, isTerminal, serviceLabel, techName } from '../lib/constants';
import { ageLevel, buildAlerts, countBy, dailySeries, dayKey, downloadText, fmtDateTime, fmtElapsed, greeting, isToday, relTime, techLoad, toCSV } from '../lib/utils';
import { useStore } from './GTSApp';
import { AgeBadge, Avatar, BarList, Btn, Chip, Donut, EmptyState, Field, Icon, Input, KPI, Panel, Segmented, Select, Sparkline, StatusChip, Toggle } from './ui';

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
//  OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════
function Overview() {
  const { state, now, goTo, openRef, newAssignment, newTicket, openAssignment, api, toast } = useStore();
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

  const loads = techLoad(state);
  const maxLoad = Math.max(1, ...loads.map((l) => l.assignments.length + l.tickets.length));

  const series = useMemo(() => {
    const items = [...tickets.map((t) => ({ at: t.createdAt })), ...live.map((a) => ({ at: a.receivedAt }))];
    return dailySeries(items, 'at', 14, now);
  }, [tickets, live, now]);
  const total14 = series.reduce((s, d) => s + d.count, 0);

  const mix = useMemo(() => {
    const c = countBy([...tickets, ...live].filter((x) => x.serviceType), (x) => x.serviceType);
    return SERVICE_TYPES.map((s) => ({ label: s.label, value: c[s.id] || 0, color: s.color, icon: s.icon })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  }, [tickets, live]);

  const pipeline = useMemo(() => {
    const c = countBy(active, (a) => a.status);
    return Object.entries(ASG_STATUS_BY_ID).filter(([id, s]) => !s.terminal).map(([id, s]) => ({ label: s.label, value: c[id] || 0, color: s.color })).filter((x) => x.value > 0);
  }, [active]);

  const today = dayKey(new Date(now));
  const checks = state.checklist[today] || {};
  const checksDone = DEFAULT_CHECKLIST.filter((_, i) => checks[i]).length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* ── KPI row ─────────────────────────────────────────────────── */}
      <div className="grid cols-5">
        <KPI label="Open SF tickets" value={openTickets.length} icon="cloud" onClick={() => goTo('salesforce')} delta={<span>{tickets.filter((t) => t.loggedAt && isToday(t.loggedAt, now)).length} pushed today</span>} />
        <KPI label="In house" value={active.length} icon="clipboard" tone="violet" onClick={() => goTo('assignments')} delta={<span>avg hold {avgHold >= 24 ? `${(avgHold / 24).toFixed(1)}d` : `${Math.round(avgHold)}h`}</span>} />
        <KPI label={`Over ${th} days`} value={overdue.length} icon="alert-triangle" tone={overdue.length ? 'red' : 'green'} onClick={() => goTo('assignments')} delta={<span>{overdue.length ? <><span className="dot is-bad" /> needs attention</> : <><span className="dot is-live" /> all within limit</>}</span>} />
        <KPI label="Ready for pickup" value={ready.length} icon="check-circle" tone="green" onClick={() => goTo('assignments')} delta={<span>{ready.filter((a) => a.readyAt && (now - new Date(a.readyAt)) > 86_400_000).length} waiting 1d+</span>} />
        <KPI label="Closed today" value={doneToday} icon="zap" tone="amber" delta={<span>pickups + SF pushes</span>} />
      </div>

      {/* ── Quick actions ───────────────────────────────────────────── */}
      <div className="row wrap" style={{ gap: 8 }}>
        <Btn variant="primary" icon="plus" onClick={() => newAssignment()}>Check in device</Btn>
        <Btn icon="cloud" onClick={() => newTicket()}>Log Salesforce ticket</Btn>
        <Btn variant="ghost" icon="handoff" onClick={() => goTo('station')}>Shift handoff</Btn>
        {!state.settings.currentTech && <Chip tone="amber" icon="alert-circle">No tech selected — pick yours in Settings</Chip>}
        {state.settings.demoLoaded && <Chip tone="violet" icon="sparkles">Demo data loaded</Chip>}
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
        {/* ── Tech board ──────────────────────────────────────────── */}
        <Panel className="span-2" title="Who has what" icon="users" sub="Live load per tech — click a job to open it">
          <div className="techboard">
            {loads.map(({ tech, assignments, tickets: tk }) => {
              const load = assignments.length + tk.length;
              return (
                <div key={tech.id} className="techcol" style={{ '--c': tech.color }}>
                  <div className="techcol-head">
                    <div className="row"><Avatar tech={tech} /><div><div style={{ fontWeight: 700 }}>{tech.name}</div><div className="faint mono" style={{ fontSize: 10.5, letterSpacing: '0.08em' }}>{assignments.length} IN HOUSE · {tk.length} SF OPEN</div></div></div>
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

        {/* ── Pipeline donut ───────────────────────────────────────── */}
        <Panel title="Pipeline" icon="layers" sub="Active assignments by stage">
          {active.length ? <Donut parts={pipeline} centerLabel={active.length} centerSub="IN HOUSE" /> : <EmptyState icon="clipboard" title="Nothing in house" desc="Check in a device and the pipeline lights up." />}
        </Panel>
      </div>

      <div className="grid cols-3">
        <Panel className="span-2" title="Intake · last 14 days" icon="activity" sub={`${total14} tickets + drop-offs`} actions={<Chip size="sm" icon="calendar">{series[series.length - 1].count} today</Chip>}>
          <Sparkline series={series} height={72} />
          <div className="row between mt-2 mono faint" style={{ fontSize: 10.5 }}>
            <span>{series[0].date.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
            <span>{series[Math.floor(series.length / 2)].date.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
            <span>today</span>
          </div>
        </Panel>
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
        <Segmented value={filter} onChange={setFilter} options={[{ id: 'all', label: 'All' }, { id: 'assignment', label: 'Assignments' }, { id: 'ticket', label: 'Tickets' }, { id: 'inventory', label: 'Station' }]} />
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

      <Panel title="Team sync" icon="refresh" sub="Optional. Share one live board across the counter PC, iPad and phones."
        actions={<Chip size="sm" tone={sync.status === 'idle' ? 'green' : sync.status === 'error' ? 'red' : undefined} icon={sync.status === 'idle' ? 'check' : sync.status === 'error' ? 'alert-circle' : 'info'}>
          {sync.status === 'idle' ? 'Connected' : sync.status === 'error' ? 'Error' : sync.status === 'syncing' ? 'Syncing…' : sync.status === 'off' ? 'Off' : 'Local mode'}
        </Chip>}>
        <div className="stack" style={{ gap: 0 }}>
          {sync.status === 'unconfigured' && (
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, paddingBottom: 10 }}>
              This deployment is running in <b>local mode</b>: data lives in this browser only. To share it between the three of you, add a free Upstash Redis database in Vercel and set <code className="mono">UPSTASH_REDIS_REST_URL</code>, <code className="mono">UPSTASH_REDIS_REST_TOKEN</code> and <code className="mono">GTS_SYNC_KEY</code> — the README walks through it (about 5 minutes).
            </p>
          )}
          <div className="setting">
            <div><div className="setting-title">Sync on this device</div><div className="setting-desc">Turn off to keep this browser isolated.</div></div>
            <Toggle on={s.syncEnabled !== false} onChange={(v) => set({ syncEnabled: v })} label="Sync enabled" />
          </div>
          <div className="setting">
            <div><div className="setting-title">Team passcode</div><div className="setting-desc">Must match GTS_SYNC_KEY on the server.</div></div>
            <Input type="password" value={s.syncPasscode} onChange={(e) => set({ syncPasscode: e.target.value })} placeholder="••••••" style={{ width: 160 }} className="mono" autoComplete="off" />
          </div>
          <div className="setting">
            <div><div className="setting-title">Last sync</div><div className="setting-desc">{sync.error ? <span style={{ color: 'var(--red-2)' }}>{sync.error}</span> : sync.lastAt ? relTime(new Date(sync.lastAt).toISOString()) : 'Never'}</div></div>
            <Btn size="sm" icon="refresh" onClick={sync.run} loading={sync.status === 'syncing'}>Sync now</Btn>
          </div>
        </div>
      </Panel>

      <Panel title="Data" icon="database" sub="Everything is stored in this browser. Back it up.">
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
            <div><div className="setting-title">Reset</div><div className="setting-desc">Delete every record on this device. Settings stay.</div></div>
            <Btn size="sm" variant="danger" icon="alert-triangle" onClick={() => confirm({ title: 'Delete all data?', danger: true, confirmLabel: 'Delete everything', message: 'This wipes tickets, assignments, inventory and activity from this browser. Export a backup first if you might need it.', onConfirm: () => { api.clearAll(); toast('All records deleted', { tone: 'warning' }); } })}>Reset</Btn>
          </div>
          <div className="setting">
            <div><div className="setting-title">About</div><div className="setting-desc">GTS Hub v{APP_VERSION} · built for the B&amp;H GTS counter by ZAYS.</div></div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
