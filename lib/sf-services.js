// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — SALESFORCE SERVICE CATALOG (V4.4)
//
//  The verified GTS services as they appear in B&H Salesforce, group › service.
//  A ticket's description is the short service name ("Camera Kit Assembly");
//  `sfService` keeps the full path ("Pro Photo › Camera Kit Assembly") and the
//  Quick Log service type is picked from it automatically.
//
//  Pure module (no React) — the search and the classifier are unit-tested.
// ═══════════════════════════════════════════════════════════════════════════

// [group, [ [name, type, extra search words], … ]]
const RAW = [
  ['Aerial Imaging', [
    ['Action Camera Setup', 'camera', 'gopro insta360 dji osmo action cam'],
    ['Drone App Setup', 'camera', 'dji fly app drone'],
    ['Drone Setup', 'camera', 'dji mavic mini air avata quadcopter'],
    ['Install Memory Card', 'camera', 'sd microsd card drone action'],
    ['Screen Protector', 'camera', 'drone controller action camera screen'],
  ]],
  ['Basic Set Up', [
    ['Binocular/Telescope', 'other', 'binoculars telescope scope optics celestron'],
    ['Pro Video Camera', 'camera', 'camcorder video camera'],
    ['Surveillance Camera', 'camera', 'security cam ring arlo wyze cctv'],
  ]],
  ['Computers', [
    ['Components Installation', 'computer', 'gpu graphics card ssd nvme install component pc build'],
    ['Computer Troubleshooting', 'computer', 'pc mac laptop not working slow boot troubleshoot'],
    ['Device Diagnostics', 'computer', 'diagnose diagnostic test'],
    ['Device Reset', 'computer', 'factory reset wipe restore'],
    ['File Recovery', 'harddrive', 'recover deleted files data recovery'],
    ['Formatting Memory Cards', 'harddrive', 'format sd card exfat fat32'],
    ['Hard Drive Cloning', 'harddrive', 'clone ssd hdd migrate drive'],
    ['Language Change', 'computer', 'language keyboard region'],
    ['Memory Ram Installation', 'computer', 'ram memory upgrade dimm'],
    ['Office Install', 'computer', 'microsoft office 365 word excel'],
    ['Other Program Install', 'computer', 'software program app install'],
    ['Printer Troubleshooting', 'printer', 'printer ink paper wifi print'],
    ['Privacy Screen Installation', 'laptop', 'privacy filter screen'],
    ['Reformatting Hard Drives', 'harddrive', 'format reformat hdd ssd external drive'],
    ['Setting Up Username/Password', 'computer', 'account login password apple id microsoft account'],
    ['Software Updates', 'computer', 'update windows macos os'],
    ['Tablet Screen Protector', 'tablet', 'ipad screen protector glass'],
    ['Tablet Troubleshooting', 'tablet', 'ipad galaxy tab tablet'],
    ['Tablets Setup', 'tablet', 'ipad tablet setup'],
    ['Updating Drivers', 'computer', 'drivers driver update'],
  ]],
  ['Customer Service', [
    ['Device Diagnostics', null, 'diagnose diagnostic test'],
    ['Device Reset', null, 'factory reset wipe restore'],
  ]],
  ['Firmware Updates', [
    ['Equipment', 'firmware', 'firmware update equipment'],
    ['Others', 'firmware', 'firmware update other'],
  ]],
  ['Mobile', [
    ['Firmware Updates', 'phone', 'phone firmware ios android update'],
    ['Headphone/MP3 Players Setup', 'audio', 'headphones earbuds airpods mp3 ipod pairing bluetooth'],
    ['Install Memory Card', 'phone', 'sd microsd card phone'],
    ['Language Change', 'phone', 'language phone'],
    ['Phone Troubleshooting', 'phone', 'iphone android galaxy pixel phone'],
    ['Screen Protector', 'phone', 'phone screen protector glass'],
    ['Setting Up Username/Password', 'phone', 'apple id google account login password'],
    ['Sim Card Activation', 'phone', 'sim esim activate carrier'],
    ['Sim Card Cutting', 'phone', 'sim cut nano micro'],
    ['Smart Watch Setup', 'phone', 'apple watch galaxy watch smartwatch garmin fitbit'],
    ['Transferring Contacts', 'phone', 'contacts transfer data move phone'],
  ]],
  ['One on One – Camera Demos', [
    ['Photo & Video', 'camera', 'demo lesson camera'],
    ['Photography', 'camera', 'demo lesson photo'],
    ['Video', 'camera', 'demo lesson video'],
  ]],
  ['One on One – Lighting', [
    ['Light Meter Usage for Photography', 'lighting', 'light meter sekonic'],
    ['Light Meter Usage for Video', 'lighting', 'light meter'],
    ['Manual Strobe/Transmitter Set-up', 'lighting', 'strobe flash trigger transmitter godox profoto'],
    ['TTL (Through-the-Lens) Strobe/Transmitter Set-up', 'lighting', 'ttl flash trigger transmitter'],
    ['Other', 'lighting', 'lighting'],
  ]],
  ['One on One – Pro Audio', [
    ['Audio for Video', 'audio', 'mic microphone lav wireless rode audio video'],
    ['DJ & Lighting', 'audio', 'dj controller mixer'],
    ['Live Sound', 'audio', 'pa speaker mixer live sound'],
    ['Music Production', 'audio', 'daw interface studio midi'],
    ['Podcasting', 'audio', 'podcast mic interface'],
    ['Other', 'audio', 'audio'],
  ]],
  ['One on One – Pro Video', [
    ['DaVinci Resolve', 'computer', 'resolve editing color grading'],
    ['External Video Recorders', 'camera', 'atomos ninja recorder monitor'],
    ['Pro Camcorders and Cinema Cameras', 'camera', 'cinema camera camcorder red blackmagic fx'],
    ['Stabilizers', 'camera', 'gimbal stabilizer ronin'],
    ['Streaming Devices', 'camera', 'streaming atem capture stream'],
    ['Other', 'camera', 'pro video'],
  ]],
  ['Pro Photo', [
    ['Camera Kit Assembly', 'camera', 'camera setup kit assembly lens attach'],
    ['Camera Troubleshooting', 'camera', 'camera error not working'],
    ['Camera Wireless Setup', 'camera', 'camera wifi bluetooth app pairing snapbridge imaging edge'],
    ['File Recovery', 'camera', 'recover photos deleted'],
    ['Firmware Updates', 'camera', 'camera lens firmware update'],
    ['Formatting Memory Cards', 'camera', 'format sd card camera'],
    ['HDSLR Rig Assembly', 'camera', 'rig cage dslr video assembly'],
    ['Install Memory Card', 'camera', 'sd card camera'],
    ['Screen Protector', 'camera', 'camera lcd screen protector'],
    ['SD Card Recovery', 'camera', 'sd card recovery photos'],
  ]],
  ['Secure Data', [
    ['Drop Off Only (Outside Customer)', 'harddrive', 'secure data drop off dropoff outside'],
    ['Referral – Drop Off (B&H Customer)', 'harddrive', 'secure data referral drop off dropoff'],
    ['Referral – Remote Diagnostics (B&H Customer)', 'harddrive', 'secure data referral remote diagnostics'],
    ['Remote Diagnostics (Outside Customer)', 'harddrive', 'secure data remote diagnostics outside'],
  ]],
];

export const SEP = ' › ';
const fold = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[–—]/g, '-');
const words = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
const compact = (s) => fold(s).replace(/[^a-z0-9]/g, '');

function entry(group, name, type, extra = '', custom = false) {
  const path = `${group}${SEP}${name}`;
  return { id: compact(path), group, name, path, type: type || null, custom, nameWords: words(name), groupWords: words(group), extraWords: words(extra), hay: compact(`${group} ${name} ${extra}`) };
}

export const SF_SERVICES = RAW.flatMap(([group, items]) => items.map(([name, type, extra]) => entry(group, name, type, extra)));
export const SF_GROUPS = RAW.map(([g]) => g);

/** Built-in + team-added services ({ group, name, type } from Management). */
export function serviceCatalog(custom = []) {
  const seen = new Set(SF_SERVICES.map((s) => s.id));
  const extra = (custom || []).filter((c) => c && c.name).map((c) => entry(c.group || 'Team added', c.name, c.type || null, c.keywords || '', true)).filter((s) => !seen.has(s.id) && seen.add(s.id));
  return [...SF_SERVICES, ...extra];
}

/**
 * Search the catalog. Every word typed has to hit the service (its name, its group
 * or its search words — "dropoff" finds "Drop Off"). Name hits rank above group
 * hits, exact names first. `type` nudges ties toward the current service type.
 */
export function searchServices(query, { catalog = SF_SERVICES, type = null, limit = 8 } = {}) {
  const q = words(query);
  if (!q.length) return [];
  const qc = compact(query);
  const out = [];
  for (const s of catalog) {
    let score = 0; let ok = true;
    for (const w of q) {
      if (s.nameWords.some((x) => x === w)) score += 6;
      else if (s.nameWords.some((x) => x.startsWith(w))) score += 4;
      else if (s.groupWords.some((x) => x === w || x.startsWith(w))) score += 2;
      else if (s.extraWords.some((x) => x.startsWith(w))) score += 1.5;
      else if (w.length >= 3 && s.hay.includes(w)) score += 1;
      else { ok = false; break; }
    }
    if (!ok) continue;
    const nc = compact(s.name);
    if (nc === qc) score += 20;
    else if (compact(s.path) === qc) score += 20;
    else if (nc.startsWith(qc)) score += 6;
    if (type && s.type === type) score += 2.5;
    if (s.custom) score -= 0.5;
    out.push({ s, score });
  }
  out.sort((a, b) => b.score - a.score || a.s.path.localeCompare(b.s.path));
  return out.slice(0, limit).map((x) => x.s);
}

/** Exact name (or full path) → the one service, preferring the current type when a name exists in several groups. */
export function resolveService(text, { catalog = SF_SERVICES, type = null } = {}) {
  const c = compact(text);
  if (!c) return null;
  const byPath = catalog.find((s) => compact(s.path) === c);
  if (byPath) return byPath;
  const hits = catalog.filter((s) => compact(s.name) === c);
  if (!hits.length) return null;
  if (hits.length === 1) return hits[0];
  return hits.find((s) => s.type && s.type === type) || hits.find((s) => s.type && (FAMILY[s.type] || s.type) === (FAMILY[type] || type)) || hits.find((s) => s.type) || hits[0];
}

export const findByPath = (path, catalog = SF_SERVICES) => (path ? catalog.find((s) => s.path === path) || null : null);

// computer ↔ laptop are the same family: a Computers service never flips Laptop to Computer
const FAMILY = { computer: 'pc', laptop: 'pc' };
export const sameFamily = (a, b) => !!a && !!b && (a === b || (FAMILY[a] && FAMILY[a] === FAMILY[b]));

// ─── Free text → service type ──────────────────────────────────────────────
//  For descriptions that aren't a catalog service (and for re-sorting old
//  "Other" tickets). Ordered: the first rule that matches wins.
const RULES = [
  ['warranty', /\bwarrant/],
  ['audio', /\b(speakers?|soundbar|sound bar|subwoofer|mics?|microphones?|lav(alier)?s?|audio|recorders?|zoom h\d|tascam|headphones?|headsets?|ear ?buds|earphones?|airpods|beats|bose|sonos|jbl|radios?|am\/?fm|cd player|cassette|walkman|turntable|record player|vinyl|amp(lifier)?s?|mixer|interface|rca|aux|xlr|dj|podcast|spotify|apple music|tidal|streaming service|ipod|mp3|hearing)\b/],
  ['harddrive', /\b(hard ?drives?|hdd|ssd|nvme|external drive|clon(e|ing)|data recovery|secure data|raid|nas|thumb ?drive|flash drive|usb drive)\b/],
  ['printer', /\b(printers?|printing|ink|toner|selphy|instax|zink|cartridge)\b/],
  ['lighting', /\b(strobes?|flash(es)?|speedlights?|godox|profoto|softbox|light meter|lighting|led panel|ring ?light|trigger)\b/],
  ['firmware', /\bfirmware\b/],
  ['tablet', /\b(ipad|tablet|galaxy tab|kindle|surface go|e-?reader|remarkable)\b/],
  ['phone', /\b(iphone|android|pixel|galaxy s\d*|phone|sim|esim|smart ?watch|apple watch|contacts)\b/],
  ['laptop', /\b(laptop|macbook|notebook|chromebook|thinkpad|surface laptop|surface pro)\b/],
  ['computer', /\b(computer|desktop|pc|imac|mac mini|windows|macos|office|ram|gpu|graphics card|monitor|display|keyboard|mouse|router|wi-?fi|network)\b/],
  ['camera', /\b(cameras?|lens(es)?|dslr|mirrorless|sony a\d|canon|nikon|fuji(film)?|gopro|insta360|drone|dji|gimbal|camcorder|sd card|memory card|tripod|binoculars?|telescope)\b/],
];

/** Best service type for some free text, or null. */
export function classifyText(text) {
  const t = fold(text);
  if (!t.trim()) return null;
  for (const [type, re] of RULES) if (re.test(t)) return type;
  return null;
}

/**
 * Everything the description implies: { service, type }.
 * The catalog wins; otherwise keywords; otherwise null (the caller falls back to Other on save).
 */
export function inferFromDescription(text, { catalog = SF_SERVICES, type = null } = {}) {
  const service = resolveService(text, { catalog, type });
  if (service) return { service, type: service.type || classifyText(text) };
  return { service: null, type: classifyText(text) };
}

/** Most-used services first (for the quick chips), from the ticket history. */
export function topServices(tickets, { catalog = SF_SERVICES, limit = 6, days = 60, now = Date.now() } = {}) {
  const c = new Map();
  for (const t of tickets || []) {
    if (t.deletedAt || !t.sfService || now - new Date(t.createdAt).getTime() > days * 86_400_000) continue;
    c.set(t.sfService, (c.get(t.sfService) || 0) + 1);
  }
  const used = [...c.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => findByPath(p, catalog)).filter(Boolean);
  const fallback = ['Pro Photo › Camera Kit Assembly', 'Pro Photo › Firmware Updates', 'Pro Photo › Camera Wireless Setup', 'Mobile › Transferring Contacts', 'Computers › Computer Troubleshooting', 'Computers › Hard Drive Cloning'].map((p) => findByPath(p, catalog)).filter(Boolean);
  const out = [];
  for (const s of [...used, ...fallback]) if (!out.includes(s)) out.push(s);
  return out.slice(0, limit);
}
