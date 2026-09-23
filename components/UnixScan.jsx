'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — UNIX SCAN BRIDGE
//  The B&H order system is a green-screen UNIX app on WYSE terminals behind
//  a firewall, so there is no API to call. What every terminal DOES accept
//  is keyboard input — and a USB barcode scanner is a keyboard. So "Push to
//  UNIX" draws the order number as a Code 128 barcode; the tech scans it
//  with the counter scanner and the order number lands in the UNIX field,
//  Enter included. Zero software on B&H machines.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useState } from 'react';
import { code128Modules } from '../lib/barcode';
import { copyText, fmtDateTime, relTime } from '../lib/utils';
import { techName } from '../lib/constants';
import { useStore } from './GTSApp';
import { Btn, Chip, Icon, Modal } from './ui';

export function Barcode({ value, unit = 3, height = 96, label = true, className }) {
  const runs = useMemo(() => { try { return code128Modules(String(value || ''), 10); } catch { return null; } }, [value]);
  if (!runs) return <div className="faint">Cannot encode “{String(value)}”</div>;
  const total = runs.reduce((s, r) => s + r.width, 0);
  let x = 0;
  const rects = [];
  for (const r of runs) { if (r.bar) rects.push(<rect key={x} x={x * unit} y={0} width={r.width * unit} height={height} />); x += r.width; }
  return (
    <div className={`barcode ${className || ''}`}>
      <svg viewBox={`0 0 ${total * unit} ${height}`} width={total * unit} height={height} shapeRendering="crispEdges" role="img" aria-label={`Barcode ${value}`}>
        <rect x="0" y="0" width={total * unit} height={height} fill="#fff" />
        <g fill="#000">{rects}</g>
      </svg>
      {label && <div className="barcode-text">{String(value).replace(/(\d{3})(?=\d)/g, '$1 ')}</div>}
    </div>
  );
}

export function UnixScanModal({ ticketId, onClose }) {
  const { state, api, toast, sfx, now, connections } = useStore();
  const t = state.tickets.find((x) => x.id === ticketId);
  const [big, setBig] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const value = t?.orderNumber || '';

  // A scanner "types" the code + Enter into whatever has focus. If the tech
  // scans while THIS screen has focus (e.g. testing), catch it and confirm.
  useEffect(() => {
    if (!value) return undefined;
    let buf = ''; let last = 0;
    const h = (e) => {
      const nowT = Date.now();
      if (nowT - last > 120) buf = '';
      last = nowT;
      if (e.key === 'Enter') { if (buf === value) { toast('Scanner read the order number correctly', { tone: 'success' }); } buf = ''; return; }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [value, toast]);

  if (!t) return null;
  const done = !!t.unixLoggedAt;

  const mark = () => { api.unixTicket(t.id, true); sfx('success'); toast(`${t.tag} marked as entered in UNIX`, { tone: 'success', action: { label: 'Undo', onClick: () => api.unixTicket(t.id, false) } }); onClose(); };

  return (
    <Modal title={`UNIX · ${t.tag}`} sub={value ? 'Scan the barcode at the WYSE terminal — the order number types itself into the order screen.' : 'UNIX entries need an order number.'} onClose={onClose} icon="hash" size={big ? 'lg' : undefined}
      footer={<>
        <span className="row" style={{ gap: 8 }}>
          {done ? <Chip tone="green" icon="check">Entered {relTime(t.unixLoggedAt, now)}{t.unixBy ? ` by ${techName(t.unixBy)}` : ''}</Chip> : <Chip tone="amber" icon="clock">Not in UNIX yet</Chip>}
        </span>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {value && <Btn icon="copy" onClick={async () => { await copyText(value); toast(`Order ${value} copied`); }}>Copy order #</Btn>}
          {done
            ? <Btn variant="ghost" icon="undo" onClick={() => { api.unixTicket(t.id, false); onClose(); }}>Undo</Btn>
            : <Btn variant="success" icon="check" onClick={mark} disabled={!value}>Mark as entered in UNIX</Btn>}
        </div>
      </>}>
      {!value ? (
        <div className="empty"><div className="empty-icon"><Icon name="hash" /></div><div className="empty-title">No order number on this ticket</div><div style={{ fontSize: 12.5, maxWidth: 380 }}>Edit the ticket and add the B&amp;H order number, then push it to UNIX. Tickets without an order number only go to Salesforce.</div></div>
      ) : (
        <>
          <div className={`unix-stage ${big ? 'is-big' : ''}`} onClick={() => setBig((b) => !b)} title="Tap to enlarge">
            <Barcode value={value} unit={big ? 4 : 3} height={big ? 150 : 100} />
            <div className="unix-stage-hint"><Icon name="eye" size={13} /> {big ? 'Tap to shrink' : 'Tap to enlarge for a phone-to-scanner scan'}</div>
          </div>
          <div className="unix-steps">
            <div className="unix-step"><span className="unix-n">1</span><div><b>Open the order screen in UNIX</b> on the WYSE terminal and put the cursor in the order-number field.</div></div>
            <div className="unix-step"><span className="unix-n">2</span><div><b>Scan this barcode</b> with the counter’s USB scanner (point it at this screen — phone, iPad or PC). The scanner types <span className="mono">{value}</span> + Enter.</div></div>
            <div className="unix-step"><span className="unix-n">3</span><div><b>Mark as entered</b> below so the team sees the order is in both systems. {t.customerName ? `Customer: ${t.customerName}.` : ''}</div></div>
          </div>
          <button className="unix-setup-toggle" onClick={() => setShowSetup((v) => !v)}><Icon name={showSetup ? 'chevron-down' : 'chevron-right'} size={14} /> Scanner setup &amp; why this works</button>
          {showSetup && (
            <div className="unix-setup">
              <p>USB barcode scanners are <b>keyboards</b> to the computer they’re plugged into (HID “keyboard wedge”). The WYSE terminal sees scanned characters exactly like typed keys, so the firewall and the age of the UNIX program don’t matter — nothing is installed and nothing talks to the network.</p>
              <ul>
                <li>Use any 1D/2D USB scanner (Zebra, Honeywell, Symbol…). Plug it into the WYSE terminal (or the PC running the terminal emulator).</li>
                <li>Enable the <b>Enter (CR) suffix</b> in the scanner’s config sheet so the order number is submitted automatically; use <b>Tab</b> instead if the UNIX screen expects it.</li>
                <li>Symbology: <b>Code 128</b> (on by default on every scanner).</li>
                <li>Scanning a phone/tablet screen works best with a 2D (imager) scanner and the barcode enlarged; laser scanners need a printed or PC-screen barcode.</li>
              </ul>
              <p className="faint">Connection status: {connections.unix?.bridge ? 'bridge helper detected' : 'scan mode (no bridge helper installed)'} · Details in Management → Connections.</p>
            </div>
          )}
          <div className="faint" style={{ fontSize: 11.5 }}>Ticket logged {fmtDateTime(t.createdAt)} by {techName(t.tech)}{t.loggedAt ? ` · Salesforce ${t.sfCaseNumber ? `Case ${t.sfCaseNumber}` : 'pushed'}` : ''}</div>
        </>
      )}
    </Modal>
  );
}
