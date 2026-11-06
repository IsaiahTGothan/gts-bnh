// Real numbers: entry rules, upsert + history, stats, forecast, calendar.  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, entryError, forecast, gtsLoggedByDay, localDay, monthGrid, realStats, upsertDailyCount, weekdayOf } from '../lib/real-counts.js';

test('entry rules: a real past day and a sane whole number', () => {
  const today = '2026-11-06';
  assert.equal(entryError({ day: '2026-11-06', total: 42 }, today), null);
  assert.equal(entryError({ day: '2026-11-06', total: '0' }, today), null, 'a closed / empty day is 0');
  assert.match(entryError({ day: '2026-11-07', total: 3 }, today), /hasn’t happened/);
  assert.match(entryError({ day: '', total: 3 }, today), /Pick a day/);
  assert.match(entryError({ day: today, total: '' }, today), /number/);
  assert.match(entryError({ day: today, total: 'abc' }, today), /number/);
  assert.match(entryError({ day: today, total: 2.5 }, today), /whole number/);
  assert.match(entryError({ day: today, total: -1 }, today), /whole number/);
  assert.match(entryError({ day: today, total: 99999 }, today), /check the number/);
});

test('one record per day; re-entering replaces the total and keeps the history', () => {
  const a = upsertDailyCount(null, { day: '2026-11-06', total: 40, source: 'sheet', by: 'Bot', gtsLogged: 31, at: '2026-11-06T22:00:00Z' });
  assert.equal(a.id, 'rc_2026-11-06'); assert.equal(a.total, 40); assert.equal(a.source, 'sheet'); assert.equal(a.gtsLogged, 31);
  const b = upsertDailyCount(a, { day: '2026-11-06', total: 43, source: 'manual', by: 'Isaiah', note: 'two late walk-ins', at: '2026-11-06T23:00:00Z' });
  assert.equal(b.total, 43); assert.equal(b.source, 'manual'); assert.equal(b.gtsLogged, 31, 'snapshot kept when not re-sent');
  assert.deepEqual(b.history.map((h) => [h.total, h.source]), [[40, 'sheet'], [43, 'manual']]);
  assert.equal(b.createdAt, '2026-11-06T22:00:00Z'); assert.equal(b.updatedAt, '2026-11-06T23:00:00Z');
});

test('GTS Hub’s own count per day (tickets + drop-offs not started as a ticket)', () => {
  const m = gtsLoggedByDay({
    tickets: [{ createdAt: '2026-11-05T15:00:00' }, { createdAt: '2026-11-05T16:00:00' }, { createdAt: '2026-11-05T17:00:00', deletedAt: 'x' }],
    assignments: [{ receivedAt: '2026-11-05T18:00:00' }, { receivedAt: '2026-11-05T18:00:00', fromTicketId: 't1' }],
  });
  assert.equal(m.get('2026-11-05'), 3);
});

test('stats: busiest weekday, best day, what GTS Hub captured vs the real total', () => {
  // two weeks: Mondays 30 & 34, Saturdays 60 & 50, Wednesday 20
  const c = (day, total) => upsertDailyCount(null, { day, total, at: '2026-11-06T00:00:00Z' });
  const counts = [c('2026-10-26', 30), c('2026-10-31', 60), c('2026-11-02', 34), c('2026-11-04', 20), c('2026-11-07', 50)].filter((x) => x.day <= '2026-11-06');
  const gtsByDay = new Map([['2026-10-26', 24], ['2026-10-31', 45], ['2026-11-02', 34], ['2026-11-04', 25]]);
  const s = realStats(counts, { gtsByDay });
  assert.equal(s.recorded, 4); assert.equal(s.total, 144); assert.equal(s.avg, 36);
  assert.equal(s.busiest.label, 'Sat'); assert.equal(s.busiest.avg, 60);
  assert.equal(s.quietest.label, 'Wed');
  assert.equal(s.best.day, '2026-10-31');
  assert.equal(s.byWeekday[1].avg, 32, 'Monday average');
  // GTS logged more than real on 11-04 (25 > 20): capped at the real total, never above 100 %
  assert.equal(s.capture, (24 + 45 + 34 + 20) / 144);
  assert.equal(s.missed, 144 - 123);
  assert.equal(s.days[0].day, '2026-11-04', 'newest first');
  assert.equal(realStats(counts, { from: '2026-11-01' }).recorded, 2);
  assert.equal(realStats([]).avg, null);
});

test('forecast: the next 7 days from the same weekday’s real history', () => {
  const c = (day, total) => ({ id: day, day, total });
  const f = forecast([c('2026-10-31', 60), c('2026-10-24', 40), c('2026-11-02', 30)], { today: '2026-11-06' });
  assert.equal(f.length, 7); assert.equal(f[0].day, '2026-11-06');
  const sat = f.find((d) => d.label === 'Sat'); assert.equal(sat.expected, 50); assert.equal(sat.samples, 2);
  assert.equal(f.find((d) => d.label === 'Mon').expected, 30);
  assert.equal(f.find((d) => d.label === 'Fri').expected, null, 'no history → no guess');
});

test('dates: weekday, add days across a month end, calendar grid', () => {
  assert.equal(weekdayOf('2026-11-06'), 5);
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(localDay(new Date(2026, 0, 5)), '2026-01-05');
  const g = monthGrid(2026, 10); // November 2026 starts on a Sunday
  assert.equal(g[0][0], '2026-11-01'); assert.equal(g.flat().filter(Boolean).length, 30); assert.ok(g.every((w) => w.length === 7));
});

test('weekly summary text for Teams / email', async () => {
  const { weeklySummaryText } = await import('../lib/real-counts.js');
  const c = (day, total) => ({ id: day, day, total });
  const txt = weeklySummaryText([c('2026-11-02', 30), c('2026-11-06', 50), c('2026-10-28', 20)], { today: '2026-11-06', gtsByDay: new Map([['2026-11-02', 27], ['2026-11-06', 45]]) });
  assert.match(txt, /80 customers over 2 counted days \(avg 40\.0\/day\)/);
  assert.match(txt, /Busiest: Fri, Nov 6 with 50/);
  assert.match(txt, /vs the week before: \+60 \(20 → 80\)/);
  assert.match(txt, /GTS Hub captured 90% \(8 not logged/);
  assert.match(weeklySummaryText([], { today: '2026-11-06' }), /no days counted yet/);
});

test('a 0 is a closed day — counted, but never the “quietest” day or a ~0 forecast', () => {
  const c = (day, total) => ({ id: day, day, total });
  const counts = [c('2026-11-01', 0), c('2026-10-25', 0), c('2026-11-02', 30), c('2026-11-03', 20)]; // two closed Sundays
  const s = realStats(counts);
  assert.equal(s.recorded, 4); assert.equal(s.closedDays, 2);
  assert.equal(s.avg, 25, 'average over open days only');
  assert.equal(s.quietest.label, 'Tue'); assert.equal(s.slowest.total, 20);
  assert.equal(s.byWeekday[0].closed, 2); assert.equal(s.byWeekday[0].avg, null);
  const sun = forecast(counts, { today: '2026-11-06' }).find((d) => d.label === 'Sun');
  assert.equal(sun.closed, true); assert.equal(sun.expected, 0);
});
