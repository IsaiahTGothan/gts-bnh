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

/**
 * End-of-day report (V4) — what the managers asked for on one sheet:
 * customers, customers per hour, service time (start → done), per tech.
 * `st` = computeStats(state, { days: 1 }).
 */
export function dayReportHTML(st, settings = {}, management = {}, fmt) {
  const { dur, pct } = fmt;
  const T = st.totals; const S = st.service; const P = st.perHour;
  const hours = [];
  for (let h = 7; h <= 21; h++) if (P.today[h] || (h >= 9 && h <= 19)) hours.push(h);
  const maxH = Math.max(1, ...hours.map((h) => P.today[h]));
  const lbl = (h) => (h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`);
  const bars = hours.map((h) => `<div class="hb"><i style="height:${Math.round((P.today[h] / maxH) * 70)}px"></i><b>${P.today[h] || ''}</b><span>${lbl(h)}</span></div>`).join('');
  const techRows = st.byTech.filter((r) => r.customers || r.tickets).map((r) => `<tr><td>${esc(r.tech.name)}</td><td>${r.customers}</td><td>${r.withOrder}</td><td>${r.serviceSamples ? dur(r.avgServiceMs) : '—'}</td><td>${r.serviceSamples ? dur(r.serviceTotalMs) : '—'}</td><td>${r.avgLogSeconds ? `${r.avgLogSeconds.toFixed(1)}s` : '—'}</td></tr>`).join('');
  const typeRows = S.byType.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.n}</td><td>${dur(r.avgMs)}</td><td>${r.target}m</td></tr>`).join('');
  const css = `
    h1 { font-size: 20px; margin: 8px 0 2px; } .sub { color:#555; font-size: 11px; letter-spacing:.12em; text-transform: uppercase; }
    .kpis { display:grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
    .kpi { border:1.5px solid #111; border-radius: 8px; padding: 8px 10px; } .kpi b { display:block; font-size: 22px; } .kpi span { font-size: 9.5px; letter-spacing:.12em; text-transform: uppercase; color:#555; }
    .hbars { display:flex; align-items:flex-end; gap: 6px; height: 110px; border-bottom: 1.5px solid #111; padding-bottom: 2px; margin: 6px 0 14px; }
    .hb { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; font-size: 9.5px; } .hb i { width: 70%; background:#111; border-radius: 3px 3px 0 0; min-height: 1px; } .hb b { font-size: 10px; } .hb span { color:#666; }
    table { width:100%; border-collapse: collapse; font-size: 11.5px; margin: 4px 0 14px; } th, td { text-align:left; padding: 4px 6px; border-bottom: 1px solid #ccc; } th { font-size: 9.5px; letter-spacing:.1em; text-transform: uppercase; color:#555; }
    h3 { font-size: 12px; letter-spacing:.12em; text-transform: uppercase; margin: 10px 0 4px; }`;
  const body = `
    <div style="max-width: 7.5in;">
      ${brandBlock(settings)}
      <hr class="rule" />
      <div class="sub">End-of-day report · ${esc(management.storeCode || '')} · ${esc(new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</div>
      <h1>${T.customers} customers served · goal ${st.goal.perDay}</h1>
      <div class="kpis">
        <div class="kpi"><b>${P.perOpenHour ? P.perOpenHour.toFixed(1) : '—'}</b><span>customers / open hour</span></div>
        <div class="kpi"><b>${S.samples ? dur(S.avgMs) : '—'}</b><span>avg service time</span></div>
        <div class="kpi"><b>${S.samples ? dur(S.p90Ms) : '—'}</b><span>90% done within</span></div>
        <div class="kpi"><b>${S.samples ? pct(S.withinTargetPct) : '—'}</b><span>within ${S.target}m target</span></div>
        <div class="kpi"><b>${pct(st.rates.orderPct)}</b><span>with order #</span></div>
        <div class="kpi"><b>${pct(st.rates.sfPct)}</b><span>pushed to Salesforce</span></div>
        <div class="kpi"><b>${pct(st.rates.unixPct)}</b><span>orders in UNIX</span></div>
        <div class="kpi"><b>${T.assignments}</b><span>overnight drop-offs</span></div>
      </div>
      <h3>Customers per hour</h3>
      <div class="hbars">${bars}</div>
      <h3>Per tech</h3>
      <table><thead><tr><th>Tech</th><th>Customers</th><th>Order #</th><th>Avg service</th><th>Total service</th><th>Avg log</th></tr></thead><tbody>${techRows || '<tr><td colspan="6">No activity</td></tr>'}</tbody></table>
      ${typeRows ? `<h3>Service time by type</h3><table><thead><tr><th>Type</th><th>Done</th><th>Avg</th><th>Target</th></tr></thead><tbody>${typeRows}</tbody></table>` : ''}
      ${st.queue.joined ? `<h3>Walk-in queue</h3><div style="font-size:12px">${st.queue.joined} joined · ${st.queue.served} served · ${st.queue.left} left before service · avg wait ${dur(st.queue.avgWaitMs)}</div>` : ''}
      <div class="foot">Generated by GTS Hub · service time runs from the first keystroke (or a manual start) to Done, pauses excluded.</div>
    </div>`;
  return shell('GTS end-of-day report', body, css);
}
