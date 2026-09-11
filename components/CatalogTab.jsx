'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — CATALOG TAB
//  The 17-area / 124-type service catalog as a searchable reference.
//  Any entry can be attached to an active assignment as a checklist task.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ASSIGNMENT_TYPES, CATALOG_META, CATEGORIES, CATEGORY_BY_ID, EVIDENCE_LEVELS, PROJECT_TEMPLATES, searchCatalog } from '../lib/catalog';
import { SERVICE_TYPES, isTerminal, serviceLabel } from '../lib/constants';
import { useStore } from './GTSApp';
import { Btn, Chip, EmptyState, Icon, Input, Modal, Panel, Select } from './ui';

const TILE_COLORS = ['#22d3ee', '#a78bfa', '#43b56a', '#f5b942', '#60a5fa', '#f472b6', '#fb923c', '#c084fc', '#38bdf8'];

export default function CatalogTab() {
  const { state, api, toast, openAssignment } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [level, setLevel] = useState('');
  const [svc, setSvc] = useState('');
  const [attach, setAttach] = useState(null); // assignment type being attached
  const searchRef = useRef(null);

  useEffect(() => {
    const h = () => searchRef.current?.focus();
    window.addEventListener('gts:focus-search', h);
    return () => window.removeEventListener('gts:focus-search', h);
  }, []);

  const results = useMemo(() => {
    let r = searchCatalog(q);
    if (cat) r = r.filter((a) => a.cat === cat);
    if (level) r = r.filter((a) => a.level === level);
    if (svc) { const cats = SERVICE_TYPES.find((s) => s.id === svc)?.cats || []; r = r.filter((a) => cats.includes(a.cat)); }
    return r;
  }, [q, cat, level, svc]);

  const grouped = useMemo(() => {
    const m = new Map();
    for (const a of results) { if (!m.has(a.cat)) m.set(a.cat, []); m.get(a.cat).push(a); }
    return [...m.entries()];
  }, [results]);

  const active = state.assignments.filter((a) => !a.deletedAt && !isTerminal(a.status));
  const overview = !q && !cat && !level && !svc;
  const usage = useMemo(() => {
    const c = {};
    for (const a of state.assignments) for (const t of a.tasks || []) if (t.catalogId) c[t.catalogId] = (c[t.catalogId] || 0) + 1;
    return c;
  }, [state.assignments]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Service catalog · v{CATALOG_META.version} · {CATALOG_META.preparedOn}</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>What we do at the counter</h1>
          <p className="page-sub">{CATEGORIES.length} work areas, {results.length === 124 ? 124 : `${results.length} of 124`} assignment types. Each has a scope and the evidence that proves it’s done — attach any of them to a job as a checklist step.</p>
        </div>
        <div className="row wrap">
          {Object.entries(EVIDENCE_LEVELS).map(([k]) => <span key={k} className={`evidence is-${k}`} title={EVIDENCE_LEVELS[k]}>{k}</span>)}
        </div>
      </div>

      <div className="toolbar">
        <div className="input-wrap" style={{ maxWidth: 420 }}><Icon name="search" /><Input ref={searchRef} placeholder="Search e.g. firmware, DMDE, Migration Assistant, SELPHY…  ( / )" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={svc} onChange={(e) => setSvc(e.target.value)} style={{ width: 180 }}><option value="">Any service type</option>{SERVICE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
        <Select value={level} onChange={(e) => setLevel(e.target.value)} style={{ width: 150 }}><option value="">Any evidence</option><option value="core">Core</option><option value="discussed">Discussed</option><option value="proposed">Proposed</option></Select>
        {(q || cat || level || svc) && <Btn variant="ghost" size="sm" icon="x" onClick={() => { setQ(''); setCat(''); setLevel(''); setSvc(''); }}>Clear</Btn>}
      </div>

      {!overview && (
        <div className="cat-chips mb-4">
          <Chip tone="accent" icon="arrow-left" onClick={() => { setCat(''); setQ(''); setLevel(''); setSvc(''); }}>All areas</Chip>
          {CATEGORIES.map((c) => <Chip key={c.id} tone={cat === c.id ? 'accent' : undefined} onClick={() => setCat(cat === c.id ? '' : c.id)} title={c.purpose}>{c.id}</Chip>)}
        </div>
      )}

      {overview ? (
        <div className="grid cols-3">
          {CATEGORIES.map((c, i) => {
            const list = ASSIGNMENT_TYPES.filter((a) => a.cat === c.id);
            const core = list.filter((a) => a.level === 'core').length;
            const used = list.reduce((n, a) => n + (usage[a.id] || 0), 0);
            return (
              <button key={c.id} className="cat-tile fade-up" style={{ '--i': Math.min(i, 12), '--c': TILE_COLORS[i % TILE_COLORS.length] }} onClick={() => setCat(c.id)}>
                <span className="cat-tile-id">{c.id} · AREA {String(i + 1).padStart(2, '0')}</span>
                <span className="cat-tile-name">{c.name}</span>
                <span className="cat-tile-purpose">{c.purpose}</span>
                <span className="cat-tile-foot"><span>{list.length} types{core ? ` · ${core} core` : ''}</span><span>{used ? `${used} used` : ''}<Icon name="chevron-right" size={13} style={{ display: 'inline', verticalAlign: '-2px', marginLeft: 6 }} /></span></span>
              </button>
            );
          })}
        </div>
      ) : grouped.length === 0 ? <EmptyState icon="book" title="No catalog entries match" desc="Try fewer words — search covers titles, scopes and completion evidence." /> : (
        <div className="stack" style={{ gap: 16 }}>
          {grouped.map(([catId, list]) => {
            const c = CATEGORY_BY_ID[catId];
            return (
              <Panel key={catId} title={`${c.id} · ${c.name}`} icon="book" sub={c.purpose} actions={<Chip size="sm">{list.length} types</Chip>}>
                <div className="list list-2">
                  {list.map((a, i) => (
                    <div key={a.id} className="cat-card fade-up" style={{ '--i': Math.min(i, 10) }}>
                      <div className="cat-title">
                        <span><span className="tag" style={{ marginRight: 8 }}>{a.id}</span>{a.title}</span>
                        <span className={`evidence is-${a.level}`}>{a.level}</span>
                      </div>
                      <div className="cat-scope">{a.scope}</div>
                      <div className="cat-evi"><b>Done when</b><span>{a.evidence}</span></div>
                      <div className="row between mt-2">
                        <span className="faint mono" style={{ fontSize: 11 }}>{usage[a.id] ? `used on ${usage[a.id]} job${usage[a.id] > 1 ? 's' : ''}` : 'not used yet'}</span>
                        <Btn size="xs" icon="plus" onClick={() => setAttach(a)} disabled={active.length === 0} title={active.length ? 'Attach as a task to an active assignment' : 'No active assignments'}>Attach to job</Btn>
                      </div>
                    </div>
                  ))}
                </div>
                {(c.fields?.length || c.resources?.length) ? (
                  <details className="mt-3" style={{ fontSize: 12.5 }}>
                    <summary className="muted" style={{ cursor: 'pointer' }}>Log fields &amp; resources for this area</summary>
                    <div className="grid cols-2 mt-2">
                      <div><div className="eyebrow mb-2">Log fields</div><div className="checks">{c.fields.map((f) => <span key={f} className="chip chip-sm">{f}</span>)}</div></div>
                      <div><div className="eyebrow mb-2">Resources to have ready</div><div className="checks">{c.resources.map((f) => <span key={f} className="chip chip-sm">{f}</span>)}</div></div>
                    </div>
                  </details>
                ) : null}
              </Panel>
            );
          })}
        </div>
      )}

      <Panel className="mt-4" title="Improvement backlog" icon="flag" sub="Team projects from the catalog brief — a reminder of what’s next for the station.">
        <div className="list list-2">
          {PROJECT_TEMPLATES.map((p) => (
            <div key={p.id} className="cat-card">
              <div className="cat-title"><span><span className="tag" style={{ marginRight: 8 }}>{p.id}</span>{p.name}</span></div>
              <div className="cat-scope">{p.deliverable}</div>
              <div className="cat-evi"><b>Done when</b><span>{p.done}</span></div>
            </div>
          ))}
        </div>
      </Panel>

      {attach && (
        <AttachModal a={attach} active={active} onClose={() => setAttach(null)} onPick={(asgId) => {
          api.addTask(asgId, { catalogId: attach.id, title: attach.title });
          const asg = active.find((x) => x.id === asgId);
          toast(`${attach.id} added to ${asg?.tag}`, { tone: 'success', action: { label: 'Open', onClick: () => openAssignment(asgId) } });
          setAttach(null);
        }} />
      )}
    </>
  );
}

function AttachModal({ a, active, onClose, onPick }) {
  return (
    <Modal title={`Attach ${a.id}`} sub={a.title} onClose={onClose} size="sm" icon="clipboard">
      <div className="stack" style={{ gap: 6 }}>
        {active.map((asg) => (
          <button key={asg.id} className="mini" onClick={() => onPick(asg.id)}>
            <span className="truncate"><span className="tag" style={{ marginRight: 6 }}>{asg.tag}</span>{asg.customerName} · <span className="muted">{asg.deviceDesc || serviceLabel(asg.serviceType)}</span></span>
            <Icon name="plus" size={14} />
          </button>
        ))}
      </div>
    </Modal>
  );
}
