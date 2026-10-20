'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — QUICK LOG STAGE (three.js)
//  The part customers watch while we type their order number. A glowing
//  core sits beside the Quick Log card; a light-beam connects whichever
//  field you are typing in to it, every keystroke streams particles down
//  the beam, the 10-segment ring lights up digit by digit, the colour
//  follows the service type, and saving fires a shockwave.
//
//  Imperative API (filled into `apiRef.current` once three.js has loaded):
//    pulse(el?)       keystroke — stream particles from `el` to the core
//    focus(el|null)   point the beam at a field (null = fade it out)
//    setColor(hex)    ease every light to a new colour
//    setProgress(n)   light n of the 10 order-number segments
//    burst()          ticket saved — shockwave + explosion
//  three.js is imported lazily so the rest of the app never pays for it.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useRef } from 'react';

const POINT_VERT = `
  attribute float aAlpha; attribute float aSize; attribute float aMix;
  uniform float uPixel;
  varying float vAlpha; varying float vMix;
  void main() {
    vAlpha = aAlpha; vMix = aMix;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixel * (14.0 / max(0.5, -mv.z));
    gl_Position = projectionMatrix * mv;
  }`;
const POINT_FRAG = `
  uniform vec3 uColor; uniform float uOpacity;
  varying float vAlpha; varying float vMix;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    vec3 col = mix(uColor, vec3(1.0), vMix * 0.65 + (1.0 - d * 2.0) * 0.25);
    gl_FragColor = vec4(col, a * vAlpha * uOpacity);
  }`;
const BEAM_VERT = `
  attribute float aU; varying float vU;
  void main() { vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BEAM_FRAG = `
  uniform vec3 uColor; uniform float uTime; uniform float uOpacity; varying float vU;
  void main() {
    float flow = fract(vU * 5.0 - uTime * 1.4);
    float dash = smoothstep(0.0, 0.12, flow) * smoothstep(0.55, 0.12, flow);
    float edge = smoothstep(0.0, 0.06, vU) * smoothstep(1.0, 0.9, vU);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), dash * 0.5), (0.18 + 0.82 * dash) * edge * uOpacity);
  }`;

export default function QuickLogScene({ apiRef, anchorRef, intensity = 'full', onFail, className, color = '#22d3ee', rgb = false }) {
  const hostRef = useRef(null);
  const live = useRef({ color, rgb });
  live.current = { color, rgb };
  // keep the running scene in step with the props (also covers the first frame after the lazy load)
  useEffect(() => { apiRef?.current?.setColor(color); }, [color, apiRef]);
  useEffect(() => { apiRef?.current?.setRgb(rgb); }, [rgb, apiRef]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    import('three').then((THREE) => {
      if (disposed || !hostRef.current) return;
      try { cleanup = build(THREE, hostRef.current, { apiRef, anchorRef, intensity, initial: live.current }); }
      catch (e) { console.warn('[gts] 3D stage unavailable', e); onFail?.(e); }
    }).catch((e) => onFail?.(e));
    return () => { disposed = true; cleanup(); if (apiRef) apiRef.current = null; };
  }, [intensity]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={hostRef} className={className || 'ql-canvas'} aria-hidden="true" />;
}

function build(THREE, host, { apiRef, anchorRef, intensity, initial = {} }) {
  const calm = intensity === 'calm';
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const speed = reduce ? 0.35 : calm ? 0.6 : 1;

  // ── renderer / camera ────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05080d, 14, 34);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  camera.position.set(0, 0.6, 15);

  const color = new THREE.Color(initial.color || '#22d3ee');
  const target = new THREE.Color(initial.color || '#22d3ee');
  let rgb = !!initial.rgb;
  const white = new THREE.Color('#ffffff');
  const disposables = [];
  const track = (x) => { disposables.push(x); return x; };

  const pointMaterial = (opacity = 1) => track(new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uPixel: { value: DPR }, uOpacity: { value: opacity } },
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const pointsGeo = (n) => {
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aMix', new THREE.BufferAttribute(new Float32Array(n), 1));
    return g;
  };
  const colorMats = []; // everything that follows the service-type colour

  // ── core ─────────────────────────────────────────────────────────────
  const core = new THREE.Group();
  scene.add(core);
  const shellMat = track(new THREE.LineBasicMaterial({ color: color.clone(), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
  colorMats.push(shellMat);
  const shell = new THREE.LineSegments(track(new THREE.EdgesGeometry(track(new THREE.IcosahedronGeometry(1.55, 1)))), shellMat);
  core.add(shell);
  const shell2Mat = track(new THREE.LineBasicMaterial({ color: color.clone(), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  colorMats.push(shell2Mat);
  const shell2 = new THREE.LineSegments(track(new THREE.EdgesGeometry(track(new THREE.OctahedronGeometry(2.05, 0)))), shell2Mat);
  core.add(shell2);

  // inner sphere of points
  const innerSrc = track(new THREE.IcosahedronGeometry(1.0, calm ? 3 : 4)).getAttribute('position');
  const innerN = innerSrc.count;
  const innerGeo = pointsGeo(innerN);
  for (let i = 0; i < innerN; i++) {
    innerGeo.attributes.position.setXYZ(i, innerSrc.getX(i), innerSrc.getY(i), innerSrc.getZ(i));
    innerGeo.attributes.aAlpha.setX(i, 0.35 + Math.random() * 0.4);
    innerGeo.attributes.aSize.setX(i, 2 + Math.random() * 2.5);
    innerGeo.attributes.aMix.setX(i, Math.random() * 0.5);
  }
  const innerMat = pointMaterial(1); colorMats.push(innerMat);
  const inner = new THREE.Points(innerGeo, innerMat);
  core.add(inner);

  // glow sprite (canvas radial gradient)
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const g2 = gc.getContext('2d');
  const grad = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g2.fillStyle = grad; g2.fillRect(0, 0, 128, 128);
  const glowTex = track(new THREE.CanvasTexture(gc));
  const glowMat = track(new THREE.SpriteMaterial({ map: glowTex, color: color.clone(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  colorMats.push(glowMat);
  const glow = new THREE.Sprite(glowMat); glow.scale.set(7, 7, 1);
  core.add(glow);

  // orbit rings
  const rings = [];
  [[2.9, 0.010, [1.15, 0.2, 0]], [3.35, 0.008, [0.4, 1.0, 0.3]], [3.9, 0.006, [1.6, -0.5, 0.8]]].forEach(([r, tube, rot], i) => {
    const m = track(new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true, opacity: 0.5 - i * 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
    colorMats.push(m);
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(r, tube, 6, 200)), m);
    ring.rotation.set(rot[0], rot[1], rot[2]);
    core.add(ring); rings.push(ring);
  });

  // 10-segment order-number ring (faces the camera)
  const segs = [];
  const segGroup = new THREE.Group();
  core.add(segGroup);
  for (let i = 0; i < 10; i++) {
    const arc = (Math.PI * 2) / 10;
    const m = track(new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    const seg = new THREE.Mesh(track(new THREE.TorusGeometry(2.45, 0.055, 6, 28, arc * 0.78)), m);
    seg.rotation.z = Math.PI / 2 - arc * (i + 1) + arc * 0.11;
    segGroup.add(seg); segs.push({ mesh: seg, mat: m, lit: 0, target: 0 });
  }

  // shockwave
  const waveMat = track(new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  const wave = new THREE.Mesh(track(new THREE.RingGeometry(0.92, 1, 96)), waveMat);
  core.add(wave);
  let waveT = 1;

  // ── orbit field (galaxy disk around the core) ────────────────────────
  const fieldN = calm ? 500 : 1100;
  const fieldGeo = pointsGeo(fieldN);
  const fieldR = new Float32Array(fieldN); const fieldA = new Float32Array(fieldN); const fieldY = new Float32Array(fieldN); const fieldS = new Float32Array(fieldN);
  for (let i = 0; i < fieldN; i++) {
    fieldR[i] = 3.2 + Math.pow(Math.random(), 0.7) * 6.5;
    fieldA[i] = Math.random() * Math.PI * 2;
    fieldY[i] = (Math.random() - 0.5) * (0.4 + fieldR[i] * 0.08);
    fieldS[i] = (0.05 + Math.random() * 0.12) / Math.sqrt(fieldR[i]);
    fieldGeo.attributes.aAlpha.setX(i, 0.15 + Math.random() * 0.55);
    fieldGeo.attributes.aSize.setX(i, 1.2 + Math.random() * 2.6);
    fieldGeo.attributes.aMix.setX(i, Math.random());
  }
  const fieldMat = pointMaterial(0.9); colorMats.push(fieldMat);
  const field = new THREE.Points(fieldGeo, fieldMat);
  field.rotation.x = 0.42;
  core.add(field);

  // far stars
  const starN = calm ? 250 : 500;
  const starGeo = pointsGeo(starN);
  for (let i = 0; i < starN; i++) {
    starGeo.attributes.position.setXYZ(i, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 40, -12 - Math.random() * 30);
    starGeo.attributes.aAlpha.setX(i, 0.2 + Math.random() * 0.5);
    starGeo.attributes.aSize.setX(i, 1 + Math.random() * 2);
    starGeo.attributes.aMix.setX(i, 0.8);
  }
  const starMat = pointMaterial(0.8);
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // floor grid (moves toward the viewer — "data highway")
  const grid = new THREE.GridHelper(80, 64, 0x22d3ee, 0x22d3ee);
  grid.material.transparent = true; grid.material.opacity = 0.09; grid.material.depthWrite = false;
  grid.position.y = -5.2;
  scene.add(grid);
  disposables.push(grid.geometry, grid.material);

  // ── stream particles (keystrokes + burst) ────────────────────────────
  const N = calm ? 350 : 700;
  const sGeo = pointsGeo(N);
  const pos = sGeo.attributes.position.array; const alpha = sGeo.attributes.aAlpha.array; const size = sGeo.attributes.aSize.array; const mix = sGeo.attributes.aMix.array;
  const vel = new Float32Array(N * 3); const life = new Float32Array(N); const homing = new Uint8Array(N);
  let cursor = 0;
  const sMat = pointMaterial(1); colorMats.push(sMat);
  const stream = new THREE.Points(sGeo, sMat);
  stream.frustumCulled = false;
  scene.add(stream);
  const spawn = (x, y, z, vx, vy, vz, home, sz = 3) => {
    const i = cursor; cursor = (cursor + 1) % N;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    life[i] = 1; homing[i] = home ? 1 : 0; size[i] = sz * (0.7 + Math.random() * 0.8); mix[i] = Math.random(); alpha[i] = 1;
  };

  // ── beam: field → core ────────────────────────────────────────────────
  const BEAM_N = 72;
  const beamGeo = track(new THREE.BufferGeometry());
  beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BEAM_N * 3), 3));
  const us = new Float32Array(BEAM_N); for (let i = 0; i < BEAM_N; i++) us[i] = i / (BEAM_N - 1);
  beamGeo.setAttribute('aU', new THREE.BufferAttribute(us, 1));
  const beamMat = track(new THREE.ShaderMaterial({ uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uOpacity: { value: 0 } }, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const beam = new THREE.Line(beamGeo, beamMat);
  beam.frustumCulled = false;
  scene.add(beam);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
  let beamEl = null; let beamOn = 0;

  // ── screen ↔ world helpers ───────────────────────────────────────────
  const tmp = new THREE.Vector3(); const dir = new THREE.Vector3();
  const toWorld = (cx, cy) => {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return new THREE.Vector3();
    tmp.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, 0.5).unproject(camera);
    dir.copy(tmp).sub(camera.position).normalize();
    const d = -camera.position.z / dir.z;
    return camera.position.clone().add(dir.multiplyScalar(d));
  };
  const elPoint = (el) => {
    if (!el?.getBoundingClientRect) return null;
    const b = el.getBoundingClientRect();
    const r = host.getBoundingClientRect();
    // the right edge of the field (closest to the core), clamped into the stage
    const x = Math.min(r.right - 4, Math.max(r.left + 4, b.right - Math.min(24, b.width * 0.1)));
    const y = Math.min(r.bottom - 4, Math.max(r.top + 4, b.top + b.height / 2));
    return toWorld(x, y);
  };
  const placeCore = () => {
    const a = anchorRef?.current?.getBoundingClientRect?.();
    if (a && a.width > 10 && a.height > 10) {
      // centre of the HUD's empty "core" box, sized so the outer ring (⌀ ≈ 7.8) fits inside it
      const cx = a.left + a.width / 2; const cy = a.top + a.height / 2;
      core.position.copy(toWorld(cx, cy));
      const wW = toWorld(a.right, cy).distanceTo(toWorld(a.left, cy));
      const wH = toWorld(cx, a.top).distanceTo(toWorld(cx, a.bottom));
      core.scale.setScalar(Math.max(0.22, Math.min(1, (wW * 0.86) / 7.8, (wH * 1.0) / 7.8)));
    } else { core.position.set(0, 0, 0); core.scale.setScalar(0.8); }
  };
  const setBeam = () => {
    if (!beamEl) return;
    const p0 = elPoint(beamEl); if (!p0) return;
    const p2 = core.position.clone();
    const mid = p0.clone().lerp(p2, 0.5); mid.z += 2.4; mid.y += 0.8;
    curve.v0.copy(p0); curve.v1.copy(mid); curve.v2.copy(p2);
    const arr = beamGeo.attributes.position.array;
    for (let i = 0; i < BEAM_N; i++) { curve.getPoint(i / (BEAM_N - 1), tmp); arr[i * 3] = tmp.x; arr[i * 3 + 1] = tmp.y; arr[i * 3 + 2] = tmp.z; }
    beamGeo.attributes.position.needsUpdate = true;
  };

  // ── sizing ───────────────────────────────────────────────────────────
  const resize = () => {
    const w = host.clientWidth || 1; const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = w / h; camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    placeCore(); setBeam();
  };
  const ro = new ResizeObserver(resize); ro.observe(host);
  if (anchorRef?.current) ro.observe(anchorRef.current);
  resize();

  // ── input ────────────────────────────────────────────────────────────
  let mx = 0, my = 0;
  const onMove = (e) => { mx = (e.clientX / window.innerWidth) * 2 - 1; my = (e.clientY / window.innerHeight) * 2 - 1; };
  window.addEventListener('pointermove', onMove, { passive: true });
  // the HUD column is sticky — follow it while the page scrolls
  let scrollQueued = false;
  const onScroll = () => { if (scrollQueued) return; scrollQueued = true; requestAnimationFrame(() => { scrollQueued = false; placeCore(); setBeam(); }); };
  window.addEventListener('scroll', onScroll, { passive: true });

  let energy = 0.2; let flash = 0; let progress = 0;
  const api = {
    pulse(el) {
      const from = elPoint(el) || toWorld(host.getBoundingClientRect().left + 40, host.getBoundingClientRect().top + host.clientHeight / 2);
      if (el && el !== beamEl) { beamEl = el; setBeam(); }
      const n = calm ? 6 : 12;
      for (let k = 0; k < n; k++) spawn(from.x + (Math.random() - 0.5) * 0.4, from.y + (Math.random() - 0.5) * 0.4, from.z + (Math.random() - 0.5) * 0.4, 0.04 + Math.random() * 0.06, (Math.random() - 0.3) * 0.08, (Math.random() - 0.2) * 0.08, true, 3.2);
      energy = Math.min(1.6, energy + 0.22);
    },
    focus(el) { beamEl = el || null; if (el) setBeam(); },
    setColor(hex) { try { target.set(hex || '#22d3ee'); } catch { /* ignore */ } },
    setRgb(on) { rgb = !!on; if (!on) target.copy(color); },
    setProgress(n) {
      const lit = Math.max(0, Math.min(10, Math.floor(n || 0)));
      segs.forEach((s, i) => { s.target = i < lit ? 1 : 0; });
      if (lit === 10 && progress < 10) { flash = Math.max(flash, 0.6); waveT = 0.35; }
      progress = lit;
    },
    burst() {
      const c = core.position;
      const n = calm ? 140 : 260;
      for (let k = 0; k < n; k++) {
        const th = Math.random() * Math.PI * 2; const ph = Math.acos(2 * Math.random() - 1); const sp = 0.12 + Math.random() * 0.28;
        spawn(c.x, c.y, c.z, Math.sin(ph) * Math.cos(th) * sp, Math.sin(ph) * Math.sin(th) * sp, Math.cos(ph) * sp, false, 4);
      }
      flash = 1; waveT = 0; energy = 1.8;
    },
  };
  if (apiRef) apiRef.current = api;

  // ── loop ─────────────────────────────────────────────────────────────
  let raf = 0; let last = performance.now(); let time = 0; let visible = true;
  const io = new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true; if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }, { threshold: 0.01 });
  io.observe(host);
  const onVis = () => { if (!document.hidden && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  document.addEventListener('visibilitychange', onVis);

  const fieldPos = fieldGeo.attributes.position.array;
  function loop(now) {
    raf = 0;
    if (document.hidden || !visible) return;
    if (document.body.classList.contains('promo-open')) { last = now; raf = requestAnimationFrame(loop); return; } // hidden behind the promo screen
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    time += dt * speed;

    if (rgb) target.setHSL((time * 0.12) % 1, 0.9, 0.6); // RGB mode: the whole stage cycles the spectrum
    color.lerp(target, Math.min(1, dt * 3));
    for (const m of colorMats) { if (m.uniforms) m.uniforms.uColor.value.copy(color); else m.color.copy(color); }
    beamMat.uniforms.uColor.value.copy(color);
    waveMat.color.copy(color).lerp(white, 0.3);
    grid.material.color.copy(color);

    energy += (0.22 - energy) * Math.min(1, dt * 1.6);
    flash *= Math.pow(0.04, dt);
    const e = energy;

    // core
    shell.rotation.y += dt * speed * (0.25 + e * 0.9);
    shell.rotation.x += dt * speed * 0.11;
    shell2.rotation.y -= dt * speed * (0.12 + e * 0.4);
    shell2.rotation.z += dt * speed * 0.05;
    inner.rotation.y -= dt * speed * (0.18 + e * 0.5);
    const breathe = 1 + Math.sin(time * 1.6) * 0.03 + e * 0.07 + flash * 0.25;
    shell.scale.setScalar(breathe); inner.scale.setScalar(breathe * (1 + flash * 0.4));
    shellMat.opacity = 0.5 + e * 0.25 + flash * 0.4;
    glowMat.opacity = 0.35 + e * 0.25 + flash * 0.6;
    glow.scale.setScalar(6.5 + e * 1.4 + flash * 6);
    rings.forEach((r, i) => { r.rotation.z += dt * speed * (0.2 + i * 0.12) * (1 + e); r.rotation.x += dt * speed * 0.03 * (i - 1); });
    segGroup.rotation.z = Math.sin(time * 0.3) * 0.04;
    segs.forEach((s) => {
      s.lit += (s.target - s.lit) * Math.min(1, dt * 9);
      s.mat.opacity = 0.1 + s.lit * (0.75 + flash * 0.25);
      s.mat.color.copy(color).lerp(white, s.lit * 0.35);
      s.mesh.scale.setScalar(1 + s.lit * 0.04 + flash * 0.05);
    });

    // shockwave
    if (waveT < 1) {
      waveT = Math.min(1, waveT + dt * 0.9);
      const k = 1 - Math.pow(1 - waveT, 3);
      wave.scale.setScalar(1 + k * 9); waveMat.opacity = (1 - waveT) * 0.9;
    } else waveMat.opacity = 0;

    // orbit field
    for (let i = 0; i < fieldN; i++) {
      fieldA[i] += fieldS[i] * dt * speed * (1 + e * 1.2);
      const r = fieldR[i] * (1 + flash * 0.08);
      fieldPos[i * 3] = Math.cos(fieldA[i]) * r;
      fieldPos[i * 3 + 1] = fieldY[i] + Math.sin(time + i) * 0.04;
      fieldPos[i * 3 + 2] = Math.sin(fieldA[i]) * r;
    }
    fieldGeo.attributes.position.needsUpdate = true;
    field.rotation.y += dt * speed * 0.02;

    // stream particles
    const c = core.position;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) { alpha[i] = 0; continue; }
      const ix = i * 3;
      if (homing[i]) {
        const dx = c.x - pos[ix], dy = c.y - pos[ix + 1], dz = c.z - pos[ix + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const pull = 0.0048 * speed * 60 * dt;
        vel[ix] += (dx / d) * pull * 2.4; vel[ix + 1] += (dy / d) * pull * 2.4 + Math.sin(time * 6 + i) * 0.0009; vel[ix + 2] += (dz / d) * pull * 2.4;
        vel[ix] *= 0.965; vel[ix + 1] *= 0.965; vel[ix + 2] *= 0.965;
        if (d < 1.1) { life[i] -= dt * 4; energy = Math.min(1.8, energy + 0.004); }
        else life[i] -= dt * 0.18;
      } else {
        vel[ix] *= 0.985; vel[ix + 1] *= 0.985; vel[ix + 2] *= 0.985;
        vel[ix + 1] -= 0.0006;
        life[i] -= dt * 0.55;
      }
      pos[ix] += vel[ix] * 60 * dt * speed; pos[ix + 1] += vel[ix + 1] * 60 * dt * speed; pos[ix + 2] += vel[ix + 2] * 60 * dt * speed;
      alpha[i] = Math.max(0, Math.min(1, life[i] * 1.4));
    }
    sGeo.attributes.position.needsUpdate = true; sGeo.attributes.aAlpha.needsUpdate = true; sGeo.attributes.aSize.needsUpdate = true; sGeo.attributes.aMix.needsUpdate = true;

    // beam
    const wantBeam = beamEl && document.activeElement === beamEl ? 1 : 0;
    beamOn += (wantBeam - beamOn) * Math.min(1, dt * 5);
    beamMat.uniforms.uOpacity.value = beamOn * (0.55 + e * 0.3);
    beamMat.uniforms.uTime.value = time * (1 + e);
    if (wantBeam && Math.floor(time * 2) !== Math.floor((time - dt * speed) * 2)) setBeam(); // follow a resizing textarea

    // drifting stars + floor + camera parallax
    stars.rotation.z += dt * 0.004;
    grid.position.z = ((time * 1.4) % 1.25);
    camera.position.x += (mx * 0.9 - camera.position.x) * Math.min(1, dt * 2);
    camera.position.y += (0.6 - my * 0.5 - camera.position.y) * Math.min(1, dt * 2);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf); raf = -1;
    ro.disconnect(); io.disconnect();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVis);
    for (const d of disposables) { try { d.dispose(); } catch { /* ignore */ } }
    renderer.dispose();
    renderer.domElement.remove();
  };
}
