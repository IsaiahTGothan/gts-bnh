// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — WARRANTY HELPER
//  Built-in manufacturer directory (lib/warranty-data.js) + the team's own
//  additions / corrections from Management → System → Warranty directory.
// ═══════════════════════════════════════════════════════════════════════════
import { WARRANTY_BRANDS, WARRANTY_CATEGORIES } from './warranty-data';

export { WARRANTY_CATEGORIES };

/** Built-ins with management overrides applied (same id = override, new id = added, `hidden` = removed). */
export function allWarrantyBrands(management = {}) {
  const custom = Array.isArray(management.warrantyBrands) ? management.warrantyBrands : [];
  const map = new Map(WARRANTY_BRANDS.map((b) => [b.id, { ...b, builtin: true }]));
  for (const c of custom) {
    if (!c || !c.id) continue;
    const base = map.get(c.id);
    map.set(c.id, { ...(base || { cats: ['other'], color: '#9aa8bb' }), ...c, builtin: !!base, edited: !!base });
  }
  return [...map.values()].filter((b) => !b.hidden && b.url).sort((a, b) => (a.id === 'bh' ? -1 : b.id === 'bh' ? 1 : a.name.localeCompare(b.name)));
}

export const brandById = (list, id) => list.find((b) => b.id === id) || null;

export function brandInitials(name = '') {
  const w = name.replace(/[^A-Za-z0-9& ]/g, ' ').trim().split(/\s+/);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase();
}

/** Readable text colour on a brand swatch. */
export function inkFor(hex = '#888888') {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0b0f16' : '#ffffff';
}
