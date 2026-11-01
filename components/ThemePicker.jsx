'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — APPEARANCE (V5)
//  Theme (Dark / Light / Matrix), accent colour (9 presets + any colour),
//  glow strength. Per device; a manager can make the look the team default.
//  <AppearanceControls/> is shared by the top-bar popover and Settings.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from 'react';
import { ACCENTS, accentHex } from '../lib/theme';
import { cx } from '../lib/utils';
import { useStore } from './GTSApp';
import { Btn, Icon, Segmented } from './ui';

export function AppearanceControls({ compact }) {
  const { state, api, isManager, toast } = useStore();
  const s = state.settings;
  const m = state.management || {};
  const current = s.accent || 'auto';
  const hex = accentHex(s, m);
  const set = (patch) => api.setSettings(patch);
  const teamSame = (m.accent || 'auto') === current;
  return (
    <div className={cx('look', compact && 'is-compact')}>
      <div className="look-row">
        <div className="look-label">Theme</div>
        <Segmented value={s.theme || 'dark'} onChange={(v) => set({ theme: v })} options={[{ id: 'dark', label: 'Dark', icon: 'moon' }, { id: 'light', label: 'Light', icon: 'sun' }, { id: 'matrix', label: 'Matrix', icon: 'terminal' }]} />
      </div>
      <div className="look-row">
        <div className="look-label">Colour</div>
        <div className="swatches" role="radiogroup" aria-label="Accent colour">
          <button type="button" role="radio" aria-checked={current === 'auto'} className={cx('swatch is-auto', current === 'auto' && 'is-on')} onClick={() => set({ accent: 'auto' })} title="Theme default"><span /></button>
          {ACCENTS.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={current === a.id} className={cx('swatch', current === a.id && 'is-on')} style={{ '--sw': s.theme === 'light' ? a.light : a.dark }} onClick={() => set({ accent: a.id })} title={a.label}><span /></button>
          ))}
          <label className={cx('swatch is-custom', current.startsWith('#') && 'is-on')} title="Any colour" style={current.startsWith('#') ? { '--sw': current } : undefined}>
            <span><Icon name="plus" size={12} /></span>
            <input type="color" value={current.startsWith('#') ? current : hex} onChange={(e) => set({ accent: e.target.value })} aria-label="Pick any colour" />
          </label>
        </div>
      </div>
      <div className="look-row">
        <div className="look-label">Glow</div>
        <Segmented value={s.glow || 'normal'} onChange={(v) => set({ glow: v })} options={[{ id: 'soft', label: 'Soft' }, { id: 'normal', label: 'Normal' }, { id: 'max', label: 'Max', icon: 'sparkles' }]} />
      </div>
      <div className="look-row">
        <div className="look-label">RGB wave</div>
        <Segmented value={s.rgb ? 'on' : 'off'} onChange={(v) => set({ rgb: v === 'on' })} options={[{ id: 'off', label: 'Off' }, { id: 'on', label: 'On', icon: 'zap' }]} />
      </div>
      {isManager && (
        <div className="look-foot">
          <span className="faint">{teamSame ? 'This colour is the team default.' : 'Only this station uses this colour.'}</span>
          {!teamSame && <Btn size="xs" icon="users" onClick={() => { api.setManagement({ accent: current }, { action: 'management.update', label: 'Appearance', detail: `Team colour → ${current}` }); toast('Every station that hasn’t picked its own colour now uses this one', { tone: 'success' }); }}>Use on every station</Btn>}
        </div>
      )}
    </div>
  );
}

/** The swatch in the top bar → the appearance popover. */
export function ThemeButton() {
  const { accent } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key, true); };
  }, [open]);
  return (
    <div className="lookbtn-wrap" ref={ref}>
      <button type="button" className={cx('lookbtn', open && 'is-open')} onClick={() => setOpen((v) => !v)} title="Appearance — theme, colour, glow" aria-expanded={open}>
        <span className="lookbtn-dot" style={{ background: accent }} />
        <span className="hidden-mobile">Look</span>
      </button>
      {open && (
        <div className="lookpop fade-up" role="dialog" aria-label="Appearance">
          <div className="lookpop-title"><Icon name="sparkles" size={14} /> Appearance</div>
          <AppearanceControls compact />
        </div>
      )}
    </div>
  );
}
