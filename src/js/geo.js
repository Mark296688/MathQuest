// Steinmetzhütte: Formen aus Teilen zusammensetzen (Buch S. 20, AH 10) und Faltschnitte (Buch S. 21).
// Formen liegen auf einem Kästchengitter. Jedes Kästchen ist in vier Dreiecke geteilt (oben, rechts, unten, links),
// so gehen auch halbe Kästchen mit schräger Kante. Ein Teil ist eine Liste solcher Viertel [x, y, q].
// Teile dürfen gedreht werden (Fußnote S. 20: „Teile gedanklich drehen“). Die Aufgaben prüft ein Löser:
// Nur die gedachten Teile passen zusammen, auch wenn man ein Teil umklappt.
import { randInt, pick, shuffle } from './rng.js';

export const N = 0, E = 1, S = 2, W = 3;
const HALF = { nw: [N, W], ne: [N, E], se: [S, E], sw: [S, W] };
const k3 = (x, y, q) => `${x},${y},${q}`;

/** Ganzes Kästchen. */
export const full = (x, y) => [[x, y, N], [x, y, E], [x, y, S], [x, y, W]];
/** Halbes Kästchen mit dem rechten Winkel in der Ecke corner ('nw', 'ne', 'se', 'sw'). */
export const half = (x, y, corner) => HALF[corner].map((q) => [x, y, q]);

/** Nach oben links schieben und sortieren. */
export function normalize(units) {
  let mx = Infinity;
  let my = Infinity;
  for (const [x, y] of units) { if (x < mx) mx = x; if (y < my) my = y; }
  return units.map(([x, y, q]) => [x - mx, y - my, q]).sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
}
export const shapeKey = (units) => normalize(units).map((u) => u.join(',')).join(';');
/** 90° im Uhrzeigersinn (Bildschirm: y nach unten). */
export const rotate = (units) => units.map(([x, y, q]) => [-y - 1, x, (q + 1) % 4]);
/** Umklappen (links und rechts tauschen). */
export const mirror = (units) => units.map(([x, y, q]) => [-x - 1, y, q === E ? W : q === W ? E : q]);
export function rotateN(units, k) {
  let u = units;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) u = rotate(u);
  return u;
}
/** Fläche in Kästchen (halbe zählen halb). */
export const area = (units) => units.length / 4;
/** Breite und Höhe in Kästchen. */
export function bbox(units) {
  const n = normalize(units);
  let w = 0;
  let h = 0;
  for (const [x, y] of n) { if (x + 1 > w) w = x + 1; if (y + 1 > h) h = y + 1; }
  return { w, h };
}

/** Alle verschiedenen Lagen eines Teils: Drehung k, umgeklappt m. */
function variants(units, withMirror) {
  const out = [];
  const seen = new Set();
  const bases = withMirror ? [units, mirror(units)] : [units];
  bases.forEach((b, m) => {
    for (let k = 0; k < 4; k++) {
      const v = normalize(rotateN(b, k));
      const s = v.map((u) => u.join(',')).join(';');
      if (!seen.has(s)) { seen.add(s); out.push({ k, m: m === 1, units: v }); }
    }
  });
  return out;
}

/** Gleiche Form, auch gedreht oder umgeklappt? */
export function congruent(a, b) {
  if (a.length !== b.length) return false;
  const kb = shapeKey(b);
  return variants(a, true).some((v) => v.units.map((u) => u.join(',')).join(';') === kb);
}

/**
 * Lassen sich die Teile ohne Lücke und ohne Überlappung zur Form legen? Liefert je Teil die Drehung k, ob umgeklappt (m)
 * und die Verschiebung (dx, dy) des normalisierten, gedrehten Teils in der normalisierten Form; sonst null.
 */
export function solve(target, pieces, withMirror = false) {
  const tgt = normalize(target);
  if (pieces.reduce((s, p) => s + p.length, 0) !== tgt.length) return null;
  const rest = new Set(tgt.map((u) => u.join(',')));
  const vs = pieces.map((p) => variants(p, withMirror));
  const placed = pieces.map(() => null);
  const first = () => {
    let best = null;
    for (const s of rest) {
      const u = s.split(',').map(Number);
      if (!best || u[1] < best[1] || (u[1] === best[1] && (u[0] < best[0] || (u[0] === best[0] && u[2] < best[2])))) best = u;
    }
    return best;
  };
  // Die erste freie Stelle (oben links) muss ein noch nicht gelegtes Teil bedecken
  const go = () => {
    if (!rest.size) return placed.every(Boolean);
    const f = first();
    for (let j = 0; j < pieces.length; j++) {
      if (placed[j]) continue;
      for (const v of vs[j]) {
        for (const a of v.units) {
          if (a[2] !== f[2]) continue;
          const dx = f[0] - a[0];
          const dy = f[1] - a[1];
          const keys = v.units.map(([x, y, q]) => k3(x + dx, y + dy, q));
          if (!keys.every((k) => rest.has(k))) continue;
          keys.forEach((k) => rest.delete(k));
          placed[j] = { k: v.k, m: v.m, dx, dy };
          if (go()) return true;
          placed[j] = null;
          keys.forEach((k) => rest.add(k));
        }
      }
    }
    return false;
  };
  return go() ? placed : null;
}

// ---------- Zusammenhang und Kästchen ----------

/** Nachbarn eines Viertels: die beiden anderen Viertel im Kästchen daneben und das Viertel im Nachbarkästchen. */
function unitNeighbors([x, y, q]) {
  const out = [[x, y, (q + 1) % 4], [x, y, (q + 3) % 4]];
  if (q === N) out.push([x, y - 1, S]);
  else if (q === E) out.push([x + 1, y, W]);
  else if (q === S) out.push([x, y + 1, N]);
  else out.push([x - 1, y, E]);
  return out;
}

/** Hängt das Teil zusammen? */
export function connected(units) {
  if (!units.length) return false;
  const set = new Set(units.map((u) => u.join(',')));
  const seen = new Set([units[0].join(',')]);
  const stack = [units[0]];
  while (stack.length) {
    for (const n of unitNeighbors(stack.pop())) {
      const k = n.join(',');
      if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push(n); }
    }
  }
  return seen.size === set.size;
}

/** Kästchen eines Teils: je Kästchen die Viertel, die dazugehören. */
function cellsOf(units) {
  const m = new Map();
  for (const [x, y, q] of units) {
    const k = `${x},${y}`;
    if (!m.has(k)) m.set(k, { x, y, qs: new Set() });
    m.get(k).qs.add(q);
  }
  return [...m.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}
const unitsOfCells = (cells) => cells.flatMap((c) => [...c.qs].sort().map((q) => [c.x, c.y, q]));

/** Kästchen-Nachbarschaft über eine ganze Kante (halbe Kästchen nur über ihre geraden Seiten). */
function cellGraph(cells) {
  const idx = new Map(cells.map((c, i) => [`${c.x},${c.y}`, i]));
  return cells.map((c) => {
    const out = [];
    const nb = (dx, dy, mine, theirs) => {
      const j = idx.get(`${c.x + dx},${c.y + dy}`);
      if (j !== undefined && c.qs.has(mine) && cells[j].qs.has(theirs)) out.push(j);
    };
    nb(1, 0, E, W); nb(-1, 0, W, E); nb(0, 1, S, N); nb(0, -1, N, S);
    return out;
  });
}

/** Ein Rechteck aus ganzen Kästchen? */
function isRect(units) {
  const cells = cellsOf(units);
  if (cells.some((c) => c.qs.size !== 4)) return false;
  const { w, h } = bbox(units);
  return cells.length === w * h;
}

/** Hat das Teil ein Loch (ein leeres Kästchen, das ganz umschlossen ist)? */
function hasHole(units) {
  const n = normalize(units);
  const { w, h } = bbox(n);
  const occ = new Set(n.map(([x, y]) => `${x},${y}`));
  const seen = new Set();
  const stack = [[-1, -1]];
  while (stack.length) {
    const [x, y] = stack.pop();
    const k = `${x},${y}`;
    if (x < -1 || y < -1 || x > w || y > h || seen.has(k) || occ.has(k)) continue;
    seen.add(k);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return (w + 2) * (h + 2) - seen.size !== occ.size;
}

/** Kästchen mit nur einem Nachbarn im Teil (Zipfel). */
function tips(units) {
  const cells = cellsOf(units);
  return cellGraph(cells).filter((nb) => nb.length <= 1).length;
}

// ---------- Formen ----------

export const SHAPE_NAME = { quadrat: 'Quadrat', rechteck: 'Rechteck', dreieck: 'Dreieck' };

function rectShape(w, h) {
  const u = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) u.push(...full(x, y));
  return u;
}
/** Rechtwinkliges Dreieck: Schenkel n, rechter Winkel unten links. */
function rightTriangle(n) {
  const u = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < y; x++) u.push(...full(x, y));
    u.push(...half(y, y, 'sw'));
  }
  return u;
}
/** Dreieck mit Spitze oben: unten 2n Kästchen breit, n hoch. */
function roofTriangle(n) {
  const u = [];
  for (let y = 0; y < n; y++) {
    u.push(...half(n - 1 - y, y, 'se'));
    for (let x = n - y; x < n + y; x++) u.push(...full(x, y));
    u.push(...half(n + y, y, 'sw'));
  }
  return u;
}

function makeTarget(r, form) {
  if (form === 'quadrat') { const n = pick(r, [4, 5, 5]); return rectShape(n, n); }
  if (form === 'rechteck') { const [w, h] = pick(r, [[5, 3], [6, 3], [5, 4], [6, 4]]); return rectShape(w, h); }
  return r() < 0.5 ? rightTriangle(pick(r, [5, 6])) : roofTriangle(pick(r, [3, 4]));
}

/**
 * Form in k zusammenhängende Teile schneiden, entlang der Kästchenkanten. Die Teile wachsen von zufälligen Startkästchen aus,
 * Kästchen mit mehr Nachbarn im Teil kommen eher dazu (kompakte Teile wie im Buch). Ohne Erfolg: null.
 */
function cut(r, target, k, minFrac, maxFrac) {
  const cells = cellsOf(target);
  const nb = cellGraph(cells);
  const owner = cells.map(() => -1);
  const sizes = new Array(k).fill(0);
  const order = shuffle(r, cells.map((_, i) => i));
  for (let p = 0; p < k; p++) { owner[order[p]] = p; sizes[p] += cells[order[p]].qs.size; }
  let left = cells.length - k;
  while (left > 0) {
    const ps = [...Array(k).keys()].sort((a, b) => sizes[a] - sizes[b] || a - b);
    let grown = false;
    for (const p of ps) {
      const front = [];
      cells.forEach((_, i) => {
        if (owner[i] !== -1) return;
        const n = nb[i].filter((j) => owner[j] === p).length;
        if (n) front.push([i, n * n * n]);
      });
      if (!front.length) continue;
      let x = r() * front.reduce((s, f) => s + f[1], 0);
      let take = front[front.length - 1][0];
      for (const [i, wgt] of front) { if ((x -= wgt) < 0) { take = i; break; } }
      owner[take] = p;
      sizes[p] += cells[take].qs.size;
      left--;
      grown = true;
      break;
    }
    if (!grown) return null;
  }
  if (sizes.some((s) => s < minFrac * target.length || s > maxFrac * target.length)) return null;
  const pieces = [...Array(k).keys()].map((p) => unitsOfCells(cells.filter((_, i) => owner[i] === p)));
  if (pieces.some((p) => !connected(p) || hasHole(p) || tips(p) > 2)) return null;
  if (pieces.every(isRect)) return null; // gerade durchgeschnitten wäre zu leicht
  return pieces.map(normalize);
}

/** Ein Teil leicht verändern: ein Kästchen dazu, weg oder versetzt. So entsteht das Teil, das übrig bleibt. */
function tweak(r, piece) {
  const cells = cellsOf(piece);
  const has = new Set(cells.map((c) => `${c.x},${c.y}`));
  const fullCells = cells.filter((c) => c.qs.size === 4);
  const addSpots = () => {
    const out = [];
    for (const c of cells) {
      for (const [dx, dy, side] of [[1, 0, E], [-1, 0, W], [0, 1, S], [0, -1, N]]) {
        const k = `${c.x + dx},${c.y + dy}`;
        if (c.qs.has(side) && !has.has(k) && !out.some((o) => o.k === k)) out.push({ k, x: c.x + dx, y: c.y + dy });
      }
    }
    return out;
  };
  const removable = fullCells.filter((c) => {
    const rest = unitsOfCells(cells.filter((d) => d !== c));
    return rest.length && connected(rest);
  });
  for (const op of shuffle(r, ['add', 'remove', 'move'])) {
    if (op === 'add') {
      const s = addSpots();
      if (s.length) { const a = pick(r, s); return normalize([...piece, ...full(a.x, a.y)]); }
    } else if (op === 'remove' && removable.length && cells.length > 3) {
      const c = pick(r, removable);
      return normalize(unitsOfCells(cells.filter((d) => d !== c)));
    } else if (op === 'move' && removable.length && cells.length > 3) {
      const c = pick(r, removable);
      const rest = cells.filter((d) => d !== c);
      const back = unitsOfCells(rest);
      const spots = addSpots().filter((s) => s.k !== `${c.x},${c.y}`)
        .filter((s) => connected([...back, ...full(s.x, s.y)]));
      if (spots.length) { const a = pick(r, spots); return normalize([...back, ...full(a.x, a.y)]); }
    }
  }
  return null;
}

/** Alle Auswahlen von k Teilen (Indizes), die zusammen die Form ergeben; umklappen erlaubt. */
export function validGroups(target, pieces, k) {
  const out = [];
  const rec = (start, chosen) => {
    if (chosen.length === k) {
      const sel = chosen.map((i) => pieces[i]);
      if (sel.reduce((s, p) => s + p.length, 0) === target.length && solve(target, sel, true)) out.push(chosen.slice());
      return;
    }
    for (let i = start; i < pieces.length; i++) { chosen.push(i); rec(i + 1, chosen); chosen.pop(); }
  };
  rec(0, []);
  return out;
}

const LETTERS = 'ABCDEFGH';
/** Längste Seite eines Teils in Kästchen. */
export const MAX_LEN = 6;

/**
 * Aufgabe „Welche zwei Teile ergeben jeweils diese Form?“ (form: quadrat, rechteck, dreieck), zwei Paare und ein Teil,
 * das übrig bleibt. Mit drei = true: „Welche drei Teile ergeben dieses Rechteck?“ (ein Dreierpack, zwei übrig).
 * turn = false: Teile ungedreht (nur beim allerersten Mal).
 */
export function makeZusammen(r, form, { drei = false, turn = true } = {}) {
  for (let tries = 0; tries < 400; tries++) {
    const target = drei ? rectShape(...pick(r, [[6, 4], [5, 4], [5, 5]])) : makeTarget(r, form);
    let groups;
    let pieces;
    if (drei) {
      const c = cut(r, target, 3, 0.2, 0.45);
      if (!c) continue;
      const t1 = tweak(r, c[0]);
      const t2 = tweak(r, c[1 + randInt(r, 0, 1)]);
      if (!t1 || !t2) continue;
      pieces = [...c, t1, t2];
      groups = [[0, 1, 2]];
    } else {
      const a = cut(r, target, 2, 0.3, 0.7);
      const b = a && cut(r, target, 2, 0.3, 0.7);
      if (!b) continue;
      const t = tweak(r, pick(r, [...a, ...b]));
      if (!t) continue;
      pieces = [...a, ...b, t];
      groups = [[0, 1], [2, 3]];
    }
    // Höchstens 6 Kästchen lang, sonst passen die Teile nicht neben die Form
    if (pieces.some((p) => { const b = bbox(p); return Math.max(b.w, b.h) > MAX_LEN; })) continue;
    // Kein Teil darf einem anderen gleichen, sonst gäbe es mehrere Lösungen oder Verwechslungen
    if (pieces.some((p, i) => pieces.some((q, j) => j > i && congruent(p, q)))) continue;
    const need = groups[0].length;
    const found = validGroups(target, pieces, need);
    if (found.length !== groups.length || !groups.every((g) => found.some((f) => f.join() === g.join()))) continue;
    if (drei && validGroups(target, pieces, 2).length) continue;
    // Die echten Gruppen gehen ohne Umklappen
    if (!groups.every((g) => solve(target, g.map((i) => pieces[i]), false))) continue;
    const order = shuffle(r, pieces.map((_, i) => i));
    const shown = order.map((i, slot) => ({ id: LETTERS[slot], units: pieces[i], rot: turn ? randInt(r, 0, 3) : 0 }));
    const remap = (g) => g.map((i) => order.indexOf(i)).sort((x, y) => x - y);
    return {
      kind: 'geo', form: drei ? 'rechteck' : form, drei, target: normalize(target),
      pieces: shown, groups: groups.map(remap).sort((a, b) => a[0] - b[0]), need,
    };
  }
  throw new Error(`Keine Aufgabe gefunden (${form})`);
}

/** Ist die Auswahl (Indizes) richtig? Dann mit der Lage jedes Teils in der Form, sonst null. */
export function checkZusammen(t, sel) {
  if (sel.length !== t.need) return null;
  const pieces = sel.map((i) => t.pieces[i].units);
  return solve(t.target, pieces, false) || solve(t.target, pieces, true);
}

/** „12½“ */
export function fmtArea(a) {
  const whole = Math.floor(a);
  const frac = a - whole;
  return frac === 0.5 ? (whole ? `${whole}½` : '½') : String(a);
}

/** Tipp nach einer falschen Auswahl: über die Zahl der Kästchen, ohne die Lösung zu verraten. */
export function hintZusammen(t, sel) {
  const name = SHAPE_NAME[t.form];
  const tA = area(t.target);
  const a = sel.reduce((s, i) => s + area(t.pieces[i].units), 0);
  const ids = sel.map((i) => t.pieces[i].id);
  const who = ids.length === 2 ? `${ids[0]} und ${ids[1]}` : `${ids.slice(0, -1).join(', ')} und ${ids[ids.length - 1]}`;
  if (a < tA) return `Das ${name} hat ${fmtArea(tA)} Kästchen. ${who} haben zusammen nur ${fmtArea(a)}.`;
  if (a > tA) return `Das ${name} hat ${fmtArea(tA)} Kästchen. ${who} haben zusammen ${fmtArea(a)}, das ist zu viel.`;
  return `Die Kästchen reichen genau (${fmtArea(tA)}), aber die Formen passen nicht ineinander. Dreh die Teile in Gedanken.`;
}

// ---------- Faltschnitte ----------

/** Kästchen je Seite im zweimal gefalteten Blatt. Die Falzecke (Mitte des Blatts) ist oben rechts. */
export const Q = 4;
const flipH = (q) => (q === E ? W : q === W ? E : q);
const flipV = (q) => (q === N ? S : q === S ? N : q);

/**
 * Aufgefaltet: Das Viertel liegt unten links, gespiegelt an der senkrechten und der waagerechten Falz.
 * Bleibt im Blatt (0 bis 2Q-1), damit man das Viertel beim Zeichnen wiederfindet.
 */
export function unfold(quarter) {
  const out = [];
  for (const [x, y, q] of quarter) {
    out.push([x, y + Q, q], [2 * Q - 1 - x, y + Q, flipH(q)], [x, Q - 1 - y, flipV(q)], [2 * Q - 1 - x, Q - 1 - y, flipV(flipH(q))]);
  }
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
}

/** Typischer Fehler: an der falschen Ecke aufgefaltet (die äußere Ecke unten links für die Mitte gehalten). */
export function unfoldWrong(quarter) {
  return unfold(quarter.map(([x, y, q]) => [Q - 1 - x, Q - 1 - y, (q + 2) % 4]));
}

const quarterFull = () => rectShape(Q, Q);
const drop = (units, gone) => units.filter((u) => !gone.some((g) => g[0] === u[0] && g[1] === u[1] && g[2] === u[2]));

/** Schnitte ins gefaltete Blatt (Viertel, Falzkanten oben und rechts, äußere Ecke unten links). */
const CUTS = {
  // außen: ergeben Kerben am Rand (Buch S. 21, Nr. 2)
  ecke: (r) => { const k = randInt(r, 1, 2); const g = []; for (let x = 0; x < k; x++) for (let y = Q - k; y < Q; y++) g.push(...full(x, y)); return g; },
  schraeg: (r) => {
    const k = randInt(r, 2, 3);
    const g = [];
    for (let y = 0; y < Q; y++) for (let x = 0; x < Q; x++) {
      const d = x - (y - Q + k);
      if (d < 0) g.push(...full(x, y));
      else if (d === 0) g.push(...half(x, y, 'sw'));
    }
    return g;
  },
  kerbe: (r) => {
    const a = randInt(r, 1, Q - 3);
    return r() < 0.5 ? [...full(0, a), ...full(0, a + 1)] : [...full(a, Q - 1), ...full(a + 1, Q - 1)];
  },
  spitz: (r) => {
    const a = randInt(r, 0, Q - 2);
    return r() < 0.5 ? [...half(0, a, 'sw'), ...half(0, a + 1, 'nw')] : [...half(a, Q - 1, 'se'), ...half(a + 1, Q - 1, 'sw')];
  },
  diagonal: () => {
    const g = [];
    for (let y = 0; y < Q; y++) for (let x = 0; x < Q; x++) {
      if (x < y) g.push(...full(x, y));
      else if (x === y) g.push(...half(x, y, 'sw'));
    }
    return g;
  },
  // innen: ergeben Löcher in der Mitte oder auf den Falzlinien (Buch S. 21, Nr. 3)
  loch: (r) => { const k = randInt(r, 1, 2); const g = []; for (let x = Q - k; x < Q; x++) for (let y = 0; y < k; y++) g.push(...full(x, y)); return g; },
  lochSchraeg: (r) => {
    const k = randInt(r, 2, 3);
    const g = [];
    for (let y = 0; y < Q; y++) for (let x = 0; x < Q; x++) {
      const d = (Q - 1 - x) + y - (k - 1);
      if (d < 0) g.push(...full(x, y));
      else if (d === 0) g.push(...half(x, y, 'ne'));
    }
    return g;
  },
  falz: (r) => {
    const a = randInt(r, 1, Q - 2);
    return r() < 0.5 ? full(a, 0) : full(Q - 1, a);
  },
};
const OUTER = ['ecke', 'schraeg', 'kerbe', 'spitz', 'diagonal'];
const INNER = ['loch', 'lochSchraeg', 'falz'];

/** Ein gefaltetes Blatt mit einem oder zwei Schnitten. Muss zusammenhängen und beide Falzkanten berühren. */
function foldedPiece(r, kind) {
  for (let tries = 0; tries < 50; tries++) {
    const names = kind === 'loch'
      ? [pick(r, INNER), ...(r() < 0.5 ? [pick(r, OUTER.filter((n) => n !== 'diagonal'))] : [])]
      : [pick(r, OUTER), ...(r() < 0.35 ? [pick(r, ['ecke', 'kerbe', 'spitz'])] : [])];
    let u = quarterFull();
    for (const n of names) u = drop(u, CUTS[n](r));
    if (u.length < 12 || !connected(u)) continue;
    if (!u.some(([, y, q]) => y === 0 && q === N) || !u.some(([x, , q]) => x === Q - 1 && q === E)) continue;
    return { units: u, cuts: names };
  }
  return null;
}

/**
 * Aufgabe „Welches gefaltete Blatt ergibt aufgefaltet welche Form?“: drei gefaltete Blätter (A bis C),
 * vier aufgefaltete Formen (1 bis 4), eine bleibt übrig (an der falschen Ecke aufgefaltet).
 * kind: 'falt' (Schnitte am Rand) oder 'loch' (Löcher in der Mitte).
 */
export function makeFalt(r, kind = 'falt') {
  for (let tries = 0; tries < 300; tries++) {
    const folded = [];
    for (let i = 0; i < 3 && folded.length === i; i++) {
      const f = foldedPiece(r, kind);
      if (f) folded.push(f);
    }
    if (folded.length < 3) continue;
    const opens = folded.map((f) => unfold(f.units));
    const extra = unfoldWrong(pick(r, folded).units);
    const all = [...opens, extra];
    if (all.some((a, i) => all.some((b, j) => j > i && congruent(a, b)))) continue;
    if (folded.some((a, i) => folded.some((b, j) => j > i && congruent(a.units, b.units)))) continue;
    const order = shuffle(r, [0, 1, 2, 3]);
    return {
      kind: 'falt', part: kind,
      folded: folded.map((f, i) => ({ id: LETTERS[i], units: normalizeQuarter(f.units), cuts: f.cuts })),
      open: order.map((i, slot) => ({ id: String(slot + 1), units: all[i] })),
      match: [0, 1, 2].map((i) => order.indexOf(i)),
    };
  }
  throw new Error(`Keine Faltschnitt-Aufgabe gefunden (${kind})`);
}

/** Das Viertel bleibt in seinem Gitter (0 bis Q-1), auch wenn oben oder links etwas weggeschnitten ist. */
function normalizeQuarter(u) {
  return u.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
}

/** Passt das gefaltete Blatt fi zur Form oi? */
export function checkFalt(t, fi, oi) {
  return shapeKey(unfold(t.folded[fi].units)) === shapeKey(t.open[oi].units);
}

/** Tipp nach einer falschen Zuordnung. */
export function hintFalt(t, fi) {
  const cuts = t.folded[fi].cuts;
  if (cuts.some((c) => INNER.includes(c))) return 'Tipp: Was an der Ecke oben rechts (in der Mitte des Blatts) ausgeschnitten ist, wird beim Auffalten ein Loch in der Mitte.';
  return 'Tipp: Die Ecke oben rechts ist die Mitte des Blatts. Was am Rand unten oder links ausgeschnitten ist, kommt beim Auffalten an allen vier Seiten vor.';
}

/** Kurzform fürs Protokoll. */
export function logGeo(t) {
  if (t.kind === 'falt') return { kind: 'falt', part: t.part, folded: t.folded.map((f) => f.cuts.join('+')), match: t.match };
  return { kind: 'geo', form: t.form, drei: t.drei, flaeche: area(t.target), pieces: t.pieces.map((p) => `${p.id}:${area(p.units)}`), groups: t.groups };
}

// ---------- Umriss zum Zeichnen ----------

/**
 * Umriss als geschlossene Linienzüge in halben Kästchen (Ecke eines Kästchens bei 2x, 2y; Mitte bei 2x+1, 2y+1).
 * Kanten zwischen zwei Vierteln heben sich auf, übrig bleibt der Rand; Löcher werden eigene Linienzüge.
 */
export function outline(units) {
  const tri = ([x, y, q]) => {
    const tl = [2 * x, 2 * y], tr = [2 * x + 2, 2 * y], br = [2 * x + 2, 2 * y + 2], bl = [2 * x, 2 * y + 2], c = [2 * x + 1, 2 * y + 1];
    return [[tl, tr, c], [tr, br, c], [br, bl, c], [bl, tl, c]][q];
  };
  const key = (p) => `${p[0]},${p[1]}`;
  const edges = new Map();
  for (const u of units) {
    const t = tri(u);
    for (let i = 0; i < 3; i++) {
      const a = t[i], b = t[(i + 1) % 3];
      const back = `${key(b)}>${key(a)}`;
      if (edges.has(back)) edges.delete(back);
      else edges.set(`${key(a)}>${key(b)}`, [a, b]);
    }
  }
  const from = new Map();
  for (const [k, e] of edges) {
    const s = key(e[0]);
    if (!from.has(s)) from.set(s, []);
    from.get(s).push(k);
  }
  const loops = [];
  while (edges.size) {
    const [k0, e0] = edges.entries().next().value;
    const pts = [e0[0]];
    let k = k0;
    let e = e0;
    for (;;) {
      edges.delete(k);
      const list = from.get(key(e[0]));
      list.splice(list.indexOf(k), 1);
      pts.push(e[1]);
      const nxt = from.get(key(e[1]));
      if (!nxt || !nxt.length) break;
      k = nxt[0];
      e = edges.get(k);
    }
    pts.pop(); // der letzte Punkt ist wieder der erste
    // Punkte auf einer Geraden weglassen
    const simple = pts.filter((p, i) => {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[(i + 1) % pts.length];
      return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
    });
    loops.push(simple);
  }
  return loops;
}

/** SVG-Pfad zum Umriss, c = Kästchengröße, (ox, oy) = Ecke oben links. */
export function outlinePath(units, c, ox = 0, oy = 0) {
  const f = (v) => +v.toFixed(1);
  return outline(units).map((l) => `M${l.map(([x, y]) => `${f(ox + x * c / 2)} ${f(oy + y * c / 2)}`).join('L')}Z`).join('');
}

// ---------- Aufgaben einer Runde ----------

/** Bauteile der Steinmetzhütte, je eines pro Aufgabenart. */
export const GEO_PARTS = [
  { id: 'quadrat', label: 'Quadrat aus 2 Teilen' },
  { id: 'rechteck', label: 'Rechteck aus 2 Teilen' },
  { id: 'dreieck', label: 'Dreieck aus 2 Teilen' },
  { id: 'drei', label: 'Rechteck aus 3 Teilen' },
  { id: 'falt', label: 'Rosettenfenster: Faltschnitt am Rand' },
  { id: 'loch', label: 'Rosettenfenster: Faltschnitt mit Loch' },
];
export const STEIN_STAGE = 2; // wie burg.js STEIN (geo.js bleibt ohne Profil-Abhängigkeit)

/** Welche Teile schon dran sein dürfen: 3 Teile erst, wenn zwei Formen aus 2 Teilen stehen; Löcher nach dem ersten Faltschnitt. */
export function geoOpen(info) {
  const twoDone = ['quadrat', 'rechteck', 'dreieck'].filter((id) => info(id).stage >= STEIN_STAGE).length;
  return {
    drei: twoDone >= 2,
    loch: info('falt').seen > 0,
  };
}

/**
 * Steinmetzhütte für eine Runde: zwei Aufgaben „zusammensetzen“, dazwischen ein Faltschnitt.
 * info(id) → { stage, seen, lastDay }; today: Tag (dayIndex). Zuerst Teile mit niedriger Stufe, die heute noch nicht dran waren.
 */
export function makeSteinmetzBlock(r, info, today) {
  const open = geoOpen(info);
  const order = (ids) => shuffle(r, ids).sort((a, b) => {
    const A = info(a), B = info(b);
    const ta = A.lastDay === today ? 1 : 0, tb = B.lastDay === today ? 1 : 0;
    return Math.min(A.stage, 3) - Math.min(B.stage, 3) || ta - tb || (A.lastDay ?? -1) - (B.lastDay ?? -1);
  });
  const zus = order(['quadrat', 'rechteck', 'dreieck', ...(open.drei ? ['drei'] : [])]).slice(0, 2);
  const falt = order(['falt', ...(open.loch ? ['loch'] : [])])[0];
  const first = ['quadrat', 'rechteck', 'dreieck', 'drei'].every((id) => !info(id).seen);
  const zItem = (id, i) => {
    const t = id === 'drei' ? makeZusammen(r, 'rechteck', { drei: true }) : makeZusammen(r, id, { turn: !(first && i === 0) });
    return { kind: 'geo', part: id, t };
  };
  return [zItem(zus[0], 0), { kind: 'falt', part: falt, t: makeFalt(r, falt) }, zItem(zus[1], 1)];
}
