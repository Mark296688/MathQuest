// SVG-Szenen für die Aufgaben. Koordinaten: viewBox 0 0 1000 520, Boden bei G.
import { mauerModel, turmModel, reiheModel, bundles, bundlesT } from './bau.js';
import { fmt } from './parse.js';

const G = 436;
const n1 = (v) => +v.toFixed(1);
const R = (x, y, w, h, c, ex = '') => `<rect class="${c}" x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" ${ex}/>`;
const TX = (x, y, t, c, ex = '') => `<text class="${c}" x="${n1(x)}" y="${n1(y)}" ${ex}>${t}</text>`;
const ground = () => R(0, G, 1000, 84, 'ground') + R(0, G, 1000, 8, 'ground2');
/** Unterteilung nur zeichnen, wenn die Teile breit genug sind; sonst wird es eine graue Fläche. */
const MIN_SEG = 3;

function hbar(x, y, w, h, c) {
  let s = R(x, y, w, h, c, 'rx="2"');
  if (w / 10 >= MIN_SEG) for (let i = 1; i < 10; i++) { const xx = n1(x + i * w / 10); s += `<line class="seg" x1="${xx}" y1="${n1(y + 3)}" x2="${xx}" y2="${n1(y + h - 3)}"/>`; }
  return s;
}
function vbar(x, y, w, h, c) {
  let s = R(x, y, w, h, c, 'rx="2"');
  if (h / 10 >= MIN_SEG) for (let i = 1; i < 10; i++) { const yy = n1(y + i * h / 10); s += `<line class="seg" x1="${n1(x + 1)}" y1="${yy}" x2="${n1(x + w - 1)}" y2="${yy}"/>`; }
  return s;
}
/** Hunderterplatte (10 × 10), auch als Rechteck, wenn der Hof in die Länge gezogen ist. */
function rplate(x, y, w, h, c) {
  let s = R(x, y, w, h, c, 'rx="2"');
  if (c === 'ghost' || c === 'plan') return s;
  for (let i = 1; i < 10; i++) {
    if (w / 10 >= MIN_SEG) { const xx = n1(x + i * w / 10); s += `<line class="seg" x1="${xx}" y1="${n1(y + 2)}" x2="${xx}" y2="${n1(y + h - 2)}"/>`; }
    if (h / 10 >= MIN_SEG) { const yy = n1(y + i * h / 10); s += `<line class="seg" x1="${n1(x + 2)}" y1="${yy}" x2="${n1(x + w - 2)}" y2="${yy}"/>`; }
  }
  return s;
}
const plate = (x, y, size, c) => rplate(x, y, size, size, c);

/** Tausenderwürfel: Vorderseite als Platte, dazu Deckel und Seite. */
function cube(x, y, c, d, cls) {
  const ghost = cls === 'ghost';
  let s = plate(x, y, c, ghost ? 'ghost' : 'blk-t');
  const top = `M${x} ${y} l${d} ${-d} h${c} l${-d} ${d}z`;
  const side = `M${x + c} ${y} l${d} ${-d} v${c} l${-d} ${d}z`;
  s += `<path class="${ghost ? 'ghost' : 'blk-t top'}" d="${top}"/><path class="${ghost ? 'ghost' : 'blk-t side'}" d="${side}"/>`;
  return s;
}

// ---------- Einmaleins ----------

/**
 * Punktefeld: Reihen mit je m Punkten, Lücke nach 5 Reihen und 5 Spalten.
 * rows: Art je Reihe ('a' blau, 'b' gelb, 'ghost' nur Umriss).
 */
function dotField(field, top, bottom, labels) {
  const n = field.rows.length;
  const m = field.m;
  const s = Math.min(36, (bottom - top) / (n + 0.6));
  const gap = s * 0.45;
  const w = m * s + (m > 5 ? gap : 0);
  const h = n * s + (n > 5 ? gap : 0);
  const x0 = 500 - w / 2;
  const y0 = top + (bottom - top - h) / 2;
  const yOf = (i) => y0 + i * s + (i >= 5 ? gap : 0) + s / 2;
  let out = '';
  field.rows.forEach((kind, i) => {
    for (let j = 0; j < m; j++) {
      const x = x0 + j * s + (j >= 5 ? gap : 0) + s / 2;
      out += `<circle class="dot-${kind}" cx="${x.toFixed(1)}" cy="${yOf(i).toFixed(1)}" r="${(s * 0.36).toFixed(1)}"/>`;
    }
  });
  if (!labels) return out;
  // Beschriftung der Reihengruppen: links die Teile, rechts was weg kommt
  const runs = [];
  field.rows.forEach((k, i) => {
    if (runs.length && runs[runs.length - 1].k === k) runs[runs.length - 1].to = i;
    else runs.push({ k, from: i, to: i });
  });
  const mid = (r) => (yOf(r.from) + yOf(r.to)) / 2 + 9;
  const hasGhost = runs.some((r) => r.k === 'ghost');
  if (hasGhost) {
    out += TX(x0 - 24, (yOf(0) + yOf(n - 1)) / 2 + 9, `10 · ${m}`, 'dlbl', 'text-anchor="end"');
    const g = runs.find((r) => r.k === 'ghost');
    out += TX(x0 + w + 24, mid(g), field.n === 5 ? 'Hälfte weg' : `− ${g.to - g.from + 1} · ${m}`, 'dlbl');
  } else {
    runs.forEach((r, i) => {
      out += TX(x0 - 24, mid(r), `${i ? '+ ' : ''}${r.to - r.from + 1} · ${m}`, 'dlbl', 'text-anchor="end"');
    });
  }
  return out;
}

/** state: 'ask' | 'hint' | 'ok' | 'solution' */
export function sceneAbruf(q, state, j) {
  const big = q.words
    ? TX(500, 250, q.words, 'term', 'text-anchor="middle" font-size="46"')
    : TX(500, 290, q.term, 'term', 'text-anchor="middle" font-size="170"');
  if (state === 'ask') return big;
  if (state === 'ok') {
    return TX(500, 290, `${q.term} = ${q.answer}`, 'term ok', 'text-anchor="middle" font-size="150"');
  }
  const head = state === 'solution'
    ? TX(500, 92, `${q.term} = ${q.answer}`, 'term ok', 'text-anchor="middle" font-size="76"')
    : q.words
      ? TX(500, 80, q.words, 'term', 'text-anchor="middle" font-size="38"')
      : TX(500, 92, q.term, 'term', 'text-anchor="middle" font-size="76"');
  // Beim Geteilt-Tipp kein Punktefeld: die Zahl der Reihen wäre schon die Lösung
  if (state === 'hint' && q.op !== 'mal') return head;
  return head + dotField(j.field, 125, 515, q.op === 'mal');
}

// ---------- Holzkran ----------
// Mittelalterlicher Tretradkran: Mast und Ausleger aus Balken mit Maserung und Eisenbändern, Schindeldach mit Wimpel,
// Kopfbänder und Hanfseile, großes Tretrad am Fuß. Steht links am Zahlenstrahl und rechts neben Mauer und Turm.

/** Strebe als eine Linie: zweimal zeichnen, dunkel breit und holzfarben schmal, das ergibt die Kontur. */
const beam = (d, cls = '') => `<path class="k-wood-o ${cls}" d="${d}"/><path class="k-wood ${cls}" d="${d}"/>`;
/** Hanfseil, ebenfalls mit Kontur. */
const rope = (x1, y1, x2, y2) => ['k-rope-o', 'k-rope']
  .map((c) => `<line class="${c}" x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}"/>`).join('');
/** Eisenteile (Haken, Kette, Zange) als Linie mit Kontur. */
const iron = (d) => `<path class="k-iron-o" d="${d}"/><path class="k-iron-l" d="${d}"/>`;
/** Eiserner Haken am Seilende (x, y). */
const hook = (x, y) => `M${x} ${y}v6a6 6 0 1 1 -6 6`;

/** Balken mit Maserung längs; bands: Eisenbänder bei diesen x (waagerecht) bzw. y (senkrecht). */
function timber(x, y, w, h, bands = []) {
  const hor = w >= h;
  const grain = (k, c) => `<path class="k-grain ${c}" d="${hor ? `M${n1(x + 8)} ${n1(y + h * k)}H${n1(x + w - 8)}` : `M${n1(x + w * k)} ${n1(y + 8)}V${n1(y + h - 8)}`}"/>`;
  let s = R(x, y, w, h, 'k-timber', 'rx="3"') + grain(0.34, '') + grain(0.68, 'b');
  for (const b of bands) s += hor ? R(b - 4, y - 1, 8, h + 2, 'k-band', 'rx="1.5"') : R(x - 1, b - 4, w + 2, 8, 'k-band', 'rx="1.5"');
  return s;
}

/** Schindeldach auf dem Mast: Traufe bei y, First bei y - h, darauf der Wimpel. */
function roof(cx, y, w, h) {
  let rows = '';
  for (let k = 1; k <= 2; k++) {
    const hw = w / 2 * (1 - k / 3), yy = n1(y - h * k / 3);
    rows += `M${n1(cx - hw)} ${yy}H${n1(cx + hw)}`;
    // versetzte Fugen zwischen den Schindeln
    for (let j = -2; j <= 2; j++) { const xx = cx + (j + (k % 2) / 2) * w / 7; if (Math.abs(xx - cx) < hw + w / 6 - 6) rows += `M${n1(xx)} ${yy}v${n1(h / 3)}`; }
  }
  return `<line class="k-pole" x1="${cx}" y1="${y - h}" x2="${cx}" y2="${y - h - 18}"/><path class="k-flag" d="M${cx} ${y - h - 18}l22 5l-22 5z"/>`
    + `<path class="k-roof" d="M${n1(cx - w / 2)} ${y}L${cx} ${y - h}L${n1(cx + w / 2)} ${y}z"/><path class="k-shingle" d="${rows}"/>`;
}

/** Tretrad auf einem Bock: zwei Felgen, dazwischen die Trittbretter, acht Speichen, Nabe. id: zum Drehen beim Abladen. */
function tretrad(cx, cy, r, id) {
  const p = (a, rr) => `${n1(cx + rr * Math.cos(a))} ${n1(cy + rr * Math.sin(a))}`;
  const ring = (rr) => `M${cx - rr} ${cy}a${rr} ${rr} 0 1 0 ${2 * rr} 0a${rr} ${rr} 0 1 0 ${-2 * rr} 0`;
  const ri = r - 12;
  let spokes = '', rungs = '';
  for (let i = 0; i < 4; i++) { const a = (i + 0.5) * Math.PI / 4; spokes += `M${p(a, ri)}L${p(a + Math.PI, ri)}`; }
  for (let i = 0; i < 24; i++) rungs += `M${p(i * Math.PI / 12, ri)}L${p(i * Math.PI / 12, r)}`;
  return beam(`M${n1(cx - r * 0.62)} ${G}L${cx} ${cy}L${n1(cx + r * 0.62)} ${G}`)
    + `<g${id ? ` id="${id}"` : ''}>${beam(spokes + rungs, 'thin')}${beam(ring(r) + ring(ri))}</g>`
    + `<circle class="k-hub" cx="${cx}" cy="${cy}" r="8"/>`;
}

/**
 * Holzkran: Mast bei mx, Ausleger von x0 bis x1 (Oberkante top, Unterkante bot), Dach auf dem Mast,
 * Seile vom Dach zu den Stellen stays, Kopfbänder links und rechts (knees), Tretrad wheel = [x, y, r, id].
 */
function holzkran({ mx, x0, x1, top, bot, stays, knees, wheel }) {
  const RH = 32, apex = top - RH;
  const [wx, wy, wr, id] = wheel;
  let s = stays.map((x) => rope(mx, apex + 6, x, top)).join('');
  const [kl, kr] = knees;
  if (kl) s += beam(`M${mx - 8} ${bot + kl}L${mx - kl} ${bot - 2}`);
  if (kr) s += beam(`M${mx + 8} ${bot + kr}L${mx + kr} ${bot - 2}`);
  s += timber(mx - 10, top, 20, G - 6 - top, [bot + 44, (bot + G) / 2]);
  const bands = [mx - 15, mx + 15];
  for (let x = x1 - 70; x > x0 + 40; x -= 170) if (Math.abs(x - mx) > 60) bands.push(x);
  s += timber(x0, top, x1 - x0, bot - top, bands);
  s += roof(mx, top + 1, 70, RH);
  s += R(mx - 24, G - 12, 48, 16, 'k-base', 'rx="3"');
  return s + rope(wx, wy, mx + 12, bot + 10) + tretrad(wx, wy, wr, id);
}

/** Laufkatze aus Holz mit zwei Eisenrädern am Ausleger (Unterkante yb), darunter die Seilrolle (Seil ab yb + 20); bei x = 0. */
function katze(yb) {
  return `<circle class="k-wheel" cx="-11" cy="${yb}" r="5.5"/><circle class="k-wheel" cx="11" cy="${yb}" r="5.5"/>`
    + R(-20, yb + 3, 40, 15, 'k-cart', 'rx="3"') + `<circle class="k-hub" cx="0" cy="${yb + 20}" r="5.5"/>`;
}

/** Kran rechts neben Mauer und Turm: Ausleger von from bis über den Mast; hookX: Laufkatze mit Seil und Haken bis hookY. */
function bauKran(from, hookX, hookY) {
  const BB = 50;
  let s = holzkran({ mx: 940, x0: from, x1: 990, top: 30, bot: BB, stays: [from + 40, (from + 940) / 2], knees: [48, 40], wheel: [940, 370, 54] });
  if (hookX != null) {
    s += rope(hookX, BB + 20, hookX, hookY) + `<g transform="translate(${hookX},0)">${katze(BB)}</g>` + iron(hook(hookX, hookY));
  }
  return s;
}

// ---------- Mauer und Turm ----------

/**
 * Eine Reihe aus n Steinen bei U Pixeln je Stein: Hunderter-Blöcke, Zehnerstangen, einzelne Steine.
 * over: Teil der Reihe liegt über dem Bauplan.
 */
function rowOf(x, y, n, U, RH, over) {
  const o = over ? ' over' : '';
  const { restH, restBars, restOnes } = mauerModel(n, Infinity);
  let g = '';
  let k = 0;
  for (let i = 0; i < restH; i++, k += 100) g += hbar(x + k * U, y, 100 * U, RH, 'blk-h' + o);
  for (let i = 0; i < restBars; i++, k += 10) g += hbar(x + k * U, y, 10 * U, RH, 'blk-z' + o);
  for (let i = 0; i < restOnes; i++, k += 1) g += R(x + k * U, y, U, RH, 'blk-e', 'rx="1"');
  return g;
}

/** Erklärt die Blöcke der Stufe 2: ein gelber Block sind 100 Steine. */
function legendH(x, y) {
  return hbar(x, y - 20, 60, 24, 'blk-h') + TX(x + 72, y, '= 100 Steine', 'lbl');
}

export function sceneMauer(t, value) {
  const big = t.stufe === 2;
  // Breite eines Steins so, dass kurze Reihen nicht winzig wirken (20 → 16, 90 → 8). Stufe 2: ein Hunderter höchstens 100 px
  const U = big ? Math.min(1, 760 / t.perRow) : Math.min(16, Math.floor(760 / t.perRow));
  const RH = 28, X0 = 60, MAXROWS = 12;
  let s = ground();
  // Haken rechts neben der Mauer: die Mauer reicht höchstens bis x = 820
  s += bauKran(600, 852, 210);
  if (big) s += legendH(X0, 52);
  if (value != null) {
    const m = mauerModel(value, t.perRow);
    const rowsTotal = m.full + (m.rest > 0 ? 1 : 0);
    const draw = Math.min(rowsTotal, MAXROWS);
    for (let r = 0; r < draw; r++) {
      const y = G - (r + 1) * RH;
      s += `<g class="b" style="--i:${r}">${rowOf(X0, y, r < m.full ? t.perRow : m.rest, U, RH, r >= t.rows)}</g>`;
    }
    if (rowsTotal > MAXROWS) s += TX(X0 + t.perRow * U, 72 + (big ? 30 : 0), `… und noch ${fmt(rowsTotal - MAXROWS)} Reihen darüber`, 'lbl warn', 'text-anchor="end"');
  }
  s += R(X0, G - t.rows * RH, t.perRow * U, t.rows * RH, 'plan');
  s += TX(X0, G + 44, `Bauplan: ${t.rows} Reihen, je ${t.perRow} Steine`, 'lbl');
  return s;
}

/** Stufe 2: Mauer mit gegebener Reihenzahl, die Steine werden auf gleich lange Reihen verteilt. */
export function sceneReihe(t, value) {
  const RH = 28, X0 = 380, W = 540;
  let s = ground();
  s += legendH(X0, 52);
  let left = t.total;
  if (value != null && value > 0) {
    const U = Math.min(1, W / Math.max(value, t.answer));
    const m = reiheModel(t, value);
    left = m.left;
    for (let r = 0; r < m.full; r++) s += `<g class="b" style="--i:${r}">${rowOf(X0, G - (r + 1) * RH, value, U, RH, false)}</g>`;
    if (m.full < t.rows) {
      const y = G - (m.full + 1) * RH;
      s += `<g class="b" style="--i:${m.full}">${rowOf(X0, y, m.part, U, RH, false)}</g>`;
      // Was für die Reihen fehlt: als Bauplan, damit man sieht, wie weit die Steine reichen
      s += R(X0, G - t.rows * RH, Math.min(value * U, W), (t.rows - m.full) * RH, 'plan');
      s += TX(X0 + Math.min(value * U, W), G - t.rows * RH - 12, 'Hier fehlen Steine', 'lbl warn', 'text-anchor="end"');
    }
  }
  // Reihen-Leiste links der Mauer
  s += `<path class="pole" d="M${X0 - 14} ${G} V${G - t.rows * RH} M${X0 - 22} ${G - t.rows * RH} h16"/>`;
  s += TX(X0, G + 44, `Bauplan: ${t.rows} Reihen, alle gleich lang`, 'lbl');
  s += lagerT(30, t.total, left);
  return s;
}

/**
 * Lager der Stufe 2: Tausenderwürfel (3 nebeneinander, bis 3 übereinander), Hunderterplatten, darauf Zehnerstangen
 * und einzelne Steine. Der Rest wird neu gebündelt, der volle Bestand bleibt als Umriss stehen. Braucht höchstens 290 px ab x.
 */
function lagerT(x, total, left) {
  const C = 42, D = 11, PITCH = C + D + 5, P = 42, OFF = 5, BW = 4.2, BP = 5.2;
  const all = bundlesT(total);
  const rest = bundlesT(Math.max(0, left));
  const cubeX = (i) => x + (i % 3) * PITCH;
  const cubeY = (i) => G - C - Math.floor(i / 3) * PITCH;
  const px = x + 3 * PITCH;
  const plateX = (i) => px + i * OFF;
  const plateY = (i) => G - P - i * OFF;
  const nt = Math.max(all.t, rest.t);
  const nh = Math.max(all.h, rest.h);
  let s = '';
  // Hinten (oben) zuerst, damit die vorderen Würfel davor liegen
  for (let i = nt - 1; i >= 0; i--) {
    if (i < rest.t) s += cube(cubeX(i), cubeY(i), C, D, 'blk-t');
    else if (i < all.t) s += cube(cubeX(i), cubeY(i), C, D, 'ghost');
  }
  for (let i = nh - 1; i >= 0; i--) {
    if (i < rest.h) s += plate(plateX(i), plateY(i), P, 'blk-h');
    else if (i < all.h) s += plate(plateX(i), plateY(i), P, 'ghost');
  }
  const base = nh ? plateY(nh - 1) - 4 : G;
  for (let j = 0; j < rest.z; j++) s += vbar(px + j * BP, base - P, BW, P, 'blk-z');
  for (let k = 0; k < rest.e; k++) s += R(px + rest.z * BP + 3 + k * BP, base - BW, BW, BW, 'blk-e');
  const top = Math.min(nt ? cubeY(nt - 1) - D : G, rest.z ? base - P : base);
  s += TX(x, top - 16, `Lager: ${fmt(left)} Steine`, 'lbl');
  return s;
}

function lager(x, total, left) {
  const P = 64;
  const all = bundles(total);
  const rest = bundles(left);
  const plateX = (i) => x + i * 8;
  const plateY = (i) => G - P - i * 8;
  const barX = (j) => x + P + Math.max(0, all.h - 1) * 8 + 16 + j * 12;
  let s = '';
  if (left !== total) {
    for (let i = all.h - 1; i >= 0; i--) s += plate(plateX(i), plateY(i), P, 'ghost');
    for (let j = 0; j < all.z; j++) s += R(barX(j), G - P, 8, P, 'ghost');
  }
  for (let i = rest.h - 1; i >= 0; i--) s += plate(plateX(i), plateY(i), P, 'blk-h');
  for (let j = 0; j < rest.z; j++) s += vbar(barX(j), G - P, 8, P, 'blk-z');
  s += TX(x, G - P - Math.max(0, all.h - 1) * 8 - 18, `Lager: ${left} Steine`, 'lbl');
  return s;
}

export function sceneTurm(t, value) {
  const big = t.stufe === 2;
  // Stufe 2: rechts vom breiteren Lager und etwas schmaler, damit die Beschriftung nicht an den Kran stößt
  const U = big ? Math.min(1, 420 / t.perLayer) : Math.min(10, Math.floor(450 / t.perLayer));
  const LH = 32, X = big ? 350 : 330, MAXL = 12;
  const layerW = t.perLayer * U;
  const cx = X + layerW / 2;
  let built = 0;
  let left = t.total;
  if (value != null) ({ built, left } = turmModel(t, value));
  let s = ground();
  // Der Haken hängt über der Turmmitte knapp über der obersten Lage
  s += bauKran(300, cx, G - built * LH - 26);
  s += big ? lagerT(30, t.total, left) + legendH(30, 110) : lager(30, t.total, left);
  for (let l = 0; l < built; l++) {
    s += `<g class="b" style="--i:${l}">${rowOf(X, G - (l + 1) * LH, t.perLayer, U, LH, false)}</g>`;
  }
  if (value != null) {
    s += TX(X + layerW + 16, G - built * LH + 24, `${built} ${built === 1 ? 'Lage' : 'Lagen'}`, 'lbl');
    if (value > t.layers) {
      const showL = Math.min(value, MAXL);
      s += R(X, G - showL * LH, layerW, (showL - built) * LH, 'plan');
      s += TX(X - 16, G - showL * LH + 24, `Geplant: ${fmt(value)} Lagen`, 'lbl warn', 'text-anchor="end"');
    }
  }
  return s;
}

// ---------- Burghof (Stufe 2): Zehner mal Zehner als Hunderterplatten ----------

/** Ein Plattenstreifen der Höhe h: n Steine breit, je Stein sw Pixel; volle Zehner als Platten, der Rest als Zehnerstangen. */
function band(x, y, n, sw, h, cls) {
  let s = '';
  const full = Math.floor(n / 10);
  for (let k = 0; k < full; k++) s += rplate(x + k * 10 * sw, y, 10 * sw, h, cls);
  for (let k = 0; k < n % 10; k++) s += vbar(x + (full * 10 + k) * sw, y, sw, h, 'blk-z');
  return s;
}

/** Gepflasterter Hof von oben: Reihen · Steine je Reihe. Die Antwort füllt Platte für Platte. */
export function sceneHof(t, value) {
  const a = t.rows / 10;
  const b = t.perRow / 10;
  const P = Math.min(56, Math.floor(560 / b), Math.floor(300 / a));
  const w = b * P;
  const h = a * P;
  const x0 = Math.round(500 - w / 2);
  const y0 = 96;
  let s = R(x0 - 14, y0 - 14, w + 28, h + 28, 'hof', 'rx="8"');
  s += TX(x0 + w / 2, y0 - 26, `je ${t.perRow} Steine`, 'lbl', 'text-anchor="middle"');
  s += TX(x0 - 26, y0 + h / 2 + 8, `${t.rows} Reihen`, 'lbl', 'text-anchor="end"');
  if (value != null) {
    const cap = a * b;
    const full = Math.min(cap, Math.floor(value / 100));
    for (let i = 0; i < full; i++) {
      const r = Math.floor(i / b);
      s += `<g class="b" style="--i:${r}">${plate(x0 + (i % b) * P, y0 + r * P, P, 'blk-h')}</g>`;
    }
    const rest = value - full * 100;
    if (full < cap && rest > 0) {
      // Angefangene Platte: Zehnerstangen und einzelne Steine
      const px = x0 + (full % b) * P;
      const py = y0 + Math.floor(full / b) * P;
      const z = Math.floor(rest / 10);
      let g = '';
      for (let k = 0; k < z; k++) g += vbar(px + k * P / 10, py, P / 10, P, 'blk-z');
      for (let k = 0; k < rest % 10; k++) g += R(px + z * P / 10, py + k * P / 10, P / 10, P / 10, 'blk-e');
      s += `<g class="b" style="--i:${Math.floor(full / b)}">${g}</g>`;
    }
    if (value > cap * 100) {
      const extra = value - cap * 100;
      const n = Math.min(9, Math.ceil(extra / 100));
      for (let i = n - 1; i >= 0; i--) s += plate(x0 + w + 40 + i * 6, y0 + h - P - i * 6, P, 'blk-h over');
      s += TX(x0 + w / 2, y0 + h + 52, `${fmt(extra)} Steine bleiben übrig`, 'lbl warn', 'text-anchor="middle"');
    }
  }
  s += R(x0, y0, w, h, 'plan');
  s += legendP(30, 56);
  return s;
}

/** Erklärt die Platten im Hof: 10 · 10 = 100 Steine. */
function legendP(x, y) {
  return plate(x, y - 30, 36, 'blk-h') + TX(x + 48, y, 'Platte: 10 · 10 = 100 Steine', 'lbl');
}

/** Hof mit gegebener Reihenzahl; die gelieferten Steine reichen für eine bestimmte Länge. */
export function sceneHofteil(t, value) {
  const a = t.rows / 10;
  const PH = Math.min(56, Math.floor(260 / a));
  const X0 = 400, W = 540, y0 = 110;
  const h = a * PH;
  let s = ground();
  s += R(X0 - 14, y0 - 14, W + 28, h + 28, 'hof', 'rx="8"');
  s += TX(X0, y0 - 28, `${t.rows} Reihen, alle gleich lang`, 'lbl');
  s += `<path class="pole" d="M${X0} ${y0 - 6} V${y0 + h + 6}"/>`;
  let left = t.total;
  if (value != null && value > 0) {
    const sw = Math.min(PH / 10, W / Math.max(value, t.answer));
    const solid = Math.min(value, t.answer);
    left = t.total - t.rows * solid;
    for (let r = 0; r < a; r++) s += `<g class="b" style="--i:${r}">${band(X0, y0 + r * PH, solid, sw, PH, 'blk-h')}</g>`;
    if (value > t.answer) {
      const mw = Math.min(W, value * sw) - solid * sw;
      s += R(X0 + solid * sw, y0, mw, h, 'plan');
      s += TX(X0 + solid * sw + mw, y0 + h + 40, 'Hier fehlen Steine', 'lbl warn', 'text-anchor="end"');
    }
  }
  s += lagerT(30, t.total, left);
  s += legendP(30, 70);
  return s;
}

// ---------- Kran am Zahlenstrahl ----------
// Holzkran links mit Tretrad, Ausleger über die ganze Breite, Zahlenstrahl als Messlatte aus Holz auf dem Boden.

export const KX0 = 60, KX1 = 940, KY = 404;
export const kx = (v, max) => KX0 + (KX1 - KX0) * v / max;
/** Last (Steinquader, um LS vergrößert): Höhe beim Zielen und beim Aufsetzen auf der Messlatte, Haken darüber. */
const LS = 1.25;
export const KDROP = [200, KY - 30 * LS];
export const KHOOK = 26 * LS;
const JT = 48, JB = 68; // Ausleger: Ober- und Unterkante
/** Tretrad: Mitte und Radius; app.js dreht es beim Abladen. */
export const KWHEEL = [96, 336, 64];

function kranBackdrop() {
  const cloud = (x, y, k) => `<path class="k-cloud" d="M${x} ${y}a${18 * k} ${18 * k} 0 0 1 ${30 * k} ${-14 * k}a${22 * k} ${22 * k} 0 0 1 ${40 * k} ${2 * k}a${16 * k} ${16 * k} 0 0 1 ${22 * k} ${12 * k}z"/>`;
  return cloud(150, 170, 1.3) + cloud(560, 135, 1) + cloud(800, 205, 0.8)
    + `<path class="k-hill far" d="M0 ${G}C120 330 300 320 470 ${G}z"/>`
    + `<path class="k-hill" d="M380 ${G}C560 350 820 340 1000 372V${G}z"/>`
    + farCastle(176, 362)
    + R(0, G, 1000, 84, 'ground') + R(0, G, 1000, 8, 'ground2');
}

/** Die Burg in der Ferne, an der gebaut wird: zwei Türme, Mauer und Bergfried mit Zinnen. */
function farCastle(x, base) {
  const block = (x0, w, top) => {
    let d = `M${x0} ${base}V${top}`;
    for (let i = 0, cx = x0; cx < x0 + w - 0.1; i++, cx += 4) d += `${i % 2 ? `V${top}` : `V${top - 4}`}H${Math.min(cx + 4, x0 + w)}`;
    return `${d}V${base}z`;
  };
  return `<path class="k-castle" d="${block(x + 14, 64, base - 18)}${block(x + 34, 22, base - 40)}${block(x, 16, base - 32)}${block(x + 76, 16, base - 32)}"/>`
    + `<path class="k-castle" d="M${x + 45} ${base - 44}v-14l12 4l-12 4"/>`;
}

function kranCrane() {
  return holzkran({ mx: 36, x0: 4, x1: 994, top: JT, bot: JB, stays: [420, 760], knees: [0, 0], wheel: [...KWHEEL, 'tread'] });
}

function kranRuler(max) {
  const size = max >= 1000000 ? 16 : max >= 100000 ? 19 : max >= 10000 ? 22 : 24;
  const y0 = KY, h = 54;
  let s = R(40, y0, 940, h, 'k-ruler alt', 'rx="6"');
  // Zehntel abwechselnd hell und dunkel, damit man die Abschnitte vom Sofa aus zählen kann
  for (let i = 0; i < 10; i += 2) s += R(kx(i * max / 10, max), y0 + 1.5, kx(max / 10, max) - KX0, h - 3, 'k-ruler');
  for (let i = 0; i <= 100; i++) {
    const x = n1(kx(i * max / 100, max));
    const len = i % 10 === 0 ? 22 : i % 5 === 0 ? 15 : 8;
    s += `<line class="k-tick${i % 10 === 0 ? ' major' : ''}" x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + len}"/>`;
    if (i % 10 === 0) s += TX(x, y0 + 47, fmt(i * max / 100), 'k-num', `text-anchor="middle" font-size="${size}"`);
  }
  return s + R(40, y0, 940, h, 'k-ruler-o', 'rx="6"');
}

/** Steinquader in der Steinzange, darüber der Haken; Unterkante bei y = 30. */
function kranLoad() {
  const arm = (m) => `M${-9 * m} -4L0 1C${12 * m} 5 ${29 * m} 2 ${30 * m} 12L${25 * m} 15`;
  return `<g transform="scale(${LS})">`
    + R(-25, 7, 50, 23, 'k-block', 'rx="3"') + R(-21, 10, 42, 3.5, 'k-block-hl', 'rx="1.5"')
    + `<path class="k-chisel" d="M-15 17l4 8M-3 16l4 8M10 17l4 8"/>`
    + iron(`${hook(0, -26)}M-3 -11a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M0 -8L-9 -4M0 -8L9 -4${arm(1)}${arm(-1)}`)
    + `<circle class="k-puff" cx="-34" cy="24" r="9"/><circle class="k-puff" cx="34" cy="24" r="9"/><circle class="k-puff" cx="-18" cy="30" r="7"/><circle class="k-puff" cx="18" cy="30" r="7"/></g>`;
}

export function sceneKran(t) {
  const max = t.max;
  let s = kranBackdrop() + kranCrane() + kranRuler(max);
  s += `<g id="flag"></g>`;
  s += `<g id="trolley" transform="translate(${kx(max / 2, max)},0)">`
    + `<ellipse class="k-shadow" cx="0" cy="${KY}" rx="38" ry="6"/>`
    + `<g id="rope">${rope(0, JB + 20, 0, KDROP[0] - KHOOK)}</g>` + katze(JB)
    + `<g id="load" transform="translate(0,${KDROP[0]})">${kranLoad()}</g></g>`;
  // Schild und Stern liegen vor Seil und Last
  return s + `<g id="flagtop"></g>`;
}

/**
 * Nach dem Abladen: Zielfahne mit Schild; daneben ein Pfeil von der Last zum Ziel, bei Volltreffer ein Stern.
 * Gibt [hinten, vorn] zurück: Fahne und Pfeil hinter die Last, Schild und Stern davor.
 */
export function kranFlag(t, value, hit) {
  const fx = n1(kx(t.target, t.max));
  const label = `Ziel ${fmt(t.target)}`;
  const w = label.length * 12.5 + 24;
  const bx = n1(Math.min(1000 - w - 4, Math.max(4, fx - w / 2)));
  let s = '';
  if (value !== undefined && !hit) {
    const vx = kx(value, t.max);
    const dir = Math.sign(fx - vx);
    const from = vx + dir * 40, to = fx - dir * 6;
    if ((to - from) * dir > 14) {
      const y = KY - 15;
      s += `<line class="k-gap" x1="${n1(from)}" y1="${y}" x2="${n1(to - dir * 10)}" y2="${y}"/>`
        + `<path class="k-gaphead" d="M${n1(to)} ${y}l${-dir * 16} -10v20z"/>`;
    }
  }
  s += `<line class="k-pole" x1="${fx}" y1="${KY}" x2="${fx}" y2="${KY - 100}"/>`
    + `<path class="k-flag" d="M${fx} ${KY - 100}l40 7l-11 6l11 6l-40 7z"/>`;
  let top = R(bx, KY - 146, w, 36, 'k-tag', 'rx="10"')
    + TX(n1(bx + w / 2), KY - 119, label, 'k-tagt', 'text-anchor="middle"');
  if (hit) top += `<path class="k-star" d="${starPath(fx, KY - 172, 20)}"/>`;
  return [s, top];
}

function starPath(cx, cy, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += `${i ? 'L' : 'M'}${n1(cx + rr * Math.cos(a))} ${n1(cy + rr * Math.sin(a))}`;
  }
  return d + 'z';
}
