// Baustelle: Mauer (mal), Turm (geteilt) mit Zehnerzahlen, Kran am Zahlenstrahl.
// Stufe 2 des Mauerrings (docs/inhalte.md): Hunderter (6 · 700) und Zehner mal Zehner (60 · 70).
import { randInt, shuffle } from './rng.js';
import { FAMILIES, famById, famId } from './einmaleins.js';
import { fmt } from './parse.js';

export const BLOCK = ['mauer', 'turm', 'kran', 'mauer', 'turm', 'kran', 'mauer'];

/** Aufgabenarten der Stufe 2, als Mauer, Turm und gepflasterter Burghof. */
export const M2_KINDS = ['mauer', 'hof', 'turm', 'reihe', 'hofteil'];
/** Beim ersten Mal: erst zweimal mal, dann einmal geteilt, und zwar am Anfang des Blocks. */
const M2_INTRO = ['mauer', 'hof', 'turm'];
const M2_SLOTS_INTRO = [0, 1, 3];
/** Danach gemischt mit Stufe 1 (verwechselbare Aufgaben nebeneinander). */
const M2_SLOTS_MIX = [1, 3, 6];

/**
 * Familien in Reihenfolge: zuerst die zur Wiederholung, dann der Rest gemischt. Mit stage(id)
 * kommen vom Rest erst Mauerstücke, die noch nie dran waren (Bauplan), zuletzt fertige (Fahne).
 */
function famPool(r, ids, prefer, stage) {
  const base = shuffle(r, ids);
  const rest = base.filter((id) => !prefer.includes(id));
  // Sortieren zieht keinen Zufall: Der Block bleibt bis auf die Reihenfolge der Familien gleich
  if (stage) rest.sort((a, b) => stage(a) - stage(b));
  return [...prefer.filter((id) => base.includes(id)), ...rest];
}

/**
 * Bauaufträge für einen Block. Bevorzugt Einmaleins-Familien, die schon sitzen (familyOk),
 * damit die Nullen das Thema sind und nicht das Einmaleins. prefer: Familien, deren
 * Mauerstück gerade wiederholt werden soll, kommen zuerst dran.
 * m2: { fams, prefer, intro } für Stufe 2, sonst null. Bis zu drei Plätze bekommen dann Stufe 2.
 * stage(id, stufe): Stufe des Mauerstücks (0 Bauplan bis 3 Fahne), damit alle Familien drankommen.
 */
export function makeBauBlock(r, familyOk, kranMax, prefer = [], m2 = null, stage = null) {
  const all = FAMILIES.map((f) => f.id);
  const good = all.filter(familyOk);
  const pool = famPool(r, good.length >= 5 ? good : all, prefer, stage && ((id) => stage(id, 1)));
  const slots2 = m2 && m2.fams.length ? (m2.intro ? M2_SLOTS_INTRO : M2_SLOTS_MIX).slice(0, m2.fams.length) : [];
  // Zufall nur ziehen, wenn Stufe 2 dran ist: Ohne Stufe 2 bleibt der Block genau wie bisher
  const pool2 = slots2.length ? famPool(r, m2.fams, m2.prefer || [], stage && ((id) => stage(id, 2))) : [];
  const kinds2 = !slots2.length ? [] : m2.intro ? M2_INTRO : shuffle(r, M2_KINDS);
  const usedTargets = new Set();
  let k = 0;
  return BLOCK.map((kind, i) => {
    if (kind === 'kran') return makeKran(r, kranMax, usedTargets);
    const j = slots2.indexOf(i);
    if (j >= 0) return makeM2(kinds2[j], famById(pool2[j]), r);
    const f = famById(pool[k++ % pool.length]);
    const [a, b] = r() < 0.5 ? [f.a, f.b] : [f.b, f.a];
    const p = b * 10;
    if (kind === 'mauer') return { kind, rows: a, perRow: p, answer: a * p };
    return { kind, layers: a, perLayer: p, total: a * p, answer: a };
  });
}

/** Ein Auftrag der Stufe 2 zur Familie f, z. B. 6 · 7: 6 · 700, 60 · 70, 4200 : 700, 4200 : 6, 4200 : 60. */
export function makeM2(kind, f, r) {
  const [a, b] = r() < 0.5 ? [f.a, f.b] : [f.b, f.a];
  const n = a * b * 100;
  if (kind === 'mauer') return { kind, stufe: 2, rows: a, perRow: b * 100, answer: n };
  if (kind === 'turm') return { kind, stufe: 2, layers: a, perLayer: b * 100, total: n, answer: a };
  if (kind === 'reihe') return { kind, stufe: 2, rows: a, total: n, answer: b * 100 };
  if (kind === 'hof') return { kind, stufe: 2, rows: a * 10, perRow: b * 10, answer: n };
  if (kind === 'hofteil') return { kind, stufe: 2, rows: a * 10, total: n, answer: b * 10 };
  throw new Error(`Unbekannte Aufgabenart ${kind}`);
}

/** Zu welcher Einmaleins-Familie (und damit zu welchem Mauerstück) ein Bauauftrag gehört. */
export function bauFamily(t) {
  const u = t.stufe === 2 ? 100 : 10;
  if (t.kind === 'mauer') return famId(t.rows, t.perRow / u);
  if (t.kind === 'turm') return famId(t.layers, t.perLayer / u);
  if (t.kind === 'reihe') return famId(t.rows, t.answer / 100);
  if (t.kind === 'hof') return famId(t.rows / 10, t.perRow / 10);
  if (t.kind === 'hofteil') return famId(t.rows / 10, t.answer / 10);
  return null;
}

/** Wie viele Bausteine die Szene setzt (für den Ton). */
export function bauCount(t, x) {
  if (t.kind === 'turm') return Math.min(x, t.layers);
  if (t.kind === 'reihe') return t.rows;
  return Math.ceil(x / (t.kind === 'hofteil' ? t.answer : t.perRow));
}

const nullFix = (x, answer) => (x * 10 === answer ? ' Da fehlt eine Null.' : x === answer * 10 ? ' Da ist eine Null zu viel.' : '');

export function judgeBau(t, x) {
  const ok = x === t.answer;
  const nullErr = x * 10 === t.answer || x === t.answer * 10;
  const base = { ok, nullErr };
  if (t.kind === 'mauer' || t.kind === 'hof') {
    const hof = t.kind === 'hof';
    const what = hof ? 'der Hof' : 'die Mauer';
    let title;
    let msg;
    if (ok) {
      title = 'Passt genau!';
      msg = `${hof ? 'Der Hof ist gepflastert' : 'Die Mauer steht'}. ${t.rows} Reihen mit je ${t.perRow} Steinen sind ${fmt(t.answer)} Steine.`;
    } else if (x * 10 === t.answer) { title = 'Viel zu wenig'; msg = `Die Steine reichen nur für ein Stück. Da fehlt eine Null.`; }
    else if (x === t.answer * 10) { title = 'Viel zu viel'; msg = `Das reicht für zehnmal so viel, wie ${what} braucht. Da ist eine Null zu viel.`; }
    else if (x < t.answer) { title = 'Zu wenig'; msg = `Die Steine reichen nicht für ${hof ? 'den ganzen Hof' : 'die ganze Mauer'}.`; }
    else { title = 'Zu viel'; msg = `Das sind mehr Steine, als ${what} braucht.`; }
    let hint;
    let way;
    if (hof) {
      const a = t.rows / 10;
      const b = t.perRow / 10;
      hint = `Tipp: Jede Platte hat 10 · 10 = 100 Steine. Wie viele Platten passen in den Hof?`;
      way = `${a} · ${b} = ${a * b} Platten zu 100 Steinen, also ${t.rows} · ${t.perRow} = ${fmt(t.answer)}`;
    } else {
      const u = t.stufe === 2 ? 100 : 10;
      const z = t.perRow / u;
      const name = u === 100 ? 'Hunderter' : 'Zehner';
      hint = `Tipp: ${t.rows} · ${t.perRow} sind ${t.rows} · ${z} ${name}.`;
      way = u === 100
        ? `${t.rows} · ${z} = ${t.rows * z}, also ${t.rows} · ${t.perRow} = ${t.rows * z} Hunderter = ${fmt(t.answer)}`
        : `${t.rows} · ${z} = ${t.rows * z}, also ${t.rows} · ${t.perRow} = ${t.answer}`;
    }
    return { ...base, title, msg, hint, way };
  }
  if (t.kind === 'turm') {
    const u = t.stufe === 2 ? 100 : 10;
    const name = u === 100 ? 'Hunderter' : 'Zehner';
    let title;
    let msg;
    if (ok) { title = 'Passt genau!'; msg = `${t.answer} Lagen mit je ${t.perLayer} Steinen sind ${fmt(t.total)}. Das Lager ist leer.`; }
    else if (x > t.answer) { title = 'Steine reichen nicht'; msg = `Nach ${t.answer} Lagen ist das Lager leer.` + (x === t.answer * 10 ? ' Da ist eine Null zu viel.' : ''); }
    else { title = 'Da bleibt was übrig'; msg = `Nach ${x} ${x === 1 ? 'Lage' : 'Lagen'} liegen noch ${fmt(t.total - x * t.perLayer)} Steine im Lager.`; }
    return {
      ...base, nullErr: x === t.answer * 10, title, msg,
      hint: `Tipp: ${fmt(t.total)} sind ${t.total / u} ${name}, ${t.perLayer} sind ${t.perLayer / u} ${name}.`,
      way: `${t.total / u} : ${t.perLayer / u} = ${t.answer}, also ${fmt(t.total)} : ${t.perLayer} = ${t.answer}`,
    };
  }
  // reihe und hofteil: Die Steine werden auf gleich lange Reihen verteilt, gesucht ist eine Reihe.
  const need = t.rows * x;
  let title;
  let msg;
  if (ok) { title = 'Passt genau!'; msg = `${t.rows} Reihen mit je ${fmt(t.answer)} Steinen sind ${fmt(t.total)}. Kein Stein bleibt übrig.`; }
  else if (need > t.total) { title = 'Steine reichen nicht'; msg = `Für ${t.rows} Reihen mit je ${fmt(x)} Steinen bräuchtest du ${fmt(need)} Steine.`; }
  else { title = 'Da bleibt was übrig'; msg = `${t.rows} Reihen mit je ${fmt(x)} Steinen brauchen nur ${fmt(need)}. Es bleiben ${fmt(t.total - need)} übrig.`; }
  // Beim Null-Fehler steht die Rechnung schon im Tipp; zweimal wäre es am TV zu viel Text
  if (nullErr) msg = nullFix(x, t.answer).trim();
  const hofteil = t.kind === 'hofteil';
  // Bei einem Null-Fehler: mit der Umkehraufgabe prüfen lassen, statt die Lösung zu verraten
  const hint = nullErr
    ? `Prüf mit der Umkehraufgabe: ${t.rows} · ${fmt(x)} = ${fmt(need)}. Es sollen aber ${fmt(t.total)} sein.`
    : hofteil
      ? `Tipp: ${fmt(t.total)} Steine sind ${t.total / 100} Platten. ${t.rows} Reihen sind ${t.rows / 10} Plattenreihen.`
      : `Tipp: ${fmt(t.total)} sind ${t.total / 100} Hunderter.`;
  const way = hofteil
    ? `${t.total / 100} : ${t.rows / 10} = ${t.answer / 10} Platten je Reihe, also ${fmt(t.total)} : ${t.rows} = ${t.answer}`
    : `${t.total / 100} : ${t.rows} = ${t.answer / 100}, also ${fmt(t.total)} : ${t.rows} = ${t.answer / 100} Hunderter = ${t.answer}`;
  return { ...base, title, msg, hint, way };
}

/** Wie viele volle Reihen und was in der angefangenen Reihe liegt (Hunderter, Zehner, Einer). */
export function mauerModel(x, perRow) {
  const full = Math.floor(x / perRow);
  const rest = x % perRow;
  return { full, rest, restH: Math.floor(rest / 100), restBars: Math.floor((rest % 100) / 10), restOnes: rest % 10 };
}

/** Wie viele Lagen gebaut werden können und was im Lager bleibt. */
export function turmModel(t, x) {
  const built = Math.min(x, t.layers);
  return { built, left: t.total - built * t.perLayer };
}

/** Bündeln in Hunderter, Zehner, Einer. */
export function bundles(n) {
  return { h: Math.floor(n / 100), z: Math.floor((n % 100) / 10), e: n % 10 };
}

/** Bündeln in Tausender, Hunderter, Zehner, Einer (Lager der Stufe 2). */
export function bundlesT(n) {
  return { t: Math.floor(n / 1000), ...bundles(n % 1000) };
}

/** Steine auf gleich lange Reihen verteilen: wie viele Reihen voll werden und was übrig bleibt. */
export function reiheModel(t, x) {
  const full = x > 0 ? Math.min(t.rows, Math.floor(t.total / x)) : 0;
  return { full, part: x > 0 && full < t.rows ? t.total - full * x : 0, left: Math.max(0, t.total - t.rows * x) };
}

// ---------- Kran am Zahlenstrahl ----------

/** Zahlenstrahl-Bereiche; der nächste wird nach 3 Volltreffern in Folge frei. */
export const KRAN_LEVELS = [1000, 10000, 100000, 1000000];

/** Ziel: Vielfaches von max/100, aber keine Marke mit Beschriftung (max/10). */
export function makeKran(r, max, used) {
  const step = max / 100;
  let target;
  do target = randInt(r, 3, 97) * step;
  while (target % (max / 10) === 0 || (used && used.has(target)));
  if (used) used.add(target);
  return { kind: 'kran', max, target, answer: target };
}

/** Zeigerposition (0..1) als Zahl, gerundet auf max/1000. */
export function kranValue(frac, max) {
  const f = Math.min(1, Math.max(0, frac));
  const step = max / 1000;
  return Math.round((f * max) / step) * step;
}

export function judgeKran(t, x) {
  const err = Math.abs(x - t.target);
  const hit = err <= t.max / 100;
  const near = err <= t.max / 33;
  return {
    ok: near, hit, err,
    title: hit ? 'Volltreffer!' : near ? 'Knapp daneben' : 'Daneben',
    msg: `Abgeladen bei ${fmt(x)}, das Ziel war ${fmt(t.target)}.`,
    hint: '', way: '',
  };
}
