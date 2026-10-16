'use client';
// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — MATRIX TOUCHES (V4)
//  <MatrixRain/>  falling glyph columns on a 2D canvas (stage backdrop, and
//                 the whole background in the Matrix theme)
//  <Decode/>      text that "decodes" through random glyphs when it changes
//  Both stop when the tab is hidden and respect prefers-reduced-motion.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from 'react';

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789GTSBH#$%&@+=<>';
const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

function cssColor(name, fallback) {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
}

export function MatrixRain({ className, opacity = 0.25, fontSize = 15, speed = 1, color, fixed }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return undefined;
    const ctx = canvas.getContext('2d'); if (!ctx) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cols = 0; let drops = []; let w = 0; let h = 0; let raf = 0; let last = 0; let tint = color || cssColor('--accent', '#22d3ee');
    const size = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / fontSize);
      drops = Array.from({ length: cols }, () => ({ y: Math.random() * -h, v: (0.5 + Math.random() * 0.9) * speed, len: 8 + ((Math.random() * 18) | 0), chars: [] }));
      tint = color || cssColor('--accent', '#22d3ee');
    };
    const ro = new ResizeObserver(size); ro.observe(canvas); size();
    const themeObs = new MutationObserver(() => { tint = color || cssColor('--accent', '#22d3ee'); });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-zone'] });
    const frame = (t) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || t - last < (reduce ? 120 : 45)) return;
      last = t;
      ctx.clearRect(0, 0, w, h);
      ctx.font = `${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      for (let i = 0; i < cols; i++) {
        const d = drops[i];
        d.y += d.v * fontSize * 0.42;
        if (d.y - d.len * fontSize > h) { d.y = Math.random() * -h * 0.5; d.v = (0.5 + Math.random() * 0.9) * speed; d.len = 8 + ((Math.random() * 18) | 0); }
        const x = i * fontSize + fontSize / 2;
        for (let k = 0; k < d.len; k++) {
          const y = d.y - k * fontSize;
          if (y < -fontSize || y > h + fontSize) continue;
          if (!d.chars[k] || Math.random() < 0.04) d.chars[k] = pick();
          if (k === 0) { ctx.fillStyle = '#eafff2'; ctx.globalAlpha = 0.95; ctx.shadowColor = tint; ctx.shadowBlur = 8; }
          else { ctx.fillStyle = tint; ctx.globalAlpha = Math.max(0, 0.85 - k / d.len); ctx.shadowBlur = 0; }
          ctx.fillText(d.chars[k], x, y);
        }
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); themeObs.disconnect(); };
  }, [fontSize, speed, color]);
  return <canvas ref={ref} className={className || 'matrix-rain'} style={{ opacity, ...(fixed ? { position: 'fixed', inset: 0, width: '100%', height: '100%' } : {}) }} aria-hidden="true" />;
}

/** Text that scrambles through glyphs and resolves left-to-right whenever it changes. */
export function Decode({ text, duration = 520, className }) {
  const [out, setOut] = useState(text);
  const prev = useRef(text);
  useEffect(() => {
    if (prev.current === text) return undefined;
    prev.current = text;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setOut(text); return undefined; }
    const start = performance.now(); let raf = 0;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const fixed = Math.floor(text.length * p);
      setOut(text.slice(0, fixed) + text.slice(fixed).replace(/[^\s·]/g, () => pick()));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, duration]);
  return <span className={className}>{out}</span>;
}
