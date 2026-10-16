'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — WARRANTY HELPER (V4)
//  Customer asks about a warranty → pick the brand → official warranty /
//  repair page, a QR they scan, the phone number, what they need ready.
//  One click logs it as a warranty ticket with the brand attached.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WARRANTY_CATEGORIES, brandById } from '../lib/warranty';
import { matches } from '../lib/utils';
import { useStore } from './GTSApp';
import { BrandSwatch, WarrantyCard } from './warranty-ui';
import { Chip, EmptyState, Icon, Input } from './ui';

export default function WarrantyTab() {
  const { state, warrantyBrands, warrantyPick, setWarrantyPick, newTicket, now } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const searchRef = useRef(null);
  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => { const h = () => searchRef.current?.focus(); window.addEventListener('gts:focus-search', h); return () => window.removeEventListener('gts:focus-search', h); }, []);

  const list = useMemo(() => warrantyBrands.filter((b) => (!cat || (b.cats || []).includes(cat)) && matches(q, b.name, b.id, b.note, ...(b.cats || []))), [warrantyBrands, q, cat]);
  const selected = brandById(warrantyBrands, warrantyPick) || null;
  // the brands this counter actually sends people to (last 90 days of warranty tickets)
  const popular = useMemo(() => {
    const c = {};
    for (const t of state.tickets) if (!t.deletedAt && t.warrantyBrand && now - new Date(t.createdAt).getTime() < 90 * 86_400_000) c[t.warrantyBrand] = (c[t.warrantyBrand] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => ({ brand: brandById(warrantyBrands, id), n })).filter((x) => x.brand);
  }, [state.tickets, warrantyBrands, now]);

  const pick = (id) => { setWarrantyPick(id); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const log = (b) => newTicket({ serviceType: 'warranty', warrantyBrand: b.id, description: `Warranty request — ${b.name}. Sent customer to the official page.` });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Warranty helper · {warrantyBrands.length} brands</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Pick the brand. <span className="grad-text">Hand them the link.</span></h1>
          <p className="page-sub">Official US warranty and repair pages for the brands we sell. Show the QR — the customer scans it and starts the claim on their own phone.</p>
        </div>
        {popular.length > 0 && <div className="row wrap" style={{ gap: 6 }}><span className="faint mono" style={{ fontSize: 10.5, letterSpacing: '.1em' }}>MOST ASKED</span>{popular.map(({ brand, n }) => <Chip key={brand.id} size="sm" onClick={() => pick(brand.id)}>{brand.name} · {n}</Chip>)}</div>}
      </div>

      {selected && <div className="mb-4 fade-up"><WarrantyCard key={selected.id} brand={selected} onClear={() => setWarrantyPick(null)} onLog={() => log(selected)} /></div>}

      <div className="toolbar">
        <div className="input-wrap" style={{ flex: '1 1 260px' }}><Icon name="search" /><Input ref={searchRef} placeholder="Search a brand — type and press Enter  ( / )" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && list.length) pick(list[0].id); }} /></div>
        <div className="row wrap" style={{ gap: 6 }}>
          <Chip tone={!cat ? 'accent' : undefined} onClick={() => setCat('')}>All</Chip>
          {WARRANTY_CATEGORIES.filter((c) => warrantyBrands.some((b) => (b.cats || []).includes(c.id))).map((c) => <Chip key={c.id} tone={cat === c.id ? 'accent' : undefined} onClick={() => setCat(cat === c.id ? '' : c.id)}>{c.label}</Chip>)}
        </div>
      </div>

      {list.length === 0 ? <EmptyState icon="shield-check" title={`No brand matches “${q}”`} desc="Managers can add a brand and its link in Management → System → Warranty directory." /> : (
        <div className="wgrid">
          {list.map((b, i) => (
            <button key={b.id} className={`wtile fade-up ${selected?.id === b.id ? 'is-on' : ''}`} style={{ '--c': b.color, '--i': Math.min(i, 16) }} onClick={() => pick(b.id)}>
              <BrandSwatch brand={b} size={40} />
              <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
                <span className="wtile-name">{b.name}</span>
                <span className="wtile-sub truncate">{b.needs || (b.cats || []).map((c) => WARRANTY_CATEGORIES.find((x) => x.id === c)?.label).filter(Boolean).slice(0, 2).join(' · ')}</span>
              </span>
              <Icon name="chevron-right" size={14} style={{ color: 'var(--text-3)' }} />
            </button>
          ))}
        </div>
      )}
      <div className="faint mt-4" style={{ fontSize: 11.5 }}>Links open the manufacturer’s own site in a new tab. Spot a moved page? Managers can correct any link in Management → System → Warranty directory, or run “Check all links”.</div>
    </>
  );
}
