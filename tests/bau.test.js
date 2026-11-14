import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBauBlock, judgeBau, mauerModel, turmModel, bundles, makeKran, kranValue, judgeKran, KRAN_LEVELS, BLOCK } from '../src/js/bau.js';
import { rng } from '../src/js/rng.js';

test('Bauaufträge sind korrekt (viele Seeds, alle Zahlenräume)', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    const max = KRAN_LEVELS[seed % KRAN_LEVELS.length];
    const okFam = seed % 2 ? () => true : (id) => id.startsWith('2') || id.startsWith('5');
    const tasks = makeBauBlock(rng(seed), okFam, max);
    assert.deepEqual(tasks.map((t) => t.kind), BLOCK);
    const pairs = new Set();
    for (const t of tasks) {
      if (t.kind === 'mauer') {
        assert.equal(t.answer, t.rows * t.perRow);
        assert.ok(t.rows >= 2 && t.rows <= 9 && t.perRow % 10 === 0 && t.perRow >= 20 && t.perRow <= 90);
        pairs.add(t.rows + 'x' + t.perRow);
      } else if (t.kind === 'turm') {
        assert.equal(t.total, t.layers * t.perLayer);
        assert.equal(t.total / t.perLayer, t.answer);
        pairs.add(t.layers + 'x' + t.perLayer);
      } else {
        assert.equal(t.max, max);
        assert.ok(t.target > 0 && t.target < max);
        assert.equal(t.target % (max / 100), 0);
        assert.notEqual(t.target % (max / 10), 0);
      }
    }
    assert.equal(pairs.size, 5, 'kein Paar doppelt im Block');
  }
});

test('Rückmeldung und Rechenweg bei Bauaufträgen', () => {
  const m = { kind: 'mauer', rows: 6, perRow: 60, answer: 360 };
  assert.equal(judgeBau(m, 360).way, '6 · 6 = 36, also 6 · 60 = 360');
  assert.equal(judgeBau(m, 36).nullErr, true);
  assert.match(judgeBau(m, 36).msg, /fehlt eine Null/);
  assert.match(judgeBau(m, 3600).msg, /Null zu viel/);
  assert.equal(judgeBau(m, 350).nullErr, false);
  assert.doesNotMatch(judgeBau(m, 36).hint, /\b360\b/);

  const t = { kind: 'turm', layers: 9, perLayer: 60, total: 540, answer: 9 };
  assert.equal(judgeBau(t, 9).way, '54 : 6 = 9, also 540 : 60 = 9');
  assert.equal(judgeBau(t, 90).nullErr, true);
  assert.match(judgeBau(t, 8).msg, /noch 60 Steine/);
});

test('Modelle für die Darstellung', () => {
  assert.deepEqual(mauerModel(36, 60), { full: 0, rest: 36, restH: 0, restBars: 3, restOnes: 6 });
  assert.deepEqual(mauerModel(4210, 700), { full: 6, rest: 10, restH: 0, restBars: 1, restOnes: 0 });
  assert.deepEqual(mauerModel(420, 700), { full: 0, rest: 420, restH: 4, restBars: 2, restOnes: 0 });
  assert.deepEqual(turmModel({ layers: 9, perLayer: 60, total: 540 }, 90), { built: 9, left: 0 });
  assert.deepEqual(bundles(540), { h: 5, z: 4, e: 0 });
});

test('Kran am Zahlenstrahl', () => {
  assert.equal(kranValue(0.34, 1000), 340);
  assert.equal(kranValue(0.3456, 1000000), 346000);
  assert.equal(kranValue(1.3, 10000), 10000);
  const k = { kind: 'kran', max: 100000, target: 34000 };
  assert.equal(judgeKran(k, 34800).hit, true);
  assert.equal(judgeKran(k, 36000).title, 'Knapp daneben');
  assert.equal(judgeKran(k, 40000).ok, false);
  assert.match(judgeKran(k, 34800).msg, /34 800/);
  const used = new Set();
  for (let i = 0; i < 50; i++) makeKran(rng(i), 1000, used);
  assert.equal(used.size, 50);
});
