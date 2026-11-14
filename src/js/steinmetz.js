// Steinmetzhütte: Zeichnung und Bedienung der Geometrie-Aufgaben. Wie im Buch (S. 20, 21): fertige Form und Einzelteile,
// das Kind klickt nacheinander die Teile an, die zusammengehören. Sind sie richtig, fliegen sie in die Form;
// beim Faltschnitt fliegt das Blatt auf sein Fenster und klappt auf. Kein freies Verschieben und Drehen.
// Koordinaten: viewBox 0 0 1000 520 wie die anderen Szenen.
import { outlinePath, bbox, checkZusammen, hintZusammen, checkFalt, hintFalt, Q } from './geo.js';

const n1 = (v) => +v.toFixed(1);
export const PIECE_COLORS = ['#f2a65a', '#7cc576', '#6fa8dc', '#e98aa3', '#b99ad8'];

/** Kästchenlinien innen in einem Feld von w × h Kästchen ab (ox, oy). */
function gridLines(w, h, c, ox = 0, oy = 0) {
  let d = '';
  for (let i = 1; i < w; i++) d += `M${n1(ox + i * c)} ${n1(oy)}V${n1(oy + h * c)}`;
  for (let j = 1; j < h; j++) d += `M${n1(ox)} ${n1(oy + j * c)}H${n1(ox + w * c)}`;
  return d;
}

/** Fläche mit Kästchen: Füllung, Kästchen nur innerhalb der Form, Umriss obendrauf. */
function shape(units, w, h, c, cls, id, { ox = 0, oy = 0, fill = '', extra = '' } = {}) {
  const d = outlinePath(units, c, ox, oy);
  return `<clipPath id="${id}"><path d="${d}"/></clipPath>`
    + `<path class="${cls}" d="${d}"${fill ? ` style="fill:${fill}"` : ''}/>`
    + `<g clip-path="url(#${id})"><path class="g-grid" d="${gridLines(w, h, c, ox, oy)}"/>${extra}</g>`
    + `<path class="g-line" d="${d}"/>`;
}

// ---------- Lage der Teile ----------

/** Punkt drehen (k-mal 90° im Uhrzeigersinn) und vorher umklappen (m): wie rotate/mirror in geo.js. */
function mapPt(k, m, [x, y]) {
  let a = m ? -x : x;
  let b = y;
  for (let i = 0; i < k; i++) [a, b] = [-b, a];
  return [a, b];
}
/** Kleinste Ecke des gedrehten Rechtecks w × h: um so viel muss man zurückschieben (wie normalize). */
function minCorner(k, m, w, h) {
  const ps = [[0, 0], [w, 0], [0, h], [w, h]].map((p) => mapPt(k, m, p));
  return [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), ps];
}
const tf = (ex, ey, deg, sx) => `translate(${n1(ex)}px, ${n1(ey)}px) rotate(${deg}deg) scale(${sx}, 1)`;

// ---------- Formen zusammensetzen ----------

/** Lage von Form(en) und Teilen; c ist für Form und Teile gleich, damit man die Größen vergleichen kann. */
export function zusammenLayout(t) {
  const gN = t.groups.length;
  const T = bbox(t.target);
  const disp = t.pieces.map((p) => { const b = bbox(p.units); return p.rot % 2 ? { w: b.h, h: b.w } : b; });
  const n = t.pieces.length;
  const cols = 3;
  const rows = Math.ceil(n / cols);
  const RX1 = 992, RY0 = 8, RY1 = 516;
  const LAB = 36;
  const GAP = 40;
  const PADX = 26;
  const LEFT = 110; // links Rand, rechts neben der Form Platz für das Häkchen
  const sh = (RY1 - RY0) / rows;
  const maxW = Math.max(...disp.map((d) => d.w));
  const maxH = Math.max(...disp.map((d) => d.h));
  // So groß wie möglich: Form links und drei Fächer rechts nebeneinander, zwei Reihen Fächer, Formen untereinander
  const c = Math.floor(Math.min(44, (RX1 - LEFT - cols * PADX) / (cols * maxW + T.w), (sh - LAB - 22) / maxH,
    (488 - GAP * (gN - 1)) / (gN * T.h)));
  const RX0 = LEFT + T.w * c;
  const sw = (RX1 - RX0) / cols;
  const totalH = gN * T.h * c + (gN - 1) * GAP;
  const targets = [];
  let y = 16 + (488 - totalH) / 2;
  for (let g = 0; g < gN; g++) { targets.push([24, n1(y)]); y += T.h * c + GAP; }
  const slots = t.pieces.map((_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const inRow = Math.min(cols, n - row * cols);
    const x = RX0 + (RX1 - RX0 - inRow * sw) / 2 + col * sw;
    const y0 = RY0 + row * sh;
    const d = disp[i];
    return { x, y: y0, w: sw, h: sh, ox: x + (sw - d.w * c) / 2, oy: y0 + 10 + (sh - LAB - 10 - d.h * c) / 2 };
  });
  return { c, targets, slots, T };
}

/** Teil i in seinem Fach, gedreht wie angezeigt. */
function slotTf(t, L, i) {
  const p = t.pieces[i];
  const b = bbox(p.units);
  const [mx, my] = minCorner(p.rot, false, b.w * L.c, b.h * L.c);
  return { css: tf(L.slots[i].ox - mx, L.slots[i].oy - my, p.rot * 90, 1), deg: p.rot * 90 };
}

/** Teil i in der Form g, an der Stelle aus der Lösung (k, m, dx, dy). Drehung nahe an der jetzigen, damit es nicht kreiselt. */
function placeTf(t, L, i, sol, g, fromDeg) {
  const b = bbox(t.pieces[i].units);
  const [mx, my] = minCorner(sol.k, sol.m, b.w * L.c, b.h * L.c);
  let deg = sol.k * 90;
  deg += 360 * Math.round((fromDeg - deg) / 360);
  const [tx, ty] = L.targets[g];
  return tf(tx + sol.dx * L.c - mx, ty + sol.dy * L.c - my, deg, sol.m ? -1 : 1);
}

export function sceneZusammen(t, L) {
  const { c, T } = L;
  let s = '';
  L.targets.forEach(([x, y], g) => {
    s += `<g class="gt" id="gt${g}">${shape(t.target, T.w, T.h, c, 'gt-fill', `gtc${g}`, { ox: x, oy: y })}</g>`
      + `<g class="gt-ok" id="gtok${g}"><circle cx="${n1(x + T.w * c + 26)}" cy="${n1(y + (T.h * c) / 2)}" r="19"/>`
      + `<path d="M${n1(x + T.w * c + 17)} ${n1(y + (T.h * c) / 2)}l6 7l12-14"/></g>`;
  });
  t.pieces.forEach((p, i) => {
    const sl = L.slots[i];
    s += `<g class="slot" data-i="${i}"><rect class="hit" x="${n1(sl.x + 6)}" y="${n1(sl.y + 4)}" width="${n1(sl.w - 12)}" height="${n1(sl.h - 8)}" rx="16"/>`
      + `<text class="slot-l" x="${n1(sl.x + sl.w / 2)}" y="${n1(sl.y + sl.h - 16)}" text-anchor="middle">${p.id}</text></g>`;
  });
  t.pieces.forEach((p, i) => {
    const b = bbox(p.units);
    s += `<g class="gp" id="gp${i}" style="transform:${slotTf(t, L, i).css}"><g class="gp-in">`
      + `${shape(p.units, b.w, b.h, c, 'gp-fill', `gpc${i}`, { fill: PIECE_COLORS[i % PIECE_COLORS.length] })}</g></g>`;
  });
  return s;
}

/**
 * Aufgabe „Welche Teile ergeben die Form?“ spielen. cb: onPick(), onRight(found, total), onWrong(text, reveal),
 * onDone({ firstOk, tries, helped }). Rückgabe: { stop }.
 */
export function playZusammen(svg, t, cb) {
  const L = zusammenLayout(t);
  svg.innerHTML = sceneZusammen(t, L);
  const found = [];
  const tries = [];
  let sel = [];
  let wrongNow = 0;
  let helped = 0;
  let busy = false;
  let alive = true;
  const timers = [];
  const later = (ms, fn) => timers.push(setTimeout(() => { if (alive) fn(); }, ms));
  const slotEl = (i) => svg.querySelector(`.slot[data-i="${i}"]`);
  const pieceEl = (i) => svg.querySelector(`#gp${i}`);
  const used = () => found.flat();
  const mark = () => t.pieces.forEach((_, i) => {
    slotEl(i).classList.toggle('sel', sel.includes(i));
    pieceEl(i).classList.toggle('sel', sel.includes(i));
  });
  const shake = (group) => group.forEach((i) => {
    for (const el of [slotEl(i), pieceEl(i)]) { el.classList.remove('shake'); void el.getBoundingClientRect(); el.classList.add('shake'); }
  });

  const place = (group) => {
    const g = found.length;
    const sol = checkZusammen(t, group);
    found.push(group);
    group.forEach((i, j) => {
      const el = pieceEl(i);
      el.classList.remove('show');
      el.classList.add('done');
      el.style.transform = placeTf(t, L, i, sol[j], g, slotTf(t, L, i).deg);
      slotEl(i).classList.add('done');
    });
    later(850, () => {
      svg.querySelector(`#gtok${g}`).classList.add('on');
      svg.querySelector(`#gt${g}`).classList.add('done');
    });
  };

  const afterFound = () => {
    cb.onRight(found.length, t.groups.length);
    if (found.length < t.groups.length) { later(900, () => { busy = false; }); return; }
    later(1100, () => {
      t.pieces.forEach((p, i) => {
        if (used().includes(i)) return;
        slotEl(i).classList.add('rest');
        slotEl(i).querySelector('.slot-l').textContent = `${p.id} bleibt übrig`;
      });
      cb.onDone({ firstOk: tries.every((x) => x.ok) && !helped, tries, helped });
    });
  };

  const reveal = () => {
    const group = t.groups.find((g) => !found.some((f) => f.join() === g.join()));
    helped++;
    group.forEach((i) => { slotEl(i).classList.add('show'); pieceEl(i).classList.add('show'); });
    const ids = group.map((i) => t.pieces[i].id);
    cb.onWrong(`Schau: ${ids.slice(0, -1).join(', ')} und ${ids[ids.length - 1]} gehören zusammen.`, true);
    later(1800, () => {
      group.forEach((i) => slotEl(i).classList.remove('show'));
      place(group);
      wrongNow = 0;
      afterFound();
    });
  };

  const onClick = (e) => {
    const el = e.target.closest('.slot');
    if (!el || busy) return;
    const i = Number(el.dataset.i);
    if (used().includes(i)) return;
    sel = sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i];
    mark();
    cb.onPick();
    if (sel.length < t.need) return;
    busy = true;
    const group = sel.slice().sort((a, b) => a - b);
    const ok = !!checkZusammen(t, group);
    tries.push({ sel: group.map((x) => t.pieces[x].id), ok });
    later(280, () => {
      sel = [];
      mark();
      if (ok) {
        place(group);
        wrongNow = 0;
        afterFound();
        return;
      }
      wrongNow++;
      shake(group);
      if (wrongNow >= 2) { later(600, reveal); return; }
      cb.onWrong(hintZusammen(t, group), false);
      later(500, () => { busy = false; });
    });
  };
  svg.addEventListener('click', onClick);
  return {
    stop() {
      alive = false;
      timers.forEach(clearTimeout);
      svg.removeEventListener('click', onClick);
    },
  };
}

// ---------- Faltschnitte ----------

export const FALT_C = 28;
const F = Q * FALT_C;

export function faltLayout(t) {
  return {
    fold: t.folded.map((_, i) => ({ x: 500 + (i - 1) * 290 - F / 2, y: 22 })),
    open: t.open.map((_, i) => ({ x: 125 + i * 250 - F, y: 200 })),
  };
}

/** Gefaltetes Blatt: Viertel mit den Falten oben und rechts (gestrichelt). */
function foldedSvg(units, x, y, id) {
  return shape(units, Q, Q, FALT_C, 'paper fold-paper', id, { ox: x, oy: y })
    + `<path class="fold" d="M${n1(x)} ${n1(y)}H${n1(x + F)}V${n1(y + F)}"/>`;
}

export function sceneFalt(t, L) {
  let s = '<defs><radialGradient id="glass" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="#fff6c9"/>'
    + '<stop offset=".45" stop-color="#8fc3f0"/><stop offset="1" stop-color="#3f6fc4"/></radialGradient></defs>';
  t.folded.forEach((f, i) => {
    const { x, y } = L.fold[i];
    s += `<g class="fs" data-f="${i}"><rect class="hit" x="${n1(x - 62)}" y="${n1(y - 14)}" width="${n1(F + 90)}" height="${n1(F + 28)}" rx="16"/>`
      + `<g class="sh-in"><text class="slot-l" x="${n1(x - 30)}" y="${n1(y + F / 2 + 12)}" text-anchor="middle">${f.id}</text>`
      + `${foldedSvg(f.units, x, y, `fsc${i}`)}</g></g>`;
  });
  t.open.forEach((o, i) => {
    const { x, y } = L.open[i];
    const crease = `<path class="crease" d="M${n1(x + F)} ${n1(y)}V${n1(y + 2 * F)}M${n1(x)} ${n1(y + F)}H${n1(x + 2 * F)}"/>`;
    s += `<g class="of" data-o="${i}"><rect class="hit" x="${n1(x - 14)}" y="${n1(y - 14)}" width="${n1(2 * F + 28)}" height="${n1(2 * F + 66)}" rx="16"/>`
      + `<g class="sh-in">${shape(o.units, 2 * Q, 2 * Q, FALT_C, 'paper open-paper', `ofc${i}`, { ox: x, oy: y, extra: crease })}`
      + `<text class="slot-l" x="${n1(x + F)}" y="${n1(y + 2 * F + 40)}" text-anchor="middle">${o.id}</text></g></g>`;
  });
  return s + '<g id="unf-layer"></g>';
}

/**
 * Faltschnitt-Aufgabe spielen: erst ein Blatt, dann ein Fenster anklicken (oder umgekehrt).
 * cb wie bei playZusammen; onRight(found, total).
 */
export function playFalt(svg, t, cb) {
  const L = faltLayout(t);
  svg.innerHTML = sceneFalt(t, L);
  const tries = [];
  const done = new Map(); // Blatt → Fenster
  const wrongBy = t.folded.map(() => 0);
  let selF = null;
  let selO = null;
  let helped = 0;
  let busy = false;
  let alive = true;
  const timers = [];
  const later = (ms, fn) => timers.push(setTimeout(() => { if (alive) fn(); }, ms));
  const fEl = (i) => svg.querySelector(`.fs[data-f="${i}"]`);
  const oEl = (i) => svg.querySelector(`.of[data-o="${i}"]`);
  const mark = () => {
    t.folded.forEach((_, i) => fEl(i).classList.toggle('sel', selF === i));
    t.open.forEach((_, i) => oEl(i).classList.toggle('sel', selO === i));
  };
  const shake = (els) => els.forEach((el) => { el.classList.remove('shake'); void el.getBoundingClientRect(); el.classList.add('shake'); });

  /** Blatt fliegt auf sein Fenster und klappt auf: erst nach rechts, dann nach oben. */
  const unfoldOnto = (fi, oi) => {
    done.set(fi, oi);
    fEl(fi).classList.add('done');
    oEl(oi).classList.add('done');
    const q = t.folded[fi].units;
    const qd = outlinePath(q, FALT_C);
    const one = `<path class="paper fold-paper" d="${qd}"/><path class="g-line" d="${qd}"/>`;
    const half = `${one}<g class="flip-h" style="--f:${F}px">${one}</g>`;
    const layer = svg.querySelector('#unf-layer');
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'unf');
    g.innerHTML = `${half}<g class="flip-v">${half}</g>`;
    const from = L.fold[fi];
    const to = L.open[oi];
    g.style.transform = `translate(${n1(from.x)}px, ${n1(from.y)}px)`;
    layer.appendChild(g);
    void g.getBoundingClientRect();
    g.style.transform = `translate(${n1(to.x)}px, ${n1(to.y + F)}px)`;
    later(1900, () => { oEl(oi).classList.add('glass'); g.classList.add('gone'); });
    later(2500, () => g.remove());
  };

  const afterFound = () => {
    cb.onRight(done.size, t.folded.length);
    if (done.size < t.folded.length) { later(1900, () => { busy = false; }); return; }
    later(2100, () => {
      t.open.forEach((o, i) => {
        if ([...done.values()].includes(i)) return;
        oEl(i).classList.add('rest');
        oEl(i).querySelector('.slot-l').textContent = `${o.id} bleibt übrig`;
      });
      cb.onDone({ firstOk: tries.every((x) => x.ok) && !helped, tries, helped });
    });
  };

  const tryPair = () => {
    busy = true;
    const fi = selF;
    const oi = selO;
    const ok = checkFalt(t, fi, oi);
    tries.push({ blatt: t.folded[fi].id, fenster: t.open[oi].id, ok });
    later(280, () => {
      selF = null;
      selO = null;
      mark();
      if (ok) { unfoldOnto(fi, oi); afterFound(); return; }
      wrongBy[fi]++;
      shake([fEl(fi), oEl(oi)]);
      if (wrongBy[fi] < 2) { cb.onWrong(hintFalt(t, fi), false); later(500, () => { busy = false; }); return; }
      // Zweimal daneben mit diesem Blatt: zeigen, wohin es gehört
      helped++;
      const right = t.match[fi];
      cb.onWrong(`Schau: Blatt ${t.folded[fi].id} ergibt Fenster ${t.open[right].id}.`, true);
      later(700, () => { unfoldOnto(fi, right); afterFound(); });
    });
  };

  const onClick = (e) => {
    if (busy) return;
    const f = e.target.closest('.fs');
    const o = e.target.closest('.of');
    if (f) {
      const i = Number(f.dataset.f);
      if (done.has(i)) return;
      selF = selF === i ? null : i;
    } else if (o) {
      const i = Number(o.dataset.o);
      if ([...done.values()].includes(i)) return;
      selO = selO === i ? null : i;
    } else return;
    mark();
    cb.onPick();
    if (selF !== null && selO !== null) tryPair();
  };
  svg.addEventListener('click', onClick);
  return {
    stop() {
      alive = false;
      timers.forEach(clearTimeout);
      svg.removeEventListener('click', onClick);
    },
  };
}
