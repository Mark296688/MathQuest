// Deterministischer Zufall: gleicher Seed ergibt dieselbe Folge.

/** mulberry32 */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(r, lo, hi) {
  return lo + Math.floor(r() * (hi - lo + 1));
}

export function pick(r, arr) {
  return arr[Math.floor(r() * arr.length)];
}

/** Ein Element, mit Wahrscheinlichkeit proportional zu weight(element). */
export function pickWeighted(r, arr, weight) {
  let x = r() * arr.reduce((s, v) => s + weight(v), 0);
  for (const v of arr) if ((x -= weight(v)) < 0) return v;
  return arr[arr.length - 1];
}

/** Neue, gemischte Kopie (Fisher-Yates). */
export function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Text zu Seed (FNV-1a), z. B. „anna|2026-10-25|3“. */
export function seedFrom(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
