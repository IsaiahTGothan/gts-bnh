// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — CODE 128 BARCODE (no dependencies)
//  Used by the "UNIX scan" bridge: the order number is drawn as a Code 128
//  barcode, and any USB barcode scanner plugged into the WYSE terminal types
//  it into the UNIX order screen (scanners act as keyboards). Digits-only
//  values use Code Set C (two digits per symbol) so the bar stays short.
// ═══════════════════════════════════════════════════════════════════════════

// Bar/space module widths for values 0–106 (106 = stop, 13 modules).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104, START_C = 105, STOP = 106;

export { PATTERNS as CODE128_PATTERNS };

/** Symbol values (start … check, stop) for `text`. */
export function code128Values(text) {
  const s = String(text ?? '');
  if (!s.length) return [];
  const digitsOnly = /^\d+$/.test(s) && s.length % 2 === 0 && s.length >= 2;
  const values = [];
  if (digitsOnly) {
    values.push(START_C);
    for (let i = 0; i < s.length; i += 2) values.push(Number(s.slice(i, i + 2)));
  } else {
    values.push(START_B);
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      if (code < 32 || code > 126) throw new Error(`Code 128B cannot encode "${ch}"`);
      values.push(code - 32);
    }
  }
  let sum = values[0];
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103);
  values.push(STOP);
  return values;
}

/** Module runs: [{ bar: boolean, width: n }, …] including quiet zones. */
export function code128Modules(text, quiet = 10) {
  const values = code128Values(text);
  const runs = [{ bar: false, width: quiet }];
  for (const v of values) {
    const p = PATTERNS[v];
    for (let i = 0; i < p.length; i++) runs.push({ bar: i % 2 === 0, width: Number(p[i]) });
  }
  runs.push({ bar: false, width: quiet });
  return runs;
}

/** SVG rects for the barcode. `unit` = px per module. */
export function code128Svg(text, { unit = 2, height = 72, quiet = 10, color = '#000' } = {}) {
  const runs = code128Modules(text, quiet);
  const total = runs.reduce((s, r) => s + r.width, 0);
  let x = 0; const rects = [];
  for (const r of runs) {
    if (r.bar) rects.push(`<rect x="${x * unit}" y="0" width="${r.width * unit}" height="${height}" fill="${color}"/>`);
    x += r.width;
  }
  return { width: total * unit, height, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${total * unit}" height="${height}" viewBox="0 0 ${total * unit} ${height}" shape-rendering="crispEdges">${rects.join('')}</svg>` };
}
