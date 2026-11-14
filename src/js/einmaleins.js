// Einmaleins als Familien: 7 · 8, 8 · 7, 56 : 7, 56 : 8 gehören zusammen.
import { pick } from './rng.js';

/** Grobe Schwierigkeit, leichte Familien kommen zuerst dran. */
export function difficulty(a, b) {
  if (a === 2 || b === 2) return 0;
  if (a === 5 || b === 5) return 1;
  if (a === b) return 2;
  if (a === 3 || b === 3) return 3;
  if (a === 4 || b === 4) return 4;
  if (a === 9 || b === 9) return 5;
  return 6;
}

/** Alle 36 Familien mit Faktoren 2 bis 9, leichte zuerst. */
export const FAMILIES = (() => {
  const out = [];
  for (let a = 2; a <= 9; a++) for (let b = a; b <= 9; b++) out.push({ id: famId(a, b), a, b });
  return out.sort((x, y) => difficulty(x.a, x.b) - difficulty(y.a, y.b) || x.a * x.b - y.a * y.b);
})();

export function famId(a, b) {
  return Math.min(a, b) + 'x' + Math.max(a, b);
}

export function famById(id) {
  const [a, b] = id.split('x').map(Number);
  return { id, a, b };
}

// Wörter wie im Schulbuch („Das Dreifache von 9“, „Der vierte Teil von 36“, Denken und Rechnen 4, S. 98).
// „Produkt“ und „Quotient“ benutzen Buch und Lehrerin nicht.
const FACHE = { 2: 'Doppelte', 3: 'Dreifache', 4: 'Vierfache', 5: 'Fünffache', 6: 'Sechsfache', 7: 'Siebenfache', 8: 'Achtfache', 9: 'Neunfache' };
const TEIL = { 2: 'die Hälfte', 3: 'den dritten Teil', 4: 'den vierten Teil', 5: 'den fünften Teil', 6: 'den sechsten Teil', 7: 'den siebten Teil', 8: 'den achten Teil', 9: 'den neunten Teil' };

const PHRASES = {
  mal: [
    (x, y) => `Multipliziere ${x} mit ${y}.`,
    (x, y) => `Berechne das ${FACHE[x]} von ${y}.`,
    (x, y) => `Wie viel ist ${x} mal ${y}?`,
  ],
  geteilt: [
    (x, y) => `Dividiere ${x} durch ${y}.`,
    (x, y) => `Berechne ${TEIL[y]} von ${x}.`,
    (x, y) => `Wie oft passt ${y} in ${x}?`,
  ],
};

/**
 * Eine Aufgabe aus der Familie. Bei words = true kommt sie als Satz mit Fachbegriffen
 * („Dividiere 56 durch 7.“), sonst als Term („56 : 7“).
 */
export function makeQuestion(fam, r, words) {
  const { a, b } = fam;
  const variants = [['mal', a, b], ['geteilt', a * b, a]];
  if (a !== b) variants.push(['mal', b, a], ['geteilt', a * b, b]);
  const [op, x, y] = pick(r, variants);
  const answer = op === 'mal' ? x * y : x / y;
  return {
    kind: 'abruf', fam: fam.id, op, x, y, answer,
    term: op === 'mal' ? `${x} · ${y}` : `${x} : ${y}`,
    words: words ? pick(r, PHRASES[op])(x, y) : null,
  };
}

const KERN = new Set([1, 2, 5, 10]);
// Welcher Faktor sich am leichtesten zerlegen lässt (niedriger = leichter)
const SPLIT_RANK = { 6: 0, 9: 1, 3: 2, 4: 3, 7: 4, 8: 5 };

/**
 * Rechenweg über eine Kernaufgabe (·2, ·5, ·10). Liefert Tipp (ohne Ergebnis),
 * vollständigen Rechenweg und das Punktefeld: n Reihen mit je m Punkten.
 */
export function strategy(x, y) {
  let n;
  let m;
  if (y === 2 && x !== 2) { n = 2; m = x; }
  else if (KERN.has(x)) { n = x; m = y; }
  else if (KERN.has(y)) { n = y; m = x; }
  else if (SPLIT_RANK[x] <= SPLIT_RANK[y]) { n = x; m = y; }
  else { n = y; m = x; }
  const p = n * m;

  if (n === 1) return { n, m, rows: ['a'], hint: `Tipp: Einmal ${m} ist ${m}.`, way: `1 · ${m} = ${m}` };
  if (n === 10) return { n, m, rows: Array(10).fill('a'), hint: `Tipp: Bei mal 10 kommt eine Null dazu.`, way: `10 · ${m} = ${p}` };
  if (n === 2) return { n, m, rows: ['a', 'b'], hint: `Tipp: Verdopple ${m}.`, way: `${m} + ${m} = ${p}` };
  if (n === 5) {
    return {
      n, m, rows: [...Array(5).fill('a'), ...Array(5).fill('ghost')],
      hint: `Tipp: 10 · ${m} = ${10 * m}. Die Hälfte davon.`,
      way: `10 · ${m} = ${10 * m}, die Hälfte ist ${p}`,
    };
  }
  if (n === 4) {
    return {
      n, m, rows: ['a', 'a', 'b', 'b'],
      hint: `Tipp: 2 · ${m} = ${2 * m}. Das Doppelte davon.`,
      way: `2 · ${m} = ${2 * m}, ${2 * m} + ${2 * m} = ${p}`,
    };
  }
  if (n === 8 || n === 9) {
    const k = 10 - n;
    return {
      n, m, rows: [...Array(n).fill('a'), ...Array(k).fill('ghost')],
      hint: `Tipp: 10 · ${m} = ${10 * m}. Davon ${k} · ${m} weg.`,
      way: `10 · ${m} = ${10 * m}, ${k} · ${m} = ${k * m}, ${10 * m} − ${k * m} = ${p}`,
    };
  }
  const base = n === 3 ? 2 : 5;
  const k = n - base;
  return {
    n, m, rows: [...Array(base).fill('a'), ...Array(k).fill('b')],
    hint: `Tipp: ${base} · ${m} = ${base * m}. Dazu noch ${k} · ${m}.`,
    way: `${base} · ${m} = ${base * m}, ${k} · ${m} = ${k * m}, ${base * m} + ${k * m} = ${p}`,
  };
}

/** Tipp für Geteilt-Aufgaben: über die Malaufgabe mit einem Anker, der nicht die Lösung ist. */
export function divisionHint(x, y) {
  const ans = x / y;
  const order = ans <= 5 ? [2, 5, 10] : ans >= 8 ? [10, 5, 2] : [5, 10, 2];
  const k = order.find((c) => c !== ans && c * y !== ans);
  return `Tipp: ? · ${y} = ${x}. Denk an ${k} · ${y} = ${k * y}.`;
}

export function judgeAbruf(q, value) {
  const ok = value === q.answer;
  if (q.op === 'mal') {
    const s = strategy(q.x, q.y);
    return {
      ok,
      hint: s.hint,
      way: `${q.term} = ${q.answer}` + (s.n === 1 || s.n === 10 ? '' : ` (${s.way})`),
      field: s,
    };
  }
  return {
    ok,
    hint: divisionHint(q.x, q.y),
    way: `${q.term} = ${q.answer}, weil ${q.answer} · ${q.y} = ${q.x}`,
    field: { n: q.answer, m: q.y, rows: Array(q.answer).fill('a') },
  };
}
