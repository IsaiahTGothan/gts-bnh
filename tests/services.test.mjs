// Salesforce service list: search, resolve, auto type.  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { SF_SERVICES, classifyText, inferFromDescription, resolveService, sameFamily, searchServices, serviceCatalog, topServices } from '../lib/sf-services.js';

const names = (list) => list.map((s) => s.path);

test('the whole Salesforce list is there, every group', () => {
  assert.equal(SF_SERVICES.length, 77);
  assert.equal(new Set(SF_SERVICES.map((s) => s.id)).size, SF_SERVICES.length, 'paths are unique');
  assert.ok(SF_SERVICES.some((s) => s.path === 'Pro Photo › Camera Kit Assembly'));
  assert.ok(SF_SERVICES.some((s) => s.path === 'Secure Data › Referral – Drop Off (B&H Customer)'));
});

test('“Secure Data” lists every Secure Data service; adding “Dropoff” narrows to the two drop-offs', () => {
  const all = searchServices('Secure Data', { limit: 10 });
  assert.deepEqual(all.map((s) => s.group), ['Secure Data', 'Secure Data', 'Secure Data', 'Secure Data']);
  const drop = searchServices('Secure Data Dropoff');
  assert.deepEqual(names(drop).sort(), ['Secure Data › Drop Off Only (Outside Customer)', 'Secure Data › Referral – Drop Off (B&H Customer)']);
  assert.deepEqual(names(searchServices('secure data drop off')).sort(), names(drop).sort());
});

test('typing a service name finds it first', () => {
  assert.equal(searchServices('Camera Kit Assembly')[0].path, 'Pro Photo › Camera Kit Assembly');
  assert.equal(searchServices('kit')[0].name, 'Camera Kit Assembly');
  assert.equal(searchServices('sim')[0].group, 'Mobile');
  assert.equal(searchServices('clon')[0].name, 'Hard Drive Cloning');
  assert.equal(searchServices('ttl')[0].group, 'One on One – Lighting');
  assert.equal(searchServices('podcast')[0].name, 'Podcasting');
  assert.deepEqual(searchServices(''), []);
  assert.deepEqual(searchServices('zzzz qqqq'), []);
});

test('a name in several groups resolves by the type already picked', () => {
  assert.equal(resolveService('Screen Protector', { type: 'phone' }).path, 'Mobile › Screen Protector');
  assert.equal(resolveService('Screen Protector', { type: 'camera' }).group, 'Aerial Imaging');
  assert.equal(resolveService('Firmware Updates', { type: 'camera' }).path, 'Pro Photo › Firmware Updates');
  assert.equal(resolveService('Firmware Updates', { type: 'phone' }).path, 'Mobile › Firmware Updates');
  assert.equal(resolveService('camera kit assembly').path, 'Pro Photo › Camera Kit Assembly', 'case-insensitive');
  assert.equal(resolveService('Pro Photo › SD Card Recovery').name, 'SD Card Recovery', 'full path works');
  assert.equal(resolveService('Fixed his thing'), null);
});

test('the description picks the service type', () => {
  assert.deepEqual(pick('Camera Kit Assembly'), ['Pro Photo › Camera Kit Assembly', 'camera']);
  assert.deepEqual(pick('Hard Drive Cloning'), ['Computers › Hard Drive Cloning', 'harddrive']);
  assert.deepEqual(pick('Podcasting'), ['One on One – Pro Audio › Podcasting', 'audio']);
  assert.deepEqual(pick('Sim Card Activation'), ['Mobile › Sim Card Activation', 'phone']);
  assert.deepEqual(pick('Set up his new JBL speaker'), [null, 'audio'], 'free text falls back to keywords');
  assert.deepEqual(pick('Asked where the bathroom is'), [null, null], 'nothing matched → caller files it as Other');
  function pick(text) { const r = inferFromDescription(text); return [r.service?.path || null, r.type]; }
});

test('the old “Other” pile: audio is recognised (examples from the counter’s own tickets)', () => {
  for (const d of ['Speakers not pairing', 'Wireless microphones setup', 'Zoom audio recorder settings', 'Headphones firmware', 'Earbuds pairing', 'Earphones not working',
    'Radio presets', 'AM/FM radio setup', 'CD player not reading discs', 'Portable cassette player', 'RCA cables to TV', 'Streaming service setup on speaker']) {
    assert.equal(classifyText(d), 'audio', d);
  }
  assert.equal(classifyText('iPad Pro setup'), 'tablet');
  assert.equal(classifyText('Sony A7 IV menu walkthrough'), 'camera');
  assert.equal(classifyText('MacBook Air migration'), 'laptop');
  assert.equal(classifyText('Clone 1TB HDD to SSD'), 'harddrive');
  assert.equal(classifyText('Flash drive not showing up'), 'harddrive', 'flash drive is storage, not lighting');
  assert.equal(classifyText('Godox flash trigger'), 'lighting');
  assert.equal(classifyText('Canon SELPHY ink'), 'printer');
  assert.equal(classifyText(''), null);
});

test('laptop and computer are one family — a Computers service never flips Laptop', () => {
  assert.ok(sameFamily('laptop', 'computer'));
  assert.ok(!sameFamily('laptop', 'camera'));
  assert.ok(!sameFamily(null, 'camera'));
});

test('team-added services join the list without duplicating a verified one', () => {
  const cat = serviceCatalog([{ name: 'Gimbal Balancing', type: 'camera' }, { group: 'Pro Photo', name: 'Camera Kit Assembly' }]);
  assert.equal(cat.length, SF_SERVICES.length + 1);
  const g = searchServices('gimbal bal', { catalog: cat })[0];
  assert.equal(g.name, 'Gimbal Balancing'); assert.ok(g.custom);
});

test('quick chips: the counter’s most-used services first, then sensible defaults', () => {
  const now = Date.parse('2026-10-30T15:00:00Z');
  const t = (p, i) => ({ id: `t${i}`, sfService: p, createdAt: '2026-10-29T15:00:00Z' });
  const tickets = [t('Mobile › Sim Card Activation', 1), t('Mobile › Sim Card Activation', 2), t('Computers › Office Install', 3)];
  const top = topServices(tickets, { now, limit: 4 });
  assert.deepEqual(top.slice(0, 2).map((s) => s.name), ['Sim Card Activation', 'Office Install']);
  assert.equal(top.length, 4);
});
