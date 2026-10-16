'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — STATS (V3)
//  Every number on one page: order # vs no order #, Salesforce + UNIX
//  coverage, speed, per-tech, per-type, busiest hours, hold times and the
//  daily goal history. All charts are hoverable.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useMemo, useState } from 'react';
import { computeStats, fmtHours, fmtMins, fmtPct } from '../lib/stats';
import { fmtDur, hourLabel, hourShort } from '../lib/service';
import { dayReportHTML, printHTML } from '../lib/print';
import { dayKey, downloadText, toCSV } from '../lib/utils';
import { useStore } from './GTSApp';
import { Avatar, BarList, Btn, Chip, Columns, Donut, EmptyState, Heatmap, HoverChart, Icon, KPI, Panel, Ring, Segmented, SplitBar } from './ui';

const RANGES = [{ id: 1, label: 'Today' }, { id: 7, label: '7 days' }, { id: 30, label: '30 days' }, { id: 90, label: '90 days' }, { id: 0, label: 'All time' }];

export default function StatsTab() {
  const { state, now, goal, toast, goTo, can } = useStore();
  const [days, setDays] = useState(7);
  const st = useMemo(() => computeStats(state, { days, now }), [state, days, now]);
  const T = st.totals, R = st.rates;
  const rangeLabel = RANGES.find((r) => r.id === days)?.label || `${days} days`;
  const empty = T.tickets + T.assignments === 0;

  const exportCsv = () => {
    downloadText(`gts-stats-daily-${dayKey()}.csv`, toCSV(st.daily, [
      { label: 'Date', value: 'key' }, { label: 'Customers', value: 'total' }, { label: 'Tickets', value: 'tickets' }, { label: 'With order #', value: 'withOrder' },
      { label: 'Pushed to Salesforce', value: 'pushed' }, { label: 'In UNIX', value: 'unix' }, { label: 'Drop-offs', value: 'assignments' }, { label: 'Goal hit', value: (d) => (d.goalHit ? 'yes' : 'no') },
    ]), 'text/csv');
    downloadText(`gts-stats-techs-${dayKey()}.csv`, toCSV(st.byTech, [
      { label: 'Tech', value: (r) => r.tech.name }, { label: 'Customers', value: 'customers' }, { label: 'Tickets', value: 'tickets' }, { label: 'With order #', value: 'withOrder' },
      { label: 'Pushed', value: 'pushed' }, { label: 'UNIX', value: 'unix' }, { label: 'Drop-offs', value: 'assignments' }, { label: 'Picked up', value: 'pickedUp' }, { label: 'Avg log seconds', value: (r) => r.avgLogSeconds.toFixed(1) },
      { label: 'Services timed', value: 'serviceSamples' }, { label: 'Avg service minutes', value: (r) => (r.serviceSamples ? (r.avgServiceMs / 60_000).toFixed(1) : '') }, { label: 'Total service hours', value: (r) => (r.serviceTotalMs / 3_600_000).toFixed(2) },
    ]), 'text/csv');
    downloadText(`gts-stats-hours-${dayKey()}.csv`, toCSV(st.hours.map((n, h) => ({ h, n, avg: st.perHour.avgByHour[h], today: st.perHour.today[h] })).filter((r) => r.n || r.today), [
      { label: 'Hour', value: (r) => hourLabel(r.h) }, { label: `Customers (${rangeLabel})`, value: 'n' }, { label: 'Typical per working day', value: (r) => r.avg.toFixed(2) }, { label: 'Today', value: 'today' },
    ]), 'text/csv');
    toast('Three CSV files downloaded (daily · per tech · per hour)', { tone: 'success' });
  };
  const printDay = () => {
    const today = computeStats(state, { days: 1, now });
    printHTML(dayReportHTML(today, state.settings, state.management, { dur: fmtDur, pct: fmtPct }));
  };
  const S = st.service; const P = st.perHour;
  const todayHours = useMemo(() => {
    const out = []; const nowH = new Date(now).getHours();
    for (let h = 8; h <= 20; h++) out.push({ label: hourShort(h), value: P.today[h], hot: h === nowH, color: h === nowH ? 'var(--accent)' : 'var(--violet)', tip: `${P.today[h]} customer${P.today[h] === 1 ? '' : 's'} today · typical ${P.avgByHour[h].toFixed(1)}` });
    return out;
  }, [P, now]);
  const typicalHours = useMemo(() => {
    const out = []; const peak = Math.max(...P.avgByHour.slice(8, 21));
    for (let h = 8; h <= 20; h++) out.push({ label: hourShort(h), value: Math.round(P.avgByHour[h] * 10) / 10, hot: P.avgByHour[h] === peak && peak > 0, color: 'var(--accent)', tip: `${P.avgByHour[h].toFixed(1)} customers on a typical day (${st.hours[h]} in range)` });
    return out;
  }, [P, st.hours]);
  const hist = S.hist.map((b, i) => ({ label: b.label, value: b.value, color: i <= 2 ? 'var(--green)' : i <= 4 ? 'var(--amber)' : 'var(--red-2)', tip: `${b.value} ticket${b.value === 1 ? '' : 's'} took ${b.label}` }));

  const hourBars = useMemo(() => {
    const out = [];
    for (let h = 8; h <= 21; h++) out.push({ label: hourLabel(h), value: st.hours[h], color: h === st.peakHour ? 'var(--accent)' : 'var(--violet)' });
    return out;
  }, [st]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Stats · {rangeLabel.toLowerCase()}</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Every number, <span className="grad-text">one page.</span></h1>
          <p className="page-sub">Order numbers vs walk-ups, Salesforce and UNIX coverage, speed, per-tech output, busiest hours and the {goal?.perDay ?? 20}-a-day goal. Hover anything for the exact count.</p>
        </div>
        <div className="row wrap">
          <Segmented value={days} onChange={setDays} options={RANGES} />
          {can('techExport') && <Btn size="sm" icon="download" onClick={exportCsv}>CSV</Btn>}
          <Btn size="sm" icon="printer" onClick={printDay} title="Print today’s end-of-day report">Day report</Btn>
        </div>
      </div>

      {empty && <div className="mb-4"><EmptyState icon="activity" title={`Nothing logged ${days === 1 ? 'today' : `in the last ${rangeLabel.toLowerCase()}`} yet`} desc="Log a few customers in Quick Log (or load the demo data in Settings) and this page fills in." action={<Btn variant="primary" icon="zap" onClick={() => goTo('salesforce')}>Open Quick Log</Btn>} /></div>}

      <div className="stack" style={{ gap: 16 }}>
        {/* ── KPI row ─────────────────────────────────────────────── */}
        <div className="grid cols-4 stats-kpis">
          <KPI label="Customers served" value={T.customers} icon="users" delta={<span>{st.daily.length > 1 ? `${st.goal.avgPerDay.toFixed(1)} per day` : 'today'}{st.goal.best ? ` · best ${st.goal.best.total}` : ''}</span>} />
          <KPI label="Customers / open hour" value={P.perOpenHour ? P.perOpenHour.toFixed(1) : '—'} icon="clock" tone="violet" delta={<span>{Math.round(P.openHours)} open hours · {goal?.thisHour ?? 0} this hour</span>} />
          <KPI label="Avg service time" value={S.samples ? fmtDur(S.avgMs) : '—'} icon="timer" tone={S.samples && S.avgMs > S.target * 60_000 ? 'amber' : 'green'} delta={<span>{S.samples ? `median ${fmtDur(S.medianMs)} · ${S.samples} timed` : 'start → Done on each ticket'}</span>} />
          <KPI label="With order #" value={T.withOrder} icon="hash" tone="green" delta={<span>{fmtPct(R.orderPct)} of {T.tickets} tickets</span>} />
          <KPI label="No order # / blank" value={T.withoutOrder + T.blank} icon="user" tone="amber" delta={<span>{T.withoutOrder} named · {T.blank} blank</span>} />
          <KPI label="Pushed to Salesforce" value={T.pushed} icon="cloud" delta={<span>{fmtPct(R.sfPct)} of tickets{T.viaApi ? ` · ${T.viaApi} via connector` : ''}</span>} />
          <KPI label="Orders in UNIX" value={T.unixLogged} icon="hash" tone={T.needsUnix ? 'amber' : 'green'} delta={<span>{fmtPct(R.unixPct)} of orders · {T.needsUnix} waiting</span>} />
          <KPI label="Drop-offs" value={T.assignments} icon="clipboard" tone="violet" delta={<span>{T.pickedUp} picked up · {T.active} in house now</span>} />
        </div>

        {/* ── Daily + order split ─────────────────────────────────── */}
        <div className="grid cols-3">
          <Panel className="span-2" title={`Service requests per day · ${rangeLabel.toLowerCase()}`} icon="activity" sub="Hover a bar — tickets, drop-offs, orders and whether the goal was hit" corners
            actions={<Chip size="sm" icon="star" tone={st.goal.hitDays ? 'green' : undefined}>{st.goal.hitDays} goal day{st.goal.hitDays === 1 ? '' : 's'}</Chip>}>
            <HoverChart series={st.daily} goal={goal?.perDay} height={220} />
          </Panel>
          <Panel title="Order number vs no order number" icon="hash" sub="Tickets in range">
            {T.tickets ? (
              <div className="stack" style={{ gap: 14 }}>
                <Donut parts={[{ label: 'With order #', value: T.withOrder, color: 'var(--green)' }, { label: 'Name only', value: T.withoutOrder, color: 'var(--amber)' }, { label: 'Blank', value: T.blank, color: 'var(--text-3)' }].filter((p) => p.value)} centerLabel={fmtPct(R.orderPct)} centerSub="HAVE ORDER #" />
                <SplitBar a={T.withOrder} b={T.withoutOrder + T.blank} labelA="Order #" labelB="No order #" />
                <div className="faint" style={{ fontSize: 12 }}>Orders are what UNIX and Salesforce need — the higher this is, the less retyping the counter does.</div>
              </div>
            ) : <EmptyState icon="hash" title="No tickets in range" />}
          </Panel>
        </div>

        {/* ── Service time (start → done) · Customers per hour ─────── */}
        <div className="grid cols-2">
          <Panel title="Service time · start → done" icon="timer" corners glow sub={`How long a ticket takes, pauses excluded · target ${S.target} min (Management → System)`}
            actions={S.running ? <Chip size="sm" tone="accent" icon="timer">{S.running} running now</Chip> : null}>
            {S.samples ? (
              <div className="stack" style={{ gap: 16 }}>
                <div className="statgrid">
                  <Stat big label="Average" value={fmtDur(S.avgMs)} hint={`${S.samples} finished tickets`} />
                  <Stat label="Median" value={fmtDur(S.medianMs)} hint="half are faster" />
                  <Stat label="90% within" value={fmtDur(S.p90Ms)} hint={`longest ${fmtDur(S.longestMs)}`} />
                  <Stat label="Within target" value={fmtPct(S.withinTargetPct)} hint={`≤ ${S.target} min (per type)`} tone={S.withinTargetPct >= 0.8 ? 'green' : 'amber'} />
                </div>
                <Columns items={hist} height={120} />
                {S.byType.length > 0 && (
                  <div className="typebars">
                    {S.byType.map((r) => {
                      const max = Math.max(...S.byType.map((x) => Math.max(x.avgMs, x.target * 60_000)));
                      return (
                        <div key={r.id} className={`typebar ${r.avgMs > r.target * 60_000 ? 'is-over' : ''}`} title={`${r.n} done · avg ${fmtDur(r.avgMs)} · target ${r.target}m`}>
                          <span className="truncate"><Icon name={r.icon} size={12} style={{ display: 'inline', verticalAlign: '-2px', color: r.color }} /> {r.label} <span className="faint">· {r.n}</span></span>
                          <span className="typebar-track"><i style={{ width: `${(r.avgMs / max) * 100}%`, '--c': r.color }} /><b style={{ left: `${((r.target * 60_000) / max) * 100}%` }} title="target" /></span>
                          <span className="typebar-val">{fmtDur(r.avgMs)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="faint" style={{ fontSize: 12 }}>Total time with customers: <b style={{ color: 'var(--text)' }}>{fmtDur(S.totalMs)}</b>. The white tick on each bar is that type’s target.</div>
              </div>
            ) : <EmptyState icon="timer" title="No finished services in range" desc="Every ticket starts a service clock when it’s logged — hit Done on the card (or in Now serving) when the customer walks away." action={<Btn variant="primary" icon="zap" onClick={() => goTo('salesforce')}>Open Quick Log</Btn>} />}
          </Panel>
          <Panel title="Customers per hour" icon="users" corners sub={`${P.perOpenHour ? `${P.perOpenHour.toFixed(1)} per open hour` : 'No traffic yet'} · ${goal?.thisHour ?? 0} so far this hour (${goal?.lastHour ?? 0} last hour)`}
            actions={P.busiestDayHour ? <Chip size="sm" icon="star" title={`Busiest single hour in range: ${P.busiestDayHour.day} ${hourLabel(P.busiestDayHour.hour)}`}>record {P.busiestDayHour.n}/hr</Chip> : null}>
            <div className="stack" style={{ gap: 18 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 6 }}><h4>Today, hour by hour</h4><span className="faint" style={{ fontSize: 11.5 }}>{goal?.perHourToday != null ? `${goal.perHourToday.toFixed(1)}/hr so far` : ''}</span></div>
                <Columns items={todayHours} height={120} empty="Nobody logged today yet" />
              </div>
              <div>
                <div className="section-title" style={{ marginBottom: 6 }}><h4>Typical day · {rangeLabel.toLowerCase()}</h4><span className="faint" style={{ fontSize: 11.5 }}>average per working day</span></div>
                <Columns items={typicalHours} height={110} format={(v) => (Math.round(v * 10) / 10).toString()} />
              </div>
              {st.queue.joined > 0 && (
                <div className="statgrid">
                  <Stat label="Walk-ins" value={st.queue.joined} hint={`${st.queue.served} served · ${st.queue.left} left`} />
                  <Stat label="Avg wait" value={fmtDur(st.queue.avgWaitMs)} hint={`median ${fmtDur(st.queue.medianWaitMs)}`} tone={st.queue.avgWaitMs > 15 * 60_000 ? 'amber' : 'green'} />
                  <Stat label="Waiting now" value={st.queue.waitingNow} hint="in the queue" />
                  <Stat label="Walk-out rate" value={st.queue.joined ? fmtPct(st.queue.left / st.queue.joined) : '—'} hint="left before service" tone={st.queue.left ? 'amber' : undefined} />
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* ── Speed · Goal · Hold ─────────────────────────────────── */}
        <div className="grid cols-3">
          <Panel title="Speed" icon="timer" sub="Why Quick Log exists" glow>
            <div className="statgrid">
              <Stat big label="Avg time to log" value={st.speed.samples ? `${st.speed.avgLogSeconds.toFixed(1)}s` : '—'} hint={st.speed.samples ? `median ${st.speed.medianLogSeconds.toFixed(1)}s · fastest ${st.speed.fastestLog.toFixed(1)}s` : 'starts counting on the first keystroke'} />
              <Stat label="Ticket → Salesforce" value={fmtMins(st.speed.avgPushMinutes)} hint="avg time until pushed" />
              <Stat label="Ticket → UNIX" value={fmtMins(st.speed.avgUnixMinutes)} hint="avg time until scanned" />
              <Stat label="Minutes saved" value={st.speed.minutesSaved} hint="vs typing every order twice" tone="green" />
            </div>
          </Panel>
          <Panel title={`Daily goal · ${goal?.perDay ?? 20} ${goal?.label || 'customers'}`} icon="star" sub={days === 1 ? 'Today' : `${st.goal.hitDays} of ${Math.max(0, st.daily.length - 1)} past days hit`}
            actions={<Btn size="xs" variant="ghost" icon="settings" onClick={() => goTo('management')}>Change</Btn>}>
            <div className="row" style={{ gap: 16, alignItems: 'center' }}>
              <Ring value={goal?.pct || 0} size={92} stroke={8} color={goal?.pct >= 1 ? 'var(--green)' : goal?.onPace ? 'var(--accent)' : 'var(--amber)'} label={goal?.today ?? 0} sub="TODAY" />
              <div className="stack" style={{ gap: 6, fontSize: 13 }}>
                <div><b>{st.goal.streak}</b> <span className="muted">day streak</span></div>
                <div><b>{st.goal.avgPerDay.toFixed(1)}</b> <span className="muted">avg per day</span></div>
                <div><b>{st.goal.best?.total ?? 0}</b> <span className="muted">best day{st.goal.best ? ` · ${st.goal.best.short}` : ''}</span></div>
              </div>
            </div>
            {st.daily.length > 1 && (
              <div className="goalstrip" title="One square per day — green = goal hit">
                {st.daily.slice(-28).map((d) => <span key={d.key} className={`goalsq ${d.goalHit ? 'is-hit' : d.total ? 'is-miss' : ''}`} title={`${d.short}: ${d.total} / ${goal?.perDay}`} style={{ '--f': Math.min(1, d.total / (goal?.perDay || 20)) }} />)}
              </div>
            )}
          </Panel>
          <Panel title="Hold times" icon="clock" sub="Overnight drop-offs">
            <div className="statgrid">
              <Stat big label="Avg hold (picked up)" value={fmtHours(st.hold.avgHoldHours)} hint={st.hold.samples ? `median ${fmtHours(st.hold.medianHoldHours)} · ${st.hold.samples} jobs` : 'no pickups in range'} />
              <Stat label="Within limit" value={st.hold.samples ? fmtPct(R.withinLimitPct) : '—'} hint={`returned inside ${state.settings.overdueDays} days`} tone={R.withinLimitPct >= 0.8 ? 'green' : 'amber'} />
              <Stat label="Check-in → ready" value={fmtHours(st.hold.avgToReadyHours)} hint="avg" />
              <Stat label="Longest in house" value={st.hold.longestOpen ? `${st.hold.longestOpen.toFixed(1)}d` : '—'} hint={`${T.overdueNow} over limit now`} tone={T.overdueNow ? 'red' : undefined} />
            </div>
          </Panel>
        </div>

        {/* ── Techs + service mix ─────────────────────────────────── */}
        <div className="grid cols-3">
          <Panel className="span-2" title="Per tech" icon="users" sub="Who logged what — customers, orders, pushes, drop-offs, speed">
            {st.byTech.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Tech</th><th>Customers</th><th>Tickets</th><th>Order #</th><th>Salesforce</th><th>UNIX</th><th>Drop-offs</th><th>Avg service</th><th>Time served</th><th>Avg log</th><th>Share</th></tr></thead>
                  <tbody>
                    {st.byTech.map((r) => (
                      <tr key={r.tech.id}>
                        <td><span className="row" style={{ gap: 8 }}><Avatar tech={r.tech} size="sm" /><b>{r.tech.name}</b>{r.tech.removed && <Chip size="sm">former</Chip>}</span></td>
                        <td className="mono"><b>{r.customers}</b></td>
                        <td className="mono">{r.tickets}</td>
                        <td className="mono">{r.withOrder} <span className="faint">({r.tickets ? Math.round((r.withOrder / r.tickets) * 100) : 0}%)</span></td>
                        <td className="mono">{r.pushed}</td>
                        <td className="mono">{r.unix}</td>
                        <td className="mono">{r.assignments} <span className="faint">· {r.pickedUp} out</span></td>
                        <td className="mono" style={{ color: r.serviceSamples && r.avgServiceMs > S.target * 60_000 ? 'var(--amber)' : undefined }}>{r.serviceSamples ? fmtDur(r.avgServiceMs) : '—'}</td>
                        <td className="mono">{r.serviceSamples ? fmtDur(r.serviceTotalMs) : '—'}</td>
                        <td className="mono">{r.avgLogSeconds ? `${r.avgLogSeconds.toFixed(1)}s` : '—'}</td>
                        <td style={{ minWidth: 120 }}><div className="bar-track"><i style={{ width: `${T.customers ? (r.customers / T.customers) * 100 : 0}%`, '--c': r.tech.color }} /></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState icon="users" title="No tech activity in range" />}
            {T.unassigned > 0 && <div className="faint mt-2" style={{ fontSize: 12 }}>{T.unassigned} record{T.unassigned > 1 ? 's' : ''} without a tech — pick your name in Settings so these count.</div>}
          </Panel>
          <Panel title="Service mix" icon="filter" sub="Tickets + drop-offs by type">
            {st.byType.length ? <BarList items={st.byType.map((r) => ({ label: r.label, value: r.total, color: r.color, icon: r.icon }))} /> : <EmptyState icon="filter" title="No typed records" />}
            {T.untyped > 0 && <div className="faint mt-2" style={{ fontSize: 12 }}>{T.untyped} without a service type</div>}
          </Panel>
        </div>

        {/* ── Hours ───────────────────────────────────────────────── */}
        <div className="grid cols-2">
          <Panel title="Busiest hours" icon="clock" sub={`Peak at ${st.peakHour > 12 ? `${st.peakHour - 12} PM` : st.peakHour === 12 ? '12 PM' : `${st.peakHour} AM`} — staff the counter around it`}>
            <BarList items={hourBars} />
          </Panel>
          <Panel title="When customers come in" icon="calendar" sub="Weekday × hour — brighter is busier">
            <Heatmap grid={st.heat} hours={[8, 21]} />
          </Panel>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, hint, big, tone }) {
  return (
    <div className={`stat ${big ? 'is-big' : ''} ${tone ? `is-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
