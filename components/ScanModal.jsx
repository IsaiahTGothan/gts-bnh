'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — SCAN TO START (V4.1)
//  Scan a barcode (camera or scanner gun) → the number lands in the system →
//  pick the service type (tap or press 1–0) → the ticket starts with its
//  service clock running. Details stay editable while the clock runs.
//
//  The counter: the MacBook scans with its built-in camera; the Windows PCs
//  have no camera but a USB scanner gun — those open straight in gun mode,
//  and a trigger pull anywhere in the app jumps here on its own.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SERVICE_TYPES } from '../lib/constants';
import { cameraSupported, listCameras, parseScan, startCamera } from '../lib/scan';
import { cx, relTime } from '../lib/utils';
import { useStore } from './GTSApp';
import { Btn, Chip, Icon, Input, Modal, Segmented, Select, Toggle } from './ui';

// 1–9, 0, − pick the 11 service types without touching the mouse
const TYPE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];

export default function ScanModal({ initialCode, initialFormat, onClose }) {
  const { state, api, toast, sfx, openTicket } = useStore();
  const m = state.management || {};
  const [mode, setMode] = useState(() => state.settings.scanMode || 'auto');
  const [cams, setCams] = useState(null);           // null = not checked yet
  const [result, setResult] = useState(() => (initialCode ? { ...parseScan(initialCode, initialFormat, m), at: Date.now() } : null));
  const continuous = !!state.settings.scanContinuous;
  // Auto: camera when this device has one (the Mac), scanner gun when it doesn't (the Windows PCs).
  const effective = mode === 'auto' ? (cams && cams.length ? 'camera' : 'gun') : mode;

  useEffect(() => { listCameras().then(setCams); }, []);

  const accept = useCallback((raw, format) => {
    const parsed = parseScan(raw, format, m);
    if (!parsed.value) return;
    sfx('success');
    try { navigator.vibrate?.(60); } catch { /* ignore */ }
    setResult({ ...parsed, at: Date.now() });
  }, [m, sfx]);

  const start = (serviceType, extra = {}) => {
    const r = result; if (!r) return;
    const asProduct = r.kind === 'product' && !r.useAsOrder;
    const scannedAt = new Date(r.at).toISOString();
    const t = api.addTicket({
      orderNumber: asProduct ? '' : r.value.trim(),
      customerName: (r.name || '').trim(),
      serviceType: serviceType || null,
      description: asProduct ? `Product code (UPC/EAN) ${r.value.trim()}` : '',
      serviceStartedAt: scannedAt,
      logSeconds: (Date.now() - r.at) / 1000,
      source: 'scan',
      ...extra,
    });
    sfx('success');
    window.dispatchEvent(new CustomEvent('gts:ticket-started', { detail: { id: t.id, tag: t.tag, secs: t.logSeconds, order: t.orderNumber, name: t.customerName } }));
    toast(`${t.tag} started from a scan${t.orderNumber ? ` · order ${t.orderNumber}` : ''} — clock running`, { tone: 'success', action: { label: 'Edit', onClick: () => window.dispatchEvent(new CustomEvent('gts:live-edit', { detail: { id: t.id } })) } });
    if (continuous) setResult(null); else onClose();
  };
  const toForm = () => {
    window.dispatchEvent(new CustomEvent('gts:prefill', { detail: { orderNumber: result.kind === 'product' && !result.useAsOrder ? '' : result.value, customerName: result.name || '', description: result.kind === 'product' && !result.useAsOrder ? `Product code (UPC/EAN) ${result.value}` : '' } }));
    onClose();
  };

  return (
    <Modal title={result ? 'Scanned — what’s the service?' : 'Scan a barcode'} sub={result ? 'Pick the type and the ticket starts with its clock running. Details stay editable while it runs.' : effective === 'camera' ? 'Hold the barcode 15–25 cm (6–10 in) from the camera, flat and steady.' : 'Pull the trigger on the scanner — it types the number here.'}
      onClose={onClose} icon="scan" size="lg"
      footer={<>
        <div className="row" style={{ gap: 8 }}>
          <Toggle on={continuous} onChange={(v) => api.setSettings({ scanContinuous: v })} label="Keep scanning" />
          <span className="faint" style={{ fontSize: 12 }}>Keep scanning after each ticket</span>
        </div>
        {!result && <Segmented value={mode} onChange={(v) => { setMode(v); api.setSettings({ scanMode: v }); }} options={[{ id: 'auto', label: 'Auto' }, { id: 'camera', label: 'Camera', icon: 'camera' }, { id: 'gun', label: 'Scanner', icon: 'scan' }]} />}
      </>}>
      {result
        ? <ScanResult result={result} setResult={setResult} onStart={start} onRescan={() => setResult(null)} onForm={toForm} openTicket={(id) => { onClose(); openTicket(id); }} />
        : effective === 'camera' ? <CameraView cams={cams} onCode={accept} onNoCamera={() => setMode('gun')} /> : <GunView onCode={accept} hasCamera={!!(cams && cams.length)} onCamera={() => setMode('camera')} />}
    </Modal>
  );
}

// ─── Camera ────────────────────────────────────────────────────────────────
function CameraView({ cams, onCode, onNoCamera }) {
  const { state, api } = useStore();
  const videoRef = useRef(null);
  const ctlRef = useRef(null);
  const [status, setStatus] = useState('starting');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState({ engine: '', torch: false, mirror: false, label: '' });
  const [torch, setTorch] = useState(false);
  const deviceId = state.settings.scanCamera || '';
  const onCodeRef = useRef(onCode); onCodeRef.current = onCode;

  useEffect(() => {
    let mounted = true; let read = false;
    setStatus('starting'); setError(null);
    startCamera(videoRef.current, { deviceId: deviceId || undefined, onCode: (t, f) => { if (mounted && !read) { read = true; onCodeRef.current(t, f); } } })
      .then((ctl) => { if (!mounted) { ctl.stop(); return; } ctlRef.current = ctl; setInfo(ctl); setStatus('live'); })
      .catch((e) => {
        if (!mounted) return;
        const name = e?.name || '';
        setError(name === 'NotAllowedError' ? 'Camera permission was blocked. Allow the camera for this site (address bar → camera icon) and try again.'
          : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'No camera found on this computer — use the scanner gun instead.'
            : name === 'NotReadableError' ? 'The camera is busy in another app (FaceTime, Zoom, Teams…). Close it and try again.'
              : String(e?.message || e));
        setStatus('error');
      });
    return () => { mounted = false; ctlRef.current?.stop(); ctlRef.current = null; };
  }, [deviceId]);

  return (
    <div className="scan-cam">
      <div className={cx('scan-video', info.mirror && 'is-mirror', status === 'live' && 'is-live')}>
        <video ref={videoRef} muted playsInline />
        {status === 'live' && <div className="scan-frame" aria-hidden="true"><i className="tl" /><i className="tr" /><i className="bl" /><i className="br" /><span className="scan-laser" /></div>}
        {status === 'starting' && <div className="scan-overlay"><Icon name="camera" size={28} /><span>Starting the camera…</span></div>}
        {status === 'error' && (
          <div className="scan-overlay is-error">
            <Icon name="alert-triangle" size={26} />
            <span>{error}</span>
            <div className="row" style={{ gap: 8 }}><Btn size="sm" icon="scan" onClick={onNoCamera}>Use the scanner gun</Btn></div>
          </div>
        )}
      </div>
      <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
        {cams && cams.length > 1 && (
          <Select value={deviceId} onChange={(e) => api.setSettings({ scanCamera: e.target.value })} style={{ width: 240 }} aria-label="Camera">
            <option value="">Default camera</option>
            {cams.map((c, i) => <option key={c.deviceId || i} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>)}
          </Select>
        )}
        {info.torch && <Btn size="sm" variant={torch ? 'outline-accent' : 'ghost'} icon="flash" onClick={() => { const on = !torch; setTorch(on); ctlRef.current?.setTorch(on); }}>Light</Btn>}
        <span className="grow" />
        {status === 'live' && <Chip size="sm" tone="green" icon="eye">{info.engine === 'native' ? 'Built-in reader' : 'ZXing reader'}{info.label ? ` · ${info.label.replace(/\s*\(.*\)$/, '')}` : ''}</Chip>}
      </div>
      <div className="faint" style={{ fontSize: 11.5, marginTop: 8 }}>Tip: laptop cameras can’t focus very close — if it won’t read, pull the barcode back a little and tilt it away from glare. Reads Code 128 (B&amp;H order labels), Code 39, UPC/EAN, ITF, QR and Data Matrix.</div>
    </div>
  );
}

// ─── Scanner gun (keyboard wedge) ──────────────────────────────────────────
function GunView({ onCode, hasCamera, onCamera }) {
  const [v, setV] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); const h = () => setTimeout(() => ref.current?.focus(), 0); window.addEventListener('focus', h); return () => window.removeEventListener('focus', h); }, []);
  return (
    <div className="scan-gun" onClick={() => ref.current?.focus()}>
      <div className="scan-gun-target">
        <span className="scan-gun-icon"><Icon name="scan" size={34} /></span>
        <b>Ready — pull the trigger</b>
        <span className="faint">USB or Bluetooth scanner · it types the number and presses Enter</span>
        <Input ref={ref} className="mono input-lg scan-gun-input" placeholder="…or type the number and press Enter" value={v} autoComplete="off"
          onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === 'Tab') && v.trim()) { e.preventDefault(); onCode(v.trim(), ''); setV(''); } }} />
      </div>
      <div className="row wrap" style={{ gap: 8, marginTop: 10, justifyContent: 'space-between' }}>
        <span className="faint" style={{ fontSize: 11.5 }}>No need to open this window — on the Windows PCs a scan anywhere in GTS Hub lands here by itself.</span>
        {hasCamera && <Btn size="sm" variant="ghost" icon="camera" onClick={onCamera}>Use the camera</Btn>}
      </div>
    </div>
  );
}

// ─── Result → pick the type → start ────────────────────────────────────────
function ScanResult({ result, setResult, onStart, onRescan, onForm, openTicket }) {
  const { state } = useStore();
  const m = state.management || {};
  const gridRef = useRef(null);
  const asProduct = result.kind === 'product' && !result.useAsOrder;
  const dupe = !asProduct ? state.tickets.find((t) => !t.deletedAt && t.orderNumber && t.orderNumber === result.value.trim() && Date.now() - new Date(t.createdAt).getTime() < (Number(m.duplicateWindowHours) || 24) * 3_600_000) : null;
  const upd = (patch) => setResult((r) => ({ ...r, ...patch }));
  useEffect(() => { gridRef.current?.focus(); }, []);
  const types = SERVICE_TYPES.filter((s) => s.id !== 'warranty' || m.features?.warranty !== false);
  const onKey = (e) => {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') { if (e.key === 'Enter') { e.preventDefault(); gridRef.current?.focus(); } return; }
    const i = TYPE_KEYS.indexOf(e.key);
    if (i >= 0 && types[i]) { e.preventDefault(); onStart(types[i].id); return; }
    if (e.key === 'Enter') { e.preventDefault(); onStart(null); }
    if (e.key === 'Backspace') { e.preventDefault(); onRescan(); }
  };
  return (
    <div className="scan-result" onKeyDown={onKey}>
      <div className="scan-hit">
        <span className="scan-hit-icon"><Icon name="check" size={20} /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="scan-hit-label">{asProduct ? 'Product code (UPC / EAN)' : result.kind === 'order' ? 'Order number' : 'Scanned code'}{result.format ? <span className="faint"> · {result.format.replace(/_/g, ' ').toUpperCase()}</span> : null}</div>
          <Input className="mono scan-hit-value" value={result.value} onChange={(e) => upd({ value: e.target.value })} aria-label="Scanned number" />
          {result.raw && result.raw !== result.value && <div className="faint mono" style={{ fontSize: 11 }}>raw: {result.raw}</div>}
        </div>
        <Input className="scan-hit-name" placeholder="Customer name (optional)" value={result.name || ''} onChange={(e) => upd({ name: e.target.value })} />
      </div>
      {result.kind === 'product' && (
        <div className="scan-note"><Icon name="info" size={13} /> That’s a product barcode, not an order number — it goes in the description.
          <button type="button" className="linkish" onClick={() => upd({ useAsOrder: !result.useAsOrder })}>{result.useAsOrder ? 'Treat as product code' : 'Use it as the order # anyway'}</button></div>
      )}
      {result.kind === 'other' && <div className="scan-note is-warn"><Icon name="alert-triangle" size={13} /> Doesn’t look like a B&amp;H order number — check it before starting.</div>}
      {dupe && <div className="scan-note is-warn"><Icon name="alert-triangle" size={13} /> Already logged as <button type="button" className="linkish" onClick={() => openTicket(dupe.id)}>{dupe.tag}</button> {relTime(dupe.createdAt)} — same customer?</div>}

      <div className="scan-types" ref={gridRef} tabIndex={-1} aria-label="Service type — press 1 to 0">
        {types.map((s, i) => (
          <button key={s.id} type="button" className="scan-type" style={{ '--c': s.color }} onClick={() => onStart(s.id)}>
            <kbd className="kbd">{TYPE_KEYS[i]}</kbd><Icon name={s.icon} size={20} /><span>{s.label}</span>
          </button>
        ))}
      </div>
      <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
        <Btn variant="primary" icon="play" onClick={() => onStart(null)}>Start without a type <kbd className="kbd" style={{ marginLeft: 4 }}>↵</kbd></Btn>
        <Btn variant="ghost" icon="scan" onClick={onRescan}>Scan again</Btn>
        <span className="grow" />
        <Btn variant="ghost" icon="edit" onClick={onForm} title="Put the number in the Quick Log form instead of starting right away">Fill the form instead</Btn>
      </div>
    </div>
  );
}
