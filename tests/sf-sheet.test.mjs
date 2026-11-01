// Salesforce copy sheet: rows, TSV, rules, confirm plan.  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_NEVER, BOT_STEPS, SF_QUEUE_TECH, botInstructionsText, buildSheetRows, planConfirm, sheetTSV } from '../lib/sf-sheet.js';

const T = (id, extra) => ({ id, kind: 'sf', tag: `SF-${id}`, status: 'open', createdAt: `2026-11-0${id}T15:00:00Z`, description: '', ...extra });
const tickets = [
  T(3, { orderNumber: '1095000003', customerName: 'Jane Doe', serviceType: 'camera', description: 'Camera Kit Assembly', sfService: 'Pro Photo › Camera Kit Assembly' }),
  T(1, { orderNumber: '', customerName: '', serviceType: 'phone', description: 'Sim Card Activation' }),
  T(2, { orderNumber: '1095000002', serviceType: 'other', description: 'Asked about store hours' }),
  T(4, { status: 'logged', description: 'pushed already' }),
  T(5, { deletedAt: '2026-11-01T00:00:00Z' }),
  T(6, { archivedAt: '2026-11-01T00:00:00Z' }),
  T(7, { kind: 'asg' }),
];

test('only open, unpushed, live Quick Log tickets — oldest first', () => {
  const rows = buildSheetRows(tickets);
  assert.deepEqual(rows.map((r) => r.id), [1, 2, 3]);
});

test('every row carries what Salesforce needs; the queue is always the tech', () => {
  const [walkup, other, kit] = buildSheetRows(tickets);
  assert.equal(kit.order, '1095000003');
  assert.equal(kit.group, 'Pro Photo'); assert.equal(kit.service, 'Camera Kit Assembly'); assert.equal(kit.match, 'exact');
  assert.equal(kit.description, 'Camera Kit Assembly');
  assert.ok([walkup, other, kit].every((r) => r.sfTech === SF_QUEUE_TECH && SF_QUEUE_TECH === 'Guest Technical Services Queue'));
  assert.equal(walkup.customer, 'Walk-up'); assert.equal(walkup.order, '');
  assert.equal(walkup.match, 'suggested', 'worked out from the description, marked as such');
  assert.equal(walkup.group, 'Mobile');
  assert.equal(other.match, 'none', 'nothing matches → "pick the closest", never an invented service');
  assert.equal(other.service, '');
});

test('TSV pastes into Excel: header + one line per row, no stray tabs/newlines', () => {
  const rows = buildSheetRows([...tickets, T(8, { description: 'line one\nline\ttwo' })]);
  const lines = sheetTSV(rows).split('\n');
  assert.equal(lines.length, rows.length + 1);
  assert.ok(lines[0].startsWith('GTS ticket\tOrder #'));
  assert.ok(lines.every((l) => l.split('\t').length === lines[0].split('\t').length));
  assert.ok(sheetTSV(rows).includes('Pick the closest (Other)') || sheetTSV(rows).includes('Pick the closest ('));
});

test('rules: never complete in Salesforce is the first hard rule; steps cover the whole job', () => {
  assert.match(BOT_NEVER[0], /NEVER complete/);
  const steps = BOT_STEPS.join(' ');
  for (const must of ['New Guest', 'select ALL', 'Guest Technical Services Queue', 'Description', 'Take', 'Select a Service', 'Customers In Queue', 'Confirm results']) assert.ok(steps.includes(must), must);
  const text = botInstructionsText({ salesforceUrl: 'https://example.my.salesforce.com', count: 3 });
  assert.match(text, /3 tickets/); assert.match(text, /NEVER:/); assert.match(text, /example\.my\.salesforce\.com/);
});

test('confirm plan: copied, skipped (reason kept or defaulted), unmarked untouched', () => {
  const rows = buildSheetRows(tickets);
  const p = planConfirm(rows, { 1: { status: 'copied' }, 2: { status: 'skipped', reason: ' order not found ' }, 99: { status: 'copied' } });
  assert.deepEqual(p.copied, [1]);
  assert.deepEqual(p.skipped, [{ id: 2, reason: 'order not found' }]);
  assert.deepEqual(p.unmarked, [3]);
  assert.equal(planConfirm(rows, { 2: { status: 'skipped' } }).skipped[0].reason, 'No reason given');
});
