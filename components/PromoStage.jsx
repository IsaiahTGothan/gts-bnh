'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — PROMO STAGE (V4.2)
//  While a customer's ticket is in service, the counter screen turns into an
//  ad: the GTS promo video plays almost full screen (sized for the 24" iMac),
//  and a slim dock along the bottom keeps the ticket editable — order #,
//  name, type, what we're doing — with the live clock, Pause and Done.
//
//  Video source (Management → System → Promo screen), first one that works:
//    1. a video uploaded from the app or a pasted link (MP4 / WebM / MOV,
//       YouTube, Vimeo)
//    2. /promo/gts-promo.mp4 committed to the repo (public/promo/)
//    3. the built-in animated GTS promo (no file needed)
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_PROMO_SLIDES, PICK_TYPES, SERVICE_BY_ID } from '../lib/constants';
import { sameFamily, topServices } from '../lib/sf-services';
import ServiceInput, { useServiceCatalog } from './ServiceInput';
import { fmtClock, fmtDur, serviceMs, serviceState, serviceTarget } from '../lib/service';
import { cx } from '../lib/utils';
import { useStore } from './GTSApp';
import { GTSMark, Icon, Input, useOverlayRoot } from './ui';
import { MatrixRain } from './matrix';

export const REPO_VIDEO = '/promo/gts-promo.mp4';
export const DESC_MIN = 3;

/** YouTube / Vimeo link → embeddable autoplaying, muted, looping URL. Otherwise null. */
export function embedFor(url, muted = true) {
  const s = String(url || '').trim();
  let m = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
  if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${m[1]}&controls=0&modestbranding=1&rel=0&playsinline=1`;
  m = s.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return `https://player.vimeo.com/video/${m[1]}?autoplay=1&muted=${muted ? 1 : 0}&loop=1&background=1`;
  return null;
}

/** Is the repo copy (public/promo/gts-promo.mp4) deployed? Checked once per page load. */
let repoVideoProbe = null;
export function useRepoVideo() {
  const [ok, setOk] = useState(null);
  useEffect(() => {
    repoVideoProbe = repoVideoProbe || fetch(REPO_VIDEO, { method: 'HEAD', cache: 'no-store' }).then((r) => r.ok && /video|octet/.test(r.headers.get('content-type') || '')).catch(() => false);
    repoVideoProbe.then(setOk);
  }, []);
  return ok;
}

export default function PromoStage({ ticketId, onClose, onSwitch }) {
  const { state, api, toast, sfx } = useStore();
  const m = state.management || {};
  const t = state.tickets.find((x) => x.id === ticketId);
  const running = state.tickets.filter((x) => !x.deletedAt && (serviceState(x) === 'running' || serviceState(x) === 'paused'));
  const [muted, setMuted] = useState(!m.promoSound);
  const [thanks, setThanks] = useState(null);
  const rootRef = useRef(null);
  // in the stage's customer-display full screen, only that element is painted — open inside it
  const overlay = useOverlayRoot();

  // Esc minimises (the ticket keeps running); lock page scroll while open
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    document.body.classList.add('promo-open'); // the 3D stage and digital rain behind it pause (GPU goes to the video)
    return () => { window.removeEventListener('keydown', k, true); document.body.style.overflow = prev; document.body.classList.remove('promo-open'); };
  }, [onClose]);

  // ticket finished / deleted elsewhere → close (after the thank-you, if we showed one)
  useEffect(() => { if (!thanks && (!t || t.deletedAt || serviceState(t) === 'done')) onClose(); }, [t, thanks, onClose]);
  if (!t && !thanks) return null;

  const done = (ms) => {
    setThanks({ name: (t.customerName || '').split(' ')[0], ms });
    sfx('success');
    setTimeout(() => { setThanks(null); onClose(); }, 2600);
  };
  const fullscreen = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else rootRef.current?.requestFullscreen?.().catch(() => {}); };

  if (!overlay) return null;
  return createPortal(
    <div className="promo" ref={rootRef} role="dialog" aria-label="Promo screen — ticket in service">
      <PromoMedia muted={muted} />
      {m.promoTicker !== false && <Ticker slides={m.promoSlides} />}
      <div className="promo-top">
        <span className="promo-brand"><GTSMark size={34} animated={false} /><span><b>Guest Technical Services</b><small>{state.settings.storeLabel || 'B&H'} · ask us about it</small></span></span>
        <div className="promo-top-actions">
          <button type="button" className="promo-icon" onClick={() => setMuted((v) => !v)} title={muted ? 'Sound on' : 'Mute'} aria-label={muted ? 'Sound on' : 'Mute'}><Icon name={muted ? 'volume-x' : 'volume'} size={18} /></button>
          <button type="button" className="promo-icon" onClick={fullscreen} title="True full screen" aria-label="Full screen"><Icon name="maximize" size={18} /></button>
          <button type="button" className="promo-icon" onClick={onClose} title="Minimise (Esc) — the ticket keeps running" aria-label="Minimise"><Icon name="minimize" size={18} /></button>
        </div>
      </div>
      {thanks ? <ThankYou thanks={thanks} /> : <Dock key={t.id} t={t} running={running} onSwitch={onSwitch} onDone={done} api={api} toast={toast} management={m} />}
    </div>,
    overlay,
  );
}

// ─── The ad ────────────────────────────────────────────────────────────────
/**
 * Each station keeps its own copy of the promo video (Cache Storage), so an 84 MB ad
 * downloads once per screen instead of every time the promo opens. The first play streams
 * from the network while the copy is saved in the background; later plays use the copy.
 * Any failure (CORS, quota, private-browsing) quietly falls back to streaming.
 */
const PROMO_CACHE = 'gts-promo-v1';
function useLocalCopy(src) {
  const [local, setLocal] = useState(null);
  useEffect(() => {
    if (!src || typeof caches === 'undefined') return undefined;
    let alive = true; let objectUrl = null;
    const key = new Request(`/__promo-cache/${encodeURIComponent(src)}`);
    (async () => {
      try {
        const cache = await caches.open(PROMO_CACHE);
        const hit = await cache.match(key);
        if (hit) {
          objectUrl = URL.createObjectURL(await hit.blob());
          if (alive) setLocal(objectUrl); else URL.revokeObjectURL(objectUrl);
          return;
        }
        // save a copy for next time (don't swap the playing video mid-loop)
        const res = await fetch(src, { cache: 'no-store' });
        if (!res.ok || !/video|octet/.test(res.headers.get('content-type') || '')) return;
        await cache.put(key, new Response(await res.blob(), { headers: { 'content-type': res.headers.get('content-type') } }));
        for (const old of await cache.keys()) if (old.url !== key.url) cache.delete(old); // only the current ad is kept
      } catch { /* streaming still works */ }
    })();
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src]);
  return local;
}

export function PromoMedia({ muted }) {
  const { state } = useStore();
  const m = state.management || {};
  const repo = useRepoVideo();
  const [failed, setFailed] = useState(false);
  const url = (m.promoVideoUrl || '').trim();
  const embed = url ? embedFor(url, muted) : null;
  const remote = !failed && url && !embed ? url : !url && repo ? REPO_VIDEO : null;
  const local = useLocalCopy(remote && remote !== REPO_VIDEO ? remote : null);
  const src = local || remote;
  const fgRef = useRef(null); const bgRef = useRef(null);
  useEffect(() => { if (fgRef.current) fgRef.current.muted = muted; }, [muted]);
  // keep the blurred backdrop copy in step with the main video
  useEffect(() => {
    const fg = fgRef.current; const bg = bgRef.current; if (!fg || !bg) return undefined;
    const iv = setInterval(() => { if (Math.abs(bg.currentTime - fg.currentTime) > 0.4) bg.currentTime = fg.currentTime; }, 2000);
    return () => clearInterval(iv);
  }, [src]);

  if (embed) return <div className="promo-media"><iframe className="promo-embed" src={embed} title="GTS promo" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen /></div>;
  if (src) {
    return (
      <div className="promo-media">
        <video ref={bgRef} className="promo-video-bg" src={src} autoPlay muted loop playsInline aria-hidden="true" />
        <video ref={fgRef} className="promo-video" src={src} autoPlay muted={muted} loop playsInline onError={() => setFailed(true)} />
      </div>
    );
  }
  return <BuiltInPromo slides={m.promoSlides} />;
}

/** No video yet: an animated GTS promo built from the slide lines in Management. */
function BuiltInPromo({ slides }) {
  const list = (Array.isArray(slides) && slides.filter(Boolean).length ? slides.filter(Boolean) : DEFAULT_PROMO_SLIDES);
  const [i, setI] = useState(0);
  useEffect(() => { const iv = setInterval(() => setI((x) => (x + 1) % list.length), 4200); return () => clearInterval(iv); }, [list.length]);
  const [head, ...rest] = String(list[i]).split('|');
  return (
    <div className="promo-media promo-builtin">
      <div className="promo-aurora" aria-hidden="true"><i /><i /><i /></div>
      <MatrixRain className="promo-rain" opacity={0.18} fontSize={18} speed={0.8} />
      <div className="promo-slide" key={i}>
        <GTSMark size={120} />
        <h2>{head.trim()}</h2>
        {rest.length > 0 && <p>{rest.join('|').trim()}</p>}
      </div>
      <div className="promo-dots" aria-hidden="true">{list.map((_, k) => <span key={k} className={k === i ? 'is-on' : ''} />)}</div>
    </div>
  );
}

function Ticker({ slides }) {
  const list = (Array.isArray(slides) && slides.filter(Boolean).length ? slides.filter(Boolean) : DEFAULT_PROMO_SLIDES).map((s) => String(s).split('|')[0].trim());
  const line = useMemo(() => list.join('   ✦   '), [list]);
  return <div className="promo-ticker" aria-hidden="true"><div className="promo-ticker-track"><span>{line}   ✦   </span><span>{line}   ✦   </span></div></div>;
}

function ThankYou({ thanks }) {
  return (
    <div className="promo-thanks">
      <Icon name="check-circle" size={44} />
      <b>{thanks.name ? `Thanks, ${thanks.name}!` : 'All done — thank you!'}</b>
      <span>Served in {fmtDur(thanks.ms)} · Guest Technical Services</span>
    </div>
  );
}

// ─── The dock: edit the ticket while the ad plays ──────────────────────────
function Dock({ t, running, onSwitch, onDone, api, toast, management }) {
  const [d, setD] = useState(() => ({ orderNumber: t.orderNumber || '', customerName: t.customerName || '', serviceType: t.serviceType || '', description: t.description || '' }));
  const [shake, setShake] = useState(false);
  const descRef = useRef(null);
  const st = serviceState(t);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (st !== 'running') return undefined; const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv); }, [st]);
  const ms = serviceMs(t, now);
  const target = serviceTarget(management, d.serviceType) * 60_000;
  const descOk = d.description.trim().length >= DESC_MIN || management.requireDescription === false;
  useEffect(() => { if (!t.description) setTimeout(() => descRef.current?.focus(), 400); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // autosave (never saves an empty description)
  useEffect(() => {
    const patch = {};
    for (const k of Object.keys(d)) { const cur = t[k] || ''; if ((d[k] || '') !== cur) patch[k] = d[k] || (k === 'serviceType' ? null : ''); }
    if (patch.description !== undefined && !descOk) delete patch.description;
    if (!Object.keys(patch).length) return undefined;
    const timer = setTimeout(() => api.updateTicket(t.id, patch), 450);
    return () => clearTimeout(timer);
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.value }));
  const finish = () => {
    if (!descOk) { setShake(true); setTimeout(() => setShake(false), 600); descRef.current?.focus(); toast('Add what you did before finishing — e.g. “Firmware update”', { tone: 'warning' }); return; }
    // flush the latest edits, then stop the clock
    api.updateTicket(t.id, { orderNumber: d.orderNumber.trim(), customerName: d.customerName.trim(), serviceType: d.serviceType || null, description: d.description.trim() });
    api.serviceAction(t.id, 'finish');
    onDone(serviceMs(t));
  };
  const svc = SERVICE_BY_ID[d.serviceType];
  const catalog = useServiceCatalog();
  const allTickets = useStore().state.tickets;
  const quick = useMemo(() => topServices(allTickets, { catalog, limit: 5 }), [allTickets, catalog]);
  return (
    <div className="promo-dock" style={{ '--c': svc?.color || 'var(--accent)' }} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); finish(); } }}>
      <div className="promo-dock-clock">
        <span className="tag">{t.tag}</span>
        <b className={cx('mono', ms > target && 'is-over')}>{fmtClock(ms)}</b>
        <span className="promo-dock-bar"><i style={{ width: `${Math.min(100, (ms / target) * 100)}%` }} /></span>
        <small>{st === 'paused' ? 'paused' : 'in service'} · target {Math.round(target / 60_000)}m</small>
      </div>
      <div className="promo-dock-fields">
        <label className="pf"><span>Order #</span><Input className="mono" value={d.orderNumber} onChange={set('orderNumber')} placeholder="1095847721" /></label>
        <label className="pf"><span>Customer</span><Input value={d.customerName} onChange={set('customerName')} placeholder="Walk-up" /></label>
        <label className="pf"><span>Type</span>
          <span className="select"><select value={d.serviceType} onChange={set('serviceType')}><option value="">Pick a type…</option>{PICK_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></span>
        </label>
        <label className={cx('pf pf-desc', !descOk && 'is-missing', shake && 'shake')}>
          <span>What are we doing? <em>required</em></span>
          <ServiceInput ref={descRef} value={d.description} type={d.serviceType || null} placeholder="Search a service — e.g. Camera Kit Assembly"
            onChange={(v) => setD((x) => ({ ...x, description: v }))}
            onPick={(svc) => {
              const serviceType = svc.type && !sameFamily(d.serviceType, svc.type) && d.serviceType !== 'warranty' ? svc.type : d.serviceType;
              setD((x) => ({ ...x, description: svc.name, serviceType: serviceType || '' }));
              api.updateTicket(t.id, { description: svc.name, sfService: svc.path, serviceType: serviceType || null });
            }} />
          {quick.length > 0 && !d.description.trim() && (
            <span className="pf-tpls">{quick.map((x) => <button type="button" key={x.id} onClick={() => { setD((v) => ({ ...v, description: x.name, serviceType: v.serviceType || x.type || '' })); api.updateTicket(t.id, { description: x.name, sfService: x.path, ...(d.serviceType ? {} : { serviceType: x.type || null }) }); }}>{x.name}</button>)}</span>
          )}
        </label>
      </div>
      <div className="promo-dock-actions">
        {st === 'running'
          ? <button type="button" className="pbtn" onClick={() => api.serviceAction(t.id, 'pause')}><Icon name="pause" size={16} />Pause</button>
          : <button type="button" className="pbtn" onClick={() => api.serviceAction(t.id, 'resume')}><Icon name="play" size={16} />Resume</button>}
        <button type="button" className="pbtn is-done" onClick={finish} title="Finish the service (⌘/Ctrl + Enter)"><Icon name="check" size={18} />Done</button>
      </div>
      {running.length > 1 && (
        <div className="promo-switch">
          {running.map((x) => <button type="button" key={x.id} className={x.id === t.id ? 'is-on' : ''} onClick={() => onSwitch(x.id)}>{x.tag} · {x.customerName?.split(' ')[0] || (x.orderNumber ? `#${x.orderNumber.slice(-4)}` : 'walk-up')}</button>)}
        </div>
      )}
    </div>
  );
}
