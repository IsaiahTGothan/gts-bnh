// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — ACCENT COLOUR (V5)
//  One choice recolours the whole app: buttons, glows, charts, focus rings,
//  the 3D stage and the digital rain. Per device (Settings, or the swatch in
//  the top bar); Management can set the team default every station starts on.
//  'auto' = the theme's own colour (cyan in Dark/Light, green in Matrix).
// ═══════════════════════════════════════════════════════════════════════════

export const ACCENTS = [
  { id: 'cyan', label: 'Cyan', dark: '#22d3ee', light: '#0891b2' },
  { id: 'green', label: 'B&H green', dark: '#4ade80', light: '#15803d' },
  { id: 'blue', label: 'Blue', dark: '#60a5fa', light: '#2563eb' },
  { id: 'violet', label: 'Violet', dark: '#a78bfa', light: '#7c3aed' },
  { id: 'pink', label: 'Pink', dark: '#f472b6', light: '#db2777' },
  { id: 'red', label: 'Red', dark: '#ff6b6b', light: '#dc2626' },
  { id: 'orange', label: 'Orange', dark: '#fb923c', light: '#ea580c' },
  { id: 'gold', label: 'Gold', dark: '#facc15', light: '#a16207' },
  { id: 'mono', label: 'Silver', dark: '#e2e8f0', light: '#334155' },
];
export const ACCENT_BY_ID = Object.fromEntries(ACCENTS.map((a) => [a.id, a]));
const THEME_DEFAULT = { dark: '#22d3ee', light: '#0e9fb8', matrix: '#00ff8c' };

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** settings.accent (this device) → management.accent (team) → the theme's own. Returns a hex or null (= theme default). */
export function resolveAccent(settings = {}, management = {}) {
  const pick = settings.accent && settings.accent !== 'auto' ? settings.accent : management.accent && management.accent !== 'auto' ? management.accent : null;
  if (!pick) return null;
  if (isHex(pick)) return pick.toLowerCase();
  const a = ACCENT_BY_ID[pick];
  if (!a) return null;
  return settings.theme === 'light' ? a.light : a.dark;
}

/** The colour the 3D stage / rain should use right now. */
export function accentHex(settings = {}, management = {}) {
  return resolveAccent(settings, management) || THEME_DEFAULT[settings.theme] || THEME_DEFAULT.dark;
}

function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function toHex([r, g, b]) { return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`; }
function mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** CSS custom properties for an accent hex (or {} to fall back to the theme's own). */
export function accentVars(hex, theme = 'dark') {
  if (!isHex(hex)) return {};
  const c = rgb(hex);
  const light = theme === 'light';
  const [r, g, b] = c;
  return {
    '--accent': hex,
    '--accent-2': toHex(light ? mix(c, [0, 0, 0], 0.18) : mix(c, [255, 255, 255], 0.28)),
    '--accent-ink': luminance(c) > 0.42 ? '#06121a' : '#ffffff',
    '--accent-soft': `rgba(${r}, ${g}, ${b}, ${light ? 0.12 : 0.13})`,
    '--glow': `0 0 0 1px rgba(${r}, ${g}, ${b}, 0.35), 0 0 28px -8px rgba(${r}, ${g}, ${b}, 0.55)`,
    '--ring': `0 0 0 3px rgba(${r}, ${g}, ${b}, 0.28)`,
  };
}

export const ACCENT_VAR_NAMES = ['--accent', '--accent-2', '--accent-ink', '--accent-soft', '--glow', '--ring'];
