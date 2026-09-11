// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — UI SOUNDS (optional, off by default)
//  Tiny synthesized blips via WebAudio — no audio files, no network.
// ═══════════════════════════════════════════════════════════════════════════
let ctx = null;

function ac() {
  if (typeof window === 'undefined') return null;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq, dur = 0.08, type = 'sine', gain = 0.05, when = 0) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, c.currentTime + when);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + when); o.stop(c.currentTime + when + dur + 0.02);
}

export const SOUNDS = {
  click: () => tone(1800, 0.04, 'square', 0.02),
  open: () => { tone(660, 0.07, 'sine', 0.04); tone(990, 0.09, 'sine', 0.035, 0.06); },
  close: () => { tone(880, 0.06, 'sine', 0.03); tone(520, 0.08, 'sine', 0.03, 0.05); },
  success: () => { tone(740, 0.08, 'triangle', 0.05); tone(988, 0.1, 'triangle', 0.05, 0.08); tone(1320, 0.14, 'triangle', 0.045, 0.16); },
  alert: () => { tone(440, 0.12, 'sawtooth', 0.035); tone(440, 0.12, 'sawtooth', 0.035, 0.18); },
  error: () => { tone(220, 0.16, 'square', 0.035); },
};

export function play(name, enabled) {
  if (!enabled) return;
  try { SOUNDS[name]?.(); } catch { /* ignore */ }
}
