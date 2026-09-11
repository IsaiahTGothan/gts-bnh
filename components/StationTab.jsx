'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — STATION TAB
//  Inventory (check-out / check-in / quarantine / stock counts) and the
//  shift handoff sheet generated from live data.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { INVENTORY_TYPES } from '../lib/catalog';
import { ASG_STATUS_BY_ID, TECHS, isTerminal, serviceLabel, techName } from '../lib/constants';
import { handoffHTML, printHTML } from '../lib/print';
import { ageLevel, buildAlerts, copyText, fmtElapsed, matches, relTime } from '../lib/utils';
import { useStore } from './GTSApp';
import { Avatar, Btn, Chip, EmptyState, Field, Icon, Input, Modal, Panel, Segmented, Select, TechSelect, Textarea } from './ui';

const TYPE_BY_ID = Object.fromEntries(INVENTORY_TYPES.map((t) => [t.id, t]));
const STATUS_META = { available: ['green', 'Available'], checked_out: ['amber', 'Checked out'], quarantined: ['red', 'Quarantined'] };

export default function StationTab() {
  const { state, api, now, toast, confirm, highlight, openAssignment } = useStore();
  const [view, setView] = useState('all');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [modal, setModal] = useState(null); // { type:'add'|'edit'|'out'|'in', item }
  const searchRef = useRef(null);

  useEffect(() => {
    const h = () => searchRef.current?.focus();
    window.addEventListener('gts:focus-search', h);
    return () => window.removeEventListener('gts:focus-search', h);
  }, []);

  const items = state.inventory.filter((i) => !i.deletedAt);
  const counts = { all: items.length, available: items.filter((i) => i.status === 'available').length, checked_out: items.filter((i) => i.status === 'checked_out').length, quarantined: items.filter((i) => i.status === 'quarantined').length, low: items.filter((i) => i.kind === 'consumable' && i.minQty != null && i.qty <= i.minQty).length };
  const list = useMemo(() => items
    .filter((i) => view === 'all' || (view === 'low' ? (i.kind === 'consumable' && i.minQty != null && i.qty <= i.minQty) : i.status === view))
    .filter((i) => !cat || i.category === cat)
    .filter((i) => matches(q, i.name, i.serial, i.location, i.notes, TYPE_BY_ID[i.category]?.name, techName(i.holder)))
    .sort((a, b) => (a.status === 'checked_out' ? -1 : 0) - (b.status === 'checked_out' ? -1 : 0) || a.name.localeCompare(b.name)), [items, view, cat, q]);

  const active = state.assignments.filter((a) => !a.deletedAt && !isTerminal(a.status));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Station · {state.settings.stationName}</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Inventory &amp; handoff</h1>
          <p className="page-sub">Readers, cables, working storage, loaners and consumables — who has what, and a handoff sheet for the next shift.</p>
        </div>
        <div className="row wrap">
          {counts.low > 0 && <Chip tone="amber" icon="alert-circle">{counts.low} low stock</Chip>}
          <Btn variant="primary" icon="plus" onClick={() => setModal({ type: 'add' })}>Add item</Btn>
        </div>
      </div>

      <div className="station-grid">
        <div className="stack" style={{ gap: 14 }}>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <Segmented value={view} onChange={setView} options={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'available', label: 'Available' },
              { id: 'checked_out', label: 'Out', count: counts.checked_out, hot: true },
              { id: 'quarantined', label: 'Quarantine', count: counts.quarantined },
              { id: 'low', label: 'Low stock', count: counts.low },
            ]} />
            <div className="input-wrap"><Icon name="search" /><Input ref={searchRef} placeholder="Search gear…  ( / )" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <Select value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 200 }}><option value="">All categories</option>{INVENTORY_TYPES.filter((t) => t.id !== 'customer_item').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          </div>

          {list.length === 0 ? (
            <EmptyState icon="box" title={items.length ? 'Nothing matches' : 'No station inventory yet'} desc={items.length ? 'Adjust the filter.' : 'Add the readers, cables and working drives the counter actually owns. Customer devices are tracked on Assignments, not here.'} action={!items.length && <Btn icon="plus" onClick={() => setModal({ type: 'add' })}>Add first item</Btn>} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th style={{ minWidth: 220 }}>Item</th><th className="nowrap">Qty / serial</th><th>Status</th><th>Where</th><th></th></tr></thead>
                <tbody>
                  {list.map((i) => {
                    const [tone, label] = STATUS_META[i.status] || STATUS_META.available;
                    const asg = i.assignmentId ? state.assignments.find((a) => a.id === i.assignmentId) : null;
                    const low = i.kind === 'consumable' && i.minQty != null && i.qty <= i.minQty;
                    const hl = highlight?.type === 'inventory' && highlight.id === i.id;
                    return (
                      <tr key={i.id} className={hl ? 'flash' : ''}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{i.name}</div>
                          <div className="faint" style={{ fontSize: 11.5, maxWidth: 360 }}>{TYPE_BY_ID[i.category]?.name || i.category || ''}{i.notes ? ` · ${i.notes}` : ''}</div>
                        </td>
                        <td className="mono nowrap">{i.kind === 'asset' ? (i.serial || '—') : <span className="row" style={{ gap: 4 }}>{i.kind === 'consumable' && <Btn size="xs" variant="ghost" icon="chevron-left" title="Use one" onClick={() => api.adjustQty(i.id, -1, 'used')} disabled={i.qty <= 0} />}<span style={{ color: low ? 'var(--amber)' : undefined }}>{i.qty}{i.unit ? ` ${i.unit}` : ''}</span>{i.kind === 'consumable' && <Btn size="xs" variant="ghost" icon="chevron-right" title="Restock one" onClick={() => api.adjustQty(i.id, +1, 'restock')} />}{low && <Chip size="sm" tone="amber">low</Chip>}</span>}</td>
                        <td className="nowrap"><Chip size="sm" tone={tone} icon={i.status === 'available' ? 'check' : i.status === 'checked_out' ? 'upload' : 'alert-triangle'}>{label}</Chip></td>
                        <td className="nowrap">{i.holder ? <div className="row" style={{ gap: 6 }}><Avatar tech={i.holder} size="sm" /><span>{techName(i.holder)}</span>{asg && <button className="tag" onClick={() => openAssignment(asg.id)}>{asg.tag}</button>}</div> : <span className="muted">{i.location || '—'}</span>}</td>
                        <td>
                          <div className="row end" style={{ gap: 4 }}>
                            {i.kind !== 'consumable' && i.status === 'available' && <Btn size="xs" icon="upload" onClick={() => setModal({ type: 'out', item: i })}>Check out</Btn>}
                            {i.status === 'checked_out' && <Btn size="xs" variant="success" icon="download" onClick={() => setModal({ type: 'in', item: i })}>Check in</Btn>}
                            {i.status === 'quarantined' && <Btn size="xs" icon="check" onClick={() => { api.checkIn(i.id); toast(`${i.name} back in service`, { tone: 'success' }); }}>Clear</Btn>}
                            <Btn size="xs" variant="ghost" icon="edit" onClick={() => setModal({ type: 'edit', item: i })} aria-label="Edit" />
                            <Btn size="xs" variant="ghost" icon="trash" aria-label="Remove" onClick={() => confirm({ title: `Remove ${i.name}?`, danger: true, confirmLabel: 'Remove', message: 'Takes it out of the register. History stays in the activity feed.', onConfirm: () => api.deleteItem(i.id) })} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Handoff />
      </div>

      {modal?.type === 'add' && <ItemModal onClose={() => setModal(null)} onSave={(d) => { api.addItem(d); toast(`${d.name} added`, { tone: 'success' }); setModal(null); }} />}
      {modal?.type === 'edit' && <ItemModal item={modal.item} onClose={() => setModal(null)} onSave={(d) => { api.updateItem(modal.item.id, d); toast(`${d.name} updated`, { tone: 'success' }); setModal(null); }} />}
      {modal?.type === 'out' && <CheckOutModal item={modal.item} active={active} onClose={() => setModal(null)} onSave={(d) => { api.checkOut(modal.item.id, d); toast(`${modal.item.name} checked out to ${techName(d.tech)}`, { tone: 'success' }); setModal(null); }} />}
      {modal?.type === 'in' && <CheckInModal item={modal.item} onClose={() => setModal(null)} onSave={(d) => { api.checkIn(modal.item.id, d); toast(d.quarantine ? `${modal.item.name} quarantined` : `${modal.item.name} returned`, { tone: d.quarantine ? 'warning' : 'success' }); setModal(null); }} />}
    </>
  );
}

// ─── Handoff sheet ─────────────────────────────────────────────────────────
function useHandoffText() {
  const { state, now } = useStore();
  return useMemo(() => {
    const th = state.settings.overdueDays;
    const active = state.assignments.filter((a) => !a.deletedAt && !isTerminal(a.status)).sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
    const open = state.tickets.filter((t) => !t.deletedAt && t.status === 'open');
    const out = state.inventory.filter((i) => !i.deletedAt && i.status === 'checked_out');
    const alerts = buildAlerts(state, now).filter((a) => a.severity !== 'info');
    const lines = [];
    lines.push(`GTS SHIFT HANDOFF — ${new Date(now).toLocaleString()}`);
    lines.push(`Station: ${state.settings.stationName} · Prepared by ${techName(state.settings.currentTech)}`);
    lines.push('');
    lines.push(`NEEDS ATTENTION (${alerts.length})`);
    if (!alerts.length) lines.push('  none');
    for (const a of alerts) lines.push(`  [${a.severity === 'critical' ? '!!' : ' !'}] ${a.title}`);
    lines.push('');
    lines.push(`IN HOUSE (${active.length})`);
    if (!active.length) lines.push('  none');
    for (const t of TECHS.concat([{ id: null, name: 'Unassigned' }])) {
      const mine = active.filter((a) => (a.tech || null) === t.id);
      if (!mine.length) continue;
      lines.push(`  ${t.name}:`);
      for (const a of mine) {
        const age = ageLevel(a.receivedAt, th, now);
        const last = (a.log || [])[(a.log || []).length - 1];
        lines.push(`    ${a.tag} ${a.customerName} — ${a.deviceDesc || serviceLabel(a.serviceType)} · ${ASG_STATUS_BY_ID[a.status]?.label}${a.waitReason ? ` (${a.waitReason})` : ''} · ${age.label}${age.isOverdue ? ' OVERDUE' : ''}${a.location ? ` · ${a.location}` : ''}`);
        if (last && last.type !== 'system') lines.push(`      last: ${last.text.slice(0, 110)}`);
      }
    }
    lines.push('');
    lines.push(`SALESFORCE — NOT YET PUSHED (${open.length})`);
    if (!open.length) lines.push('  none');
    for (const t of open) lines.push(`  ${t.tag} ${t.orderNumber ? `#${t.orderNumber}` : ''} ${t.customerName || ''} — ${serviceLabel(t.serviceType)}${t.description ? `: ${t.description.slice(0, 80)}` : ''} (${techName(t.tech)}, ${fmtElapsed(t.createdAt, now)} ago)`);
    lines.push('');
    lines.push(`STATION GEAR OUT (${out.length})`);
    if (!out.length) lines.push('  none');
    for (const i of out) { const asg = state.assignments.find((a) => a.id === i.assignmentId); lines.push(`  ${i.name} — ${techName(i.holder)}${asg ? ` for ${asg.tag}` : ''}`); }
    return lines.join('\n');
  }, [state, now]);
}

function Handoff() {
  const { state, toast } = useStore();
  const text = useHandoffText();
  return (
    <Panel title="Shift handoff" icon="handoff" sub="Generated live from the board. Copy it into the group chat or print it." corners
      actions={<><Btn size="sm" icon="copy" onClick={async () => { await copyText(text); toast('Handoff copied', { tone: 'success' }); }}>Copy</Btn><Btn size="sm" variant="ghost" icon="printer" onClick={() => printHTML(handoffHTML(text, state.settings))} aria-label="Print" /></>}>
      <pre className="handoff">{text}</pre>
    </Panel>
  );
}

// ─── Modals ────────────────────────────────────────────────────────────────
function ItemModal({ item, onClose, onSave }) {
  const [d, setD] = useState(() => ({ name: item?.name || '', category: item?.category || 'reader', kind: item?.kind || 'asset', serial: item?.serial || '', qty: item?.qty ?? 1, unit: item?.unit || '', minQty: item?.minQty ?? '', location: item?.location || '', notes: item?.notes || '' }));
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const valid = d.name.trim().length > 0;
  const type = TYPE_BY_ID[d.category];
  return (
    <Modal title={item ? `Edit ${item.name}` : 'Add station item'} sub="Station-owned gear only. Customer devices belong on Assignments." onClose={onClose} icon="box"
      footer={<><span className="faint" style={{ fontSize: 12 }}>{type ? `e.g. ${type.examples.slice(0, 3).join(', ')}` : ''}</span><div className="row"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon="check" disabled={!valid} onClick={() => onSave({ ...d, qty: Number(d.qty) || 0, minQty: d.minQty === '' ? null : Number(d.minQty) })}>{item ? 'Save' : 'Add item'}</Btn></div></>}>
      <div className="form-grid">
        <Field label="Name" required className="span-2"><Input autoFocus placeholder="e.g. CFexpress Type B reader (ProGrade)" value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Category"><Select value={d.category} onChange={(e) => set('category', e.target.value)}>{INVENTORY_TYPES.filter((t) => t.id !== 'customer_item').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Tracking" hint={d.kind === 'asset' ? 'One physical item with a serial/tag' : d.kind === 'pool' ? 'Interchangeable items counted together' : 'Stock that gets used up'}>
          <Select value={d.kind} onChange={(e) => set('kind', e.target.value)}><option value="asset">Serialized asset</option><option value="pool">Counted pool</option><option value="consumable">Consumable</option></Select>
        </Field>
        {d.kind === 'asset' ? (
          <Field label="Serial / asset tag" optional><Input className="mono" value={d.serial} onChange={(e) => set('serial', e.target.value)} /></Field>
        ) : (
          <Field label="Quantity"><div className="row"><Input type="number" min="0" value={d.qty} onChange={(e) => set('qty', e.target.value)} style={{ width: 100 }} /><Input placeholder="unit (sets, rolls…)" value={d.unit} onChange={(e) => set('unit', e.target.value)} /></div></Field>
        )}
        {d.kind === 'consumable' && <Field label="Low-stock alert at" optional><Input type="number" min="0" value={d.minQty} onChange={(e) => set('minQty', e.target.value)} placeholder="e.g. 1" /></Field>}
        <Field label="Home location" optional><Input placeholder="Bench drawer 1, Locker 2…" value={d.location} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="Notes" optional className="span-2"><Textarea rows={2} placeholder="Known-good combos, quirks, wipe-after-use…" value={d.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function CheckOutModal({ item, active, onClose, onSave }) {
  const { state } = useStore();
  const [tech, setTech] = useState(state.settings.currentTech);
  const [asgId, setAsgId] = useState('');
  return (
    <Modal title={`Check out ${item.name}`} onClose={onClose} size="sm" icon="upload"
      footer={<><span /><div className="row"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon="upload" disabled={!tech} onClick={() => onSave({ tech, assignmentId: asgId || null })}>Check out</Btn></div></>}>
      <Field label="Who has it" required><TechSelect value={tech} onChange={setTech} allowNone={false} /></Field>
      <Field label="For which job" optional hint="Ties the gear to the device so it shows up on the handoff sheet.">
        <Select value={asgId} onChange={(e) => setAsgId(e.target.value)}><option value="">Bench / general use</option>{active.map((a) => <option key={a.id} value={a.id}>{a.tag} · {a.customerName}</option>)}</Select>
      </Field>
    </Modal>
  );
}

function CheckInModal({ item, onClose, onSave }) {
  const [condition, setCondition] = useState('good');
  const [note, setNote] = useState('');
  return (
    <Modal title={`Check in ${item.name}`} onClose={onClose} size="sm" icon="download"
      footer={<><span /><div className="row"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant={condition === 'good' ? 'primary' : 'danger'} icon={condition === 'good' ? 'check' : 'alert-triangle'} onClick={() => onSave({ quarantine: condition !== 'good', note: note.trim() })}>{condition === 'good' ? 'Back in service' : 'Quarantine'}</Btn></div></>}>
      <Field label="Condition">
        <Segmented value={condition} onChange={setCondition} options={[{ id: 'good', label: 'Working', icon: 'check' }, { id: 'bad', label: 'Damaged / unreliable', icon: 'alert-triangle' }]} />
      </Field>
      <Field label="Note" optional><Input placeholder={condition === 'good' ? 'Anything to know?' : 'What’s wrong with it?'} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {item.holder && <p className="faint" style={{ fontSize: 12.5 }}>Currently with {techName(item.holder)}{item.checkedOutAt ? ` · out since ${relTime(item.checkedOutAt)}` : ''}.</p>}
    </Modal>
  );
}
