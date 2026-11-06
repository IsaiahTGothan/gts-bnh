'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — STATS → REAL NUMBERS (V5.2)
//  Busiest weekdays, calendar heat map, daily totals, what GTS Hub captured,
//  7-day forecast, weekly summary. Split from RealNumbers.jsx so it loads with
//  the Stats tab, not at startup. Engine: lib/real-counts.js
// ═══════════════════════════════════════════════════════════════════════════
import React, { useMemo, useState } from 'react';
import { WEEKDAYS_SHORT, addDays, forecast, gtsLoggedByDay, localDay, monthGrid, realStats, weeklySummaryText } from '../lib/real-counts';
import { copyText, cx, downloadText, toCSV } from '../lib/utils';
import { useStore } from './GTSApp';
import { RealTotalBox, niceDay, pct } from './RealNumbers';
import { Btn, Chip, Columns, EmptyState, Icon, KPI, Panel } from './ui';

/** Stats → Real numbers. `days` = the Stats range (0 = all time). */
export default function RealNumbersView({ days }) {
  const { state, api, confirm, toast, can } = useStore();
  const today = localDay();
  const from = days ? addDays(today, -(days - 1)) : null;
  const gtsByDay = useMemo(() => gtsLoggedByDay(state), [state.tickets, state.assignments]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = state.dailyCounts || [];
  const s = useMemo(() => realStats(counts, { from, to: today, gtsByDay }), [counts, from, today, gtsByDay]);
  const all = useMemo(() => realStats(counts, { gtsByDay }), [counts, gtsByDay]);
  const fc = useMemo(() => forecast(counts, { today }), [counts, today]);
  const [editDay, setEditDay] = useState(today);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const byDay = useMemo(() => new Map(counts.filter((c) => !c.deletedAt).map((c) => [c.day, c])), [counts]);
  const maxDay = Math.max(1, ...counts.filter((c) => !c.deletedAt).map((c) => c.total));
  const weekdayBars = s.byWeekday.map((w) => ({ label: w.label, value: w.avg == null ? 0 : Math.round(w.avg * 10) / 10, hot: s.busiest?.wd === w.wd, color: s.busiest?.wd === w.wd ? 'var(--accent)' : 'var(--violet)', tip: w.n ? `${w.avg.toFixed(1)} a day on average · ${w.n} ${w.label}${w.n > 1 ? 's' : ''} counted · best ${w.max}${w.closed ? ` · closed ${w.closed}×` : ''}` : w.closed ? `Closed (${w.closed} counted)` : 'No real totals yet' }));
  const daily = s.days.slice(0, 31).reverse().map((d) => ({ label: niceDay(d.day, { month: 'numeric', day: 'numeric' }), value: d.total, hot: d.day === s.best?.day, color: 'var(--accent)', tip: `${niceDay(d.day)} · ${d.total} real · GTS Hub logged ${d.gts} (${pct(d.capture)})` }));
  const exportCsv = () => downloadText(`gts-real-numbers-${today}.csv`, toCSV(s.days, [
    { label: 'Day', value: 'day' }, { label: 'Weekday', value: (d) => WEEKDAYS_SHORT[d.weekday] }, { label: 'Real total (Salesforce)', value: 'total' }, { label: 'GTS Hub logged', value: 'gts' },
    { label: 'Not in GTS Hub', value: (d) => Math.max(0, d.gap) }, { label: 'Captured %', value: (d) => (d.capture == null ? '' : Math.round(d.capture * 100)) }, { label: 'Source', value: 'source' }, { label: 'Entered by', value: 'by' }, { label: 'Note', value: 'note' },
  ]), 'text/csv');
  const pick = (day) => { setEditDay(day); document.getElementById('real-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="real-intro">
        <Icon name="database" size={16} />
        <span><b>Real numbers</b> are the day’s true totals from Salesforce — counted by the copy-sheet bot when it finishes, or typed here. They’re kept apart from what GTS Hub logs, so a missed Quick Log never skews them. No times, just days: perfect for seeing which days are really busy.</span>
      </div>

      <div className="grid cols-4">
        <KPI label="Real customers" value={s.total} icon="users" delta={`${s.recorded} day${s.recorded === 1 ? '' : 's'} counted${s.closedDays ? ` · ${s.closedDays} closed` : ''}`} />
        <KPI label="Average per day" value={s.avg == null ? '—' : s.avg.toFixed(1)} icon="activity" tone="violet" delta={s.median != null ? `median ${s.median}` : 'no days yet'} />
        <KPI label="Busiest day" value={s.busiest ? s.busiest.label : '—'} icon="flag" tone="amber" delta={s.busiest ? `${s.busiest.avg.toFixed(1)} a day${s.quietest ? ` · quietest ${s.quietest.label} ${s.quietest.avg.toFixed(1)}` : ''}` : 'needs a few days'} />
        <KPI label="GTS Hub captured" value={pct(s.capture)} icon="check-circle" tone={s.capture == null ? undefined : s.capture >= 0.9 ? 'green' : s.capture >= 0.7 ? 'amber' : 'red'} delta={s.capture == null ? 'compare once days are counted' : `${s.missed} customer${s.missed === 1 ? '' : 's'} never logged in GTS Hub`} />
      </div>

      <div className="grid cols-3">
        <Panel title="Enter or fix a day" icon="edit" sub="Pick any past day — re-entering replaces the number and keeps the old one in history." className="span-2" id="real-box">
          <div style={{ padding: '4px 18px 18px' }}><RealTotalBox source="manual" day={editDay} onDayChange={setEditDay} compact /></div>
        </Panel>
        <Panel title="The week ahead" icon="calendar" sub="What each day usually brings, from the last 8 weeks of real totals">
          <div className="fc-list">
            {fc.map((d, i) => (
              <div key={d.day} className={cx('fc-row', i === 0 && 'is-today')}>
                <span className="fc-day">{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : niceDay(d.day, { weekday: 'long' })}</span>
                <span className="fc-bar"><i style={{ width: `${d.expected == null ? 0 : Math.min(100, (d.expected / Math.max(1, ...fc.map((x) => x.expected || 0))) * 100)}%` }} /></span>
                <b className="fc-num">{d.closed ? 'closed' : d.expected == null ? '—' : `~${d.expected}`}</b>
              </div>
            ))}
          </div>
          {fc.every((d) => d.expected == null) && <div className="faint" style={{ padding: '0 18px 16px', fontSize: 12.5 }}>Count a few days and this fills in.</div>}
        </Panel>
      </div>

      <div className="grid cols-2">
        <Panel title="Busiest days of the week" icon="activity" sub="Average real total per weekday — the day to staff up">
          <div style={{ padding: '6px 18px 16px' }}><Columns items={weekdayBars} height={170} format={(v) => (v ? v.toFixed(1) : '')} empty="Count a few days to see the pattern" /></div>
        </Panel>
        <Panel title="Calendar" icon="calendar" sub="Darker = busier. Click a day to enter or fix it."
          actions={<div className="row" style={{ gap: 4 }}>
            <Btn size="xs" variant="ghost" icon="chevron-left" aria-label="Previous month" onClick={() => setMonth(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))} />
            <span className="cal-month">{new Date(month.y, month.m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })}</span>
            <Btn size="xs" variant="ghost" icon="chevron-right" aria-label="Next month" onClick={() => setMonth(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))} />
          </div>}>
          <div className="cal">
            {WEEKDAYS_SHORT.map((w) => <span key={w} className="cal-wd">{w[0]}</span>)}
            {monthGrid(month.y, month.m).flat().map((day, i) => {
              if (!day) return <span key={`x${i}`} className="cal-cell is-blank" />;
              const c = byDay.get(day); const future = day > today;
              return (
                <button type="button" key={day} disabled={future} className={cx('cal-cell', c && 'has', day === today && 'is-today', editDay === day && 'is-pick')}
                  style={c ? { '--heat': Math.max(0.12, c.total / maxDay) } : undefined} onClick={() => pick(day)}
                  title={c ? `${niceDay(day)} · ${c.total} real · GTS Hub ${gtsByDay.get(day) ?? 0}` : future ? '' : `${niceDay(day)} · not counted — click to enter`}>
                  <span className="cal-d">{Number(day.slice(8))}</span>{c && <b>{c.total}</b>}
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title="Day by day" icon="list" sub={`${s.recorded} counted day${s.recorded === 1 ? '' : 's'} in range · all time ${all.recorded} days, best ${all.best ? `${all.best.total} on ${niceDay(all.best.day)}` : '—'}`}
        actions={<div className="row" style={{ gap: 6 }}>
          <Btn size="sm" icon="copy" onClick={async () => { await copyText(weeklySummaryText(counts, { today, gtsByDay, store: `${state.settings.storeLabel || 'B&H'} GTS` })); toast('Weekly summary copied — paste it into Teams or an email', { tone: 'success' }); }} disabled={!all.recorded}>Weekly summary</Btn>
          <Btn size="sm" icon="download" onClick={exportCsv} disabled={!s.recorded}>CSV</Btn>
        </div>}>
        {s.recorded ? (
          <>
            {daily.length > 1 && <div style={{ padding: '6px 18px 4px' }}><Columns items={daily} height={130} /></div>}
            <div className="table-wrap" style={{ margin: '8px 18px 18px' }}>
              <table className="table">
                <thead><tr><th>Day</th><th>Real total</th><th>GTS Hub logged</th><th>Not in GTS Hub</th><th>Captured</th><th>Source</th><th>Entered by</th><th>Note</th><th /></tr></thead>
                <tbody>
                  {s.days.map((d) => (
                    <tr key={d.id}>
                      <td><b>{niceDay(d.day)}</b></td>
                      <td className="mono"><b style={{ fontSize: 15 }}>{d.total}</b>{d.day === all.best?.day && <Chip size="sm" tone="amber" icon="star" style={{ marginLeft: 6 }}>record</Chip>}</td>
                      <td className="mono">{d.gts}</td>
                      <td className="mono" style={{ color: d.gap > 0 ? 'var(--amber)' : undefined }}>{Math.max(0, d.gap)}</td>
                      <td><span className="cap-bar"><i style={{ width: pct(d.capture), background: d.capture >= 0.9 ? 'var(--green)' : d.capture >= 0.7 ? 'var(--amber)' : 'var(--red-2)' }} /></span> <span className="mono faint">{pct(d.capture)}</span></td>
                      <td><Chip size="sm" tone={d.source === 'sheet' ? 'accent' : 'violet'}>{d.source === 'sheet' ? 'copy sheet' : 'by hand'}</Chip>{d.history?.length > 1 && <span className="faint" style={{ fontSize: 11, marginLeft: 6 }} title={d.history.map((h) => `${h.total} · ${h.by || '—'} · ${h.source}`).join('\n')}>edited ×{d.history.length - 1}</span>}</td>
                      <td>{d.by || '—'}</td>
                      <td className="faint" style={{ maxWidth: 220 }}>{d.note}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <Btn size="xs" variant="ghost" icon="edit" onClick={() => pick(d.day)} aria-label={`Edit ${d.day}`} />
                        {can('techDelete') && <Btn size="xs" variant="ghost" icon="trash" aria-label={`Remove ${d.day}`} onClick={() => confirm({ title: `Remove the real total for ${niceDay(d.day)}?`, danger: true, confirmLabel: 'Remove', message: `${d.total} customers — it can be typed in again any time.`, onConfirm: () => { api.removeRealCount(d.day); toast('Removed', { tone: 'warning' }); } })} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <EmptyState icon="database" title="No real totals in this range" desc="The copy-sheet bot saves one when it finishes, or type one above." />}
      </Panel>
    </div>
  );
}

