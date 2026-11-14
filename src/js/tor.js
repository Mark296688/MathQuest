// Tor: Vergleiche an der Waage (T1, T2) und Punkt vor Strich (T3, T4), docs/inhalte.md Abschnitt 3.
// Erst die Teilrechnungen, ihre Ergebnisse bleiben unter einem Bogen sichtbar (wie in bayerischen Schulbüchern der 4. Klasse).
// Danach der Vergleich (<, = oder > anklicken) bzw. das Ergebnis. Bei Punkt vor Strich zeigt das Kind zuerst,
// welches Rechenzeichen es zuerst rechnet: Ein häufiger Fehler ist, einfach von links nach rechts zu rechnen.
import { randInt, pick, pickWeighted } from './rng.js';
import { strategy, divisionHint } from './einmaleins.js';
import { fmt } from './parse.js';

export const TOR_PARTS = [
  { id: 'waage1', stufe: 1, name: 'Torflügel', label: 'Torflügel: Vergleichen (9 · 9 ○ 30 · 2)' },
  { id: 'waage2', stufe: 2, name: 'Zugbrücke', label: 'Zugbrücke: Vergleichen mit Zehnerzahlen (70 · 5 ○ 6 · 60)' },
  { id: 'pvs1', stufe: 3, name: 'Fallgitter', label: 'Fallgitter: Punkt vor Strich (5 · 6 + 7 · 7)' },
  { id: 'pvs2', stufe: 4, name: 'Torhaus', label: 'Torhaus: Punkt vor Strich mit Zehnerzahlen (540 : 60 − 2 · 2)' },
];
export const MAL = '·';
export const GETEILT = ':';
export const PLUS = '+';
export const MINUS = '−';

/**
 * Punktrechnung a op b. zehner: Aufgabe mit Zehnerzahl (Stufe 2 und 4), Tipps über Zehner.
 * Einmaleins-Aufgaben wie 40 : 8 sind keine, obwohl die 40 eine Null hat.
 */
export function part(a, op, b, zehner = a % 10 === 0 || b % 10 === 0) {
  return { a, op, b, val: op === MAL ? a * b : a / b, zehner };
}
export const partText = (p) => `${fmt(p.a)} ${p.op} ${fmt(p.b)}`;

// ---------- Teilrechnungen ----------

const r29 = (r) => randInt(r, 2, 9);
/** Einmaleins mal: 7 · 8 */
const eMal = (r) => part(r29(r), MAL, r29(r));
/** Einmaleins geteilt: 56 : 7 */
const eDiv = (r) => { const a = r29(r); const b = r29(r); return part(a * b, GETEILT, b, false); };
/** Kleine Zehnerzahl mal Einer, Ergebnis höchstens 90: 30 · 2 */
const zKlein = (r) => {
  const [c, d] = pick(r, [[2, 2], [2, 3], [2, 4], [3, 2], [3, 3], [4, 2]]);
  return r() < 0.7 ? part(c * 10, MAL, d) : part(d, MAL, c * 10);
};
/** Zehnerzahl mal Einer: 70 · 5, 6 · 60 */
const zMal = (r) => { const a = r29(r); const b = r29(r); return r() < 0.5 ? part(a * 10, MAL, b) : part(a, MAL, b * 10); };
/** Zehnerzahl geteilt: 540 : 60 (Einer als Ergebnis) oder 420 : 7 (Zehnerzahl als Ergebnis) */
const zDiv = (r) => {
  const a = r29(r);
  const b = r29(r);
  return r() < 0.6 ? part(a * b * 10, GETEILT, b * 10) : part(a * b * 10, GETEILT, b);
};

/** Tauschaufgaben (6 · 7 gegen 7 · 6) und gleiche Terme sind kein echter Vergleich. */
function sameTerm(p, q) {
  if (p.op !== q.op) return false;
  if (p.a === q.a && p.b === q.b) return true;
  return p.op === MAL && p.a === q.b && p.b === q.a;
}

// ---------- Waage ----------

/** Nah beieinander, damit man wirklich rechnen muss. */
const close = (x, y) => Math.abs(x - y) <= Math.max(4, Math.round(0.15 * Math.max(x, y)));

/**
 * Waage: zwei Teilrechnungen vergleichen. stufe 1: Einmaleins gegen Einmaleins oder kleine Zehnerzahl (9 · 9 ○ 30 · 2).
 * stufe 2: mit Zehnerzahlen (70 · 5 ○ 6 · 60, 810 : 90 ○ 3 · 3), mindestens eine Seite mit Zehnerzahl.
 */
export function makeWaage(r, stufe) {
  const rel = pickWeighted(r, ['<', '=', '>'], (x) => (x === '=' ? 2 : 3));
  const side = stufe === 1
    ? () => pickWeighted(r, [eMal, eDiv, zKlein], (f) => (f === eMal ? 6 : f === eDiv ? 2 : 3))(r)
    : () => pickWeighted(r, [zMal, zDiv, eMal], (f) => (f === eMal ? 2 : f === zMal ? 5 : 3))(r);
  for (let i = 0; i < 4000; i++) {
    const L = side();
    const R = side();
    if (stufe === 2 && !L.zehner && !R.zehner) continue;
    if (stufe === 1 && L.zehner && R.zehner) continue;
    if (sameTerm(L, R)) continue;
    const got = L.val < R.val ? '<' : L.val > R.val ? '>' : '=';
    if (got !== rel || !close(L.val, R.val)) continue;
    if (stufe === 2 && Math.max(L.val, R.val) > 1000) continue;
    return { kind: 'waage', stufe, left: L, right: R, rel };
  }
  throw new Error(`Keine Waage gefunden (Stufe ${stufe}, ${rel})`);
}

// ---------- Punkt vor Strich ----------

/** Ergebnis der Reihe nach von links gerechnet (der typische Fehler); null, wenn es nicht aufgeht. */
export function leftToRight(tokens) {
  let v = tokens[0];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const x = tokens[i + 1];
    if (op === MAL) v *= x;
    else if (op === GETEILT) { if (v % x) return null; v /= x; }
    else if (op === PLUS) v += x;
    else v -= x;
    if (v < 0) return null;
  }
  return v;
}

/** Zahlen und Rechenzeichen der Reihe nach: [5, '·', 6, '+', 7, '·', 7] */
export function pvsTokens(t) {
  const side = (x) => (typeof x === 'number' ? [x] : [x.a, x.op, x.b]);
  return [...side(t.items[0]), t.s, ...side(t.items[1])];
}
export const valueOf = (x) => (typeof x === 'number' ? x : x.val);
export function pvsText(t) {
  return pvsTokens(t).map((x) => (typeof x === 'number' ? fmt(x) : x)).join(' ');
}

/**
 * Punkt vor Strich. stufe 3: mit dem Einmaleins (5 · 6 + 7 · 7), stufe 4: mit Zehnerzahlen (540 : 60 − 2 · 2).
 * items: zwei Glieder, jedes eine Zahl oder eine Punktrechnung; s: + oder −. Mindestens eine Punktrechnung.
 * Von links gerechnet käme etwas anderes heraus, sonst merkt man den Fehler nicht.
 */
export function makePvs(r, stufe) {
  const P = stufe === 3
    ? () => (r() < 0.75 ? eMal(r) : eDiv(r))
    : () => pickWeighted(r, [zMal, zDiv, eMal, eDiv], (f) => (f === zMal ? 4 : f === zDiv ? 4 : f === eMal ? 3 : 1))(r);
  // „6 · 5 + 32“ fehlt mit Absicht: Von links gerechnet kommt dasselbe heraus, die Regel wird nicht gebraucht
  for (let i = 0; i < 4000; i++) {
    const form = r() < 0.6 ? 'PP' : 'nP';
    const s = r() < 0.55 ? PLUS : MINUS;
    let items;
    if (form === 'PP') items = [P(), P()];
    else {
      const p = P();
      const n = stufe === 3 ? randInt(r, 2, 60) : (r() < 0.6 ? randInt(r, 1, 30) * 10 : randInt(r, 2, 60));
      items = [n, p];
    }
    const [x, y] = items.map(valueOf);
    const val = s === PLUS ? x + y : x - y;
    if (val < 0 || (s === MINUS && val === 0)) continue;
    if (stufe === 3 && (val > 150 || items.some((it) => typeof it !== 'number' && it.zehner))) continue;
    if (stufe === 4 && (val > 1000 || !items.some((it) => typeof it !== 'number' && it.zehner))) continue;
    if (form === 'PP' && sameTerm(items[0], items[1])) continue;
    const t = { kind: 'pvs', stufe, items, s, val };
    if (leftToRight(pvsTokens(t)) === val) continue;
    return t;
  }
  throw new Error(`Keine Punkt-vor-Strich-Aufgabe gefunden (Stufe ${stufe})`);
}

// ---------- Schritte ----------

/**
 * Die Schritte einer Aufgabe. Waage: links rechnen, rechts rechnen, Zeichen wählen.
 * Punkt vor Strich: erst zeigen, was zuerst kommt (first), dann die Punktrechnungen (die gezeigte zuerst), dann das Ergebnis.
 * firstItem: Index des Glieds, dessen Rechenzeichen das Kind gezeigt hat.
 */
export function torSteps(t, firstItem = null) {
  if (t.kind === 'waage') {
    return [
      { kind: 'calc', item: 0, part: t.left, val: t.left.val },
      { kind: 'calc', item: 1, part: t.right, val: t.right.val },
      { kind: 'sign', val: t.rel },
    ];
  }
  const ps = [0, 1].filter((i) => typeof t.items[i] !== 'number');
  if (firstItem !== null && ps.includes(firstItem)) ps.sort((a, b) => (a === firstItem ? -1 : b === firstItem ? 1 : 0));
  const [x, y] = t.items.map(valueOf);
  return [
    { kind: 'first' },
    ...ps.map((i) => ({ kind: 'calc', item: i, part: t.items[i], val: t.items[i].val })),
    { kind: 'final', a: x, s: t.s, b: y, val: t.val },
  ];
}

/** Rechenzeichen, die man bei „Was rechnest du zuerst?“ anklicken kann: Index im Token-Array und Glied. */
export function opChoices(t) {
  const tokens = pvsTokens(t);
  const out = [];
  let item = 0;
  tokens.forEach((x, i) => {
    if (typeof x === 'number') return;
    if (x === PLUS || x === MINUS) { out.push({ token: i, op: x, item: null, punkt: false }); item = 1; return; }
    out.push({ token: i, op: x, item, punkt: true });
  });
  return out;
}

// ---------- Bewertung und Tipps ----------

/** Tipp zu einer Punktrechnung, ohne das Ergebnis zu verraten. */
export function partHint(p) {
  if (!p.zehner) return p.op === MAL ? strategy(p.a, p.b).hint : divisionHint(p.a, p.b);
  if (p.op === MAL) {
    const [z, e] = p.a % 10 === 0 ? [p.a, p.b] : [p.b, p.a];
    return `Tipp: ${partText(p)} sind ${e} · ${z / 10} Zehner.`;
  }
  if (p.b % 10 === 0) return `Tipp: ${fmt(p.a)} sind ${p.a / 10} Zehner, ${p.b} sind ${p.b / 10} Zehner.`;
  return `Tipp: ${fmt(p.a)} sind ${p.a / 10} Zehner. ${p.a / 10} Zehner : ${p.b} = ? Zehner.`;
}

/** Rechenweg zu einer Punktrechnung, nach dem zweiten Fehlversuch. */
export function partWay(p) {
  if (!p.zehner && p.op === GETEILT) return `${partText(p)} = ${p.val}, weil ${p.val} · ${p.b} = ${p.a}`;
  if (!p.zehner) {
    const s = strategy(p.a, p.b);
    return `${partText(p)} = ${p.val}` + (s.n === 1 || s.n === 10 ? '' : ` (${s.way})`);
  }
  if (p.op === MAL) {
    const [z, e] = p.a % 10 === 0 ? [p.a, p.b] : [p.b, p.a];
    return `${e} · ${z / 10} = ${e * z / 10}, also ${partText(p)} = ${fmt(p.val)}`;
  }
  if (p.b % 10 === 0) return `${p.a / 10} : ${p.b / 10} = ${p.val}, also ${partText(p)} = ${p.val}`;
  return `${p.a / 10} : ${p.b} = ${p.val / 10}, also ${partText(p)} = ${fmt(p.val)}`;
}

/** Tipp zur Strichrechnung am Ende: über Zehner und Einer, ohne Ergebnis. */
export function finalHint(a, s, b) {
  const big = Math.max(a, b);
  if (s === PLUS) {
    if (b % 10 && b > 10) return `Tipp: Erst ${fmt(a)} + ${fmt(b - (b % 10))}, dann + ${b % 10}.`;
    if (a % 10 === 0 && b % 10 === 0) return `Tipp: ${a / 10} Zehner + ${b / 10} Zehner.`;
    return `Tipp: Von ${fmt(big)} aus weiterzählen.`;
  }
  if (b % 10 && b > 10) return `Tipp: Erst ${fmt(a)} − ${fmt(b - (b % 10))}, dann − ${b % 10}.`;
  if (a % 10 === 0 && b % 10 === 0) return `Tipp: ${a / 10} Zehner − ${b / 10} Zehner.`;
  return `Tipp: Von ${fmt(b)} bis ${fmt(a)}: Wie viel fehlt?`;
}

export const SIGN_WORD = { '<': 'kleiner als', '>': 'größer als', '=': 'gleich' };

/**
 * Eine Antwort zu einem Schritt bewerten. calc/final: Zahl; sign: '<' | '=' | '>'; first: Index in opChoices.
 * Liefert ok, Tipp (beim ersten Fehler), Rechenweg (beim zweiten), nullErr (Faktor 10 daneben, Null vergessen oder zu viel).
 */
export function judgeStep(t, step, v) {
  if (step.kind === 'first') {
    const c = opChoices(t)[v];
    return { ok: !!(c && c.punkt), hint: 'Punkt vor Strich: Erst mal und geteilt rechnen, dann plus und minus.' };
  }
  if (step.kind === 'sign') {
    const L = t.left.val;
    const R = t.right.val;
    const ok = v === t.rel;
    let hint;
    if (t.rel === '=') hint = `Beide Seiten sind ${fmt(L)}. Dann passt =.`;
    else if (v === '=') hint = `${fmt(L)} und ${fmt(R)} sind nicht gleich.`;
    else hint = `${fmt(Math.max(L, R))} ist mehr als ${fmt(Math.min(L, R))}. Die Spitze zeigt zur kleineren Zahl.`;
    return { ok, hint };
  }
  const ok = v === step.val;
  const nullErr = !ok && (v === step.val * 10 || v * 10 === step.val);
  if (step.kind === 'calc') {
    const hint = nullErr && step.part.zehner ? `Achtung, die Nullen! ${partHint(step.part).replace('Tipp: ', '')}` : partHint(step.part);
    return { ok, nullErr, hint, way: partWay(step.part) };
  }
  return { ok, nullErr, hint: finalHint(step.a, step.s, step.b), way: `${fmt(step.a)} ${step.s} ${fmt(step.b)} = ${fmt(step.val)}` };
}

/** Für das Protokoll: Art, Stufe, Rechnung als Text und Lösung. */
export function logTor(t) {
  if (t.kind === 'waage') return { kind: t.kind, stufe: t.stufe, text: `${partText(t.left)} ○ ${partText(t.right)}`, rel: t.rel, left: t.left.val, right: t.right.val };
  return { kind: t.kind, stufe: t.stufe, text: pvsText(t), val: t.val, parts: t.items.map(valueOf) };
}

/** Ganze Rechnung als Satz für die Rückmeldung. */
export function torSummary(t) {
  if (t.kind === 'waage') {
    return `${partText(t.left)} = ${fmt(t.left.val)} ist ${SIGN_WORD[t.rel]} ${partText(t.right)} = ${fmt(t.right.val)}.`;
  }
  const [x, y] = t.items.map(valueOf);
  return `${pvsText(t)} = ${fmt(x)} ${t.s} ${fmt(y)} = ${fmt(t.val)}`;
}

// ---------- Aufgaben einer Runde ----------

/** Stufe 2 bzw. 4 kommt, sobald die Stufe davor an einem Tag gleich richtig war. */
export function torOpen(info) {
  return { waage2: info('waage1').okDays > 0, pvs2: info('pvs1').okDays > 0 };
}

/**
 * Tor für eine Runde: Waage, Punkt vor Strich, Waage, Punkt vor Strich.
 * info(id) → { stage, seen, okDays, lastDay }. Zuerst niedrige Stufe, die heute noch nicht dran war.
 */
export function makeTorBlock(r, info, today) {
  const open = torOpen(info);
  const rank = (id) => {
    const m = info(id);
    return [Math.min(m.stage, 3), m.lastDay === today ? 1 : 0, m.lastDay ?? -1];
  };
  const best = (ids) => ids.slice().sort((a, b) => {
    const A = rank(a);
    const B = rank(b);
    return A[0] - B[0] || A[1] - B[1] || A[2] - B[2] || (a < b ? -1 : 1);
  });
  const waage = best(['waage1', ...(open.waage2 ? ['waage2'] : [])]);
  const pvs = best(['pvs1', ...(open.pvs2 ? ['pvs2'] : [])]);
  // Beide Stufen offen: je eine von jeder; die neuere zuerst, solange sie noch kein Stein ist
  const two = (list) => (list.length > 1 ? list : [list[0], list[0]]);
  const [w1, w2] = two(waage);
  const [p1, p2] = two(pvs);
  const item = (id) => {
    const st = TOR_PARTS.find((x) => x.id === id).stufe;
    return { kind: 'tor', part: id, t: st <= 2 ? makeWaage(r, st) : makePvs(r, st) };
  };
  return [item(w1), item(p1), item(w2), item(p2)];
}
