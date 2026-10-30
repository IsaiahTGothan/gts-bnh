'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — SERVICE INPUT (V4.4)
//  The description box: one short line that searches the verified Salesforce
//  services as you type ("secure data dropoff" → both Drop Off services).
//  ↑/↓ move, Enter or click picks, Esc closes the list. Anything typed that
//  isn't on the list is kept as is (and can be added to the list).
//  The list floats over everything (portal + fixed position) so it is never
//  cut off by the stage, a modal or the promo dock.
// ═══════════════════════════════════════════════════════════════════════════
import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SERVICE_BY_ID } from '../lib/constants';
import { resolveService, searchServices, serviceCatalog } from '../lib/sf-services';
import { cx } from '../lib/utils';
import { useStore } from './GTSApp';
import { Icon, overlayRoot } from './ui';

export function useServiceCatalog() {
  const { state } = useStore();
  const custom = state.management?.customServices;
  return useMemo(() => serviceCatalog(custom), [custom]);
}

const ServiceInput = forwardRef(function ServiceInput({ value, onChange, onPick, type, onEnter, placeholder = 'Search a service — e.g. Camera Kit Assembly', className, invalid, autoFocus, ariaLabel = 'Service / description', allowAdd = true }, fwd) {
  const { api, state, toast } = useStore();
  const catalog = useServiceCatalog();
  const inputRef = useRef(null);
  useImperativeHandle(fwd, () => inputRef.current);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [box, setBox] = useState(null);
  const text = value || '';
  const exact = useMemo(() => resolveService(text, { catalog, type }), [text, catalog, type]);
  const results = useMemo(() => (open && text.trim() ? searchServices(text, { catalog, type, limit: 7 }) : []), [open, text, catalog, type]);
  const showKeep = open && text.trim().length >= 3 && !exact;
  const rows = [...results.map((s) => ({ kind: 'svc', s })), ...(showKeep ? [{ kind: 'keep' }] : []), ...(showKeep && allowAdd ? [{ kind: 'add' }] : [])];
  const visible = open && rows.length > 0 && !(exact && results.length === 1 && results[0] === exact);
  useEffect(() => { setHi(0); }, [text]);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  // follow the input on screen (scrolling modals, the promo dock, resizes)
  useLayoutEffect(() => {
    if (!visible) return undefined;
    let raf = 0;
    const place = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom;
      const up = below < 280 && r.top > below;
      setBox((b) => (b && b.left === r.left && b.top === r.top && b.width === r.width && b.up === up && b.bottom === r.bottom ? b : { left: r.left, top: r.top, bottom: r.bottom, width: r.width, up }));
    };
    const loop = () => { place(); raf = requestAnimationFrame(loop); };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  const pick = (s) => { onPick?.(s); setOpen(false); };
  const addToList = () => {
    const name = text.trim();
    const list = state.management?.customServices || [];
    if (list.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    const entry = { group: 'Team added', name, type: type || null, addedBy: state.settings.currentTech || null, addedAt: new Date().toISOString() };
    api.setManagement({ customServices: [...list, entry] }, { action: 'services.add', label: 'Service list', detail: `Added “${name}” (not a verified Salesforce service)` });
    toast(`“${name}” added to the service list — marked as team-added`, { tone: 'success' });
    setOpen(false);
  };
  const choose = (row) => { if (row.kind === 'svc') pick(row.s); else if (row.kind === 'add') addToList(); else setOpen(false); };

  const onKeyDown = (e) => {
    if (visible && e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % rows.length); return; }
    if (visible && e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + rows.length) % rows.length); return; }
    if (visible && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      if (visible && rows[hi]) { e.preventDefault(); e.stopPropagation(); choose(rows[hi]); return; }
      if (exact && exact.path !== undefined) onPick?.(exact, { silent: true });
      onEnter?.(e);
    }
  };

  return (
    <>
      <div className={cx('svc-input', exact && 'is-known', className)}>
        <input ref={inputRef} className={cx('input', invalid && 'is-invalid')} value={text} placeholder={placeholder} autoComplete="off" spellCheck={false} aria-label={ariaLabel}
          role="combobox" aria-expanded={visible} aria-autocomplete="list"
          onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={onKeyDown} />
        {exact ? <span className="svc-badge" title={exact.custom ? 'Team-added service (not verified in Salesforce)' : 'Verified Salesforce service'}><Icon name={exact.custom ? 'tag' : 'check'} size={12} />{exact.group}</span>
          : text.trim().length >= 3 && !visible ? <span className="svc-badge is-custom" title="Not on the Salesforce list — saved as typed">custom</span> : null}
      </div>
      {visible && box && createPortal(
        <div className={cx('svc-menu', box.up && 'is-up')} role="listbox" style={{ left: box.left, width: Math.max(box.width, 320), ...(box.up ? { bottom: window.innerHeight - box.top + 6 } : { top: box.bottom + 6 }) }} onMouseDown={(e) => e.preventDefault()}>
          {rows.map((row, i) => {
            if (row.kind === 'keep') return <button type="button" key="keep" className={cx('svc-row is-meta', i === hi && 'is-hi')} onMouseEnter={() => setHi(i)} onClick={() => choose(row)}><Icon name="edit" size={13} /><span>Keep “{text.trim()}” as typed</span></button>;
            if (row.kind === 'add') return <button type="button" key="add" className={cx('svc-row is-meta', i === hi && 'is-hi')} onMouseEnter={() => setHi(i)} onClick={() => choose(row)}><Icon name="plus" size={13} /><span>Add “{text.trim()}” to the service list</span></button>;
            const s = row.s; const t = SERVICE_BY_ID[s.type];
            return (
              <button type="button" key={s.id} role="option" aria-selected={i === hi} className={cx('svc-row', i === hi && 'is-hi')} onMouseEnter={() => setHi(i)} onClick={() => choose(row)} style={{ '--c': t?.color || 'var(--accent)' }}>
                <Icon name={t?.icon || 'dots'} size={14} />
                <span className="svc-name">{s.name}</span>
                <span className="svc-group">{s.group}{s.custom ? ' · team-added' : ''}</span>
              </button>
            );
          })}
          <div className="svc-foot">↑ ↓ to move · Enter to pick · Esc to close</div>
        </div>,
        overlayRoot(),
      )}
    </>
  );
});

export default ServiceInput;
