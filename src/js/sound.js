// Kurze, leise Töne über WebAudio. Abschaltbar, Einstellung bleibt im Browser.
const KEY = 'mathquest-sound';
let on = true;
try { on = localStorage.getItem(KEY) !== 'off'; } catch { /* egal */ }
let ac = null;

export const soundOn = () => on;
export function setSound(v) {
  on = v;
  try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* egal */ }
}

function tone(f, d, type = 'sine', vol = 0.06, when = 0) {
  if (!on) return;
  try {
    ac = ac || new AudioContext();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = f;
    o.connect(g).connect(ac.destination);
    const t0 = ac.currentTime + when;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.start(t0);
    o.stop(t0 + d + 0.02);
  } catch { /* kein Ton */ }
}

export const soundOk = () => { tone(660, 0.12, 'sine', 0.08); tone(880, 0.2, 'sine', 0.08, 0.12); };
export const soundBad = () => tone(240, 0.3, 'triangle', 0.08);
export const soundBlocks = (n) => { for (let i = 0; i < Math.min(n, 14); i++) tone(500 + i * 25, 0.05, 'square', 0.025, i * 0.09); };
export const soundDrop = () => tone(180, 0.15, 'square', 0.05);
export const soundTick = () => tone(990, 0.06, 'sine', 0.05);
export const soundRecord = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'sine', 0.08, i * 0.13));
