'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — UI PRIMITIVES
//  Icons · logos · buttons · chips · panels · KPI · forms · modal · drawer ·
//  badges · small SVG charts. No external UI libraries.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ASG_STATUS_BY_ID, PRIORITY_BY_ID, SERVICE_TYPES, TECH_BY_ID, TICKET_STATUSES } from '../lib/constants';
import { ageLevel, cx, fmtElapsedLong } from '../lib/utils';
import { ZAYS_PATH, ZAYS_VIEWBOX } from '../lib/zays-logo';

// ─── Icons (24×24 stroke set) ──────────────────────────────────────────────
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
  cloud: '<path d="M17.5 19a4.5 4.5 0 0 0 .4-9A7 7 0 0 0 4.3 12.1 3.5 3.5 0 0 0 5.5 19z"/>',
  clipboard: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 3h6v4H9zM9 12h6M9 16h4"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  toolbox: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 5-5"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'chevron-left': '<path d="m15 6-6 6 6 6"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  call: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.7a2 2 0 0 1 1.7 2z"/>',
  message: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  printer: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14M10 11v6M14 11v6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  'alert-triangle': '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  'alert-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-5-6.7"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>',
  desktop: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M12 17v4M7 21h10M6 8h6"/>',
  laptop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>',
  tablet: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 18h.01"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M12 18h.01"/>',
  flash: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  chip: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>',
  download: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4"/>',
  sparkles: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 1-1h11l-1 4h5l-2 6H9"/>',
  shield: '<path d="M12 2 4 5v6c0 5.5 3.4 9.4 8 11 4.6-1.6 8-5.5 8-11V5z"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  pin: '<path d="M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  handoff: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  power: '<path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  move: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
};

export function Icon({ name, size = 16, className, style, title }) {
  const inner = ICONS[name] || ICONS.dots;
  return (
    <svg
      className={className}
      style={{ width: size, height: size, ...style }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title}</title>` : '') + inner }}
    />
  );
}

// ─── Logos ─────────────────────────────────────────────────────────────────
/**
 * Original GTS mark. A rounded badge in B&H red with a green accent bar (a
 * nod to the store's red badge + green nav) and a subtle circuit trace.
 */
export function GTSMark({ size = 40, animated = true, className }) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className={cx('gts-mark', className)} width={size} height={size} viewBox="0 0 64 64" aria-label="GTS">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff4b4b" />
          <stop offset="1" stopColor="#b3121c" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-clip`}><rect x="4" y="4" width="56" height="56" rx="14" /></clipPath>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="14" fill={`url(#${id}-bg)`} />
      <rect x="4" y="4" width="56" height="28" rx="14" fill={`url(#${id}-shine)`} />
      {/* circuit trace */}
      <g stroke="#fff" strokeOpacity="0.22" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M10 15h7l3 3" />
        <path d="M54 15h-7l-3 3" />
        <path d="M50 49h5" />
        <circle cx="20" cy="18" r="1.5" fill="#fff" fillOpacity="0.6" stroke="none" />
        <circle cx="44" cy="18" r="1.5" fill="#fff" fillOpacity="0.6" stroke="none" />
      </g>
      {/* wordmark */}
      <text x="32" y="39" textAnchor="middle" fontFamily="'Space Grotesk','Inter',system-ui,sans-serif" fontWeight="700" fontSize="21" letterSpacing="1" fill="#fff">GTS</text>
      {/* green status bar */}
      <rect x="18" y="47" width="28" height="3.5" rx="2" fill="#43b56a" />
      <rect x="18" y="47" width="10" height="3.5" rx="2" fill="#a7f3c0" opacity="0.9" />
      {animated && (
        <g clipPath={`url(#${id}-clip)`}>
          <rect className="scanline" x="4" y="4" width="56" height="12" fill="#fff" opacity="0.10" />
        </g>
      )}
    </svg>
  );
}

export function GTSLogo({ size = 38, showText = true }) {
  return (
    <div className="brand" title="GTS Hub">
      <GTSMark size={size} />
      {showText && (
        <div className="brand-text">
          <div className="brand-name">GUEST TECHNICAL SERVICES</div>
          <div className="brand-sub">B&amp;H · Tech Support Counter</div>
        </div>
      )}
    </div>
  );
}

export function ZaysLogo({ height = 20, className, title = 'ZAYS' }) {
  return (
    <svg className={className} viewBox={ZAYS_VIEWBOX} style={{ height, width: 'auto' }} role="img" aria-label={title}>
      <path d={ZAYS_PATH} fill="currentColor" />
    </svg>
  );
}

// ─── Buttons & chips ───────────────────────────────────────────────────────
export function Btn({ variant = 'default', size, icon, iconRight, children, className, loading, ...props }) {
  const v = variant === 'default' ? '' : `btn-${variant}`;
  const s = size ? `btn-${size}` : '';
  const iconOnly = !children && icon;
  return (
    <button type="button" className={cx('btn', v, s, iconOnly && 'btn-icon', className)} disabled={loading || props.disabled} {...props}>
      {loading ? <Icon name="refresh" className="spin" /> : icon ? <Icon name={icon} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} /> : null}
    </button>
  );
}

export function Chip({ tone, icon, children, size, className, style, title, onClick }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} title={title} style={style}
      className={cx('chip', tone && `is-${tone}`, size === 'sm' && 'chip-sm', className)}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </Tag>
  );
}

export function Kbd({ children }) { return <kbd className="kbd">{children}</kbd>; }

export function Avatar({ tech, size, title }) {
  const t = typeof tech === 'string' ? TECH_BY_ID[tech] : tech;
  return (
    <span className={cx('avatar', size === 'sm' && 'avatar-sm', size === 'lg' && 'avatar-lg', !t && 'is-empty')}
      style={t ? { '--c': t.color } : undefined} title={title || (t ? t.name : 'Unassigned')}>
      {t ? t.initials : '—'}
    </span>
  );
}

export function TechName({ tech, size = 'sm' }) {
  const t = TECH_BY_ID[tech];
  return (
    <span className="row" style={{ gap: 6 }}>
      <Avatar tech={t} size={size} />
      <span style={{ fontWeight: 600, fontSize: 12.5, color: t ? 'var(--text)' : 'var(--text-3)' }}>{t ? t.name : 'Unassigned'}</span>
    </span>
  );
}

export function Dot({ tone }) { return <span className={cx('dot', tone && `is-${tone}`)} />; }

// ─── Panels & KPI ──────────────────────────────────────────────────────────
export function Panel({ title, sub, icon, actions, children, className, glow, danger, corners, bodyClass, style, id }) {
  return (
    <section id={id} className={cx('panel', glow && 'is-glow', danger && 'is-danger', className)} style={style}>
      {corners && (<><i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" /></>)}
      {(title || actions) && (
        <header className="panel-head">
          <div>
            {title && <h3 className="panel-title">{icon && <Icon name={icon} />}{title}</h3>}
            {sub && <div className="panel-sub">{sub}</div>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className={cx('panel-body', bodyClass)}>{children}</div>
    </section>
  );
}

export function CountUp({ value, duration = 700 }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current; const to = value; prev.current = value;
    if (from === to) return;
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{display}</>;
}

export function KPI({ label, value, icon, tone, delta, onClick, style, className }) {
  return (
    <div className={cx('kpi', tone && `is-${tone}`, onClick && 'is-clickable', className)} onClick={onClick} style={style} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {icon && <span className="kpi-icon"><Icon name={icon} /></span>}
      </div>
      <div className="kpi-value">{typeof value === 'number' ? <CountUp value={value} /> : value}</div>
      {delta && <div className="kpi-delta">{delta}</div>}
    </div>
  );
}

// ─── Forms ─────────────────────────────────────────────────────────────────
export function Field({ label, required, optional, hint, error, children, className, style }) {
  return (
    <label className={cx('field', className)} style={style}>
      {label && (
        <span className="field-label">
          {label}
          {required && <span className="req">*</span>}
          {optional && <span className="opt">optional</span>}
        </span>
      )}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export const Input = React.forwardRef(function Input({ className, invalid, ...props }, ref) {
  return <input ref={ref} className={cx('input', invalid && 'is-invalid', className)} {...props} />;
});

export const Textarea = React.forwardRef(function Textarea({ className, invalid, ...props }, ref) {
  return <textarea ref={ref} className={cx('textarea', invalid && 'is-invalid', className)} {...props} />;
});

export function Select({ className, children, ...props }) {
  return (
    <span className={cx('select', className)}>
      <select {...props}>{children}</select>
    </span>
  );
}

export function TechSelect({ value, onChange, allowNone = true, ...props }) {
  return (
    <Select value={value || ''} onChange={(e) => onChange(e.target.value || null)} {...props}>
      {allowNone && <option value="">Unassigned</option>}
      {Object.values(TECH_BY_ID).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </Select>
  );
}

export function Toggle({ on, onChange, label, ...props }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} className={cx('toggle', on && 'is-on')} onClick={() => onChange(!on)} {...props} />
  );
}

export function Checkbox({ checked, onChange, label }) {
  return (
    <button type="button" role="checkbox" aria-checked={!!checked} aria-label={label} className={cx('checkbox', checked && 'is-on')} onClick={(e) => { e.stopPropagation(); onChange(!checked); }}>
      <Icon name="check" />
    </button>
  );
}

export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cx('segmented', className)} role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={cx('seg', value === o.id && 'is-active')} onClick={() => onChange(o.id)}>
          {o.icon && <Icon name={o.icon} size={13} />}
          {o.label}
          {o.count != null && o.count > 0 && <span className={cx('badge', !o.hot && 'is-neutral')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function CheckPills({ options, value = [], onChange }) {
  const toggle = (opt) => onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  return (
    <div className="checks">
      {options.map((opt) => {
        const on = value.includes(opt);
        return (
          <button key={opt} type="button" className={cx('check', on && 'is-on')} onClick={() => toggle(opt)} aria-pressed={on}>
            <span className="check-box">{on && <Icon name="check" size={10} />}</span>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/** Service-type picker: the dropdown Isaiah asked for, plus a tap-friendly grid. */
export function TypePicker({ value, onChange, compact }) {
  if (compact) {
    return (
      <Select value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Select service type…</option>
        {SERVICE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </Select>
    );
  }
  return (
    <div className="typegrid" role="radiogroup">
      {SERVICE_TYPES.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={value === s.id} className={cx('typebtn', value === s.id && 'is-on')} onClick={() => onChange(value === s.id ? null : s.id)} title={s.label}>
          <Icon name={s.icon} />
          <span className="truncate" style={{ maxWidth: '100%' }}>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Overlays ──────────────────────────────────────────────────────────────
function useEscape(onClose) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [onClose]);
}

function useLockScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
}

export function Modal({ title, sub, onClose, children, footer, size, icon }) {
  useEscape(onClose); useLockScroll();
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
        <div className={cx('modal', size && `is-${size}`)} role="dialog" aria-modal="true" aria-label={title}>
          <header className="modal-head">
            <div className="row" style={{ gap: 12 }}>
              {icon && <span className="kpi-icon" style={{ '--c': 'var(--accent)' }}><Icon name={icon} /></span>}
              <div>
                <h2 className="modal-title">{title}</h2>
                {sub && <p className="modal-sub">{sub}</p>}
              </div>
            </div>
            <Btn variant="ghost" size="sm" icon="x" onClick={onClose} aria-label="Close" />
          </header>
          <div className="modal-body">{children}</div>
          {footer && <footer className="modal-foot">{footer}</footer>}
        </div>
      </div>
    </>
  );
}

export function Drawer({ onClose, header, children, footer, width }) {
  useEscape(onClose); useLockScroll();
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="drawer" style={width ? { width } : undefined} role="dialog" aria-modal="true">
        <div className="drawer-head">{header}</div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose} size="sm" icon={danger ? 'alert-triangle' : 'info'}
      footer={<><span /><div className="row"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }} autoFocus>{confirmLabel}</Btn></div></>}>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}

export function EmptyState({ icon = 'inbox', title, desc, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} /></div>
      {title && <div className="empty-title">{title}</div>}
      {desc && <div style={{ fontSize: 12.5, maxWidth: 360 }}>{desc}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ─── Badges specific to GTS ────────────────────────────────────────────────
export function AgeBadge({ receivedAt, threshold = 3, now, compact, title }) {
  const a = ageLevel(receivedAt, threshold, now);
  const sub = a.level === 'severe' ? 'way over' : a.level === 'overdue' ? `over ${threshold}d` : a.level === 'aging' ? 'near limit' : 'in house';
  return (
    <span className={cx('agebadge', `is-${a.level}`)} title={title || `${fmtElapsedLong(receivedAt, now)} in house`}>
      <span className="agebadge-main">{a.label}</span>
      {!compact && <span className="agebadge-sub">{sub}</span>}
    </span>
  );
}

export function PriorityChip({ priority, manual, title, size }) {
  const p = PRIORITY_BY_ID[priority] || PRIORITY_BY_ID.normal;
  return (
    <span className={cx('pri', `is-${p.id}`)} title={title} style={size === 'sm' ? { height: 20, fontSize: 10 } : undefined}>
      {p.label}{manual ? '' : ' · auto'}
    </span>
  );
}

export function StatusChip({ status, size }) {
  const s = ASG_STATUS_BY_ID[status];
  if (!s) return null;
  return (
    <span className={cx('chip', size === 'sm' && 'chip-sm')} style={{ '--c': s.color, color: s.color, background: `color-mix(in srgb, ${s.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${s.color} 40%, transparent)` }}>
      <span className="dot" style={{ background: s.color, width: 6, height: 6 }} />
      {s.label}
    </span>
  );
}

export function TicketStatusChip({ status, size }) {
  const s = TICKET_STATUSES.find((x) => x.id === status) || TICKET_STATUSES[0];
  return <Chip tone={s.color} size={size} icon={status === 'logged' ? 'check' : status === 'converted' ? 'arrow-right' : 'clock'}>{s.label}</Chip>;
}

export function ServiceIcon({ type, size = 14 }) {
  const s = SERVICE_TYPES.find((x) => x.id === type);
  return <Icon name={s?.icon || 'dots'} size={size} />;
}

// ─── Tiny charts ───────────────────────────────────────────────────────────
export function Sparkline({ series, height = 64 }) {
  const w = 300, h = height, pad = 6;
  const max = Math.max(1, ...series.map((s) => s.count));
  const pts = series.map((s, i) => [pad + (i * (w - pad * 2)) / Math.max(1, series.length - 1), h - pad - (s.count / max) * (h - pad * 2)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="area" d={area} />
      <path className="line" d={line} />
      <circle cx={last[0]} cy={last[1]} r="3.5" />
    </svg>
  );
}

export function BarList({ items, formatValue = (v) => v }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars">
      {items.map((it) => (
        <div className="bar" key={it.label}>
          <div className="bar-label">{it.icon && <Icon name={it.icon} />}<span className="truncate">{it.label}</span></div>
          <div className="bar-track"><i style={{ width: `${(it.value / max) * 100}%`, '--c': it.color }} /></div>
          <div className="bar-val">{formatValue(it.value)}</div>
        </div>
      ))}
    </div>
  );
}

export function Donut({ parts, size = 120, thickness = 14, centerLabel, centerSub }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = (size - thickness) / 2, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg className="donut" viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-4)" strokeWidth={thickness} />
        {parts.map((p) => {
          const len = (p.value / total) * c;
          const el = (
            <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="butt" />
          );
          offset += len;
          return el;
        })}
        <text x="50%" y="50%" textAnchor="middle" dy="0.1em" fill="var(--text)" fontFamily="var(--font-display)" fontWeight="700" fontSize="22">{centerLabel}</text>
        {centerSub && <text x="50%" y="50%" textAnchor="middle" dy="1.6em" fill="var(--text-3)" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="1.5">{centerSub}</text>}
      </svg>
      <div className="legend">
        {parts.map((p) => (
          <div className="legend-item" key={p.label}><span className="legend-swatch" style={{ background: p.color }} /><span className="grow truncate">{p.label}</span><span className="mono" style={{ color: 'var(--text-3)' }}>{p.value}</span></div>
        ))}
      </div>
    </div>
  );
}
