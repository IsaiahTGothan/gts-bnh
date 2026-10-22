// ═══════════════════════════════════════════════════════════════════════════
//  GTS OPS — SYNTHETIC FIXTURES
//
//  Fake orders for tests and for the "Load synthetic data" button. Every
//  order number starts 99000 (not a real B&H range), every record carries
//  synthetic:true / demo:true, and the report/UI label them as test data.
//  One case per reconciliation outcome, plus the traps (typo'd order number,
//  Excel-mangled number, duplicate visits, a ticket still in service).
// ═══════════════════════════════════════════════════════════════════════════
import { zonedISO } from './schema.js';

export const SYNTHETIC_PREFIX = '99000';

export function buildSyntheticDay(day = '2026-10-21', timeZone = 'America/New_York') {
  const [y, m, d] = day.split('-').map(Number);
  const at = (h, mi) => zonedISO(y, m, d, h, mi, 0, timeZone);
  const sfDate = (h, mi) => { const hh = h % 12 || 12; return `${m}/${d}/${y} ${hh}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  const T = (n, extra) => ({
    id: `syn_t${n}`, tag: `SF-9${String(n).padStart(3, '0')}`, kind: 'sf', demo: true, customerName: '', tech: 'isaiah', status: 'logged',
    updatedAt: at(18, 0), ...extra,
  });
  const tickets = [
    T(1, { orderNumber: '9900000001', serviceType: 'camera', description: 'Firmware update 2.00 → 3.01, paired phone app.', createdAt: at(10, 5), serviceStartedAt: at(10, 5), serviceEndedAt: at(10, 23), servicePausedMs: 0, loggedAt: at(10, 25) }),
    T(2, { orderNumber: '9900000002', serviceType: 'computer', description: 'Windows 11 setup, updates, Office sign-in.', createdAt: at(10, 40), serviceStartedAt: at(10, 40), serviceEndedAt: at(11, 32), servicePausedMs: 6 * 60000, loggedAt: at(11, 35), tech: 'mike' }),
    T(3, { orderNumber: '9900000003', serviceType: 'phone', description: 'Transferred data from old phone, set up eSIM.', createdAt: at(11, 50), serviceStartedAt: at(11, 50), serviceEndedAt: at(12, 20), servicePausedMs: 0, status: 'open' }),
    T(5, { orderNumber: '9900000005', serviceType: 'laptop', description: 'MacBook migration assistant from Time Machine.', createdAt: at(12, 30), serviceStartedAt: at(12, 30), serviceEndedAt: at(13, 45), servicePausedMs: 15 * 60000, tech: 'keeshon' }),
    T(6, { orderNumber: '9900000006', serviceType: 'harddrive', description: 'Cloning 2TB HDD to SSD — still copying.', createdAt: at(14, 0), serviceStartedAt: at(14, 0), status: 'open' }),
    T(7, { orderNumber: '9900000017', serviceType: 'printer', description: 'Printer Wi-Fi setup, test page.', createdAt: at(14, 30), serviceStartedAt: at(14, 30), serviceEndedAt: at(14, 48), servicePausedMs: 0 }),
    T(8, { orderNumber: '9900000008', serviceType: 'other', description: 'Mic firmware, first visit.', createdAt: at(15, 0), serviceStartedAt: at(15, 0), serviceEndedAt: at(15, 10), servicePausedMs: 0 }),
    T(9, { orderNumber: '99000-00008', serviceType: 'other', description: 'Same order, second device.', createdAt: at(15, 20), serviceStartedAt: at(15, 20), serviceEndedAt: at(15, 31), servicePausedMs: 0 }),
    T(10, { orderNumber: '9900000010', serviceType: 'camera', description: 'Lens firmware via Lens Station.', createdAt: at(16, 0), serviceStartedAt: at(16, 0), serviceEndedAt: at(16, 12), servicePausedMs: 0, tech: 'mike' }),
    T(11, { orderNumber: '', serviceType: 'other', description: 'Walk-up question about HDMI adapters.', createdAt: at(16, 30), status: 'open' }),
    T(12, { orderNumber: '9900000012', serviceType: 'computer', description: 'BIOS update and driver install.', createdAt: at(17, 0), serviceStartedAt: at(17, 0), serviceEndedAt: at(17, 40), servicePausedMs: 0 }),
    T(13, { orderNumber: '9900000013', serviceType: 'camera', description: 'No service clock — legacy ticket.', createdAt: at(17, 10) }),
  ];
  const H = 'Order Number,Case Number,Task ID,Subject,Status,Created Date,Completed Date,Assigned To,Contact Name';
  const rows = [
    ['9900000001', '00900001', 'SYN-T-0001', 'GTS Camera — firmware', 'Completed', sfDate(10, 5), sfDate(10, 26), 'GTS Tech', 'SYNTHETIC CUSTOMER'],
    ['9900000002', '00900002', '', '', 'New', sfDate(10, 41), '', 'GTS Tech', 'SYNTHETIC CUSTOMER'],
    ['9900000004', '00900004', 'SYN-T-0004', 'GTS Phone — setup', 'Completed', sfDate(11, 0), sfDate(11, 20), 'GTS Tech', 'SYNTHETIC CUSTOMER'],
    ['9900000005', '00900005', 'SYN-T-0005', 'GTS Laptop — migration', 'Open', sfDate(12, 31), '', 'GTS Tech', 'SYNTHETIC CUSTOMER'],
    ['9900000006', '00900006', 'SYN-T-0006', 'GTS Hard Drive — clone', 'Completed', sfDate(14, 1), sfDate(14, 5), 'GTS Tech', 'SYNTHETIC CUSTOMER'],
    ['9900000071', '00900007', 'SYN-T-0007', 'GTS Printer — Wi-Fi', 'Completed', sfDate(14, 31), sfDate(14, 50), 'GTS Tech', 'SYNTHETIC CUSTOMER'],
    ['9900000008', '00900008', 'SYN-T-0008', 'GTS Audio — mic', 'Completed', sfDate(15, 1), sfDate(15, 11), 'GTS Tech', 'SYNTHETIC CUSTOMER'],
    ['9900000008', '00900008', 'SYN-T-0009', 'GTS Audio — mic 2', 'Completed', sfDate(15, 21), sfDate(15, 32), 'GTS Tech', 'SYNTHETIC CUSTOMER'],
    ['9900000010', '00900010', 'SYN-T-0010', 'GTS Camera — lens', 'Completed', sfDate(16, 0), sfDate(16, 13), 'GTS Tech', 'SYNTHETIC CUSTOMER'],
    ['9.90000001E+09', '00900011', 'SYN-T-0011', 'GTS — mangled', 'Completed', sfDate(16, 40), sfDate(16, 50), 'GTS Tech', 'SYNTHETIC CUSTOMER'],
    ['009900000012', '00900012', 'SYN-T-0012', 'GTS Computer — BIOS', 'Completed', sfDate(17, 1), sfDate(17, 41), 'GTS Tech', 'SYNTHETIC CUSTOMER'],
    ['9900000013', '00900013', 'SYN-T-0013', 'GTS Camera — legacy', 'Completed', `${m}/${d}/${y}`, `${m}/${d}/${y}`, 'GTS Tech', 'SYNTHETIC CUSTOMER'],
  ];
  const sfCSV = [H, ...rows.map((r) => r.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))].join('\r\n');
  return { day, tickets, sfCSV };
}
