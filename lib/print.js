// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — PRINTING
//  Intake tag (goes on the device), claim ticket (goes with the customer),
//  and the shift-handoff sheet. Rendered into a hidden iframe so the app's
//  own layout is never printed.
// ═══════════════════════════════════════════════════════════════════════════
import { ASG_STATUS_BY_ID, serviceLabel, techName } from './constants';
import { escapeHtml as esc, fmtDateLong, fmtDateTime } from './utils';

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Inter, Helvetica, Arial, sans-serif; color: #111; margin: 0; padding: 18px; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .mark { width: 34px; height: 34px; border-radius: 8px; background: #d0021b; color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 13px; letter-spacing: .02em; font-family: ui-monospace, Menlo, monospace; }
  .brand b { font-size: 13px; letter-spacing: .02em; }
  .brand small { display: block; font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; color: #666; margin-top: 2px; }
  .tag { font-size: 30px; font-weight: 800; letter-spacing: .04em; font-family: ui-monospace, Menlo, monospace; }
  .rule { border: 0; border-top: 1.5px solid #111; margin: 10px 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; font-size: 12.5px; }
  .grid div span { display: block; font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase; color: #666; margin-bottom: 1px; }
  .full { grid-column: 1 / -1; }
  .box { border: 1.5px solid #111; border-radius: 8px; padding: 10px 12px; }
  .foot { font-size: 10.5px; color: #555; margin-top: 10px; line-height: 1.5; }
  .stamp { display: inline-block; border: 2px solid #111; border-radius: 6px; padding: 3px 8px; font-weight: 800; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
  @page { margin: 10mm; }
`;

function shell(title, body, extraCss = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE_CSS}${extraCss}</style></head><body>${body}</body></html>`;
}

function brandBlock(settings) {
  return `<div class="brand"><div class="mark">GTS</div><div><b>Guest Technical Services</b><small>${esc(settings.storeLabel || 'B&H Photo Video')}${settings.stationName ? ` · ${esc(settings.stationName)}` : ''}</small></div></div>`;
}

export function intakeTagHTML(asg, settings = {}) {
  const acc = (asg.accessories || []).length ? asg.accessories.map(esc).join(', ') : 'None';
  const body = `
    <div style="width: 4in;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 12px;">
        ${brandBlock(settings)}
        <div class="tag">${esc(asg.tag)}</div>
      </div>
      <hr class="rule" />
      <div class="grid">
        <div class="full"><span>Customer</span><b style="font-size:16px">${esc(asg.customerName || '—')}</b></div>
        <div><span>Phone</span>${esc(asg.phone || '—')}</div>
        <div><span>Order #</span><span class="mono" style="font-size:12.5px;color:#111;letter-spacing:.02em;text-transform:none">${esc(asg.orderNumber || '—')}</span></div>
        <div class="full"><span>Device</span>${esc(asg.deviceDesc || serviceLabel(asg.serviceType))}</div>
        <div class="full"><span>Requested work</span>${esc(asg.issue || '—')}</div>
        <div><span>Received</span>${esc(fmtDateTime(asg.receivedAt))}</div>
        <div><span>Tech</span>${esc(techName(asg.tech))}</div>
        <div><span>Location</span>${esc(asg.location || '—')}</div>
        <div><span>Left with device</span>${acc}</div>
      </div>
      <hr class="rule" />
      <div class="foot">Attach to device. Match this tag number to the customer's claim ticket at pickup.</div>
    </div>`;
  return shell(`Intake tag ${asg.tag}`, body);
}

export function claimTicketHTML(asg, settings = {}) {
  const status = ASG_STATUS_BY_ID[asg.status]?.label || asg.status;
  const body = `
    <div style="max-width: 5.5in;">
      ${brandBlock(settings)}
      <hr class="rule" />
      <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:12px;">
        <div><div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#666">Device drop-off receipt</div><div class="tag">${esc(asg.tag)}</div></div>
        <div class="stamp">${esc(status)}</div>
      </div>
      <div class="box" style="margin-top:12px">
        <div class="grid">
          <div><span>Customer</span>${esc(asg.customerName || '—')}</div>
          <div><span>Phone</span>${esc(asg.phone || '—')}</div>
          <div class="full"><span>Device</span>${esc(asg.deviceDesc || serviceLabel(asg.serviceType))}</div>
          <div class="full"><span>Requested work</span>${esc(asg.issue || '—')}</div>
          <div><span>Received</span>${esc(fmtDateLong(asg.receivedAt))}</div>
          <div><span>Order #</span>${esc(asg.orderNumber || '—')}</div>
          <div class="full"><span>Items left with device</span>${(asg.accessories || []).length ? asg.accessories.map(esc).join(', ') : 'None'}</div>
        </div>
      </div>
      <div class="foot">
        Please bring this ticket (or a photo of it) and a photo ID when collecting your device.<br/>
        Data is your responsibility — we recommend keeping a backup. Devices not collected within 30 days may be subject to store policy.<br/>
        ${settings.counterPhone ? `Questions: <b>${esc(settings.counterPhone)}</b> · ` : ''}Reference <b>${esc(asg.tag)}</b>.
      </div>
    </div>`;
  return shell(`Claim ticket ${asg.tag}`, body);
}

export function handoffHTML(text, settings = {}) {
  const body = `
    <div style="max-width: 7in;">
      ${brandBlock(settings)}
      <hr class="rule" />
      <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#666;margin-bottom:6px">Shift handoff · ${esc(new Date().toLocaleString())}</div>
      <pre class="mono" style="white-space:pre-wrap; font-size:11.5px; line-height:1.55;">${esc(text)}</pre>
    </div>`;
  return shell('Shift handoff', body);
}

/** Print an HTML document via a throwaway hidden iframe. */
export function printHTML(html) {
  if (typeof window === 'undefined') return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  const go = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* ignore */ }
    setTimeout(() => frame.remove(), 1500);
  };
  if (doc.readyState === 'complete') setTimeout(go, 60); else frame.onload = () => setTimeout(go, 60);
}
