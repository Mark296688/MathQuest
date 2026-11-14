import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBauBlock, makeM2, judgeBau, bauFamily, bauCount, reiheModel, bundlesT, M2_KINDS, BLOCK } from '../src/js/bau.js';
import { burgParts, m2Ready, m2Plan, mauerStage, mauerPrefer, GERUEST, STEIN, FAHNE, PLAN } from '../src/js/burg.js';
import { newProfile, updateCard, recordMauer, recordBau, MAUER_FAST_MS } from '../src/js/motor.js';
import { sceneMauer, sceneTurm, sceneReihe, sceneHof, sceneHofteil } from '../src/js/scenes.js';
import { FAMILIES, famById } from '../src/js/einmaleins.js';
import { rng } from '../src/js/rng.js';
import { fmt } from '../src/js/parse.js';

const T0 = new Date(2026, 9, 25, 17, 0).getTime();
const DAY = 86400000;
const ALL = FAMILIES.map((f) => f.id);

test('Stufe 2: jede Aufgabe ist richtig gerechnet und gehört zu ihrer Familie (alle Familien, viele Seeds)', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed);
    for (const id of ALL) {
      const f = famById(id);
      for (const kind of M2_KINDS) {
        const t = makeM2(kind, f, r);
        assert.equal(t.kind, kind);
        assert.equal(t.stufe, 2);
        assert.equal(bauFamily(t), id);
        if (kind === 'mauer') {
          assert.equal(t.answer, t.rows * t.perRow);
          assert.ok(t.perRow % 100 === 0 && t.perRow >= 200 && t.perRow <= 900);
        } else if (kind === 'turm') {
          assert.equal(t.total, t.layers * t.perLayer);
          assert.equal(t.total / t.perLayer, t.answer);
          assert.equal(t.perLayer % 100, 0);
        } else if (kind === 'reihe') {
          assert.equal(t.total / t.rows, t.answer);
          assert.equal(t.answer % 100, 0);
        } else if (kind === 'hof') {
          assert.equal(t.answer, t.rows * t.perRow);
          assert.ok(t.rows % 10 === 0 && t.perRow % 10 === 0 && t.rows <= 90 && t.perRow <= 90);
        } else {
          assert.equal(t.total / t.rows, t.answer);
          assert.ok(t.rows % 10 === 0 && t.answer % 10 === 0);
        }
        // Alle Zahlen der Stufe 2 liegen im Zahlenraum bis 10 000 (Schulstoff Wo. 4–8)
        assert.ok((t.total || t.answer) <= 8100);
      }
    }
  }
});

test('Stufe 2 im Block: Einführung am Anfang, danach gemischt, keine Familie doppelt', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const fams2 = ALL.slice(0, 1 + (seed % 8));
    const intro = seed % 2 === 0;
    const tasks = makeBauBlock(rng(seed), () => true, 1000, [], { fams: fams2, prefer: [], intro });
    assert.equal(tasks.length, BLOCK.length);
    tasks.forEach((t, i) => assert.equal(t.kind === 'kran', BLOCK[i] === 'kran'));
    const s2 = tasks.map((t, i) => [t, i]).filter(([t]) => t.stufe === 2);
    assert.equal(s2.length, Math.min(3, fams2.length));
    const slots = s2.map(([, i]) => i);
    const want = intro ? [0, 1, 3] : [1, 3, 6];
    assert.deepEqual(slots, want.slice(0, slots.length));
    if (intro) assert.deepEqual(s2.map(([t]) => t.kind), ['mauer', 'hof', 'turm'].slice(0, slots.length));
    const f2 = s2.map(([t]) => bauFamily(t));
    assert.equal(new Set(f2).size, f2.length);
    assert.ok(f2.every((id) => fams2.includes(id)));
    // Die übrigen Bauplätze bleiben Stufe 1 (Zehnerzahlen)
    for (const t of tasks) if (t.kind !== 'kran' && !t.stufe) assert.ok(t.perRow ? t.perRow < 100 : t.perLayer < 100);
  }
});

test('Ohne bereite Familien bleibt der Block wie bisher', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const a = makeBauBlock(rng(seed), () => true, 1000, []);
    const b = makeBauBlock(rng(seed), () => true, 1000, [], { fams: [], prefer: [], intro: true });
    assert.deepEqual(a, b);
    assert.ok(a.every((t) => !t.stufe));
  }
});

test('Rückmeldung Stufe 2: Null-Fehler erkannt, Tipp verrät die Lösung nicht, Rechenweg über die Kernaufgabe', () => {
  const m = { kind: 'mauer', stufe: 2, rows: 6, perRow: 700, answer: 4200 };
  assert.equal(judgeBau(m, 4200).ok, true);
  assert.equal(judgeBau(m, 420).nullErr, true);
  assert.match(judgeBau(m, 420).msg, /fehlt eine Null/);
  assert.match(judgeBau(m, 42000).msg, /Null zu viel/);
  assert.equal(judgeBau(m, 4100).nullErr, false);
  assert.equal(judgeBau(m, 420).hint, 'Tipp: 6 · 700 sind 6 · 7 Hunderter.');
  assert.equal(judgeBau(m, 420).way, '6 · 7 = 42, also 6 · 700 = 42 Hunderter = 4200');

  const h = { kind: 'hof', stufe: 2, rows: 60, perRow: 70, answer: 4200 };
  assert.match(judgeBau(h, 4200).msg, /gepflastert/);
  assert.equal(judgeBau(h, 420).nullErr, true);
  assert.equal(judgeBau(h, 1).way, '6 · 7 = 42 Platten zu 100 Steinen, also 60 · 70 = 4200');

  const tu = { kind: 'turm', stufe: 2, layers: 6, perLayer: 700, total: 4200, answer: 6 };
  assert.equal(judgeBau(tu, 60).nullErr, true);
  assert.match(judgeBau(tu, 5).msg, /noch 700 Steine/);
  assert.equal(judgeBau(tu, 6).way, '42 : 7 = 6, also 4200 : 700 = 6');

  const re = { kind: 'reihe', stufe: 2, rows: 6, total: 4200, answer: 700 };
  assert.equal(judgeBau(re, 70).nullErr, true);
  assert.equal(judgeBau(re, 70).msg, 'Da fehlt eine Null.');
  assert.equal(judgeBau(re, 7000).msg, 'Da ist eine Null zu viel.');
  assert.equal(judgeBau(re, 693).msg, '6 Reihen mit je 693 Steinen brauchen nur 4158. Es bleiben 42 übrig.');
  assert.equal(judgeBau(re, 800).msg, `Für 6 Reihen mit je 800 Steinen bräuchtest du 4800 Steine.`);
  assert.equal(judgeBau(re, 70).hint, 'Prüf mit der Umkehraufgabe: 6 · 70 = 420. Es sollen aber 4200 sein.');
  assert.equal(judgeBau(re, 700).way, '42 : 6 = 7, also 4200 : 6 = 7 Hunderter = 700');

  const ht = { kind: 'hofteil', stufe: 2, rows: 60, total: 4200, answer: 70 };
  assert.equal(judgeBau(ht, 7).nullErr, true);
  assert.equal(judgeBau(ht, 700).hint, `Prüf mit der Umkehraufgabe: 60 · 700 = ${fmt(42000)}. Es sollen aber 4200 sein.`);
  assert.equal(judgeBau(ht, 70).way, '42 : 6 = 7 Platten je Reihe, also 4200 : 60 = 70');

  // Kein Tipp nennt die Lösung, bei keiner Familie und keiner Art
  for (const id of ALL) {
    for (const kind of M2_KINDS) {
      const t = makeM2(kind, famById(id), rng(id.length));
      for (const x of [t.answer + 1, t.answer * 10, Math.max(1, t.answer / 10)]) {
        const j = judgeBau(t, x);
        const nums = (j.hint.match(/\d+(?:\u202f\d{3})*/g) || []).map((n) => Number(n.replace(/\u202f/g, '')));
        // Die Lösung darf nur vorkommen, wo sie zufällig gleich einer Zahl der Aufgabe ist (2 · 2: 20 Reihen, je 20).
        // Beim Turm ist die Lösung eine einzelne Ziffer und taucht zufällig auf (4900 : 700, „700 sind 7 Hunderter“)
        const given = [t.rows, t.perRow, t.total, t.perLayer];
        if (kind !== 'turm' && !given.includes(t.answer)) assert.ok(!nums.includes(t.answer), `${kind} ${id} ${x}: ${j.hint}`);
        assert.ok(j.way.endsWith(fmt(t.answer)), j.way);
      }
    }
  }
});

test('Modelle: Verteilen auf Reihen und Lager mit Tausendern', () => {
  const re = { rows: 6, total: 4200 };
  assert.deepEqual(reiheModel(re, 700), { full: 6, part: 0, left: 0 });
  assert.deepEqual(reiheModel(re, 70), { full: 6, part: 0, left: 3780 });
  assert.deepEqual(reiheModel(re, 7000), { full: 0, part: 4200, left: 0 });
  assert.deepEqual(reiheModel(re, 800), { full: 5, part: 200, left: 0 });
  assert.deepEqual(reiheModel(re, 0), { full: 0, part: 0, left: 4200 });
  assert.deepEqual(bundlesT(8100), { t: 8, h: 1, z: 0, e: 0 });
  assert.equal(bauCount({ kind: 'reihe', rows: 6 }, 70), 6);
  assert.equal(bauCount({ kind: 'hofteil', answer: 70 }, 140), 2);
});

test('Szenen der Stufe 2 zeichnen ohne Rechenfehler, auch bei falschen und riesigen Antworten', () => {
  const scenes = { mauer: sceneMauer, turm: sceneTurm, reihe: sceneReihe, hof: sceneHof, hofteil: sceneHofteil };
  for (const id of ALL) {
    for (const kind of M2_KINDS) {
      const t = makeM2(kind, famById(id), rng(7));
      for (const v of [null, t.answer, t.answer / 10, t.answer * 10, t.answer + 37, 0, 1, 9999999]) {
        const svg = scenes[kind](t, v);
        assert.doesNotMatch(svg, /NaN|undefined|Infinity/, `${kind} ${id} ${v}`);
        assert.ok(svg.length < 400000, `${kind} ${id} ${v}: ${svg.length} Zeichen`);
      }
    }
  }
});

test('Burg: Stufe 2 kommt erst, wenn Einmaleins und Zehnerzahl als Stein stehen', () => {
  const p = newProfile('Anna', T0);
  assert.equal(m2Ready(p, '6x7'), false);
  assert.match(burgParts(p).find((x) => x.id === 'mauer2:6x7').need, /sobald 6 · 7 im Fundament/);
  updateCard(p, '6x7', { firstOk: true, ms: 9000 }, T0);
  updateCard(p, '6x7', { firstOk: true, ms: 9000 }, T0 + DAY);
  recordMauer(p, '6x7', true, 20000, T0);
  assert.equal(m2Ready(p, '6x7'), false, 'Mauerstück erst Gerüst');
  recordMauer(p, '6x7', true, 20000, T0 + DAY);
  assert.equal(m2Ready(p, '6x7'), true);
  const plan = m2Plan(p, T0 + 2 * DAY);
  assert.deepEqual(plan.fams, ['6x7']);
  assert.equal(plan.intro, true);
  assert.match(burgParts(p).find((x) => x.id === 'mauer2:6x7').need, /6 · 700/);

  recordMauer(p, '6x7', true, MAUER_FAST_MS - 1, T0 + 2 * DAY, 2);
  assert.equal(m2Plan(p, T0 + 2 * DAY).intro, false);
  assert.equal(mauerStage(p, '6x7', 2), GERUEST);
  assert.equal(mauerStage(p, '6x7', 1), STEIN, 'Stufe 1 bleibt unberührt');
  assert.deepEqual(mauerPrefer(p, T0 + 3 * DAY, 3, 2), ['6x7']);
  recordMauer(p, '6x7', true, MAUER_FAST_MS - 1, T0 + 3 * DAY, 2);
  assert.equal(mauerStage(p, '6x7', 2), FAHNE);
  const part = burgParts(p).find((x) => x.id === 'mauer2:6x7');
  assert.equal(part.label, '6 · 700 und 60 · 70');
  assert.equal(part.ring, 2);
  assert.equal(burgParts(p).find((x) => x.id === 'mauer2:2x2').stage, PLAN);
});

test('Alte Spielstände ohne Stufe 2 laufen weiter', () => {
  const p = newProfile('Ben', T0);
  delete p.mauer2;
  delete p.bau2;
  assert.equal(burgParts(p).filter((x) => x.ring === 2).length, 36);
  assert.deepEqual(p.mauer2, {});
  recordBau(p, true, false, 2);
  recordBau(p, false, true, 2);
  recordBau(p, true, false);
  assert.deepEqual(p.bau2, { done: 2, firstOk: 1, nullErr: 1, recent: [true, false] });
  assert.equal(p.bau.done, 1, 'Zehnerzahlen getrennt gezählt');
});
