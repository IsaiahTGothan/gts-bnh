'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — FIRMWARE TAB
//  "Update / Install Firmware": the Camera Firmware Hub (made for B&H by
//  ZAYS.us) embedded as-is from /public/firmware. The rail dropdown and the
//  chips up here drive the hub's own sections over postMessage; the hub reports
//  back when the tech navigates inside it, so both stay in step.
//  "Add gear" lets any tech add a camera/lens/flash that is missing: model,
//  firmware version, the official link and (optionally) the firmware file.
//  Entries live in the shared team document (state.gear) so every station
//  sees them; the file goes to Vercel Blob through /api/firmware/upload.
//  The hub ships its own espresso theme; the GTS shell eases into the same
//  brown palette while this tab is open (html[data-zone="firmware"]).
// ═══════════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FIRMWARE_VIEWS } from '../lib/constants';
import { relTime } from '../lib/utils';
import { BRANDS, BRAND_COLORS, DEFAULT_BRAND_COLOR } from '../lib/brand-colors';
import { BRAND_MARKS } from '../lib/brand-marks';
import { useStore } from './GTSApp';
import { Btn, Field, Icon, Input, Modal, Select, Textarea } from './ui';

const HUB_SRC = '/firmware/index.html';
const CATEGORIES = [['camera', 'Camera'], ['lens', 'Lens'], ['flash', 'Flash / light'], ['accessory', 'Accessory']];
const MAX_FILE_MB = 1500;

export default function FirmwareTab() {
  const { state, api, fwView, setFwView, toast, confirm } = useStore();
  const frame = useRef(null);
  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState(null); // null | {} (new) | gear record (edit)
  const [showList, setShowList] = useState(false);
  const current = FIRMWARE_VIEWS.find((v) => v.id === fwView) || FIRMWARE_VIEWS[0];
  const gear = useMemo(() => (state.gear || []).filter((g) => !g.deletedAt), [state.gear]);

  const send = useCallback((msg) => {
    try { frame.current?.contentWindow?.postMessage({ type: 'cfh:nav', ...msg }, window.location.origin); } catch { /* ignore */ }
  }, []);
  const sendGear = useCallback((list) => {
    try { frame.current?.contentWindow?.postMessage({ type: 'cfh:custom', items: list }, window.location.origin); } catch { /* ignore */ }
  }, []);

  // Drive the hub when the dropdown / chips change; push team gear whenever it changes.
  useEffect(() => { if (ready) send({ view: fwView }); }, [fwView, ready, send]);
  useEffect(() => { if (ready) sendGear(gear); }, [gear, ready, sendGear]);

  // Follow the hub when the tech clicks its own tabs.
  useEffect(() => {
    const onMessage = (e) => {
      if (e.source !== frame.current?.contentWindow) return;
      const m = e.data || {};
      if (m.type === 'cfh:view' && m.view && m.view !== fwView && FIRMWARE_VIEWS.some((v) => v.id === m.view)) setFwView(m.view);
      if (m.type === 'cfh:addgear') {
        const it = m.item;
        if (!it) setAdding({});
        else if (it.overrideOf) setAdding(gear.find((g) => g.overrideOf === it.overrideOf) || { ...it, id: undefined, _prefill: true });
        else setAdding(gear.find((g) => g.id === String(it.id || '').replace(/^team-/, '')) || {});
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [fwView, setFwView, gear]);

  // `/` focuses the hub's search like it does on the other tabs.
  useEffect(() => {
    const h = () => send({ query: '', focus: true });
    window.addEventListener('gts:focus-search', h);
    return () => window.removeEventListener('gts:focus-search', h);
  }, [send]);

  const saveGear = (data, existing) => {
    const label = `${data.brand} ${data.model}`;
    if (existing?.id) { api.updateGear(existing.id, data); toast(data.overrideOf ? `${label} fixed for everyone` : `${label} updated`, { tone: 'success' }); }
    else { api.addGear(data); toast(data.overrideOf ? `${label} fixed for everyone — Reset brings back the original` : `${label} added — everyone sees it now`, { tone: 'success' }); }
    setAdding(null);
    send({ view: data.category, query: data.model });
    setFwView(data.category);
  };

  const removeGear = (g) => confirm(g.overrideOf ? {
    title: `Reset ${g.brand} ${g.model} to the original?`, danger: true, confirmLabel: 'Reset',
    message: 'Your team’s edits (links, version, steps) are dropped on every station and the researched entry comes back.',
    onConfirm: () => { api.removeGear(g.id); setAdding(null); toast('Back to the original entry', { tone: 'warning' }); },
  } : {
    title: `Remove ${g.brand} ${g.model}?`, danger: true, confirmLabel: 'Remove',
    message: 'It disappears from the firmware hub on every station. The uploaded file stays in storage until it is cleaned up.',
    onConfirm: () => { api.removeGear(g.id); setAdding(null); toast('Removed', { tone: 'warning' }); },
  });

  return (
    <div className="fw-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Camera Firmware Hub · made for B&amp;H · by ZAYS.us</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Update / Install Firmware</h1>
          <p className="page-sub">{current.hint}</p>
        </div>
        <div className="row wrap fw-views" role="tablist" aria-label="Firmware sections">
          {FIRMWARE_VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={fwView === v.id} className={`fw-view ${fwView === v.id ? 'is-active' : ''}`} onClick={() => setFwView(v.id)}>{v.label}</button>
          ))}
          <a className="fw-view fw-view-link" href={`${HUB_SRC}#${fwView}`} target="_blank" rel="noopener" title="Open the hub full screen in a new tab"><Icon name="external" size={13} /> Full screen</a>
          <Btn variant="primary" size="sm" icon="plus" onClick={() => setAdding({})} title="Add a camera, lens or flash that is missing (or a newer firmware)">Add gear</Btn>
          {gear.length > 0 && <Btn size="sm" icon="layers" onClick={() => setShowList((s) => !s)}>{gear.length} team-added</Btn>}
        </div>
      </div>

      {showList && gear.length > 0 && (
        <div className="fw-gearlist">
          {gear.map((g) => (
            <div key={g.id} className="fw-gearrow">
              <span className="fw-gearcat">{g.overrideOf ? 'Edited' : (CATEGORIES.find((c) => c[0] === g.category) || CATEGORIES[0])[1]}</span>
              <div className="grow truncate"><b>{g.brand} {g.model}</b> <span className="muted">{g.version ? `· fw ${g.version}` : ''} · {g.addedBy || 'team'} · {relTime(g.updatedAt || g.createdAt)}</span></div>
              {g.files?.[0]?.url && <a className="btn btn-sm" href={g.files[0].url} target="_blank" rel="noopener"><Icon name="download" size={13} /> File</a>}
              {g.link && <a className="btn btn-sm" href={g.link} target="_blank" rel="noopener"><Icon name="external" size={13} /> Link</a>}
              <Btn size="sm" icon="edit" onClick={() => setAdding(g)}>Edit</Btn>
              <Btn size="sm" variant="ghost" icon="trash" onClick={() => removeGear(g)} aria-label="Remove" />
            </div>
          ))}
        </div>
      )}

      <div className={`fw-frame-wrap ${ready ? 'is-ready' : ''}`}>
        {!ready && <div className="fw-loading"><span className="spinner" /> Loading the firmware hub…</div>}
        <iframe
          ref={frame}
          className="fw-frame"
          title="Camera Firmware Hub"
          src={`${HUB_SRC}?embed=1#${fwView}`}
          onLoad={() => { setReady(true); send({ view: fwView }); sendGear(gear); }}
          allow="clipboard-write"
        />
      </div>
      <p className="fw-foot muted">Missing a model, or the maker just posted a newer version? <button className="linkish" onClick={() => setAdding({})}>Add gear</button> — name, version, link, drop the file — and it shows up for the whole team. Card-type firmware: copy the file to the root of a card formatted in the camera, then run the update from the camera menu.</p>

      {adding && <GearModal initial={adding.id ? adding : null} prefill={adding._prefill ? adding : null} passcode={state.settings.syncPasscode || ''} onSave={saveGear} onRemove={removeGear} onClose={() => setAdding(null)} />}
    </div>
  );
}

// ─── Add / edit gear ─────────────────────────────────────────────────────────
const DL_TYPES = [['cardfile', 'Card file'], ['installer', 'Installer'], ['page', 'Web page'], ['app', 'App']];
const DL_OS = [['any', 'Any OS'], ['win', 'Windows'], ['mac', 'macOS']];
const isUrl = (u) => /^https?:\/\//.test(String(u || ''));

function GearModal({ initial, prefill, passcode, onSave, onRemove, onClose }) {
  const [d, setD] = useState(() => {
    const base = { category: 'camera', brand: 'Panasonic', model: '', version: '', date: '', page: '', link: '', aliases: '', howTo: '', notes: '', files: [], ...(prefill || {}), ...(initial || {}) };
    delete base._prefill;
    if (Array.isArray(base.downloads)) base.downloads = base.downloads.map((x) => ({ url: x.url || '', filename: x.filename || '', type: x.type || 'page', os: x.os || 'any', sizeMB: x.sizeMB || null }));
    return base;
  });
  const isOverride = !!d.overrideOf;
  const setDl = (i, patch) => setD((x) => ({ ...x, downloads: x.downloads.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const [uploads, setUploads] = useState(null);   // { enabled, maxMB } | null while probing
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/firmware/upload', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (alive) setUploads(j); }).catch(() => { if (alive) setUploads({ enabled: false }); });
    return () => { alive = false; };
  }, []);

  const pickFile = async (file) => {
    if (!file) return;
    setErr('');
    if (file.size > MAX_FILE_MB * 1048576) { setErr(`That file is ${(file.size / 1048576).toFixed(0)} MB — the limit is ${MAX_FILE_MB} MB. Paste the maker's download link instead.`); return; }
    if (!uploads?.enabled) { setErr('File storage is not set up yet on this deployment (Vercel → Storage → Blob). Paste the download link for now.'); return; }
    setBusy(true); setProgress(0);
    try {
      const { upload } = await import('@vercel/blob/client');
      const safe = file.name.replace(/[^\w.\-() ]+/g, '_');
      const blob = await upload(`firmware/${safe}`, file, {
        access: 'public',
        handleUploadUrl: '/api/firmware/upload',
        clientPayload: JSON.stringify({ key: passcode }),
        onUploadProgress: (p) => setProgress(Math.round(p.percentage || 0)),
      });
      set('files', [{ name: file.name, url: blob.url, size: file.size, contentType: file.type || null, uploadedAt: new Date().toISOString() }]);
      setProgress(100);
    } catch (e) {
      setErr(`Upload failed: ${String(e?.message || e)}. You can still save with the link.`);
    } finally { setBusy(false); }
  };

  const valid = d.model.trim() && d.brand.trim() && (d.link.trim() || d.page.trim() || d.files.length || (d.downloads || []).some((x) => x.url));
  const submit = (e) => {
    e?.preventDefault?.();
    if (!valid) { setErr('Model, brand, and at least a link or a file are needed.'); return; }
    const bad = [d.page, d.link, ...(d.downloads || []).map((x) => x.url)].filter((u) => u && u.trim() && !isUrl(u.trim()));
    if (bad.length) { setErr(`Links must start with http:// or https:// — check: ${bad[0]}`); return; }
    const clean = { ...d, model: d.model.trim(), brand: d.brand.trim(), version: d.version.trim(), page: d.page.trim(), link: d.link.trim(), aliases: String(d.aliases || '').trim(), howTo: d.howTo.trim(), notes: d.notes.trim() };
    if (Array.isArray(clean.downloads)) clean.downloads = clean.downloads.filter((x) => x.url && x.url.trim()).map((x) => ({ ...x, url: x.url.trim(), filename: x.filename || x.url.trim().split('?')[0].split('/').pop().slice(0, 80) }));
    delete clean.id; delete clean.createdAt; delete clean.updatedAt; delete clean.addedBy; delete clean.deletedAt;
    onSave(clean, initial);
  };

  return (
    <Modal title={initial || isOverride ? `Edit ${d.brand} ${d.model}` : 'Add gear to the firmware hub'}
      sub={isOverride ? 'Fix a dead link, a newer version or the steps. Saves to the shared board so every station gets the fix; Reset brings back the researched entry.' : 'Model + version + where the firmware is. Saves to the shared board, so every station sees it.'} icon="chip" size="lg"
      onClose={onClose}
      footer={<>{initial?.id && onRemove && <Btn variant="danger" icon={isOverride ? 'undo' : 'trash'} onClick={() => onRemove(initial)} style={{ marginRight: 'auto' }}>{isOverride ? 'Reset to original' : 'Remove'}</Btn>}<Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon="check" onClick={submit} disabled={busy || !valid} loading={busy}>{initial || isOverride ? 'Save changes' : 'Add to hub'}</Btn></>}>
      <form className="stack" onSubmit={submit} style={{ gap: 14 }}>
        <div className="fw-formgrid">
          <Field label="Type" required>
            <ChoicePicker options={CATEGORIES} value={d.category} onChange={(v) => set('category', v)} />
          </Field>
          <Field label="Brand" required>
            <BrandPicker value={d.brand} onChange={(b) => set('brand', b)} />
          </Field>
          <Field label="Model" required hint="As the customer says it: Lumix S1R II, a7 IV, EOS R6 Mark II">
            <Input value={d.model} onChange={(e) => set('model', e.target.value)} placeholder="Lumix S1R II" autoFocus />
          </Field>
          <Field label="Firmware version" hint="Exactly as the maker writes it">
            <Input value={d.version} onChange={(e) => set('version', e.target.value)} placeholder="Ver.1.5" />
          </Field>
          <Field label="Released" optional><Input type="date" value={d.date || ''} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Also called" optional hint="Model codes / nicknames, comma separated"><Input value={d.aliases} onChange={(e) => set('aliases', e.target.value)} placeholder="DC-S1RM2, S1RII, S1R2" /></Field>
        </div>
        <Field label="Official firmware page" hint="The maker's page for this model — the safest link to hand a customer">
          <div className="fw-urlrow">
            <Input value={d.page} onChange={(e) => set('page', e.target.value)} placeholder="https://av.jpn.support.panasonic.com/support/global/cs/dsc/download/s1rm2/" inputMode="url" />
            <TestLink url={d.page} />
          </div>
        </Field>
        {Array.isArray(d.downloads) && (
          <div className="field">
            <span className="field-label">Download links <span className="opt">edit, test or remove — the first working one is what “Update now” uses</span></span>
            <div className="fw-dls">
              {d.downloads.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No download links. Add one, or rely on the official page.</div>}
              {d.downloads.map((x, i) => (
                <div className="fw-dl" key={i}>
                  <ChoicePicker options={DL_TYPES} value={x.type} onChange={(v) => setDl(i, { type: v })} compact />
                  <ChoicePicker options={DL_OS} value={x.os} onChange={(v) => setDl(i, { os: v })} compact />
                  <Input value={x.url} onChange={(e) => setDl(i, { url: e.target.value, filename: '' })} placeholder="https://…" inputMode="url" />
                  <TestLink url={x.url} />
                  <Btn size="sm" variant="ghost" icon="x" aria-label="Remove this link" onClick={() => setD((y) => ({ ...y, downloads: y.downloads.filter((_, j) => j !== i) }))} />
                </div>
              ))}
            </div>
            <div><Btn size="sm" variant="ghost" icon="plus" onClick={() => setD((y) => ({ ...y, downloads: [...y.downloads, { url: '', filename: '', type: 'cardfile', os: 'any' }] }))}>Add a link</Btn></div>
          </div>
        )}
        {!Array.isArray(d.downloads) && (
          <Field label="Direct download link" optional hint="A link straight to the firmware file (zip / DAT / exe) if the maker has one">
            <div className="fw-urlrow">
              <Input value={d.link} onChange={(e) => set('link', e.target.value)} placeholder="https://…/S1RM2_V15.zip" inputMode="url" />
              <TestLink url={d.link} />
            </div>
          </Field>
        )}
        <Field label="Firmware file" optional hint={uploads === null ? 'Checking storage…' : uploads.enabled ? `Drop the file here or click to choose · up to ${MAX_FILE_MB} MB · shared with the whole team` : 'File storage is not attached to this deployment yet — paste a link above.'}>
          <div className={`fw-drop ${drag ? 'is-drag' : ''} ${uploads?.enabled ? '' : 'is-off'}`}
            onClick={() => uploads?.enabled && fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); }}>
            <input ref={fileRef} type="file" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            {busy ? (
              <div className="stack" style={{ gap: 6, width: '100%' }}><span>Uploading… {progress}%</span><div className="progress"><i style={{ width: `${progress}%` }} /></div></div>
            ) : d.files?.length ? (
              <div className="row" style={{ gap: 10, width: '100%' }}><Icon name="check" /><div className="grow truncate"><b>{d.files[0].name}</b> <span className="muted">· {(d.files[0].size / 1048576).toFixed(1)} MB</span></div><Btn size="sm" variant="ghost" icon="x" onClick={(e) => { e.stopPropagation(); set('files', []); }}>Remove</Btn></div>
            ) : (
              <div className="row" style={{ gap: 10 }}><Icon name="upload" /><span>Drop the firmware file here</span></div>
            )}
          </div>
        </Field>
        <div className="fw-formgrid">
          <Field label="How to install" optional hint="Short steps: 1) Format card in camera 2) Copy file to card root 3) Menu → Setup → Firmware update">
            <Textarea rows={3} value={d.howTo} onChange={(e) => set('howTo', e.target.value)} placeholder="1) Charge battery. 2) Copy S1RM2__151.ZIP contents to the card root. 3) Setup → Firmware Version → Update." />
          </Field>
          <Field label="Notes" optional hint="What changed, gotchas, needs an intermediate version, etc.">
            <Textarea rows={3} value={d.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Ver.1.5 adds … Must be on 1.1+ first." />
          </Field>
        </div>
        {err && <div className="field-error">{err}</div>}
      </form>
    </Modal>
  );
}

// ─── Custom brand dropdown (colour dot per brand, type to filter, add a new brand) ───
function BrandPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const list = BRANDS.filter((b) => !q || b.toLowerCase().includes(q.toLowerCase()));
  const custom = q.trim() && !BRANDS.some((b) => b.toLowerCase() === q.trim().toLowerCase());
  const pick = (b) => { onChange(b); setOpen(false); setQ(''); };
  return (
    <div className="bp" ref={box}>
      <button type="button" className={`bp-btn ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        {value ? <BrandMark brand={value} size={12} /> : <span className="bp-dot" style={{ '--c': DEFAULT_BRAND_COLOR }} />}
        <span className="bp-label">{value ? '' : <span className="muted">Pick a brand…</span>}</span>
        <Icon name="chevron-down" size={14} className="bp-caret" />
      </button>
      {open && (
        <div className="bp-menu" role="listbox">
          <input className="bp-search" autoFocus placeholder="Type to filter or add a brand" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (list[0]) pick(list[0]); else if (custom) pick(q.trim()); } if (e.key === 'Escape') setOpen(false); }} />
          <div className="bp-list">
            {list.map((b) => (
              <button type="button" key={b} role="option" aria-selected={b === value} className={`bp-item ${b === value ? 'is-sel' : ''}`} onClick={() => pick(b)}>
                <BrandMark brand={b} size={11} />
              </button>
            ))}
            {custom && <button type="button" className="bp-item is-new" onClick={() => pick(q.trim())}><span className="bp-dot" style={{ '--c': DEFAULT_BRAND_COLOR }} />Add “{q.trim()}” as a new brand</button>}
            {!list.length && !custom && <div className="muted" style={{ padding: '8px 12px', fontSize: 12.5 }}>No brand matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function BrandMark({ brand, size = 11 }) {
  const m = BRAND_MARKS[brand];
  if (!m) return <span className="bm bm-generic" style={{ '--c': BRAND_COLORS[brand] || DEFAULT_BRAND_COLOR, fontSize: size }}>{brand}</span>;
  const style = { background: m.bg, color: m.fg, fontFamily: m.font, fontWeight: m.w, letterSpacing: m.ls, fontSize: size, fontStyle: m.it ? 'italic' : 'normal' };
  if (m.round) { style.borderRadius = 999; style.paddingLeft = Math.round(size * 0.9); style.paddingRight = Math.round(size * 0.9); }
  return <span className="bm" style={style} title={brand}>{m.t}{m.bar && <span className="bm-bar">{m.bar.map((c) => <i key={c} style={{ background: c }} />)}</span>}</span>;
}

function TestLink({ url }) {
  const ok = isUrl(url && url.trim());
  return <a className={`btn btn-sm fw-test ${ok ? '' : 'is-off'}`} href={ok ? url.trim() : undefined} target="_blank" rel="noopener" title={ok ? 'Open this link in a new tab to check it' : 'Enter a full https:// link first'}><Icon name="external" size={13} /> Test</a>;
}

// Small custom dropdown (same look as the brand picker) for type / OS choices.
function ChoicePicker({ options, value, onChange, compact }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const cur = options.find((o) => o[0] === value) || options[0];
  return (
    <div className={`bp ${compact ? 'is-compact' : ''}`} ref={box}>
      <button type="button" className={`bp-btn ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="bp-label">{cur[1]}</span>
        <Icon name="chevron-down" size={14} className="bp-caret" />
      </button>
      {open && (
        <div className="bp-menu" role="listbox">
          <div className="bp-list one">
            {options.map(([v, l]) => (
              <button type="button" key={v} role="option" aria-selected={v === value} className={`bp-item ${v === value ? 'is-sel' : ''}`} onClick={() => { onChange(v); setOpen(false); }}>{l}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
