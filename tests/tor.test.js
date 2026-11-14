import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeWaage, makePvs, makeTorBlock, torOpen, torSteps, opChoices, judgeStep, pvsTokens, pvsText, partText, logTor,
  leftToRight, TOR_PARTS, MAL, GETEILT, PLUS, MINUS,
} from '../src/js/tor.js';
import { torLayout, sceneTor } from '../src/js/torszene.js';
import { rng } from '../src/js/rng.js';
import { newProfile, recordTor, recordGeo } from '../src/js/motor.js';
import { burgParts, torStage, stationsToday, PLAN, GERUEST, STEIN, FAHNE } from '../src/js/burg.js';

const SEEDS = 300;
const DAY = 86400000;
const T0 = new Date('2026-11-02T16:00:00').getTime(); // ein Montag

/** Unabhängige Auswertung mit Punkt vor Strich: erst alle · und :, dann + und − von links. */
function evalPvs(tokens) {
  const t = tokens.slice();
  for (let i = 1; i < t.length;) {
    if (t[i] === MAL || t[i] === GETEILT) {
      const a = t[i - 1];
      const b = t[i + 1];
      if (t[i] === GETEILT) assert.equal(a % b, 0, `${a} : ${b} geht nicht auf`);
      t.splice(i - 1, 3, t[i] === MAL ? a * b : a / b);
    } else i += 2;
  }
  let v = t[0];
  for (let i = 1; i < t.length; i += 2) v = t[i] === PLUS ? v + t[i + 1] : v - t[i + 1];
  return v;
}

const checkPart = (p) => {
  assert.ok([MAL, GETEILT].includes(p.op));
  assert.equal(p.val, p.op === MAL ? p.a * p.b : p.a / p.b);
  assert.ok(Number.isInteger(p.val) && p.val > 0, `${partText(p)} = ${p.val}`);
  if (!p.zehner) return;
  // Die Tipps rechnen in Zehnern: Das muss aufgehen
  if (p.op === MAL) assert.ok(p.a % 10 === 0 || p.b % 10 === 0);
  else if (p.b % 10 === 0) assert.ok(p.a % 10 === 0);
  else assert.equal((p.a / 10) % p.b, 0, `${partText(p)}: Zehner gehen nicht auf`);
};
const numbersIn = (s) => (s.match(/\d+/g) || []).map(Number);

test('Waage: Zeichen stimmt, Seiten nah beieinander, keine Tauschaufgabe; Stufe 2 immer mit Zehnerzahl', () => {
  const rels = { 1: {}, 2: {} };
  for (const stufe of [1, 2]) {
    for (let s = 1; s <= SEEDS; s++) {
      const w = makeWaage(rng(s), stufe);
      checkPart(w.left);
      checkPart(w.right);
      const L = w.left.val;
      const R = w.right.val;
      assert.equal(w.rel, L < R ? '<' : L > R ? '>' : '=');
      assert.ok(Math.abs(L - R) <= Math.max(4, Math.round(0.15 * Math.max(L, R))), `${L} und ${R} zu weit auseinander`);
      assert.ok(!(w.left.op === w.right.op && w.left.op === MAL && w.left.a === w.right.b && w.left.b === w.right.a), 'Tauschaufgabe');
      assert.ok(!(w.left.op === w.right.op && w.left.a === w.right.a && w.left.b === w.right.b), 'gleiche Seiten');
      if (stufe === 2) assert.ok(w.left.zehner || w.right.zehner, 'Stufe 2 ohne Zehnerzahl');
      if (stufe === 1) assert.ok(!(w.left.zehner && w.right.zehner), 'Stufe 1 mit zwei Zehnerzahlen');
      rels[stufe][w.rel] = (rels[stufe][w.rel] || 0) + 1;
      assert.deepEqual(makeWaage(rng(s), stufe), w, 'gleicher Seed, gleiche Aufgabe');
    }
  }
  for (const stufe of [1, 2]) for (const r of ['<', '=', '>']) assert.ok(rels[stufe][r] > SEEDS / 8, `Stufe ${stufe}: zu selten ${r}`);
});

test('Punkt vor Strich: Ergebnis stimmt, von links gerechnet käme etwas anderes heraus', () => {
  const forms = {};
  for (const stufe of [3, 4]) {
    for (let s = 1; s <= SEEDS; s++) {
      const t = makePvs(rng(s), stufe);
      const tokens = pvsTokens(t);
      assert.equal(evalPvs(tokens), t.val, pvsText(t));
      assert.ok(t.val > 0 || t.s === PLUS, `${pvsText(t)} = ${t.val}`);
      assert.notEqual(leftToRight(tokens), t.val, `${pvsText(t)}: von links gleiches Ergebnis`);
      const parts = t.items.filter((x) => typeof x !== 'number');
      assert.ok(parts.length >= 1);
      parts.forEach(checkPart);
      t.items.filter((x) => typeof x === 'number').forEach((n) => assert.ok(Number.isInteger(n) && n > 0));
      if (stufe === 3) {
        assert.ok(parts.every((p) => !p.zehner), `${pvsText(t)}: Stufe 3 mit Zehnerzahl`);
        assert.ok(t.val <= 150);
      } else {
        assert.ok(parts.some((p) => p.zehner), `${pvsText(t)}: Stufe 4 ohne Zehnerzahl`);
        assert.ok(t.val <= 1000);
      }
      const form = t.items.map((x) => (typeof x === 'number' ? 'n' : 'P')).join('') + t.s;
      forms[form] = (forms[form] || 0) + 1;
      assert.deepEqual(makePvs(rng(s), stufe), t, 'gleicher Seed, gleiche Aufgabe');
    }
  }
  for (const f of ['PP+', 'PP−', 'nP+', 'nP−']) assert.ok(forms[f] > 10, `Form ${f} kommt zu selten vor (${forms[f] || 0})`);
});

test('Schritte: Waage rechnet beide Seiten, dann das Zeichen; Punkt vor Strich zuerst das gezeigte Rechenzeichen', () => {
  const w = makeWaage(rng(7), 1);
  assert.deepEqual(torSteps(w).map((s) => s.kind), ['calc', 'calc', 'sign']);
  for (let s = 1; s <= 80; s++) {
    const t = makePvs(rng(s), 3 + (s % 2));
    const ch = opChoices(t);
    assert.deepEqual(ch.map((c) => c.punkt), pvsTokens(t).filter((x) => typeof x === 'string').map((o) => o === MAL || o === GETEILT));
    assert.equal(ch.filter((c) => !c.punkt).length, 1, 'genau ein Strichzeichen');
    for (const c of ch.filter((x) => x.punkt)) {
      const steps = torSteps(t, c.item);
      assert.equal(steps[0].kind, 'first');
      assert.equal(steps[1].item, c.item, 'die gezeigte Punktrechnung kommt zuerst');
      const last = steps[steps.length - 1];
      assert.equal(last.kind, 'final');
      assert.equal(last.val, t.val);
      assert.equal(last.s === PLUS ? last.a + last.b : last.a - last.b, t.val);
      assert.equal(steps.filter((x) => x.kind === 'calc').length, t.items.filter((x) => typeof x !== 'number').length);
    }
    assert.equal(judgeStep(t, { kind: 'first' }, ch.findIndex((c) => !c.punkt)).ok, false);
    assert.equal(judgeStep(t, { kind: 'first' }, ch.findIndex((c) => c.punkt)).ok, true);
  }
});

test('Bewertung: richtig, Null-Fehler erkannt, Tipps verraten das Ergebnis nicht', () => {
  for (let s = 1; s <= SEEDS; s++) {
    const t = s % 2 ? makeWaage(rng(s), 1 + (s % 4 === 1 ? 1 : 0)) : makePvs(rng(s), 3 + (s % 4 === 0 ? 1 : 0));
    const steps = torSteps(t, t.kind === 'pvs' ? opChoices(t).find((c) => c.punkt).item : null);
    for (const st of steps) {
      if (st.kind === 'first') continue;
      if (st.kind === 'sign') {
        assert.equal(judgeStep(t, st, t.rel).ok, true);
        for (const v of ['<', '=', '>'].filter((x) => x !== t.rel)) assert.equal(judgeStep(t, st, v).ok, false);
        continue;
      }
      assert.equal(judgeStep(t, st, st.val).ok, true);
      const z = judgeStep(t, st, st.val * 10);
      assert.equal(z.ok, false);
      assert.equal(z.nullErr, true);
      const wrong = judgeStep(t, st, st.val + 1);
      assert.equal(wrong.nullErr, false);
      // Der Tipp nennt das Ergebnis nicht, außer es steht ohnehin als Zahl in der Aufgabe
      // dazu Zehner der Zahlen: „810 sind 81 Zehner, 90 sind 9 Zehner“ bei 810 : 90 = 9 ist Zufall, kein Verraten
      const shown = st.kind === 'calc' ? [st.part.a, st.part.b, st.part.a / 10, st.part.b / 10] : [st.a, st.b];
      if (!shown.includes(st.val)) assert.ok(!numbersIn(wrong.hint).includes(st.val), `Tipp verrät ${st.val}: ${wrong.hint}`);
      assert.ok(numbersIn(wrong.way).includes(st.val), `Rechenweg ohne Ergebnis: ${wrong.way}`);
      if (st.kind === 'calc' && !st.part.zehner) assert.ok(!z.hint.includes('Nullen'), z.hint);
    }
  }
});

test('Zeichnung: keine kaputten Werte, Rechnung passt in die Breite, Bogen erst nach der Frage „zuerst?“', () => {
  for (let s = 1; s <= 120; s++) {
    const t = s % 2 ? makeWaage(rng(s), 1 + (s % 3 ? 1 : 0)) : makePvs(rng(s), 3 + (s % 3 ? 1 : 0));
    const L = torLayout(t);
    for (const b of L.boxes) assert.ok(b.x >= 40 && b.x + b.w <= 960, `${JSON.stringify(logTor(t))} ragt hinaus`);
    const steps = torSteps(t, t.kind === 'pvs' ? opChoices(t).find((c) => c.punkt).item : null);
    const done = {};
    steps.forEach((cur, i) => {
      const svg = sceneTor(t, L, { done, cur, sign: null, final: null, badOp: null, tilt: '0', fresh: null, pick: cur.kind === 'first' });
      assert.ok(!/NaN|undefined/.test(svg), `Szene kaputt bei Schritt ${i}`);
      if (cur.kind === 'first') {
        assert.ok(!svg.includes('tor-arc'), 'Bogen verrät die Punktrechnung');
        assert.equal((svg.match(/class="opt/g) || []).length, opChoices(t).length);
      }
      if (cur.kind === 'calc') done[cur.item] = { val: cur.val, given: false };
    });
    const end = sceneTor(t, L, { done, cur: null, sign: t.kind === 'waage' ? { v: t.rel, given: false } : null, final: t.kind === 'pvs' ? { val: t.val, given: true } : null, badOp: null, tilt: 'l', fresh: 'sign', pick: false });
    assert.ok(!/NaN|undefined/.test(end));
  }
});

test('Runde: Waage und Punkt vor Strich im Wechsel, Stufe 2 und 4 erst nach einem guten Tag', () => {
  const fresh = () => ({ stage: PLAN, seen: 0, okDays: 0, lastDay: null });
  const b0 = makeTorBlock(rng(1), fresh, 100);
  assert.deepEqual(b0.map((x) => x.part), ['waage1', 'pvs1', 'waage1', 'pvs1']);
  assert.deepEqual(b0.map((x) => x.t.kind), ['waage', 'pvs', 'waage', 'pvs']);
  assert.deepEqual(makeTorBlock(rng(1), fresh, 100), b0);
  const good = (id) => (id === 'waage1' || id === 'pvs1' ? { stage: GERUEST, seen: 3, okDays: 1, lastDay: 99 } : fresh());
  assert.deepEqual(torOpen(good), { waage2: true, pvs2: true });
  const b1 = makeTorBlock(rng(2), good, 100);
  assert.deepEqual(b1.map((x) => x.part).sort(), ['pvs1', 'pvs2', 'waage1', 'waage2']);
  assert.equal(b1[0].part, 'waage2', 'die neue Stufe zuerst');
  assert.deepEqual(b1.map((x) => x.t.stufe), b1.map((x) => TOR_PARTS.find((g) => g.id === x.part).stufe));
});

test('Tor in der Burg: Waage mit Tempo wie Kopfrechnen; Punkt vor Strich über Tage; höchstens 1 Fehler in den letzten 5', () => {
  const p = newProfile('Test', T0);
  assert.ok(burgParts(p).filter((x) => x.area === 'tor').every((x) => x.stage === PLAN));
  recordTor(p, 'waage1', true, 40000, T0);
  assert.equal(torStage(p, 'waage1'), GERUEST);
  recordTor(p, 'waage1', true, 40000, T0 + DAY);
  assert.equal(torStage(p, 'waage1'), STEIN, 'zwei Tage richtig');
  recordTor(p, 'waage1', true, 9000, T0 + 2 * DAY);
  recordTor(p, 'waage1', true, 9000, T0 + 3 * DAY);
  assert.equal(torStage(p, 'waage1'), FAHNE, 'zwei Tage schnell');

  for (let d = 0; d < 3; d++) recordTor(p, 'pvs1', true, 90000, T0 + d * DAY);
  assert.equal(torStage(p, 'pvs1'), STEIN, 'Punkt vor Strich ohne Zeitgrenze');
  recordTor(p, 'pvs1', true, 90000, T0 + 3 * DAY);
  assert.equal(torStage(p, 'pvs1'), FAHNE);

  // Zwei Fehler unter den letzten 5: Auch ein richtiger Versuch zählt dann nicht als guter Tag
  recordTor(p, 'pvs2', false, 0, T0, true);
  recordTor(p, 'pvs2', false, 0, T0);
  assert.equal(recordTor(p, 'pvs2', true, 0, T0 + DAY), false);
  assert.equal(p.tor.pvs2.okDays.length, 0);
  assert.equal(p.tor.pvs2.nullErr, 1);
  recordTor(p, 'pvs2', true, 0, T0 + 2 * DAY);
  recordTor(p, 'pvs2', true, 0, T0 + 2 * DAY);
  assert.equal(recordTor(p, 'pvs2', true, 0, T0 + 3 * DAY), true, 'Fehler sind aus den letzten 5 heraus');
  const parts = burgParts(p).filter((x) => x.area === 'tor');
  assert.deepEqual(parts.map((x) => x.tor), ['waage1', 'waage2', 'pvs1', 'pvs2']);
  assert.ok(parts.every((x) => x.need && x.label));
});

test('Stationen: unter der Woche abwechselnd Steinmetzhütte und Tor, am Wochenende beide', () => {
  const p = newProfile('Test', T0);
  assert.deepEqual(stationsToday(p, T0), ['steinmetz'], 'beide neu: zuerst der aktuelle Schulstoff');
  recordGeo(p, 'quadrat', true, T0);
  assert.deepEqual(stationsToday(p, T0), ['tor'], 'zweite Runde am selben Tag');
  recordTor(p, 'waage1', true, 9000, T0);
  assert.deepEqual(stationsToday(p, T0 + DAY), ['steinmetz']);
  recordGeo(p, 'quadrat', true, T0 + DAY);
  assert.deepEqual(stationsToday(p, T0 + 2 * DAY), ['tor']);
  assert.deepEqual(stationsToday(p, T0 + 5 * DAY), ['steinmetz', 'tor'], 'Samstag');
  assert.deepEqual(stationsToday(p, T0 + 6 * DAY), ['steinmetz', 'tor'], 'Sonntag');
});
