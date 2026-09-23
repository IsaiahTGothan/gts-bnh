'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — MANAGEMENT (V3)
//  Team roster (add / remove techs), team-wide alerts, the daily goal,
//  connections (Salesforce · UNIX · team sync), exports, manager PIN.
//  Protected by a PIN once one is set; the PIN hash syncs, the PIN doesn't.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useMemo, useState } from 'react';
import { BROADCAST_TONES, TECH_COLORS, techName } from '../lib/constants';
import { hashPin, verifyPin } from '../lib/pin';
import { sfTestConnection } from '../lib/salesforce';
import { computeStats, fmtPct } from '../lib/stats';
import { dayKey, downloadText, fmtDateTime, relTime, toCSV } from '../lib/utils';
import { activeBroadcasts, onlineOthers, useStore } from './GTSApp';
import { Barcode } from './UnixScan';
import { Avatar, Btn, Chip, EmptyState, Icon, Input, KPI, Panel, Ring, Segmented, Select, Textarea, Toggle } from './ui';

export default function ManagementTab() {
  const { state, api, isManager } = useStore();
  const m = state.management || {};
  if (m.pinHash && !isManager) return <PinGate />;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Management · {techName(state.settings.currentTech) === 'Unassigned' ? 'signed out' : techName(state.settings.currentTech)}</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Run the counter, <span className="grad-text">not the paperwork.</span></h1>
          <p className="page-sub">Add techs, post an alert every screen sees, set the daily goal, connect Salesforce and UNIX, pull the numbers.</p>
        </div>
        <div className="row wrap">
          {m.pinHash ? <Btn size="sm" icon="lock" onClick={() => api.setSettings({ managerUnlocked: false })}>Lock this device</Btn> : <Chip tone="amber" icon="alert-circle">No manager PIN yet — anyone can open this tab</Chip>}
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <Snapshot />
        <div className="grid cols-2">
          <TeamPanel />
          <BroadcastPanel />
        </div>
        <div className="grid cols-2">
          <GoalPanel />
          <PinPanel />
        </div>
        <ConnectionsPanel />
        <ExportsPanel />
      </div>
    </>
  );
}

// ─── PIN gate ──────────────────────────────────────────────────────────────
function PinGate() {
  const { state, api, toast, sfx } = useStore();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const ok = await verifyPin(pin, state.management.pinHash);
    setBusy(false);
    if (ok) { api.setSettings({ managerUnlocked: true }); sfx('success'); toast('Management unlocked on this device', { tone: 'success' }); }
    else { setErr('Wrong PIN'); sfx('error'); setPin(''); }
  };
  return (
    <div className="pingate">
      <div className="pingate-card corners-neon">
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
        <span className="kpi-icon" style={{ '--c': 'var(--accent)', width: 44, height: 44 }}><Icon name="lock" size={20} /></span>
        <h2 style={{ fontSize: 20, marginTop: 12 }}>Management is locked</h2>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 6 }}>Enter the manager PIN to manage the team, post alerts, change the goal and connect systems. Techs keep everything else.</p>
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <Input type="password" inputMode="numeric" className="mono input-lg" placeholder="Manager PIN" value={pin} onChange={(e) => { setPin(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} autoFocus style={{ maxWidth: 220 }} />
          <Btn variant="primary" size="lg" icon="arrow-right" onClick={submit} loading={busy} disabled={!pin}>Unlock</Btn>
        </div>
        {err && <div style={{ color: 'var(--red-2)', fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        <div className="faint" style={{ fontSize: 12, marginTop: 14 }}>Forgot it? Change it from any device that is still unlocked (Management → Manager PIN).</div>
      </div>
    </div>
  );
}

// ─── Snapshot (today) ──────────────────────────────────────────────────────
function Snapshot() {
  const { state, now, goal, goTo, sync } = useStore();
  const today = useMemo(() => computeStats(state, { days: 1, now }), [state, now]);
  const week = useMemo(() => computeStats(state, { days: 7, now }), [state, now]);
  const others = onlineOthers(sync);
  return (
    <div className="grid cols-5 stats-kpis">
      <KPI label="Customers today" value={today.totals.customers} icon="users" delta={<span>goal {goal?.perDay} · {goal?.pct >= 1 ? 'reached' : goal?.onPace ? 'on pace' : `${goal?.remaining} to go`}</span>} onClick={() => goTo('stats')} />
      <KPI label="Order # rate (7d)" value={fmtPct(week.rates.orderPct)} icon="hash" tone="green" delta={<span>{week.totals.withOrder} of {week.totals.tickets} tickets</span>} onClick={() => goTo('stats')} />
      <KPI label="Salesforce (7d)" value={fmtPct(week.rates.sfPct)} icon="cloud" delta={<span>{week.totals.pushed} pushed</span>} onClick={() => goTo('stats')} />
      <KPI label="UNIX (7d)" value={fmtPct(week.rates.unixPct)} icon="hash" tone={week.totals.needsUnix ? 'amber' : 'green'} delta={<span>{week.totals.needsUnix} orders waiting</span>} onClick={() => goTo('salesforce')} />
      <KPI label="Online now" value={others.length + (sync.status === 'idle' ? 1 : 0)} icon="zap" tone="violet" delta={<span>{sync.status === 'idle' ? (sync.live ? 'live board' : 'connected') : 'local mode'}</span>} onClick={() => goTo('home', 'settings')} />
    </div>
  );
}

// ─── Team ──────────────────────────────────────────────────────────────────
function TeamPanel() {
  const { state, api, toast, confirm, sfx } = useStore();
  const [name, setName] = useState('');
  const [role, setRole] = useState('tech');
  const team = (state.team || []).filter((t) => !t.deletedAt).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const removed = (state.team || []).filter((t) => t.deletedAt);
  const add = () => {
    const rec = api.addTech({ name, role });
    if (!rec) return;
    sfx('success'); toast(`${rec.name} added${role === 'manager' ? ' as a manager' : ''}`, { tone: 'success' }); setName(''); setRole('tech');
  };
  return (
    <Panel title="Team" icon="users" sub={`${team.length} on the roster — techs pick themselves on any device`} actions={<Chip size="sm" icon="users">{team.filter((t) => t.role === 'manager').length} manager{team.filter((t) => t.role === 'manager').length === 1 ? '' : 's'}</Chip>}>
      <div className="stack" style={{ gap: 8 }}>
        {team.map((t) => (
          <div key={t.id} className="teamrow" style={{ '--c': t.color }}>
            <Avatar tech={t} />
            <div className="grow" style={{ minWidth: 0 }}>
              <input className="teamrow-name" value={t.name} onChange={(e) => api.updateTech(t.id, { name: e.target.value })} aria-label="Tech name" />
              <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <Select value={t.role || 'tech'} onChange={(e) => api.updateTech(t.id, { role: e.target.value })} style={{ width: 120, height: 28 }} className="select-sm"><option value="tech">Tech</option><option value="manager">Manager</option></Select>
                <span className="swatches">{TECH_COLORS.map((c) => <button key={c} className={`swatch ${t.color === c ? 'is-on' : ''}`} style={{ background: c }} onClick={() => api.updateTech(t.id, { color: c })} title={c} aria-label={`Color ${c}`} />)}</span>
              </div>
            </div>
            {state.settings.currentTech === t.id && <Chip size="sm" tone="accent">you</Chip>}
            <Btn size="xs" variant="ghost" icon="trash" title="Remove from the team" onClick={() => confirm({ title: `Remove ${t.name} from the team?`, danger: true, confirmLabel: 'Remove', message: 'Their past tickets and jobs stay on the board with their name. They just stop appearing in pickers.', onConfirm: () => { api.removeTech(t.id); toast(`${t.name} removed`, { tone: 'warning', action: { label: 'Undo', onClick: () => api.restoreTech(t.id) } }); } })} />
          </div>
        ))}
        <div className="row wrap" style={{ gap: 8, paddingTop: 6 }}>
          <Input placeholder="New tech’s name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} style={{ flex: '1 1 160px' }} />
          <Select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 130 }}><option value="tech">Tech</option><option value="manager">Manager</option></Select>
          <Btn variant="primary" icon="plus" onClick={add} disabled={!name.trim()}>Add</Btn>
        </div>
        {removed.length > 0 && <div className="faint" style={{ fontSize: 12 }}>Removed: {removed.map((t) => <button key={t.id} className="linkish" onClick={() => api.restoreTech(t.id)} title="Restore">{t.name}</button>).reduce((acc, el, i) => (i ? [...acc, ', ', el] : [el]), [])} — tap a name to restore.</div>}
      </div>
    </Panel>
  );
}

// ─── Broadcasts ────────────────────────────────────────────────────────────
const EXPIRY = [{ id: 'none', label: 'Until cleared' }, { id: 'today', label: 'End of today' }, { id: '3d', label: '3 days' }, { id: '7d', label: '1 week' }];
function BroadcastPanel() {
  const { state, api, now, toast, sfx, confirm } = useStore();
  const [text, setText] = useState('');
  const [tone, setTone] = useState('info');
  const [expiry, setExpiry] = useState('today');
  const active = activeBroadcasts({ ...state, settings: { ...state.settings, dismissedBroadcasts: [] } }, now);
  const history = (state.broadcasts || []).filter((b) => !b.deletedAt && !active.includes(b)).slice(0, 5);
  const post = () => {
    let expiresAt = null;
    if (expiry === 'today') { const d = new Date(now); d.setHours(23, 59, 59, 0); expiresAt = d.toISOString(); }
    if (expiry === '3d') expiresAt = new Date(now + 3 * 86_400_000).toISOString();
    if (expiry === '7d') expiresAt = new Date(now + 7 * 86_400_000).toISOString();
    const rec = api.postBroadcast({ text, tone, expiresAt });
    if (!rec) return;
    sfx('success'); toast('Alert posted — it’s on every screen now', { tone: 'success' }); setText('');
  };
  return (
    <Panel title="Team alerts" icon="bell" sub="Posts a banner at the top of every device on the board — live." actions={active.length ? <Chip size="sm" tone="amber" icon="bell">{active.length} live</Chip> : null}>
      <div className="stack" style={{ gap: 10 }}>
        <Textarea rows={2} placeholder="e.g. We need 6 more orders before 6 PM — push every walk-up to an order number." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(); }} />
        <div className="row wrap" style={{ gap: 8 }}>
          <Segmented value={tone} onChange={setTone} options={BROADCAST_TONES.map((t) => ({ id: t.id, label: t.label, icon: t.id === 'critical' ? 'alert-circle' : t.id === 'warning' ? 'alert-triangle' : 'bell' }))} />
          <Select value={expiry} onChange={(e) => setExpiry(e.target.value)} style={{ width: 150 }}>{EXPIRY.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select>
          <span className="grow" />
          <Btn variant="primary" icon="send" onClick={post} disabled={!text.trim()}>Post to everyone</Btn>
        </div>
        {tone === 'critical' && <div className="faint" style={{ fontSize: 12 }}>Urgent alerts can’t be dismissed by techs — only cleared here.</div>}
        {active.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            {active.map((b) => (
              <div key={b.id} className={`bcast is-${b.tone} is-compact`}>
                <span className="bcast-icon"><Icon name={b.tone === 'critical' ? 'alert-circle' : b.tone === 'warning' ? 'alert-triangle' : 'bell'} /></span>
                <div className="grow" style={{ minWidth: 0 }}><div className="bcast-text">{b.text}</div><div className="bcast-meta">{techName(b.by) === 'Unassigned' ? 'Management' : techName(b.by)} · {relTime(b.createdAt, now)}{b.expiresAt ? ` · until ${fmtDateTime(b.expiresAt)}` : ''}</div></div>
                <Btn size="xs" variant="ghost" icon="trash" title="Clear for everyone" onClick={() => confirm({ title: 'Clear this alert for everyone?', message: b.text, confirmLabel: 'Clear', onConfirm: () => api.removeBroadcast(b.id) })} />
              </div>
            ))}
          </div>
        )}
        {active.length === 0 && <div className="faint" style={{ fontSize: 12.5 }}>Nothing posted right now. {history.length ? `Last: “${history[0].text.slice(0, 60)}${history[0].text.length > 60 ? '…' : ''}”` : ''}</div>}
      </div>
    </Panel>
  );
}

// ─── Daily goal ────────────────────────────────────────────────────────────
function GoalPanel() {
  const { state, api, goal, toast } = useStore();
  const m = state.management || {};
  const setGoal = (n) => { const v = Math.max(1, Math.min(500, Math.round(Number(n) || 0))); if (v === m.goalPerDay) return; api.setManagement({ goalPerDay: v }, { action: 'goal.set', label: `${v} ${m.goalLabel || 'customers'}/day`, detail: 'Daily goal changed' }); toast(`Daily goal is now ${v}`, { tone: 'success' }); };
  return (
    <Panel title="Daily goal" icon="star" sub="Counts every ticket and drop-off as a customer served. Shown on Home and in the top strip.">
      <div className="row" style={{ gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <Ring value={goal?.pct || 0} size={84} stroke={8} color={goal?.pct >= 1 ? 'var(--green)' : 'var(--accent)'} label={goal?.today ?? 0} sub={`OF ${m.goalPerDay || 20}`} />
        <div className="stack" style={{ gap: 10, flex: '1 1 220px' }}>
          <div className="row wrap" style={{ gap: 6 }}>
            {[15, 20, 25, 30, 40].map((n) => <Btn key={n} size="sm" variant={m.goalPerDay === n ? 'primary' : 'default'} onClick={() => setGoal(n)}>{n}</Btn>)}
            <Input type="number" min={1} max={500} defaultValue={m.goalPerDay || 20} key={m.goalPerDay} onBlur={(e) => setGoal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setGoal(e.target.value); }} className="mono" style={{ width: 90 }} aria-label="Custom goal" />
            <span className="muted" style={{ fontSize: 13 }}>{m.goalLabel || 'customers'} per day</span>
          </div>
          <div className="setting" style={{ padding: '8px 0 0', borderBottom: 0 }}>
            <div><div className="setting-title">How loud</div><div className="setting-desc">Subtle keeps the ring small. Bold makes the strip count down. Off hides it.</div></div>
            <Segmented value={m.goalEmphasis || 'subtle'} onChange={(v) => api.setManagement({ goalEmphasis: v })} options={[{ id: 'subtle', label: 'Subtle' }, { id: 'bold', label: 'Bold' }, { id: 'off', label: 'Off' }]} />
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ─── PIN ───────────────────────────────────────────────────────────────────
function PinPanel() {
  const { state, api, toast, sfx, confirm } = useStore();
  const m = state.management || {};
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const save = async () => {
    if (pin.length < 4) return toast('Use at least 4 digits', { tone: 'warning' });
    if (pin !== pin2) return toast('The two PINs don’t match', { tone: 'warning' });
    const pinHash = await hashPin(pin);
    api.setManagement({ pinHash }, { action: 'management.pin', label: 'Manager PIN', detail: m.pinHash ? 'Changed' : 'Set' });
    api.setSettings({ managerUnlocked: true });
    sfx('success'); toast(m.pinHash ? 'Manager PIN changed for everyone' : 'Manager PIN set — this tab is now locked on other devices', { tone: 'success' }); setPin(''); setPin2('');
  };
  return (
    <Panel title="Manager PIN" icon="lock" sub={m.pinHash ? 'Set. Techs see this tab locked until they enter it.' : 'Not set — set one before the walkthrough so only managers can change the team, goal and alerts.'}
      actions={m.pinHash ? <Chip size="sm" tone="green" icon="check">Protected</Chip> : <Chip size="sm" tone="amber" icon="alert-circle">Open</Chip>}>
      <div className="row wrap" style={{ gap: 8 }}>
        <Input type="password" inputMode="numeric" className="mono" placeholder={m.pinHash ? 'New PIN' : 'PIN (4+ digits)'} value={pin} onChange={(e) => setPin(e.target.value)} style={{ width: 150 }} autoComplete="new-password" />
        <Input type="password" inputMode="numeric" className="mono" placeholder="Repeat" value={pin2} onChange={(e) => setPin2(e.target.value)} style={{ width: 120 }} autoComplete="new-password" onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        <Btn variant="primary" icon="check" onClick={save} disabled={!pin}>{m.pinHash ? 'Change' : 'Set PIN'}</Btn>
        {m.pinHash && <Btn variant="ghost" icon="x" onClick={() => confirm({ title: 'Remove the manager PIN?', message: 'Management becomes open to every tech until a new PIN is set.', confirmLabel: 'Remove', danger: true, onConfirm: () => { api.setManagement({ pinHash: null }, { action: 'management.pin', label: 'Manager PIN', detail: 'Removed' }); toast('PIN removed', { tone: 'warning' }); } })}>Remove</Btn>}
      </div>
    </Panel>
  );
}

// ─── Connections ───────────────────────────────────────────────────────────
function ConnectionsPanel() {
  const { state, connections, sync, toast, goTo, isManager } = useStore();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showSample, setShowSample] = useState(false);
  const sf = connections.salesforce;
  const test = async () => {
    setTesting(true); setTestResult(null);
    const r = await sfTestConnection(state.settings.syncPasscode).catch((e) => ({ status: 0, error: String(e?.message || e) }));
    setTesting(false);
    if (r.status === 200 && r.ok) { setTestResult({ ok: true, text: `Connected — Case object ${r.createable ? 'is writable' : 'is NOT writable for the run-as user'} (${r.fields ?? '?'} fields)` }); toast('Salesforce connection works', { tone: 'success' }); }
    else setTestResult({ ok: false, text: r.error || `Test failed (${r.status})` });
    connections.refresh();
  };
  const syncLabel = { idle: sync.live ? 'Live · connected' : 'Connected · polling', setup: 'Needs passcode', locked: 'Locked on this device', unconfigured: 'Local mode', error: 'Error', off: 'Off', probing: 'Checking…' }[sync.status] || sync.status;
  return (
    <Panel title="Connections" icon="layers" sub="Where a Quick Log ticket goes. Green = real integration, amber = bridge or manual.">
      <div className="grid cols-3 conn-grid">
        {/* Salesforce */}
        <div className={`conn ${sf.configured ? 'is-on' : 'is-off'}`}>
          <div className="conn-head"><span className="conn-icon"><Icon name="cloud" /></span><div><div className="conn-title">Salesforce</div><div className="conn-sub">{sf.configured ? `Connected App · ${sf.host}` : 'Not connected — Push marks the ticket only'}</div></div><Chip size="sm" tone={sf.configured ? 'green' : 'amber'}>{sf.configured ? 'API' : 'Manual'}</Chip></div>
          {sf.configured ? (
            <>
              <div className="conn-body"><p>Push to Salesforce creates a Case (Subject “GTS · Order … · type”, description with the ticket) and stores the Case number on the ticket. API {sf.apiVersion}.</p></div>
              <div className="row wrap" style={{ gap: 8 }}><Btn size="sm" icon="zap" onClick={test} loading={testing}>Test connection</Btn>{testResult && <span style={{ fontSize: 12.5, color: testResult.ok ? 'var(--green)' : 'var(--red-2)' }}>{testResult.text}</span>}</div>
            </>
          ) : (
            <div className="conn-body">
              <p><b>To connect (needs the B&amp;H Salesforce admin, ~15 min):</b></p>
              <ol className="steps">
                <li>Setup → App Manager → <b>New Connected App</b> → enable OAuth, tick <b>Client Credentials Flow</b>, scope <code>api</code>.</li>
                <li>Manage → set the <b>run-as user</b> (a GTS service user who can create Cases).</li>
                <li>In Vercel → gts-hub → Environment Variables add <code>SF_INSTANCE_URL</code>, <code>SF_CLIENT_ID</code>, <code>SF_CLIENT_SECRET</code> → redeploy.</li>
              </ol>
              <div className="faint" style={{ fontSize: 12 }}>Until then every push still records who pushed and when — the manual flag stays.</div>
              {sf.error && <div style={{ color: 'var(--red-2)', fontSize: 12 }}>{sf.error}</div>}
            </div>
          )}
        </div>
        {/* UNIX */}
        <div className="conn is-bridge">
          <div className="conn-head"><span className="conn-icon"><Icon name="hash" /></span><div><div className="conn-title">UNIX (WYSE terminal)</div><div className="conn-sub">Scan bridge — no software on B&amp;H machines</div></div><Chip size="sm" tone="accent">Scan</Chip></div>
          <div className="conn-body">
            <p>The order system has no API and the firewall blocks this app on the terminals. But a USB barcode scanner is a keyboard to the WYSE: <b>Push to UNIX</b> shows the order number as a Code 128 barcode, the tech scans it, the terminal types it in with Enter.</p>
            <ul className="steps" style={{ paddingLeft: 18, margin: 0 }}>
              <li>Needs: any USB scanner plugged into the WYSE (or the PC running the terminal), Enter suffix on.</li>
              <li>Tracking: each ticket shows <b>UNIX ✓</b> once marked; Stats counts coverage.</li>
              <li>Next step (needs IT): whitelist <code>gts-hub.vercel.app</code> on the counter PCs so the barcode is on the same screen as UNIX.</li>
            </ul>
            <div className="row wrap" style={{ gap: 8 }}><Btn size="sm" icon="eye" onClick={() => setShowSample((v) => !v)}>{showSample ? 'Hide' : 'Show'} sample barcode</Btn><Btn size="sm" variant="ghost" icon="arrow-right" onClick={() => goTo('salesforce')}>Open Quick Log</Btn></div>
            {showSample && <div style={{ marginTop: 10 }}><Barcode value="1095847721" unit={2} height={64} /></div>}
          </div>
        </div>
        {/* Team sync */}
        <div className={`conn ${sync.status === 'idle' ? 'is-on' : 'is-off'}`}>
          <div className="conn-head"><span className="conn-icon"><Icon name="zap" /></span><div><div className="conn-title">Team board (live sync)</div><div className="conn-sub">{syncLabel}{sync.rev ? ` · rev ${sync.rev}` : ''}</div></div><Chip size="sm" tone={sync.status === 'idle' ? 'green' : 'amber'}>{sync.status === 'idle' ? (sync.live ? 'Live' : 'Sync') : 'Off'}</Chip></div>
          <div className="conn-body"><p>Supabase-backed shared board. Every device with the team passcode sees edits within a second; presence shows who’s online. Managed in Settings → Team sync.</p></div>
          <div className="row wrap" style={{ gap: 8 }}><Btn size="sm" icon="settings" onClick={() => goTo('home', 'settings')}>Team sync settings</Btn>{sync.status === 'idle' && <Btn size="sm" variant="ghost" icon="refresh" onClick={sync.run} loading={sync.busy}>Sync now</Btn>}</div>
        </div>
      </div>
      {!isManager && <div className="faint mt-2" style={{ fontSize: 12 }}>Read-only until unlocked.</div>}
    </Panel>
  );
}

// ─── Exports ───────────────────────────────────────────────────────────────
function ExportsPanel() {
  const { state, toast, goTo } = useStore();
  const exportTickets = (days) => {
    const cutoff = days ? Date.now() - days * 86_400_000 : 0;
    const rows = state.tickets.filter((t) => !t.deletedAt && new Date(t.createdAt).getTime() >= cutoff).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    downloadText(`gts-tickets-${days ? `${days}d-` : ''}${dayKey()}.csv`, toCSV(rows, [
      { label: 'Tag', value: 'tag' }, { label: 'Created', value: 'createdAt' }, { label: 'Order #', value: 'orderNumber' }, { label: 'Customer', value: 'customerName' }, { label: 'Service type', value: 'serviceType' },
      { label: 'Description', value: 'description' }, { label: 'Tech', value: (r) => techName(r.tech) }, { label: 'Status', value: 'status' }, { label: 'Salesforce at', value: 'loggedAt' }, { label: 'Salesforce case', value: 'sfCaseNumber' },
      { label: 'UNIX at', value: 'unixLoggedAt' }, { label: 'Log seconds', value: 'logSeconds' },
    ]), 'text/csv');
    toast(`${rows.length} tickets exported`, { tone: 'success' });
  };
  return (
    <Panel title="Reports & exports" icon="download" sub="Spreadsheet-ready. The Stats page has per-day and per-tech CSVs too.">
      <div className="row wrap" style={{ gap: 8 }}>
        <Btn size="sm" icon="download" onClick={() => exportTickets(7)}>Tickets · 7 days</Btn>
        <Btn size="sm" icon="download" onClick={() => exportTickets(30)}>Tickets · 30 days</Btn>
        <Btn size="sm" icon="download" onClick={() => exportTickets(0)}>Tickets · all</Btn>
        <Btn size="sm" variant="ghost" icon="activity" onClick={() => goTo('stats')}>Open Stats</Btn>
        <Btn size="sm" variant="ghost" icon="database" onClick={() => goTo('home', 'settings')}>Backups (Settings)</Btn>
      </div>
    </Panel>
  );
}
