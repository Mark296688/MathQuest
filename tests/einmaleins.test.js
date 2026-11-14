import test from 'node:test';
import assert from 'node:assert/strict';
import { FAMILIES, famId, makeQuestion, strategy, divisionHint, judgeAbruf } from '../src/js/einmaleins.js';
import { rng } from '../src/js/rng.js';

// Wertet einen Ausdruck wie „5 · 8 = 40“ oder „40 + 16 = 56“ aus und prüft ihn.
function checkEquation(s) {
  const m = s.match(/^(\d+) ([·:+−]) (\d+) = (\d+)$/);
  assert.ok(m, 'Form: ' + s);
  const [, a, op, b, c] = m;
  const x = Number(a), y = Number(b);
  const v = op === '·' ? x * y : op === ':' ? x / y : op === '+' ? x + y : x - y;
  assert.equal(v, Number(c), s);
}

test('36 Familien, jede genau einmal, leichte zuerst', () => {
  assert.equal(FAMILIES.length, 36);
  assert.equal(new Set(FAMILIES.map((f) => f.id)).size, 36);
  assert.equal(FAMILIES[0].id, '2x2');
  assert.ok(FAMILIES.findIndex((f) => f.id === '7x8') > FAMILIES.findIndex((f) => f.id === '5x7'));
  assert.equal(famId(8, 7), '7x8');
});

test('Aufgaben passen zur Familie und sind richtig (viele Seeds)', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const r = rng(seed);
    for (const f of FAMILIES) {
      const q = makeQuestion(f, r, seed % 3 === 0);
      if (q.op === 'mal') {
        assert.equal(q.answer, q.x * q.y);
        assert.deepEqual([q.x, q.y].sort(), [f.a, f.b].sort());
      } else {
        assert.equal(q.answer * q.y, q.x);
        assert.equal(q.x, f.a * f.b);
        assert.ok(q.y === f.a || q.y === f.b);
      }
      assert.ok(Number.isInteger(q.answer));
      if (q.words) assert.ok(q.words.includes(String(q.x)) || q.words.includes(String(q.y)));
    }
  }
});

test('Aufgaben in Worten: Der Satz ergibt das Ergebnis, ohne Produkt und Quotient', () => {
  const ZAHL = { Doppelte: 2, Dreifache: 3, Vierfache: 4, Fünffache: 5, Sechsfache: 6, Siebenfache: 7, Achtfache: 8, Neunfache: 9 };
  const TEIL = { 'die Hälfte': 2, 'den dritten Teil': 3, 'den vierten Teil': 4, 'den fünften Teil': 5, 'den sechsten Teil': 6, 'den siebten Teil': 7, 'den achten Teil': 8, 'den neunten Teil': 9 };
  const MUSTER = [
    [/^Multipliziere (\d+) mit (\d+)\.$/, (m) => m[1] * m[2]],
    [/^Wie viel ist (\d+) mal (\d+)\?$/, (m) => m[1] * m[2]],
    [/^Berechne das (\S+) von (\d+)\.$/, (m) => ZAHL[m[1]] * m[2]],
    [/^Dividiere (\d+) durch (\d+)\.$/, (m) => m[1] / m[2]],
    [/^Wie oft passt (\d+) in (\d+)\?$/, (m) => m[2] / m[1]],
    [/^Berechne (die Hälfte|den \S+ Teil) von (\d+)\.$/, (m) => m[2] / TEIL[m[1]]],
  ];
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed);
    for (const f of FAMILIES) {
      const q = makeQuestion(f, r, true);
      assert.doesNotMatch(q.words, /Produkt|Quotient/);
      const hit = MUSTER.findIndex(([re]) => re.test(q.words));
      assert.ok(hit >= 0, q.words);
      assert.equal(MUSTER[hit][1](q.words.match(MUSTER[hit][0])), q.answer, q.words);
      seen.add(hit);
    }
  }
  assert.equal(seen.size, MUSTER.length);
});

test('Rechenwege stimmen und Tipps verraten die Lösung nicht', () => {
  for (let x = 2; x <= 9; x++) {
    for (let y = 2; y <= 9; y++) {
      const s = strategy(x, y);
      assert.equal(s.n * s.m, x * y);
      for (const part of s.way.split(', ')) {
        if (part.startsWith('die Hälfte ist')) assert.equal(Number(part.split(' ').pop()) * 2, s.m * 10);
        else checkEquation(part);
      }
      assert.doesNotMatch(s.hint, new RegExp(`\\b${x * y}\\b`), `${x}·${y}: ${s.hint}`);
      // Punktefeld: gefüllte Reihen ergeben das Produkt
      assert.equal(s.rows.filter((k) => k !== 'ghost').length * s.m, x * y, `${x}·${y}`);

      const p = x * y;
      const h = divisionHint(p, y);
      assert.doesNotMatch(h, new RegExp(`= ${x}\\b`));
      const [, k, yy, kp] = h.match(/Denk an (\d+) · (\d+) = (\d+)/);
      assert.equal(Number(k) * Number(yy), Number(kp));
      assert.notEqual(Number(k), x);
    }
  }
});

test('Bewertung', () => {
  const q = { op: 'mal', x: 3, y: 6, answer: 18, term: '3 · 6' };
  assert.equal(judgeAbruf(q, 18).ok, true);
  assert.equal(judgeAbruf(q, 21).ok, false);
  assert.equal(judgeAbruf(q, 21).hint, 'Tipp: 5 · 3 = 15. Dazu noch 1 · 3.');
  const d = { op: 'geteilt', x: 56, y: 7, answer: 8, term: '56 : 7' };
  assert.equal(judgeAbruf(d, 8).way, '56 : 7 = 8, weil 8 · 7 = 56');
  assert.equal(judgeAbruf(d, 7).hint, 'Tipp: ? · 7 = 56. Denk an 10 · 7 = 70.');
});
