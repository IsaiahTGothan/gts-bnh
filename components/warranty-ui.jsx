'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — WARRANTY UI
//  QR · brand swatch · brand picker (Quick Log) · brand card (links, QR,
//  phone, what the customer needs). Used by Quick Log and the Warranty tab.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useState } from 'react';
import { WARRANTY_CATEGORIES, brandById, brandInitials, inkFor } from '../lib/warranty';
import { copyText, cx, matches } from '../lib/utils';
import { useStore } from './GTSApp';
import { Btn, Icon, Input } from './ui';

/** SVG QR code (rendered locally — nothing leaves the browser). */
export function QR({ value, size = 168, className }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    if (!value) { setSvg(''); return undefined; }
    import('qrcode').then((m) => (m.default || m).toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b0f16', light: '#ffffff' } }))
      .then((s) => { if (alive) setSvg(s); }).catch(() => { if (alive) setSvg(''); });
    return () => { alive = false; };
  }, [value]);
  return <div className={cx('qr', className)} style={{ width: size, height: size }} aria-label={`QR code for ${value}`} role="img" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function BrandSwatch({ brand, size = 34 }) {
  if (!brand) return <span className="bswatch is-empty" style={{ width: size, height: size }}><Icon name="shield-check" size={size * 0.45} /></span>;
  return <span className="bswatch" style={{ width: size, height: size, background: brand.color || '#9aa8bb', color: inkFor(brand.color || '#9aa8bb'), fontSize: size * 0.34 }}>{brandInitials(brand.name)}</span>;
}

/** Inline brand chooser for warranty tickets. */
export function WarrantyPicker({ value, onChange }) {
  const { warrantyBrands } = useStore();
  const [q, setQ] = useState('');
  const brand = brandById(warrantyBrands, value);
  const list = useMemo(() => warrantyBrands.filter((b) => matches(q, b.name, b.id, ...(b.cats || []))), [warrantyBrands, q]);
  if (brand) return <WarrantyCard brand={brand} compact onClear={() => onChange(null)} />;
  return (
    <div className="wpick">
      <div className="input-wrap"><Icon name="search" /><Input placeholder={`Search ${warrantyBrands.length} brands — Sony, Apple, Canon…`} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && list.length) { e.preventDefault(); onChange(list[0].id); } }} /></div>
      <div className="wpick-grid">
        {list.slice(0, q ? 24 : 18).map((b) => (
          <button type="button" key={b.id} className="wpick-item" onClick={() => onChange(b.id)} style={{ '--c': b.color }} title={b.note}>
            <BrandSwatch brand={b} size={22} /><span className="truncate">{b.name}</span>
          </button>
        ))}
        {!list.length && <div className="faint" style={{ fontSize: 12.5, padding: 6 }}>No brand matches “{q}”. Managers can add one in Management → System.</div>}
      </div>
    </div>
  );
}

/** Everything the tech needs for one brand: links, QR for the customer, phone, prerequisites. */
export function WarrantyCard({ brand, compact, onClear, onLog }) {
  const { toast } = useStore();
  const [qr, setQr] = useState(!compact);
  const [which, setWhich] = useState('url');
  const link = which === 'repair' && brand.repair ? brand.repair : brand.url;
  return (
    <div className={cx('wcard', compact && 'is-compact')} style={{ '--c': brand.color }}>
      <div className="wcard-main">
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <BrandSwatch brand={brand} size={compact ? 38 : 52} />
          <div className="grow">
            <div className="wcard-name">{brand.name} <span className="faint">warranty</span>{brand.edited && <span className="chip chip-sm" style={{ marginLeft: 8 }}>edited</span>}{!brand.builtin && <span className="chip chip-sm" style={{ marginLeft: 8 }}>team</span>}</div>
            {brand.needs && <div className="wcard-needs"><Icon name="clipboard" size={12} /> Customer needs: <b>{brand.needs}</b></div>}
            {brand.note && <div className="wcard-note">{brand.note}</div>}
          </div>
          {onClear && <Btn size="xs" variant="ghost" icon="x" onClick={onClear} title="Pick another brand" aria-label="Change brand" />}
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
          <a className="btn btn-sm btn-primary" href={brand.url} target="_blank" rel="noopener noreferrer"><Icon name="external" />Open warranty page</a>
          {brand.repair && <a className="btn btn-sm" href={brand.repair} target="_blank" rel="noopener noreferrer"><Icon name="wrench" />Start a repair</a>}
          <Btn size="sm" variant="ghost" icon="copy" onClick={async () => { await copyText(link); toast(`${brand.name} link copied`, { tone: 'success' }); }}>Copy link</Btn>
          <Btn size="sm" variant={qr ? 'outline-accent' : 'ghost'} icon="qr" onClick={() => setQr((v) => !v)}>QR</Btn>
          {brand.phone && <a className="btn btn-sm btn-ghost" href={`tel:${brand.phone.replace(/[^\d+]/g, '')}`}><Icon name="call" />{brand.phone}</a>}
          {onLog && <Btn size="sm" variant="success" icon="zap" onClick={onLog}>Log warranty ticket</Btn>}
        </div>
        <div className="wcard-url mono truncate" title={link}><Icon name="link" size={11} /> {link}</div>
      </div>
      {qr && (
        <div className="wcard-qr">
          <QR value={link} size={compact ? 112 : 150} />
          <div className="wcard-qr-sub">Customer scans this with their phone camera</div>
          {brand.repair && <div className="seg-mini"><button type="button" className={which === 'url' ? 'is-on' : ''} onClick={() => setWhich('url')}>Warranty</button><button type="button" className={which === 'repair' ? 'is-on' : ''} onClick={() => setWhich('repair')}>Repair</button></div>}
        </div>
      )}
    </div>
  );
}

export { WARRANTY_CATEGORIES };
