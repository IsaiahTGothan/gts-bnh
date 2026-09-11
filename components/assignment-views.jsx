'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — ASSIGNMENT & TICKET VIEWS
//  TicketFields / TicketForm  — Salesforce quick-log entry
//  AssignmentForm             — overnight intake (name + phone required)
//  AssignmentDrawer           — full detail: status pipeline, tasks,
//                                work log, custody, printing, pickup
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ACCESSORIES, ASG_STATUSES, ASG_STATUS_BY_ID, NOTE_TEMPLATES, PRIORITIES, SERVICE_BY_ID, STORAGE_SPOTS, TECH_BY_ID, WAIT_REASONS, isTerminal, serviceLabel, techName } from '../lib/constants';
import { ASSIGNMENT_TYPES, CATEGORY_BY_ID } from '../lib/catalog';
import { claimTicketHTML, intakeTagHTML, printHTML } from '../lib/print';
import { computePriority, copyText, cx, effectivePriority, fmtDateTime, fmtElapsedLong, fmtTime, formatPhone, isValidEmail, isValidPhone, relTime, smsHref, telHref } from '../lib/utils';
import { useStore } from './GTSApp';
import { AgeBadge, Avatar, Btn, CheckPills, Checkbox, Chip, Drawer, Field, Icon, Input, Modal, PriorityChip, Select, ServiceIcon, StatusChip, TechSelect, Textarea, Toggle, TypePicker } from './ui';

// ═══════════════════════════════════════════════════════════════════════════
//  TICKET (Salesforce tab)
// ═══════════════════════════════════════════════════════════════════════════
export function useTicketDraft(prefill) {
  const { state } = useStore();
  const [d, setD] = useState(() => ({
    orderNumber: '', customerName: '', serviceType: null, description: '',
    tech: state.settings.currentTech, ...(prefill || {}),
  }));
  const [attempted, setAttempted] = useState(false);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  // follow the signed-in tech if it changes while the form is open
  const currentTech = state.settings.currentTech;
  useEffect(() => { if (!prefill) setD((x) => ({ ...x, tech: currentTech })); }, [currentTech]); // eslint-disable-line react-hooks/exhaustive-deps
  const isBlank = !d.orderNumber.trim() && !d.customerName.trim();
  const problems = {};
  if (isBlank && !d.serviceType && !d.description.trim()) problems.description = 'Blank tickets need at least a service type or a short description of the service.';
  const valid = Object.keys(problems).length === 0;
  const errors = attempted ? problems : {};
  const reset = () => { setD({ orderNumber: '', customerName: '', serviceType: null, description: '', tech: state.settings.currentTech }); setAttempted(false); };
  return { d, set, errors, valid, isBlank, reset, attempt: () => setAttempted(true) };
}

/** Shared fields — used by the inline Quick Log panel and the modal. */
export function TicketFields({ draft, autoFocus, compactTypes }) {
  const { d, set, errors, isBlank } = draft;
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  return (
    <div className="form-grid">
      <Field label="Order number" optional hint="Order numbers are what we mainly need — name is a fallback.">
        <Input ref={ref} className="mono input-lg" inputMode="numeric" placeholder="e.g. 1095847721" value={d.orderNumber} onChange={(e) => set('orderNumber', e.target.value)} />
      </Field>
      <Field label="Customer name" optional>
        <Input className="input-lg" placeholder="Walk-up if unknown" value={d.customerName} onChange={(e) => set('customerName', e.target.value)} />
      </Field>
      <Field label="Type of service" optional={!isBlank} className="span-2">
        <TypePicker value={d.serviceType} onChange={(v) => set('serviceType', v)} compact={compactTypes} />
      </Field>
      <Field label="Description" optional={!isBlank} error={errors.description} hint={isBlank ? 'No order # or name — describe the service so the ticket means something later.' : 'What was done or requested.'} className="span-2">
        <Textarea placeholder="e.g. Firmware update Sony A7R V 2.00 → 3.01 via card; paired with iPhone." value={d.description} onChange={(e) => set('description', e.target.value)} rows={3} />
      </Field>
      <Field label="Tech">
        <TechSelect value={d.tech} onChange={(v) => set('tech', v)} />
      </Field>
    </div>
  );
}

export function TicketForm({ prefill, onClose, onSave }) {
  const draft = useTicketDraft(prefill);
  return (
    <Modal title="New Salesforce ticket" sub="Log the interaction now, push it to Salesforce or Assignments later." onClose={onClose} icon="cloud"
      footer={<>
        <span className="faint" style={{ fontSize: 12 }}>Tip: press <kbd className="kbd">T</kbd> anywhere to open this.</span>
        <div className="row"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon="plus" disabled={!draft.valid} onClick={() => onSave(draft.d)}>Add to log</Btn></div>
      </>}>
      <TicketFields draft={draft} autoFocus />
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ASSIGNMENT INTAKE
// ═══════════════════════════════════════════════════════════════════════════
function suggestedTasks(serviceType, issue = '') {
  const s = SERVICE_BY_ID[serviceType];
  if (!s) return [];
  const pool = ASSIGNMENT_TYPES.filter((a) => s.cats.includes(a.cat));
  const text = issue.toLowerCase();
  // score: keyword hits in title/scope, then core > discussed > proposed
  const levelScore = { core: 2, discussed: 1, proposed: 0 };
  const words = text.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  return pool
    .map((a) => {
      const hay = `${a.title} ${a.scope}`.toLowerCase();
      const hits = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
      return { a, score: hits * 3 + levelScore[a.level] + (s.cats.indexOf(a.cat) === 0 ? 1 : 0) };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 8)
    .map((x) => x.a);
}

export function AssignmentForm({ prefill, existing, onClose, onSave }) {
  const { state, api, toast } = useStore();
  const th = state.settings.overdueDays;
  const [d, setD] = useState(() => existing ? {
    customerName: existing.customerName || '', phone: existing.phone || '', email: existing.email || '', orderNumber: existing.orderNumber || '',
    serviceType: existing.serviceType || null, deviceDesc: existing.deviceDesc || '', issue: existing.issue || '',
    accessories: existing.accessories || [], location: existing.location || '', accessProvided: !!existing.accessProvided,
    promisedAt: existing.promisedAt ? existing.promisedAt.slice(0, 16) : '', tech: existing.tech ?? null,
    priorityMode: existing.priorityMode || 'auto', priority: existing.priority || 'normal', tasks: [],
  } : {
    customerName: '', phone: '', email: '', orderNumber: '', serviceType: null, deviceDesc: '', issue: '',
    accessories: [], location: '', accessProvided: false, promisedAt: '', tech: state.settings.currentTech,
    priorityMode: 'auto', priority: 'normal', tasks: [],
    ...(prefill || {}),
  });
  const [touched, setTouched] = useState({});
  const [customLoc, setCustomLoc] = useState(() => !!(d.location && !STORAGE_SPOTS.includes(d.location)));
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const nameRef = useRef(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const errors = {};
  if (!d.customerName.trim()) errors.customerName = 'Required for overnight drop-offs.';
  if (!isValidPhone(d.phone)) errors.phone = 'A 10-digit phone number is required so we can reach them.';
  if (!isValidEmail(d.email)) errors.email = 'That email doesn’t look right.';
  if (!d.issue.trim()) errors.issue = 'Describe what we’re doing to the device.';
  const valid = Object.keys(errors).length === 0;

  const autoPri = useMemo(() => computePriority({ ...d, receivedAt: existing?.receivedAt || new Date().toISOString(), status: existing?.status || 'received', promisedAt: d.promisedAt ? new Date(d.promisedAt).toISOString() : null }, { thresholdDays: th }), [d, th, existing]);
  const suggestions = useMemo(() => suggestedTasks(d.serviceType, `${d.issue} ${d.deviceDesc}`), [d.serviceType, d.issue, d.deviceDesc]);

  const toggleTask = (a) => setD((x) => {
    const has = x.tasks.some((t) => t.catalogId === a.id);
    return { ...x, tasks: has ? x.tasks.filter((t) => t.catalogId !== a.id) : [...x.tasks, { catalogId: a.id, title: a.title }] };
  });

  const payload = () => ({ ...d, phone: formatPhone(d.phone), promisedAt: d.promisedAt ? new Date(d.promisedAt).toISOString() : null });
  const submit = (andPrint) => {
    if (!valid) { setTouched({ customerName: true, phone: true, email: true, issue: true }); toast('Fill in the required fields first', { tone: 'warning' }); return; }
    if (existing) {
      const { tasks, ...patch } = payload();
      api.updateAssignment(existing.id, patch, 'Details edited');
      onClose();
      toast(`${existing.tag} updated`, { tone: 'success' });
      return;
    }
    onSave(payload(), andPrint);
  };

  const err = (k) => (touched[k] ? errors[k] : undefined);
  const touch = (k) => setTouched((t) => ({ ...t, [k]: true }));

  return (
    <Modal title={existing ? `Edit ${existing.tag}` : 'Check in a device'} sub={existing ? 'Change the intake details. Status and history are managed in the drawer.' : 'Overnight drop-off — name and phone are required so we can reach the customer.'} onClose={onClose} icon="clipboard" size="lg"
      footer={<>
        <div className="row" style={{ gap: 10 }}>
          <span className="faint" style={{ fontSize: 12 }}>Criticality</span>
          {d.priorityMode === 'auto'
            ? <PriorityChip priority={autoPri.id} title={autoPri.reasons.join(' · ') || 'Baseline'} />
            : <PriorityChip priority={d.priority} manual />}
          <span className="faint hidden-mobile" style={{ fontSize: 12 }}>{d.priorityMode === 'auto' ? (autoPri.reasons[0] || 'Escalates automatically as the hold time grows') : 'Manual — won’t auto-escalate'}</span>
        </div>
        <div className="row">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          {!existing && <Btn variant="subtle" icon="printer" onClick={() => submit(true)} title="Check in and print the intake tag">Check in &amp; print tag</Btn>}
          <Btn variant="primary" icon={existing ? 'check' : 'arrow-right'} onClick={() => submit(false)}>{existing ? 'Save changes' : 'Check in device'}</Btn>
        </div>
      </>}>
      <div className="form-grid">
        <div className="form-section" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>Customer</div>
        <Field label="Customer name" required error={err('customerName')}>
          <Input ref={nameRef} className="input-lg" placeholder="First and last name" value={d.customerName} onChange={(e) => set('customerName', e.target.value)} onBlur={() => touch('customerName')} invalid={!!err('customerName')} />
        </Field>
        <Field label="Phone" required error={err('phone')} hint={!err('phone') ? 'Formats as you type' : undefined}>
          <Input className="input-lg mono" inputMode="tel" placeholder="(212) 555-0100" value={d.phone} onChange={(e) => set('phone', formatPhone(e.target.value))} onBlur={() => touch('phone')} invalid={!!err('phone')} />
        </Field>
        <Field label="Email" optional error={err('email')}>
          <Input type="email" placeholder="name@example.com" value={d.email} onChange={(e) => set('email', e.target.value)} onBlur={() => touch('email')} invalid={!!err('email')} />
        </Field>
        <Field label="Order number" optional>
          <Input className="mono" inputMode="numeric" placeholder="B&H order #" value={d.orderNumber} onChange={(e) => set('orderNumber', e.target.value)} />
        </Field>

        <div className="form-section">Device &amp; work</div>
        <Field label="Type of service" className="span-2">
          <TypePicker value={d.serviceType} onChange={(v) => set('serviceType', v)} />
        </Field>
        <Field label="Device (make / model)" optional hint="Exact model matters for firmware and drivers.">
          <Input placeholder='e.g. MacBook Pro 14" M3, Sony A7R V…' value={d.deviceDesc} onChange={(e) => set('deviceDesc', e.target.value)} />
        </Field>
        <Field label="Promised by" optional hint="Drives auto-criticality when set.">
          <Input type="datetime-local" value={d.promisedAt} onChange={(e) => set('promisedAt', e.target.value)} />
        </Field>
        <Field label="Requested work / issue" required error={err('issue')} className="span-2">
          <Textarea rows={3} placeholder="What the customer wants done, exact symptoms or errors, what data must be preserved…" value={d.issue} onChange={(e) => set('issue', e.target.value)} onBlur={() => touch('issue')} invalid={!!err('issue')} />
        </Field>
        {!existing && suggestions.length > 0 && (
          <Field label="Suggested tasks" optional hint="From the GTS service catalog — tap to add as a checklist." className="span-2">
            <div className="suggest">
              {suggestions.map((a) => {
                const on = d.tasks.some((t) => t.catalogId === a.id);
                return <Chip key={a.id} tone={on ? 'accent' : undefined} icon={on ? 'check' : 'plus'} onClick={() => toggleTask(a)} title={a.scope}>{a.title}</Chip>;
              })}
            </div>
          </Field>
        )}

        <div className="form-section">Custody</div>
        <Field label="Left with the device" optional className="span-2">
          <CheckPills options={ACCESSORIES} value={d.accessories} onChange={(v) => set('accessories', v)} />
        </Field>
        <Field label="Storage location" optional>
          {!customLoc ? (
            <Select value={d.location} onChange={(e) => { if (e.target.value === '__custom') { setCustomLoc(true); set('location', ''); } else set('location', e.target.value); }}>
              <option value="">Not shelved yet</option>
              {STORAGE_SPOTS.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="__custom">Other…</option>
            </Select>
          ) : (
            <div className="row">
              <Input placeholder="Where is it?" value={d.location} onChange={(e) => set('location', e.target.value)} autoFocus />
              <Btn variant="ghost" size="sm" onClick={() => { setCustomLoc(false); set('location', ''); }}>Presets</Btn>
            </div>
          )}
        </Field>
        <Field label="Device access" optional hint="Never type passwords here — keep them on the paper intake tag.">
          <div className="row" style={{ height: 40 }}>
            <Toggle on={d.accessProvided} onChange={(v) => set('accessProvided', v)} label="Customer provided device access" />
            <span className="muted" style={{ fontSize: 13 }}>Customer provided passcode / login</span>
          </div>
        </Field>

        <div className="form-section">Ownership</div>
        <Field label="Tech">
          <TechSelect value={d.tech} onChange={(v) => set('tech', v)} />
        </Field>
        <Field label="Criticality" hint={d.priorityMode === 'auto' ? 'Auto escalates with age, deadlines and data-loss symptoms.' : 'Fixed until you switch back to auto.'}>
          <div className="row">
            <Select value={d.priorityMode} onChange={(e) => set('priorityMode', e.target.value)} style={{ flex: 1 }}>
              <option value="auto">Auto (recommended)</option>
              <option value="manual">Set manually</option>
            </Select>
            {d.priorityMode === 'manual' && (
              <Select value={d.priority} onChange={(e) => set('priority', e.target.value)} style={{ flex: 1 }}>
                {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
            )}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ASSIGNMENT DRAWER
// ═══════════════════════════════════════════════════════════════════════════
export function AssignmentDrawer({ asg, onClose }) {
  const { state, api, now, toast, sfx, confirm } = useStore();
  const th = state.settings.overdueDays;
  const [editing, setEditing] = useState(false);
  const [waitPrompt, setWaitPrompt] = useState(false);
  const [waitReason, setWaitReason] = useState(asg.waitReason || WAIT_REASONS[0]);
  const [note, setNote] = useState('');
  const [noteType, setNoteType] = useState('note');
  const [newTask, setNewTask] = useState('');
  const pri = effectivePriority(asg, { now, thresholdDays: th });
  const active = !isTerminal(asg.status);
  const tasks = asg.tasks || [];
  const done = tasks.filter((t) => t.done).length;
  const svc = SERVICE_BY_ID[asg.serviceType];
  const suggestions = useMemo(() => suggestedTasks(asg.serviceType, `${asg.issue} ${asg.deviceDesc}`).filter((a) => !tasks.some((t) => t.catalogId === a.id)).slice(0, 6), [asg.serviceType, asg.issue, asg.deviceDesc, tasks]);
  const outItems = state.inventory.filter((i) => !i.deletedAt && i.status === 'checked_out' && i.assignmentId === asg.id);

  const setStatus = (s) => {
    if (s === asg.status) return;
    if (s === 'waiting') { setWaitPrompt(true); return; }
    api.setAsgStatus(asg.id, s); sfx('click');
    if (s === 'ready') toast(`${asg.tag} marked ready — call ${asg.customerName.split(' ')[0]}`, { tone: 'success' });
  };
  const confirmWait = () => { api.setAsgStatus(asg.id, 'waiting', { reason: waitReason }); setWaitPrompt(false); sfx('click'); };

  const addNote = () => {
    const text = note.trim(); if (!text) return;
    api.addLog(asg.id, { type: noteType, text }); setNote(''); sfx('click');
  };
  const addTaskManual = () => { const t = newTask.trim(); if (!t) return; api.addTask(asg.id, { title: t }); setNewTask(''); };

  const pickedUp = () => confirm({
    title: `Hand back ${asg.tag}?`,
    message: `Confirm ${asg.customerName} collected the ${asg.deviceDesc || serviceLabel(asg.serviceType)}${outItems.length ? `. ${outItems.length} station item(s) are still checked out to this job — check them in on the Station tab.` : '.'}`,
    confirmLabel: 'Picked up',
    onConfirm: () => { api.setAsgStatus(asg.id, 'picked_up'); sfx('success'); toast(`${asg.tag} closed — picked up by customer`, { tone: 'success' }); },
  });
  const cancelJob = () => confirm({
    title: `Cancel ${asg.tag}?`, danger: true, confirmLabel: 'Cancel job',
    message: 'Marks the job cancelled and keeps its history. The device still needs to go back to the customer.',
    onConfirm: () => { api.setAsgStatus(asg.id, 'cancelled'); toast(`${asg.tag} cancelled`, { tone: 'warning' }); },
  });
  const remove = () => confirm({
    title: `Delete ${asg.tag}?`, danger: true, confirmLabel: 'Delete',
    message: 'Removes the record from every view. You can undo from the toast for a few seconds.',
    onConfirm: () => { api.deleteAssignment(asg.id); onClose(); toast(`${asg.tag} deleted`, { tone: 'warning', action: { label: 'Undo', onClick: () => api.restoreAssignment(asg.id) }, duration: 7000 }); },
  });

  const first = (asg.customerName || '').split(' ')[0];
  const smsBody = asg.status === 'ready'
    ? `Hi ${first}, this is Guest Technical Services at B&H. Your ${asg.deviceDesc || serviceLabel(asg.serviceType)} is ready for pickup (ref ${asg.tag}).`
    : `Hi ${first}, this is Guest Technical Services at B&H about your ${asg.deviceDesc || serviceLabel(asg.serviceType)} (ref ${asg.tag}).`;

  const stepperStatuses = ASG_STATUSES.filter((s) => !s.terminal);
  const curIdx = stepperStatuses.findIndex((s) => s.id === asg.status);

  return (
    <>
      <Drawer onClose={onClose}
        header={
          <>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div className="stack" style={{ gap: 6 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className="tag" style={{ fontSize: 13 }}>{asg.tag}</span>
                  <StatusChip status={asg.status} />
                  <PriorityChip priority={pri.id} manual={pri.manual} title={pri.reasons.join(' · ')} />
                  {asg.demo && <Chip size="sm">DEMO</Chip>}
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700 }}>{asg.customerName}</h2>
                <div className="row muted" style={{ gap: 6, fontSize: 13 }}><ServiceIcon type={asg.serviceType} />{asg.deviceDesc || serviceLabel(asg.serviceType)}</div>
              </div>
              <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                {active && <AgeBadge receivedAt={asg.receivedAt} threshold={th} now={now} />}
                <Btn variant="ghost" size="sm" icon="x" onClick={onClose} aria-label="Close" />
              </div>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <a className="btn btn-sm btn-success" href={telHref(asg.phone)}><Icon name="call" />Call</a>
              <a className="btn btn-sm" href={smsHref(asg.phone, smsBody)}><Icon name="message" />Text</a>
              {asg.email && <a className="btn btn-sm" href={`mailto:${asg.email}?subject=${encodeURIComponent(`B&H GTS — ${asg.tag}`)}`}><Icon name="mail" />Email</a>}
              {asg.orderNumber && <Btn size="sm" icon="copy" onClick={async () => { await copyText(asg.orderNumber); toast(`Order ${asg.orderNumber} copied`); }}>Order #</Btn>}
              <Btn size="sm" icon="printer" variant="ghost" onClick={() => printHTML(intakeTagHTML(asg, state.settings))}>Tag</Btn>
              <Btn size="sm" icon="printer" variant="ghost" onClick={() => printHTML(claimTicketHTML(asg, state.settings))}>Claim ticket</Btn>
            </div>
          </>
        }
        footer={
          <>
            {active && asg.status !== 'ready' && <Btn variant="success" icon="check" onClick={() => setStatus('ready')}>Mark ready</Btn>}
            {active && <Btn variant={asg.status === 'ready' ? 'primary' : 'default'} icon="check-circle" onClick={pickedUp}>Picked up</Btn>}
            {!active && <Btn icon="undo" onClick={() => api.setAsgStatus(asg.id, 'received')}>Reopen</Btn>}
            <span className="grow" />
            <Btn variant="ghost" icon="edit" onClick={() => setEditing(true)} title="Edit details" aria-label="Edit" />
            {active && <Btn variant="ghost" icon="x" onClick={cancelJob} title="Cancel job" aria-label="Cancel job" />}
            <Btn variant="ghost" icon="trash" onClick={remove} title="Delete" aria-label="Delete" />
          </>
        }>

        {/* ── Pipeline ─────────────────────────────────────────────── */}
        <section>
          <div className="section-title"><h4>Pipeline</h4>{!active && <Chip size="sm">{ASG_STATUS_BY_ID[asg.status]?.label}</Chip>}</div>
          <div className="stepper">
            {stepperStatuses.map((s, i) => (
              <button key={s.id} className={cx('step', i < curIdx && 'is-done', s.id === asg.status && 'is-current')} style={{ '--c': s.color }} onClick={() => setStatus(s.id)} disabled={!active} title={s.hint}>
                <span className="step-bar" /><span className="step-label">{s.short}</span>
              </button>
            ))}
          </div>
          {waitPrompt && (
            <div className="panel is-flat mt-3" style={{ padding: 12 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <span className="muted" style={{ fontSize: 13 }}>Why is it waiting?</span>
                <Select value={waitReason} onChange={(e) => setWaitReason(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
                  {WAIT_REASONS.map((r) => <option key={r}>{r}</option>)}
                </Select>
                <Btn size="sm" variant="primary" onClick={confirmWait}>Set waiting</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setWaitPrompt(false)}>Never mind</Btn>
              </div>
            </div>
          )}
          {asg.status === 'waiting' && asg.waitReason && <div className="mt-2 muted" style={{ fontSize: 12.5 }}><Icon name="clock" size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> Waiting on: <b>{asg.waitReason}</b></div>}
          {pri.reasons.length > 0 && !pri.manual && (
            <div className="mt-2 faint" style={{ fontSize: 12 }}>Auto-criticality: {pri.reasons.join(' · ')}</div>
          )}
        </section>

        {/* ── Details ──────────────────────────────────────────────── */}
        <section>
          <div className="section-title"><h4>Details</h4></div>
          <dl className="dl">
            <dt>Issue</dt><dd>{asg.issue || '—'}</dd>
            <dt>Phone</dt><dd className="mono">{asg.phone}</dd>
            {asg.email && <><dt>Email</dt><dd>{asg.email}</dd></>}
            <dt>Order #</dt><dd className="mono">{asg.orderNumber || '—'}</dd>
            <dt>Received</dt><dd>{fmtDateTime(asg.receivedAt)} <span className="faint">· {fmtElapsedLong(asg.receivedAt, now)} ago</span></dd>
            {asg.promisedAt && <><dt>Promised</dt><dd style={{ color: new Date(asg.promisedAt) < now ? 'var(--red-2)' : undefined }}>{fmtDateTime(asg.promisedAt)}</dd></>}
            {asg.readyAt && <><dt>Ready since</dt><dd>{fmtDateTime(asg.readyAt)}</dd></>}
            {asg.pickedUpAt && <><dt>Picked up</dt><dd>{fmtDateTime(asg.pickedUpAt)}</dd></>}
            <dt>Location</dt><dd>{asg.location || <span className="faint">not shelved</span>}</dd>
            <dt>Left with it</dt><dd>{(asg.accessories || []).length ? asg.accessories.join(', ') : <span className="faint">nothing</span>}</dd>
            <dt>Access</dt><dd>{asg.accessProvided ? 'Customer provided passcode (on paper tag)' : <span className="faint">no passcode provided</span>}</dd>
            <dt>Tech</dt>
            <dd>
              <div className="row" style={{ gap: 8 }}>
                <Avatar tech={asg.tech} size="sm" />
                <TechSelect value={asg.tech} onChange={(v) => api.updateAssignment(asg.id, { tech: v }, `Reassigned to ${techName(v)}`)} style={{ maxWidth: 200 }} />
              </div>
            </dd>
            <dt>Criticality</dt>
            <dd>
              <div className="row wrap" style={{ gap: 8 }}>
                <Select value={asg.priorityMode || 'auto'} onChange={(e) => api.updateAssignment(asg.id, { priorityMode: e.target.value }, `Criticality set to ${e.target.value}`)} style={{ maxWidth: 150 }}>
                  <option value="auto">Auto</option><option value="manual">Manual</option>
                </Select>
                {asg.priorityMode === 'manual' && (
                  <Select value={asg.priority || 'normal'} onChange={(e) => api.updateAssignment(asg.id, { priority: e.target.value }, `Criticality → ${e.target.value}`)} style={{ maxWidth: 150 }}>
                    {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </Select>
                )}
              </div>
            </dd>
            {outItems.length > 0 && <><dt>Station gear</dt><dd>{outItems.map((i) => <Chip key={i.id} size="sm" icon="box" style={{ marginRight: 4 }}>{i.name}</Chip>)}</dd></>}
          </dl>
        </section>

        {/* ── Tasks ────────────────────────────────────────────────── */}
        <section>
          <div className="section-title">
            <h4>Tasks {tasks.length ? <span className="faint">· {done}/{tasks.length}</span> : null}</h4>
            {tasks.length > 0 && <div className="progress" style={{ width: 120 }}><i style={{ width: `${(done / tasks.length) * 100}%` }} /></div>}
          </div>
          <div className="tasks">
            {tasks.map((t) => (
              <div key={t.id} className={cx('task', t.done && 'is-done')}>
                <Checkbox checked={t.done} onChange={() => { api.toggleTask(asg.id, t.id); sfx('click'); }} label={t.title} />
                <span className="task-title">{t.title} {t.catalogId && <span className="task-id">· {t.catalogId}</span>}</span>
                <Btn variant="ghost" size="xs" icon="x" onClick={() => api.removeTask(asg.id, t.id)} aria-label="Remove task" />
              </div>
            ))}
            {tasks.length === 0 && <div className="faint" style={{ fontSize: 12.5 }}>No checklist yet — add a custom step or pick from the catalog suggestions.</div>}
          </div>
          <div className="row mt-2">
            <Input placeholder="Add a step…" value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTaskManual(); }} />
            <Btn icon="plus" onClick={addTaskManual} disabled={!newTask.trim()} aria-label="Add task" />
          </div>
          {suggestions.length > 0 && (
            <div className="mt-2">
              <div className="faint mb-2" style={{ fontSize: 11.5 }}>Catalog suggestions for {svc?.label || 'this'} work</div>
              <div className="suggest">
                {suggestions.map((a) => <Chip key={a.id} icon="plus" onClick={() => api.addTask(asg.id, { catalogId: a.id, title: a.title })} title={`${a.id} · ${CATEGORY_BY_ID[a.cat]?.name}\n${a.scope}`}>{a.title}</Chip>)}
              </div>
            </div>
          )}
        </section>

        {/* ── Work log ─────────────────────────────────────────────── */}
        <section>
          <div className="section-title"><h4>Work log</h4><span className="faint" style={{ fontSize: 11.5 }}>{(asg.log || []).length} entries</span></div>
          <div className="stack" style={{ gap: 8 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              {NOTE_TEMPLATES.map((t) => <Chip key={t.label} size="sm" icon={t.type === 'call' ? 'call' : 'edit'} onClick={() => { setNoteType(t.type); setNote(t.text); }}>{t.label}</Chip>)}
            </div>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Select value={noteType} onChange={(e) => setNoteType(e.target.value)} style={{ width: 110, flex: 'none' }}>
                <option value="note">Note</option><option value="call">Call</option>
              </Select>
              <Textarea rows={2} placeholder="What did you observe or do? Keep facts and guesses separate." value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote(); }} style={{ minHeight: 44 }} />
              <Btn variant="primary" icon="send" onClick={addNote} disabled={!note.trim()} aria-label="Add note" title="⌘/Ctrl + Enter" />
            </div>
          </div>
          <div className="log mt-3">
            {[...(asg.log || [])].reverse().map((e) => (
              <div key={e.id} className={cx('log-item', `is-${e.type || 'note'}`)}>
                <span className="log-dot"><Icon name={e.type === 'status' ? 'arrow-right' : e.type === 'call' ? 'call' : e.type === 'system' ? 'zap' : 'edit'} /></span>
                <div>
                  <div className="log-text">{e.text}</div>
                  <div className="log-meta">{techName(e.tech)} · {fmtDateTime(e.ts)} · {relTime(e.ts, now)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </Drawer>
      {editing && <AssignmentForm existing={asg} onClose={() => setEditing(false)} />}
    </>
  );
}

// Small helper used by list views: compact card summary line
export function asgSummary(asg) {
  return `${asg.tag} · ${asg.customerName} · ${asg.deviceDesc || serviceLabel(asg.serviceType)}`;
}
