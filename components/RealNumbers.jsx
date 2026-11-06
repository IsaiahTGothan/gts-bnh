'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — REAL NUMBERS (V5.2)
//  <RealTotalBox/>     type the day's true Salesforce total (copy sheet + Stats)
//  (Stats → Real numbers lives in RealNumbersView.jsx so it loads with Stats)
//  <BusyDaysCard/>     Home: the week ahead from real history + today's nudge
//  Engine: lib/real-counts.js
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useState } from 'react';
import { forecast, gtsLoggedByDay, localDay, realId, realStats } from '../lib/real-counts';
import { cx, fmtDateTime } from '../lib/utils';
import { useStore } from './GTSApp';
import { Btn, Icon, Input, Panel } from './ui';

export const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
export const niceDay = (day, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString([], opts); };

/** The one input: a day + its real Salesforce total. */
export function RealTotalBox({ source = 'manual', day: dayProp, onDayChange, compact, title }) {
  const { state, api, toast, fireHype, sfx } = useStore();
  const today = localDay();
  const [dayLocal, setDayLocal] = useState(dayProp || today);
  const day = dayProp || dayLocal;
  const setDay = (d) => { setDayLocal(d); onDayChange?.(d); };
  const saved = (state.dailyCounts || []).find((c) => c.id === realId(day) && !c.deletedAt) || null;
  const [total, setTotal] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  useEffect(() => { setTotal(saved ? String(saved.total) : ''); setNote(saved?.note || ''); setErr(null); }, [day, saved?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const gts = useMemo(() => gtsLoggedByDay(state).get(day) ?? 0, [state.tickets, state.assignments, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    const best = Math.max(0, ...(state.dailyCounts || []).filter((c) => !c.deletedAt && c.day !== day).map((c) => c.total));
    const r = api.saveRealCount({ day, total: String(total).trim() === '' ? '' : Number(total), source, note });
    if (!r.ok) { setErr(r.error); return; }
    setErr(null);
    if (best > 0 && r.record.total > best) {
      fireHype?.(10000); sfx?.('success');
      toast(`New record day — ${r.record.total} beats the old best of ${best}!`, { tone: 'success', duration: 7000 });
    } else toast(`Real total for ${day === today ? 'today' : niceDay(day)} saved: ${r.record.total}`, { tone: 'success' });
  };
  const label = day === today ? 'Today’s real total in Salesforce' : `Real total in Salesforce · ${niceDay(day)}`;
  return (
    <div className={cx('rtb', compact && 'is-compact')} id={source === 'sheet' ? 'real-total' : undefined}>
      <div className="rtb-head">
        <span className="rtb-icon"><Icon name="database" size={16} /></span>
        <div>
          <div className="rtb-title">{title || label}</div>
          <div className="rtb-sub">Every GTS guest / order Salesforce shows for that day — what was already there plus what GTS Hub put in. A counted number, never an estimate.</div>
        </div>
      </div>
      <div className="rtb-row">
        <label className="rtb-field"><span>Day</span><Input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value || today)} aria-label="Day for the real total" /></label>
        <label className="rtb-field is-num"><span>Total</span>
          <Input type="number" inputMode="numeric" min={0} step={1} className="mono rtb-num" value={total} placeholder="0" aria-label={label} id={source === 'sheet' ? 'real-total-input' : undefined}
            onChange={(e) => setTotal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
        </label>
        {source === 'manual' && <label className="rtb-field is-note"><span>Note</span><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional — e.g. store closed early" maxLength={240} /></label>}
        <Btn variant="primary" icon="check" onClick={save} id={source === 'sheet' ? 'save-real-total' : undefined}>Save real total</Btn>
      </div>
      {err && <div className="rtb-err"><Icon name="alert-circle" size={13} /> {err}</div>}
      <div className="rtb-foot">
        <span>GTS Hub logged <b>{gts}</b> that day</span>
        {saved ? <span>· Saved <b>{saved.total}</b> by {saved.by || '—'} ({saved.source === 'sheet' ? 'copy sheet' : 'by hand'}, {fmtDateTime(saved.enteredAt)}) · GTS Hub captured <b>{pct(saved.total ? Math.min(1, gts / saved.total) : null)}</b></span>
          : <span>· Nothing saved for this day yet</span>}
      </div>
    </div>
  );
}

/** Home: the week ahead + a nudge when today's real total is still missing near closing. */
export function BusyDaysCard() {
  const { state, goTo, openSfSheet } = useStore();
  const today = localDay();
  const counts = state.dailyCounts || [];
  const fc = useMemo(() => forecast(counts, { today }), [counts, today]);
  const s = useMemo(() => realStats(counts, {}), [counts]);
  const todaySaved = counts.find((c) => c.id === realId(today) && !c.deletedAt);
  const peak = Math.max(1, ...fc.map((d) => d.expected || 0));
  const hasHistory = fc.some((d) => d.expected != null);
  const late = new Date().getHours() >= 17;
  return (
    <Panel title="Busy days ahead" icon="calendar" sub={hasHistory ? `From real Salesforce totals · busiest is usually ${s.busiest?.label || '—'}` : 'Fills in from real Salesforce totals'}
      actions={<Btn size="xs" variant="ghost" iconRight="arrow-right" onClick={() => goTo('stats', 'real')}>Real numbers</Btn>}>
      <div className="busy">
        {fc.map((d, i) => (
          <div key={d.day} className={cx('busy-day', i === 0 && 'is-today', d.expected != null && d.expected === peak && 'is-peak')} title={d.closed ? `Closed every ${d.label} counted` : d.expected == null ? 'No history for this weekday yet' : `Usually ~${d.expected} (${d.samples} ${d.label}${d.samples > 1 ? 's' : ''})`}>
            <span className="busy-bar"><i style={{ height: `${d.expected == null ? 6 : Math.max(8, (d.expected / peak) * 100)}%` }} /></span>
            <b>{d.closed ? '–' : d.expected == null ? '—' : d.expected}</b>
            <span>{i === 0 ? 'Today' : d.label}</span>
          </div>
        ))}
      </div>
      <div className="busy-foot">
        {todaySaved
          ? <span><Icon name="check-circle" size={13} style={{ color: 'var(--green)' }} /> Today’s real total: <b>{todaySaved.total}</b></span>
          : <span className={cx(late && 'is-due')}><Icon name={late ? 'alert-circle' : 'clock'} size={13} /> Today’s real total isn’t in yet{late ? ' — add it before close' : ''}</span>}
        {!todaySaved && <Btn size="xs" icon="send" onClick={openSfSheet}>Copy sheet</Btn>}
        {!todaySaved && <Btn size="xs" variant="ghost" icon="edit" onClick={() => goTo('stats', 'real')}>Type it</Btn>}
      </div>
    </Panel>
  );
}
