'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — MANAGEMENT → SYSTEM (V4)
//  Everything the software department / IT needs to run GTS Hub as a real
//  B&H tool: store hours, service-time targets, ticket rules, features,
//  privacy & retention, security & permissions, the warranty directory,
//  integrations (webhooks, health), diagnostics and config import/export.
//  All of it lives in the shared `management` document, so it syncs.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION, DEFAULT_HOURS, DEFAULT_MANAGEMENT, PICK_TYPES, SERVICE_BY_ID, SERVICE_TYPES, WEEKDAYS, techName } from '../lib/constants';
import { SF_GROUPS, SF_SERVICES, classifyText, inferFromDescription, serviceCatalog } from '../lib/sf-services';
import { headers } from '../lib/sync';
import { checkOrder } from '../lib/service';
import { handoffMarkdown } from '../lib/handoff';
import { WEBHOOK_EVENTS, sendWebhook } from '../lib/webhook';
import { WARRANTY_BRANDS } from '../lib/warranty-data';
import { WARRANTY_CATEGORIES } from '../lib/warranty';
import { copyText, cx, dayKey, downloadText, fmtDateTime, matches, toCSV } from '../lib/utils';
import { webhookPayload, useStore } from './GTSApp';
import { BrandSwatch } from './warranty-ui';
import { PromoMedia, REPO_VIDEO, embedFor, useRepoVideo } from './PromoStage';
import { DEFAULT_PROMO_SLIDES } from '../lib/constants';
import { storageStatus, uploadFile } from '../lib/blob-upload';
import { Btn, Chip, Field, Icon, Input, Panel, Segmented, Select, Textarea, Toggle } from './ui';

const SECTIONS = [
  ['promo', 'Promo screen', 'video'], ['hours', 'Store & hours', 'clock'], ['service', 'Service clock', 'timer'], ['rules', 'Ticket rules', 'clipboard'], ['services', 'Services', 'list'], ['features', 'Features', 'sparkles'],
  ['security', 'Security', 'lock'], ['privacy', 'Privacy', 'shield'], ['warranty', 'Warranty directory', 'shield-check'], ['integrations', 'Integrations', 'layers'],
  ['diagnostics', 'Diagnostics', 'server'], ['config', 'Configuration', 'code'],
];

function useMgmt() {
  const { state, api, toast } = useStore();
  const m = state.management || {};
  const set = (patch, label) => { api.setManagement(patch, label ? { action: 'management.update', label: 'System', detail: label } : undefined); };
  return { m, set, toast, state, api };
}

function Setting({ title, desc, children, wide }) {
  return (
    <div className={cx('setting', wide && 'is-wide')}>
      <div><div className="setting-title">{title}</div>{desc && <div className="setting-desc">{desc}</div>}</div>
      <div className="setting-ctl">{children}</div>
    </div>
  );
}

export default function ManagementSystem() {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <nav className="sysnav" aria-label="System sections">
        {SECTIONS.map(([id, label, icon]) => <button key={id} type="button" className="sysnav-item" onClick={() => document.getElementById(`sys-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><Icon name={icon} size={13} />{label}</button>)}
      </nav>
      <PromoPanel />
      <div className="grid cols-2 sys-grid">
        <HoursPanel />
        <ServicePanel />
        <RulesPanel />
        <FeaturesPanel />
        <SecurityPanel />
        <PrivacyPanel />
      </div>
      <ServicesPanel />
      <WarrantyDirectoryPanel />
      <div className="grid cols-2 sys-grid">
        <IntegrationsPanel />
        <DiagnosticsPanel />
      </div>
      <ConfigPanel />
    </div>
  );
}

// ─── Services: the Salesforce list, team additions, re-sorting Other ───────
function ServicesPanel() {
  const { m, set, state, api, toast } = useMgmt();
  const custom = m.customServices || [];
  const catalog = useMemo(() => serviceCatalog(custom), [custom]);
  const [showList, setShowList] = useState(false);
  // every live ticket filed as Other, with no type, or under the retired Monitors chip
  const candidates = useMemo(() => state.tickets
    .filter((t) => !t.deletedAt && (t.kind || 'sf') === 'sf' && (!t.serviceType || t.serviceType === 'other' || SERVICE_BY_ID[t.serviceType]?.legacy))
    .map((t) => {
      const inf = inferFromDescription(t.description || '', { catalog });
      const type = inf.type || classifyText(`${t.description || ''} ${t.warrantyBrand || ''}`);
      return { t, type: type && type !== t.serviceType ? type : null, sfService: inf.service?.path || null };
    }), [state.tickets, catalog]);
  const [pick, setPick] = useState({}); // id → type override ('' = leave as is)
  const typeFor = (c) => (pick[c.t.id] !== undefined ? pick[c.t.id] : c.type || '');
  const changes = candidates.filter((c) => typeFor(c) && typeFor(c) !== c.t.serviceType);
  // what the "Other" pile really is, biggest first
  const groups = useMemo(() => {
    const g = {};
    for (const c of candidates) { const k = typeFor(c) || 'unsorted'; g[k] = (g[k] || 0) + 1; }
    return Object.entries(g).sort((a, b) => b[1] - a[1]);
  }, [candidates, pick]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = () => {
    api.retypeTickets(changes.map((c) => ({ id: c.t.id, type: typeFor(c), ...(c.sfService ? { sfService: c.sfService } : {}) })));
    toast(`${changes.length} ticket${changes.length === 1 ? '' : 's'} re-sorted`, { tone: 'success' });
    setPick({});
  };
  const removeCustom = (i) => set({ customServices: custom.filter((_, k) => k !== i) }, `Removed team service “${custom[i].name}”`);
  const retypeCustom = (i, type) => set({ customServices: custom.map((c, k) => (k === i ? { ...c, type: type || null } : c)) });
  return (
    <Panel id="sys-services" title="Services" icon="list" sub={`${SF_SERVICES.length} verified Salesforce services in ${SF_GROUPS.length} groups${custom.length ? ` + ${custom.length} team-added` : ''}. The description is the service name; the type is picked from it.`}
      actions={<Btn size="sm" variant="ghost" icon={showList ? 'chevron-down' : 'chevron-right'} onClick={() => setShowList((v) => !v)}>{showList ? 'Hide list' : 'Show list'}</Btn>}>
      {showList && (
        <div className="svc-groups mb-3">
          {SF_GROUPS.map((g) => (
            <div key={g} className="svc-group-card"><b>{g}</b>{SF_SERVICES.filter((x) => x.group === g).map((x) => <span key={x.id} style={{ '--c': SERVICE_BY_ID[x.type]?.color || 'var(--text-3)' }}><Icon name={SERVICE_BY_ID[x.type]?.icon || 'dots'} size={11} />{x.name}</span>)}</div>
          ))}
        </div>
      )}
      <div className="setting-title">Team-added services <span className="faint" style={{ fontWeight: 400 }}>· not verified in Salesforce — add them from the service box (“Add … to the service list”)</span></div>
      {custom.length ? (
        <div className="tpl-edit mb-3">
          {custom.map((c, i) => (
            <span key={`${c.name}-${i}`} className="tpl-chip">{c.name}
              <select className="mini-select" value={c.type || ''} onChange={(e) => retypeCustom(i, e.target.value)} aria-label={`Type for ${c.name}`}><option value="">auto</option>{PICK_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
              <button type="button" onClick={() => removeCustom(i)} aria-label={`Remove ${c.name}`}><Icon name="x" size={11} /></button></span>
          ))}
        </div>
      ) : <div className="faint mb-3" style={{ fontSize: 13 }}>None yet.</div>}

      <div className="setting-title">Re-sort Other <span className="faint" style={{ fontWeight: 400 }}>· {candidates.length} ticket{candidates.length === 1 ? '' : 's'} filed as Other, with no type, or as Monitors</span></div>
      {candidates.length ? (
        <>
          <div className="row wrap mb-2" style={{ gap: 6 }}>
            {groups.map(([k, n]) => <Chip key={k} size="sm" tone={k === 'unsorted' ? undefined : 'accent'}>{k === 'unsorted' ? 'Stays Other' : SERVICE_BY_ID[k]?.label || k} · {n}</Chip>)}
          </div>
          <div className="table-wrap resort-table">
            <table className="table">
              <thead><tr><th>Ticket</th><th>Description</th><th>Now</th><th>Move to</th></tr></thead>
              <tbody>
                {candidates.slice().sort((a, b) => (typeFor(b) ? 1 : 0) - (typeFor(a) ? 1 : 0) || String(typeFor(a)).localeCompare(String(typeFor(b)))).map((c) => (
                  <tr key={c.t.id}>
                    <td className="mono">{c.t.tag}<div className="faint" style={{ fontSize: 11 }}>{fmtDateTime(c.t.createdAt)}</div></td>
                    <td style={{ maxWidth: 420 }}>{c.t.description || <span className="faint">—</span>}{c.sfService && <div className="faint" style={{ fontSize: 11 }}>{c.sfService}</div>}</td>
                    <td>{c.t.serviceType ? SERVICE_BY_ID[c.t.serviceType]?.label : <span className="faint">none</span>}</td>
                    <td><Select value={typeFor(c)} onChange={(e) => setPick((x) => ({ ...x, [c.t.id]: e.target.value }))} style={{ width: 150 }}><option value="">Leave as is</option>{PICK_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row wrap mt-3" style={{ gap: 8 }}>
            <Btn variant="primary" icon="check" disabled={!changes.length} onClick={apply}>Apply {changes.length} change{changes.length === 1 ? '' : 's'}</Btn>
            <span className="faint" style={{ fontSize: 12 }}>Suggestions come from each ticket’s own description. Nothing changes until you apply; every change is stamped in Activity.</span>
          </div>
        </>
      ) : <div className="faint" style={{ fontSize: 13 }}>Nothing to sort — every ticket has a real type.</div>}
    </Panel>
  );
}

// ─── Promo screen ──────────────────────────────────────────────────────────
function PromoPanel() {
  const { m, set, toast, state } = useMgmt();
  const f = m.features || {};
  const repo = useRepoVideo();
  const [storage, setStorage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [link, setLink] = useState(m.promoVideoUrl || '');
  const [preview, setPreview] = useState(false);
  const [slides, setSlides] = useState(() => (m.promoSlides || DEFAULT_PROMO_SLIDES).join('\n'));
  const fileRef = useRef(null);
  useEffect(() => { storageStatus().then(setStorage); }, []);
  useEffect(() => { setLink(m.promoVideoUrl || ''); }, [m.promoVideoUrl]);
  const url = (m.promoVideoUrl || '').trim();
  const source = url ? (embedFor(url) ? (/vimeo/i.test(url) ? 'Vimeo link' : 'YouTube link') : m.promoVideoName ? `Uploaded · ${m.promoVideoName}` : 'Video link') : repo ? `Repo file · ${REPO_VIDEO}` : 'Built-in animated promo (no video yet)';
  const upload = async (file) => {
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) { toast('Pick a video file (MP4, WebM or MOV)', { tone: 'warning' }); return; }
    if (!storage?.enabled) { toast('File storage isn’t attached yet (Vercel → Storage → Blob) — paste a YouTube link for now', { tone: 'warning', duration: 8000 }); return; }
    setBusy(true); setProgress(0);
    try {
      const blob = await uploadFile('promo', file, { passcode: state.settings.syncPasscode, onProgress: setProgress, status: storage });
      set({ promoVideoUrl: blob.url, promoVideoName: file.name }, `Promo video uploaded: ${file.name}`);
      toast('Promo video uploaded — every station plays it now', { tone: 'success' }); setPreview(true);
    } catch (e) { toast(`Upload failed: ${String(e?.message || e)}`, { tone: 'error', duration: 9000 }); }
    setBusy(false);
  };
  const saveLink = () => {
    const v = link.trim();
    if (v && !/^https:\/\//.test(v)) { toast('Use an https:// link (YouTube, Vimeo or a direct .mp4)', { tone: 'warning' }); return; }
    if (/drive\.google\.com/i.test(v)) toast('Google Drive links usually won’t play inside a website — upload the file here or use an unlisted YouTube link', { tone: 'warning', duration: 9000 });
    set({ promoVideoUrl: v, promoVideoName: '' }, v ? 'Promo video link set' : 'Promo video removed'); setPreview(!!v);
  };
  return (
    <Panel id="sys-promo" title="Promo screen" icon="video" sub="While a customer’s ticket is in service the counter screen plays your promo almost full screen — the ticket stays editable along the bottom."
      actions={<Chip size="sm" tone={url || repo ? 'green' : 'amber'} icon={url || repo ? 'check' : 'info'}>{url || repo ? 'Video set' : 'No video yet'}</Chip>}>
      <div className="promo-admin">
        <div className="stack" style={{ gap: 0 }}>
          <Setting title="Promo screen" desc="Turn the whole feature on or off.">
            <Toggle on={f.promo !== false} onChange={(v) => set({ features: { ...f, promo: v } }, `Promo screen ${v ? 'on' : 'off'}`)} label="Promo screen" />
          </Setting>
          <Setting title="Open automatically" desc="As soon as a ticket starts running (logged or scanned). Esc minimises; the video button on a running ticket (Now serving) brings it back.">
            <Toggle on={m.promoAutoOpen !== false} onChange={(v) => set({ promoAutoOpen: v })} label="Open automatically" />
          </Setting>
          <Setting title="Sound" desc="Start unmuted. Browsers may still block sound until someone clicks the page once.">
            <Toggle on={!!m.promoSound} onChange={(v) => set({ promoSound: v })} label="Sound" />
          </Setting>
          <Setting title="Scrolling services line" desc="A ticker across the top listing what GTS does.">
            <Toggle on={m.promoTicker !== false} onChange={(v) => set({ promoTicker: v })} label="Ticker" />
          </Setting>
          <div className="setting" style={{ display: 'block' }}>
            <div className="setting-title">Video</div>
            <div className="setting-desc" style={{ marginBottom: 8 }}>Now playing: <b>{source}</b></div>
            <div className={cx('promo-drop', busy && 'is-busy', !storage?.enabled && 'is-off')} onClick={() => !busy && fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]); }}>
              <Icon name="upload" size={20} />
              <span>{busy ? `Uploading… ${progress}%` : storage === null ? 'Checking storage…' : storage.enabled ? <><b>Upload the promo video</b> — drop it here or click (MP4 / WebM / MOV)</> : <><b>File storage isn’t attached to this deployment</b> — connect a Blob store to gts-hub in Vercel, then redeploy. Or paste a link below.</>}</span>
              {busy && <i className="promo-drop-bar" style={{ width: `${progress}%` }} />}
            </div>
            <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="row" style={{ gap: 6, marginTop: 8 }}>
              <Input className="mono" placeholder="…or paste a link: unlisted YouTube, Vimeo or a direct .mp4" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveLink(); }} />
              <Btn size="sm" variant="primary" onClick={saveLink} disabled={link.trim() === url}>Save</Btn>
              {url && <Btn size="sm" variant="ghost" icon="x" onClick={() => { set({ promoVideoUrl: '', promoVideoName: '' }, 'Promo video removed'); setLink(''); }} title="Remove — falls back to the repo file or the built-in promo" aria-label="Remove video" />}
            </div>
            <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>Also works: add the file to the repo as <code>public/promo/gts-promo.mp4</code> — it plays whenever no upload or link is set.</div>
            {storage && <div className="faint mono" style={{ fontSize: 10.5, marginTop: 6 }}>Storage: {storage.enabled ? `connected (${storage.mode === 'oidc' ? 'Vercel sign-in' : 'token'})` : 'not detected'} · Vercel vars: {(storage.vars || []).join(', ') || 'none'}</div>}
            <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>Each station keeps its own copy of the video after the first play, so it only downloads once.</div>
          </div>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <div className="promo-preview">{preview ? <PromoMedia muted /> : <button type="button" className="promo-preview-btn" onClick={() => setPreview(true)}><Icon name="play" size={28} /><span>Preview</span></button>}</div>
          <Field label="Promo lines" hint="One per line · “Headline | smaller line”. Used for the ticker, and for the built-in promo when there’s no video.">
            <Textarea rows={6} value={slides} onChange={(e) => setSlides(e.target.value)} onBlur={() => { const list = slides.split('\n').map((x) => x.trim()).filter(Boolean); set({ promoSlides: list.length ? list : null }); }} />
          </Field>
        </div>
      </div>
    </Panel>
  );
}

// ─── Store & hours ─────────────────────────────────────────────────────────
function HoursPanel() {
  const { m, set } = useMgmt();
  const hours = Array.isArray(m.hours) && m.hours.length === 7 ? m.hours : DEFAULT_HOURS;
  const setDay = (i, v) => set({ hours: hours.map((h, k) => (k === i ? v : h)) }, `${WEEKDAYS[i]} hours changed`);
  return (
    <Panel id="sys-hours" title="Store & hours" icon="clock" sub="Drives “on pace”, customers per open hour and the hourly charts.">
      <Setting title="Store code" desc="Printed on reports and sent with every webhook — ready for more than one store.">
        <Input className="mono" value={m.storeCode || ''} onChange={(e) => set({ storeCode: e.target.value.toUpperCase().slice(0, 16) })} style={{ width: 130 }} />
      </Setting>
      <Setting title="Time zone" desc="Counters run on the device clock; this labels exports.">
        <Select value={m.timezone || 'America/New_York'} onChange={(e) => set({ timezone: e.target.value })} style={{ width: 200 }}>
          {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Asia/Jerusalem'].map((z) => <option key={z} value={z}>{z}</option>)}
        </Select>
      </Setting>
      <div className="hours-grid">
        {hours.map((h, i) => (
          <div key={i} className={cx('hours-row', !h && 'is-closed')}>
            <span className="hours-day">{WEEKDAYS[i]}</span>
            <Toggle on={!!h} onChange={(on) => setDay(i, on ? (DEFAULT_HOURS[i] || { open: '10:00', close: '18:00' }) : null)} label={`${WEEKDAYS[i]} open`} />
            {h ? <>
              <Input type="time" value={h.open} onChange={(e) => setDay(i, { ...h, open: e.target.value })} className="mono" />
              <span className="faint">→</span>
              <Input type="time" value={h.close} onChange={(e) => setDay(i, { ...h, close: e.target.value })} className="mono" />
            </> : <span className="faint" style={{ gridColumn: 'span 3', fontSize: 12.5 }}>Closed</span>}
          </div>
        ))}
      </div>
      <div className="faint" style={{ fontSize: 11.5, marginTop: 8 }}>Defaults are the NYC SuperStore’s usual hours — check them against the posted holiday / seasonal hours.</div>
    </Panel>
  );
}

// ─── Service clock ─────────────────────────────────────────────────────────
function ServicePanel() {
  const { m, set } = useMgmt();
  const per = m.serviceTargets || {};
  return (
    <Panel id="sys-service" title="Service clock" icon="timer" sub="How long a ticket takes — from the first keystroke (or Start) to Done, pauses excluded.">
      <Setting title="New tickets" desc="Keep running: the clock runs until a tech hits Done. Done: logged as finished on save.">
        <Segmented value={m.serviceClock || 'start'} onChange={(v) => set({ serviceClock: v }, `Service clock default → ${v}`)} options={[{ id: 'start', label: 'Keep running', icon: 'play' }, { id: 'done', label: 'Log as done', icon: 'check' }]} />
      </Setting>
      <Setting title="Target per ticket" desc="Live clocks turn amber past it; Stats shows the % within target.">
        <div className="row" style={{ gap: 6 }}><Input type="number" min={1} max={240} className="mono" value={m.serviceTargetMin ?? 15} onChange={(e) => set({ serviceTargetMin: Math.max(1, Math.min(240, Number(e.target.value) || 15)) })} style={{ width: 80 }} /><span className="muted">min</span></div>
      </Setting>
      <Setting title="Forgotten clock alert" desc="A clock still running after this many hours shows on Home → Needs attention.">
        <Select value={m.staleServiceHours ?? 3} onChange={(e) => set({ staleServiceHours: Number(e.target.value) })} style={{ width: 110 }}>{[1, 2, 3, 4, 6, 8, 12].map((n) => <option key={n} value={n}>{n} h</option>)}</Select>
      </Setting>
      <div className="setting-title" style={{ marginTop: 10 }}>Per-type targets <span className="faint" style={{ fontWeight: 400 }}>· blank = {m.serviceTargetMin ?? 15} min</span></div>
      <div className="target-grid">
        {SERVICE_TYPES.map((s) => (
          <label key={s.id} className="target-cell" style={{ '--c': s.color }}>
            <span className="truncate"><Icon name={s.icon} size={12} /> {s.label}</span>
            <input className="input mono" type="number" min={1} max={480} placeholder={String(m.serviceTargetMin ?? 15)} value={per[s.id] ?? ''} onChange={(e) => { const v = e.target.value; const next = { ...per }; if (v) next[s.id] = Math.max(1, Number(v)); else delete next[s.id]; set({ serviceTargets: next }); }} />
          </label>
        ))}
      </div>
    </Panel>
  );
}

// ─── Ticket rules ──────────────────────────────────────────────────────────
function RulesPanel() {
  const { m, set } = useMgmt();
  const [test, setTest] = useState('1095847721');
  let patternOk = true; try { new RegExp(m.orderPattern || ''); } catch { patternOk = false; }
  return (
    <Panel id="sys-rules" title="Ticket rules" icon="clipboard" sub="What a valid Quick Log ticket looks like at this counter.">
      <Setting title="Description required" desc="Every ticket must say what was done (e.g. “Firmware update”) — it won’t save or finish without it."><Toggle on={m.requireDescription !== false} onChange={(v) => set({ requireDescription: v }, `Description ${v ? 'required' : 'optional'}`)} label="Description required" /></Setting>
      <Setting title="Service type required"><Toggle on={!!m.requireServiceType} onChange={(v) => set({ requireServiceType: v }, `Service type ${v ? 'required' : 'optional'}`)} label="Service type required" /></Setting>
      <Setting title="Order number required" desc="Off by default — walk-ups without an order still get logged."><Toggle on={!!m.requireOrderNumber} onChange={(v) => set({ requireOrderNumber: v }, `Order # ${v ? 'required' : 'optional'}`)} label="Order number required" /></Setting>
      <Setting title="Order number check" desc="Warn shows a hint, Block refuses to save a number that doesn’t match.">
        <Segmented value={m.orderCheck || 'warn'} onChange={(v) => set({ orderCheck: v }, `Order check → ${v}`)} options={[{ id: 'off', label: 'Off' }, { id: 'warn', label: 'Warn' }, { id: 'block', label: 'Block' }]} />
      </Setting>
      <Setting title="Order number pattern" desc="Regular expression. Default: 6–12 digits." wide>
        <div className="row wrap" style={{ gap: 6 }}>
          <Input className={cx('mono', !patternOk && 'is-invalid')} value={m.orderPattern || ''} onChange={(e) => set({ orderPattern: e.target.value })} style={{ width: 170 }} />
          <Input className="mono" value={test} onChange={(e) => setTest(e.target.value)} style={{ width: 140 }} aria-label="Test value" />
          <Chip size="sm" tone={!patternOk ? 'red' : checkOrder(test, { ...m, orderCheck: 'warn' }) === 'ok' ? 'green' : 'amber'}>{!patternOk ? 'bad pattern' : checkOrder(test, { ...m, orderCheck: 'warn' }) === 'ok' ? 'matches' : 'no match'}</Chip>
          <Btn size="xs" variant="ghost" onClick={() => set({ orderPattern: DEFAULT_MANAGEMENT.orderPattern })}>Reset</Btn>
        </div>
      </Setting>
      <Setting title="Duplicate warning" desc="Warn when the same order # was logged within…">
        <Select value={m.duplicateWindowHours ?? 24} onChange={(e) => set({ duplicateWindowHours: Number(e.target.value) })} style={{ width: 120 }}>{[1, 4, 8, 24, 48, 168].map((n) => <option key={n} value={n}>{n < 24 ? `${n} h` : n === 168 ? '1 week' : `${n / 24} day${n > 24 ? 's' : ''}`}</option>)}</Select>
      </Setting>
      <Setting title="Service list" desc="Descriptions come from the verified Salesforce service list — search it while logging. Team-added services and the Other re-sort live in Services below.">
        <Btn size="sm" variant="ghost" icon="arrow-right" onClick={() => document.getElementById('sys-services')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Services</Btn>
      </Setting>
    </Panel>
  );
}

// ─── Features ──────────────────────────────────────────────────────────────
function FeaturesPanel() {
  const { m, set } = useMgmt();
  const { state, api } = useStore();
  const f = m.features || {};
  const flag = (k, label) => <Toggle on={f[k] !== false} onChange={(v) => set({ features: { ...f, [k]: v } }, `${label} ${v ? 'on' : 'off'}`)} label={label} />;
  return (
    <Panel id="sys-features" title="Features" icon="sparkles" sub="Turn parts of the app on or off for every device.">
      <Setting title="3D Quick Log stage" desc="The live scene customers watch while we type.">{flag('scene3d', '3D stage')}</Setting>
      <Setting title="Stage intensity" desc="Calm halves the particles — for older counter PCs.">
        <Segmented value={m.sceneIntensity || 'full'} onChange={(v) => set({ sceneIntensity: v })} options={[{ id: 'full', label: 'Full' }, { id: 'calm', label: 'Calm' }]} />
      </Setting>
      <Setting title="This device" desc="Override on this browser only (saved locally).">
        <Segmented value={state.settings.effects || 'auto'} onChange={(v) => api.setSettings({ effects: v })} options={[{ id: 'auto', label: 'Auto' }, { id: 'full', label: 'Full' }, { id: 'calm', label: 'Calm' }, { id: 'off', label: 'Off' }]} />
      </Setting>
      <Setting title="Customer display button" desc="Full-screen stage for a second, customer-facing monitor.">{flag('customerDisplay', 'Customer display')}</Setting>
      <Setting title="Ops tab" desc="Salesforce reconciliation, review queue, turnaround and end-of-day reports. Review-first — it never writes to Salesforce.">{flag('ops', 'Ops')}</Setting>
      <Setting title="Walk-in queue" desc="Queue on Quick Log; wait times in Stats.">{flag('queue', 'Walk-in queue')}</Setting>
      <Setting title="Barcode scanning" desc="Scan button (camera) and scanner-gun detection anywhere in the app.">{flag('scanner', 'Barcode scanning')}</Setting>
      <Setting title="Warranty helper" desc="Warranty tab, brand picker on warranty tickets.">{flag('warranty', 'Warranty helper')}</Setting>
      <Setting title="Celebrate the daily goal" desc="Confetti-style burst when the counter hits the goal.">{flag('celebrate', 'Celebrate goal')}</Setting>
    </Panel>
  );
}

// ─── Security & permissions ────────────────────────────────────────────────
function SecurityPanel() {
  const { m, set } = useMgmt();
  const p = m.perms || {};
  const perm = (k, label) => <Toggle on={p[k] !== false} onChange={(v) => set({ perms: { ...p, [k]: v } }, `Techs ${v ? 'can' : 'cannot'} ${label}`)} label={label} />;
  return (
    <Panel id="sys-security" title="Security & permissions" icon="lock" sub={m.pinHash ? 'Manager PIN is set — these apply to techs; unlocked managers can do everything.' : 'Set a manager PIN (Overview tab) first, otherwise everyone counts as a manager.'}
      actions={m.pinHash ? <Chip size="sm" tone="green" icon="check">PIN set</Chip> : <Chip size="sm" tone="amber" icon="alert-circle">No PIN</Chip>}>
      <Setting title="Auto-lock Management" desc="Re-locks this tab after inactivity on any device.">
        <Select value={m.autoLockMinutes ?? 15} onChange={(e) => set({ autoLockMinutes: Number(e.target.value) }, 'Auto-lock changed')} style={{ width: 130 }}>{[0, 5, 10, 15, 30, 60].map((n) => <option key={n} value={n}>{n ? `${n} min` : 'Never'}</option>)}</Select>
      </Setting>
      <Setting title="Techs can delete tickets">{perm('techDelete', 'delete tickets')}</Setting>
      <Setting title="Techs can edit service times" desc="Start / end / pause and created-at on a ticket.">{perm('techEditTimes', 'edit service times')}</Setting>
      <Setting title="Techs can export CSV">{perm('techExport', 'export')}</Setting>
      <Setting title="Techs can reset the board" desc="Settings → Data → Reset. Off is safer.">{perm('techReset', 'reset the board')}</Setting>
    </Panel>
  );
}

// ─── Privacy & retention ───────────────────────────────────────────────────
function PrivacyPanel() {
  const { m, set, api, toast } = useMgmt();
  const { confirm } = useStore();
  return (
    <Panel id="sys-privacy" title="Privacy & retention" icon="shield" sub="Customer names and phone numbers shouldn’t live forever.">
      <Setting title="Mask names on the stage" desc="Customer-facing display shows “Devon C.”, never the full name.">
        <Toggle on={m.maskNamesOnDisplay !== false} onChange={(v) => set({ maskNamesOnDisplay: v }, `Name masking ${v ? 'on' : 'off'}`)} label="Mask names" />
      </Setting>
      <Setting title="Anonymise after" desc="Names, phones, emails and serials are replaced with “Purged” — counts and times stay for Stats.">
        <Select value={m.purgeAfterDays ?? 0} onChange={(e) => set({ purgeAfterDays: Number(e.target.value) }, 'Retention changed')} style={{ width: 130 }}>{[0, 30, 60, 90, 180, 365].map((n) => <option key={n} value={n}>{n ? `${n} days` : 'Keep'}</option>)}</Select>
      </Setting>
      <Setting title="Run it now" desc="Applies the rule above immediately (closed jobs only for drop-offs).">
        <Btn size="sm" variant="danger" icon="shield" disabled={!m.purgeAfterDays} onClick={() => confirm({ title: `Anonymise records older than ${m.purgeAfterDays} days?`, danger: true, confirmLabel: 'Anonymise', message: 'This can’t be undone (except from a backup). Stats keep working.', onConfirm: () => { const n = api.purgePII(m.purgeAfterDays); toast(n ? `${n} records anonymised` : 'Nothing old enough to purge', { tone: n ? 'success' : 'info' }); } })}>Purge now</Btn>
      </Setting>
      <div className="faint" style={{ fontSize: 11.5, marginTop: 8 }}>Passcodes are never stored here; device access codes stay on the paper intake tag. With team sync on, data sits in the Supabase project (RLS on, server-side key only).</div>
    </Panel>
  );
}

// ─── Warranty directory ────────────────────────────────────────────────────
function WarrantyDirectoryPanel() {
  const { m, set, toast, state } = useMgmt();
  const { warrantyBrands } = useStore();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState(null);
  const custom = m.warrantyBrands || [];
  const hidden = custom.filter((c) => c.hidden).map((c) => WARRANTY_BRANDS.find((b) => b.id === c.id) || c);
  const list = warrantyBrands.filter((b) => matches(q, b.name, b.id, b.url));
  const save = (rec) => {
    const clean = { ...rec, id: rec.id || rec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') };
    if (!clean.name?.trim() || !/^https:\/\//.test(clean.url || '')) { toast('Name and an https:// link are required', { tone: 'warning' }); return; }
    set({ warrantyBrands: [...custom.filter((c) => c.id !== clean.id), clean] }, `Warranty link: ${clean.name}`);
    setEdit(null); toast(`${clean.name} saved for every device`, { tone: 'success' });
  };
  const resetBrand = (id) => set({ warrantyBrands: custom.filter((c) => c.id !== id) }, 'Warranty link reset');
  const hide = (b) => set({ warrantyBrands: [...custom.filter((c) => c.id !== b.id), ...(b.builtin ? [{ id: b.id, hidden: true }] : [])] }, `Warranty brand removed: ${b.name}`);
  const checkAll = async () => {
    setChecking(true); setResults(null);
    const urls = [...new Set(warrantyBrands.flatMap((b) => [b.url, b.repair]).filter(Boolean))];
    try {
      const res = await fetch('/api/linkcheck', { method: 'POST', headers: headers(state.settings.syncPasscode), body: JSON.stringify({ urls }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResults(Object.fromEntries(data.results.map((r) => [r.url, r])));
      const bad = data.results.filter((r) => !r.ok && !r.blocked).length;
      toast(bad ? `${bad} link${bad === 1 ? '' : 's'} need attention` : `All ${data.results.length} links answered`, { tone: bad ? 'warning' : 'success' });
    } catch (e) { toast(`Link check failed: ${e.message}`, { tone: 'error' }); }
    setChecking(false);
  };
  const badge = (url) => {
    const r = results?.[url]; if (!r) return null;
    return <span className={cx('linkstat', r.ok ? 'is-ok' : r.blocked ? 'is-warn' : 'is-bad')} title={r.error || (r.final ? `→ ${r.final}` : '')}>{r.ok ? r.status : r.blocked ? '403 bot-blocked' : r.status || 'fail'}</span>;
  };
  return (
    <Panel id="sys-warranty" title="Warranty directory" icon="shield-check" sub={`${warrantyBrands.length} brands · ${custom.filter((c) => !c.hidden).length} team edits · links open on the customer’s phone via QR`}
      actions={<><Btn size="sm" icon="refresh" onClick={checkAll} loading={checking} title="Fetch every link from the server and report its HTTP status">Check all links</Btn><Btn size="sm" variant="primary" icon="plus" onClick={() => setEdit({ name: '', url: 'https://', cats: ['camera'], color: '#22d3ee' })}>Add brand</Btn></>}>
      {edit && <BrandEditor value={edit} onCancel={() => setEdit(null)} onSave={save} />}
      <div className="input-wrap mb-3" style={{ maxWidth: 360 }}><Icon name="search" /><Input placeholder="Filter brands…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="wdir">
        {list.map((b) => (
          <div key={b.id} className="wdir-row">
            <BrandSwatch brand={b} size={28} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 6 }}><b>{b.name}</b>{b.edited && <Chip size="sm" tone="accent">edited</Chip>}{!b.builtin && <Chip size="sm" tone="violet">team</Chip>}</div>
              <div className="wdir-url mono truncate"><a href={b.url} target="_blank" rel="noopener noreferrer">{b.url}</a> {badge(b.url)}</div>
              {b.repair && <div className="wdir-url mono truncate faint">repair: <a href={b.repair} target="_blank" rel="noopener noreferrer">{b.repair}</a> {badge(b.repair)}</div>}
            </div>
            <Btn size="xs" variant="ghost" icon="edit" onClick={() => setEdit(b)} aria-label={`Edit ${b.name}`} />
            {b.edited && <Btn size="xs" variant="ghost" icon="undo" onClick={() => resetBrand(b.id)} title="Back to the built-in link" aria-label="Reset" />}
            <Btn size="xs" variant="ghost" icon="trash" onClick={() => hide(b)} title="Remove from the directory" aria-label={`Remove ${b.name}`} />
          </div>
        ))}
      </div>
      {hidden.length > 0 && <div className="faint mt-2" style={{ fontSize: 12 }}>Removed: {hidden.map((b) => <button key={b.id} className="linkish" onClick={() => resetBrand(b.id)} style={{ marginRight: 8 }}>{b.name}</button>)} — tap to restore.</div>}
      <div className="faint mt-2" style={{ fontSize: 11.5 }}>Built-in links were compiled from each manufacturer’s own US site. “Check all links” fetches them from the server (some brands block bots with 403 — those still open fine in a browser).</div>
    </Panel>
  );
}

function BrandEditor({ value, onCancel, onSave }) {
  const [b, setB] = useState(() => ({ ...value }));
  const upd = (k, v) => setB((x) => ({ ...x, [k]: v }));
  return (
    <div className="brand-editor fade-up">
      <div className="form-grid">
        <Field label="Brand name" required><Input value={b.name} onChange={(e) => upd('name', e.target.value)} disabled={!!value.builtin} /></Field>
        <Field label="Colour"><div className="row" style={{ gap: 6 }}><input type="color" value={b.color || '#22d3ee'} onChange={(e) => upd('color', e.target.value)} className="colorpick" /><Input className="mono" value={b.color || ''} onChange={(e) => upd('color', e.target.value)} /></div></Field>
        <Field label="Warranty page" required className="span-2"><Input className="mono" value={b.url || ''} onChange={(e) => upd('url', e.target.value)} placeholder="https://" /></Field>
        <Field label="Repair / service request page" optional className="span-2"><Input className="mono" value={b.repair || ''} onChange={(e) => upd('repair', e.target.value)} placeholder="https://" /></Field>
        <Field label="Support phone" optional><Input value={b.phone || ''} onChange={(e) => upd('phone', e.target.value)} /></Field>
        <Field label="Customer needs" optional><Input value={b.needs || ''} onChange={(e) => upd('needs', e.target.value)} placeholder="Serial number + receipt" /></Field>
        <Field label="Note for techs" optional className="span-2"><Textarea rows={2} value={b.note || ''} onChange={(e) => upd('note', e.target.value)} /></Field>
        <Field label="Categories" optional className="span-2">
          <div className="row wrap" style={{ gap: 5 }}>{WARRANTY_CATEGORIES.map((c) => { const on = (b.cats || []).includes(c.id); return <Chip key={c.id} size="sm" tone={on ? 'accent' : undefined} onClick={() => upd('cats', on ? b.cats.filter((x) => x !== c.id) : [...(b.cats || []), c.id])}>{c.label}</Chip>; })}</div>
        </Field>
      </div>
      <div className="row mt-3" style={{ justifyContent: 'flex-end' }}><Btn variant="ghost" onClick={onCancel}>Cancel</Btn><Btn variant="primary" icon="check" onClick={() => onSave(b)}>Save for everyone</Btn></div>
    </div>
  );
}

// ─── Integrations ──────────────────────────────────────────────────────────
function IntegrationsPanel() {
  const { m, set, toast, state } = useMgmt();
  const [url, setUrl] = useState(m.webhookUrl || '');
  const [testing, setTesting] = useState(false);
  const [last, setLast] = useState(null);
  useEffect(() => { setUrl(m.webhookUrl || ''); }, [m.webhookUrl]);
  const events = m.webhookEvents || [];
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const valid = !url || /^https:\/\/[^\s]+\.[^\s]+/.test(url);
  const test = async () => {
    setTesting(true);
    const sample = state.tickets.find((t) => !t.deletedAt) || { id: 'test', tag: 'SF-TEST', serviceType: 'camera', createdAt: new Date().toISOString(), tech: state.settings.currentTech };
    const r = await sendWebhook(url, 'test', { ...webhookPayload('ticket.create', sample, state), event: 'test' }, state.settings.syncPasscode).catch((e) => ({ ok: false, error: String(e?.message || e) }));
    setTesting(false); setLast(r);
    toast(r.ok ? `Endpoint answered ${r.status}` : `Webhook failed: ${r.error || r.status}`, { tone: r.ok ? 'success' : 'error' });
  };
  return (
    <Panel id="sys-integrations" title="Integrations" icon="layers" sub="Push GTS events to Teams / Slack / Power Automate / an internal service. Monitor the app from IT tools.">
      <Field label="Webhook URL (HTTPS)" hint={valid ? 'Relayed server-side by /api/webhook — the counter PCs never call it directly.' : 'Must start with https://'} error={valid ? undefined : 'Must be an https:// URL'}>
        <div className="row" style={{ gap: 6 }}>
          <Input className="mono" placeholder="https://prod-00.westus.logic.azure.com/workflows/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Btn size="sm" variant="primary" disabled={!valid || url === (m.webhookUrl || '')} onClick={() => set({ webhookUrl: url.trim() }, url ? 'Webhook set' : 'Webhook removed')}>Save</Btn>
        </div>
      </Field>
      <div className="row wrap mt-2" style={{ gap: 6 }}>
        {WEBHOOK_EVENTS.map((e) => { const on = events.includes(e.id); return <Chip key={e.id} size="sm" tone={on ? 'accent' : undefined} icon={on ? 'check' : 'plus'} onClick={() => set({ webhookEvents: on ? events.filter((x) => x !== e.id) : [...events, e.id] })}>{e.label}</Chip>; })}
      </div>
      <div className="row wrap mt-3" style={{ gap: 8 }}>
        <Btn size="sm" icon="send" onClick={test} loading={testing} disabled={!m.webhookUrl}>Send test event</Btn>
        {last && <span style={{ fontSize: 12.5, color: last.ok ? 'var(--green)' : 'var(--red-2)' }}>{last.ok ? `OK · HTTP ${last.status}` : last.error || `HTTP ${last.status}`}</span>}
      </div>
      <div className="form-section mt-4">Endpoints for IT</div>
      <div className="endpoint-list">
        {[['GET', '/api/health', 'Uptime probe · version · integrations (no auth, no data)'], ['GET/POST', '/api/sync', 'Team board (passcode header x-gts-key)'], ['POST', '/api/salesforce', 'Salesforce Case connector'], ['POST', '/api/webhook', 'Event relay'], ['POST', '/api/linkcheck', 'Warranty link checker']].map(([method, path, desc]) => (
          <div key={path} className="endpoint">
            <span className="endpoint-m mono">{method}</span>
            <span className="grow" style={{ minWidth: 0 }}><span className="mono">{path}</span><span className="faint" style={{ display: 'block', fontSize: 11.5 }}>{desc}</span></span>
            <Btn size="xs" variant="ghost" icon="copy" onClick={async () => { await copyText(origin + path); toast('URL copied', { tone: 'success' }); }} aria-label="Copy URL" />
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ─── Diagnostics ───────────────────────────────────────────────────────────
function DiagnosticsPanel() {
  const { state, sync, connections, toast } = useStore();
  const [health, setHealth] = useState(null);
  const [webgl, setWebgl] = useState(null);
  useEffect(() => {
    fetch('/api/health', { cache: 'no-store' }).then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
    try { const c = document.createElement('canvas'); setWebgl(!!(c.getContext('webgl2') || c.getContext('webgl'))); } catch { setWebgl(false); }
  }, []);
  const bytes = useMemo(() => { try { return (localStorage.getItem('gts-hub:state') || '').length; } catch { return 0; } }, [state]);
  const n = (k) => (state[k] || []).filter((x) => !x.deletedAt).length;
  const info = {
    app: `GTS Hub ${APP_VERSION}`, deployment: health ? `${health.ok ? 'healthy' : 'unreachable'}${health.commit ? ` · ${health.commit}` : ''}${health.region ? ` · ${health.region}` : ''}` : 'checking…',
    sync: `${sync.status}${sync.live ? ' · live' : ''}${sync.rev ? ` · rev ${sync.rev}` : ''}`, salesforce: connections.salesforce.configured ? `connected · ${connections.salesforce.host}` : 'not configured',
    device: state.meta?.deviceId, tech: techName(state.settings.currentTech), storage: `${(bytes / 1024).toFixed(0)} KB in this browser`,
    records: `${n('tickets')} tickets · ${n('assignments')} jobs · ${n('queue')} queue · ${n('inventory')} items · ${state.activity.length} events`,
    browser: typeof navigator !== 'undefined' ? navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 120) : '', webgl: webgl == null ? '…' : webgl ? 'available (3D stage OK)' : 'NOT available — stage falls back to 2D',
    screen: typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x` : '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  return (
    <Panel id="sys-diagnostics" title="Diagnostics" icon="server" sub="Paste this into an IT ticket — no customer data included."
      actions={<Btn size="sm" icon="copy" onClick={async () => { await copyText(JSON.stringify({ ...info, health, at: new Date().toISOString() }, null, 2)); toast('Diagnostics copied', { tone: 'success' }); }}>Copy</Btn>}>
      <dl className="dl diag">
        {Object.entries(info).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd className={k === 'device' || k === 'app' ? 'mono' : ''}>{v}</dd></React.Fragment>)}
      </dl>
    </Panel>
  );
}

// ─── Configuration (export / import / handoff / audit) ─────────────────────
function ConfigPanel() {
  const { m, set, toast, state, api } = useMgmt();
  const { confirm, can } = useStore();
  const fileRef = useRef(null);
  const exportConfig = () => {
    const { pinHash, updatedAt, ...cfg } = m;
    downloadText(`gts-config-${m.storeCode || 'store'}-${dayKey()}.json`, JSON.stringify({ app: 'gts-hub', kind: 'config', version: APP_VERSION, exportedAt: new Date().toISOString(), management: cfg, team: (state.team || []).filter((t) => !t.deletedAt).map(({ id, name, role, color, order }) => ({ id, name, role, color, order })) }, null, 2), 'application/json');
    toast('Configuration exported (no PIN, no customer data)', { tone: 'success' });
  };
  const importConfig = (file) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(String(r.result));
        if (data.app !== 'gts-hub' || data.kind !== 'config' || !data.management) throw new Error('Not a GTS Hub config file');
        const { pinHash, ...cfg } = data.management;
        set(cfg, `Config imported from ${file.name}`);
        toast('Configuration applied to every device', { tone: 'success' });
      } catch (e) { toast(`Import failed: ${e.message}`, { tone: 'error' }); }
    };
    r.readAsText(file);
  };
  const handoff = async () => {
    const health = await fetch('/api/health', { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
    downloadText(`GTS-Hub-technical-handoff-${dayKey()}.md`, handoffMarkdown(state, { health }), 'text/markdown');
    toast('Technical handoff downloaded', { tone: 'success' });
  };
  const audit = () => {
    downloadText(`gts-audit-log-${dayKey()}.csv`, toCSV(state.activity, [{ label: 'When', value: 'ts' }, { label: 'Who', value: (a) => techName(a.tech) }, { label: 'Action', value: 'action' }, { label: 'Record', value: 'label' }, { label: 'Detail', value: 'detail' }]), 'text/csv');
    toast(`${state.activity.length} audit events exported`, { tone: 'success' });
  };
  return (
    <Panel id="sys-config" title="Configuration" icon="code" sub="Move a setup between stores, hand the app to the software department, keep an audit trail.">
      <div className="config-grid">
        <button type="button" className="config-card" onClick={exportConfig}><Icon name="download" size={18} /><b>Export configuration</b><span>Hours, targets, rules, features, warranty links, team — JSON, no PIN, no customers.</span></button>
        <button type="button" className="config-card" onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} /><b>Import configuration</b><span>Apply a config file from another store or a backup. Syncs to every device.</span></button>
        <button type="button" className="config-card is-accent" onClick={handoff}><Icon name="file" size={18} /><b>Technical handoff</b><span>Markdown for the software team: architecture, API, env vars, current settings, next steps.</span></button>
        <button type="button" className="config-card" onClick={audit} disabled={!can('techExport')}><Icon name="history" size={18} /><b>Audit log (CSV)</b><span>Every action with who and when — last {state.activity.length} events.</span></button>
        <button type="button" className="config-card is-danger" onClick={() => confirm({ title: 'Reset system settings to defaults?', danger: true, confirmLabel: 'Reset', message: 'Hours, targets, rules, features, permissions and integrations go back to the defaults. Goal, PIN, team and warranty edits stay.', onConfirm: () => { const keep = { goalPerDay: m.goalPerDay, goalLabel: m.goalLabel, goalEmphasis: m.goalEmphasis, pinHash: m.pinHash, warrantyBrands: m.warrantyBrands }; set({ ...DEFAULT_MANAGEMENT, ...keep }, 'System settings reset'); toast('System settings reset', { tone: 'warning' }); } })}><Icon name="refresh" size={18} /><b>Reset to defaults</b><span>Undo every System change in one go.</span></button>
      </div>
      <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importConfig(f); e.target.value = ''; }} />
      <div className="faint mt-3" style={{ fontSize: 11.5 }}>Last change {m.updatedAt ? fmtDateTime(m.updatedAt) : '—'} · full record backups live in Home → Settings → Data.</div>
    </Panel>
  );
}
