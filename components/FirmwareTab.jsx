'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — FIRMWARE TAB
//  "Update / Install Firmware": the Camera Firmware Hub (made for B&H by
//  ZAYS.us) embedded as-is from /public/firmware. The rail dropdown and the
//  chips up here drive the hub's own sections over postMessage; the hub reports
//  back when the tech navigates inside it, so both stay in step.
//  The hub ships its own espresso theme; the GTS shell eases into the same
//  brown palette while this tab is open (html[data-zone="firmware"]).
// ═══════════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FIRMWARE_VIEWS } from '../lib/constants';
import { useStore } from './GTSApp';
import { Icon } from './ui';

const HUB_SRC = '/firmware/index.html';

export default function FirmwareTab() {
  const { fwView, setFwView } = useStore();
  const frame = useRef(null);
  const [ready, setReady] = useState(false);
  const current = FIRMWARE_VIEWS.find((v) => v.id === fwView) || FIRMWARE_VIEWS[0];

  const send = useCallback((msg) => {
    try { frame.current?.contentWindow?.postMessage({ type: 'cfh:nav', ...msg }, window.location.origin); } catch { /* ignore */ }
  }, []);

  // Drive the hub when the dropdown / chips change.
  useEffect(() => { if (ready) send({ view: fwView }); }, [fwView, ready, send]);

  // Follow the hub when the tech clicks its own tabs.
  useEffect(() => {
    const onMessage = (e) => {
      if (e.source !== frame.current?.contentWindow) return;
      const m = e.data || {};
      if (m.type === 'cfh:view' && m.view && m.view !== fwView && FIRMWARE_VIEWS.some((v) => v.id === m.view)) setFwView(m.view);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [fwView, setFwView]);

  // `/` focuses the hub's search like it does on the other tabs.
  useEffect(() => {
    const h = () => send({ query: '', focus: true });
    window.addEventListener('gts:focus-search', h);
    return () => window.removeEventListener('gts:focus-search', h);
  }, [send]);

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
        </div>
      </div>
      <div className={`fw-frame-wrap ${ready ? 'is-ready' : ''}`}>
        {!ready && <div className="fw-loading"><span className="spinner" /> Loading the firmware hub…</div>}
        <iframe
          ref={frame}
          className="fw-frame"
          title="Camera Firmware Hub"
          src={`${HUB_SRC}?embed=1#${fwView}`}
          onLoad={() => { setReady(true); send({ view: fwView }); }}
          allow="clipboard-write"
        />
      </div>
      <p className="fw-foot muted">Card-type firmware: download the file, copy it to the root of a card formatted in the camera, then run the update from the camera menu. Installers run on the counter PC. The desktop edition of the hub adds direct card copy, live version checks and Windows USB writing.</p>
    </div>
  );
}
