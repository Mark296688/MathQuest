import test from 'node:test';
import assert from 'node:assert/strict';
import { newProfile, pickWarmup, updateCard, getCard, dayIndex, cardCounts, blitzPool, pickBlitz, recordKran, FAST_MS, WARMUP_SIZE, MIN_WARMUP, MAX_LEARNING, MAX_REVIEW } from '../src/js/motor.js';
import { FAMILIES, famById, makeQuestion } from '../src/js/einmaleins.js';
import { rng } from '../src/js/rng.js';

const T0 = new Date(2026, 9, 25, 17, 0).getTime();
const DAY = 86400000;

test('Erste Sitzung: 12 unbekannte Karten, leichte zuerst', () => {
  const p = newProfile('Anna', T0);
  const ids = pickWarmup(p, T0, rng(1));
  assert.equal(ids.length, WARMUP_SIZE);
  assert.equal(new Set(ids).size, WARMUP_SIZE);
  const first12 = FAMILIES.slice(0, 12).map((f) => f.id).sort();
  assert.deepEqual(ids.slice().sort(), first12);
});

test('Einordnen: schnell richtig ist sicher, falsch kommt ins Übungsfach', () => {
  const p = newProfile('Anna', T0);
  assert.deepEqual(updateCard(p, '2x3', { firstOk: true, ms: 3000 }, T0), { before: 0, after: 3 });
  assert.deepEqual(updateCard(p, '3x6', { firstOk: false, ms: 4000 }, T0), { before: 0, after: 1 });
  assert.deepEqual(updateCard(p, '7x8', { firstOk: true, ms: FAST_MS + 1 }, T0), { before: 0, after: 2 });
  assert.equal(getCard(p, '2x3').dueDay, dayIndex(T0) + 2);
  assert.equal(getCard(p, '3x6').dueDay, dayIndex(T0));
  assert.deepEqual(updateCard(p, '2x3', { firstOk: false, ms: 2000 }, T0), { before: 3, after: 1 });
  assert.deepEqual(updateCard(p, '7x8', { firstOk: true, ms: 1000 }, T0), { before: 2, after: 3 });
  for (let i = 0; i < 5; i++) updateCard(p, '7x8', { firstOk: true, ms: 1000 }, T0);
  assert.equal(getCard(p, '7x8').box, 5);
  assert.deepEqual(cardCounts(p), { secure: 1, gold: 1, learning: 2, almost: 0, unseen: 33, total: 36 });
  assert.deepEqual(blitzPool(p), ['7x8']);
});

test('Übungskarten zuerst, höchstens 4; fällige vor neuen; nichts doppelt', () => {
  const p = newProfile('Anna', T0);
  const learn = ['3x6', '4x7', '6x8', '7x8', '6x7', '8x9'];
  learn.forEach((id) => updateCard(p, id, { firstOk: false, ms: 5000 }, T0));
  updateCard(p, '2x2', { firstOk: true, ms: 1000 }, T0); // Fach 3, fällig in 2 Tagen
  updateCard(p, '2x5', { firstOk: true, ms: 9000 }, T0); // Fach 2, fällig morgen
  const next = T0 + DAY;
  const ids = pickWarmup(p, next, rng(2));
  assert.equal(ids.length, WARMUP_SIZE);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter((id) => learn.includes(id)).length, 4);
  assert.ok(ids.includes('2x5'));
  assert.ok(!ids.includes('2x2') || ids.length === WARMUP_SIZE);
});

test('Sitzt alles, wird das Aufwärmen kurz: nur Fällige, aufgefüllt bis MIN_WARMUP', () => {
  const p = newProfile('Ben', T0);
  for (const f of FAMILIES) updateCard(p, f.id, { firstOk: true, ms: 2000 }, T0); // alle Fach 3, fällig in 2 Tagen
  // Morgen ist nichts fällig: nur Wiederholung bis MIN_WARMUP
  let ids = pickWarmup(p, T0 + DAY, rng(3));
  assert.equal(ids.length, MIN_WARMUP);
  assert.equal(new Set(ids).size, ids.length);
  // Drei wackeln (Übungsfach): die drei plus Wiederholung bis MIN_WARMUP
  ['3x6', '7x8', '6x9'].forEach((id) => updateCard(p, id, { firstOk: false, ms: 4000 }, T0));
  ids = pickWarmup(p, T0 + DAY, rng(4));
  assert.equal(ids.length, MIN_WARMUP);
  for (const id of ['3x6', '7x8', '6x9']) assert.ok(ids.includes(id), id);
  // Übermorgen sind 33 sichere Karten fällig: davon nur MAX_REVIEW, die wackligen zuerst
  ids = pickWarmup(p, T0 + 2 * DAY, rng(5));
  assert.equal(ids.length, 3 + MAX_REVIEW);
  for (const id of ['3x6', '7x8', '6x9']) assert.ok(ids.includes(id), id);
  // Fast sichere Karten (Fach 2) sind nicht begrenzt
  const almost = ['2x3', '2x4', '2x5', '2x6', '2x7', '2x8', '2x9', '3x3'];
  for (const id of almost) Object.assign(p.cards[id], { box: 2, dueDay: dayIndex(T0 + 2 * DAY) });
  ids = pickWarmup(p, T0 + 2 * DAY, rng(7));
  assert.equal(ids.length, WARMUP_SIZE);
  for (const id of almost) assert.ok(ids.includes(id), id);
  assert.ok(ids.filter((id) => p.cards[id].box >= 3).length <= MAX_REVIEW);
});

test('Viele Übungskarten: höchstens 4 je Runde, auch wenn die Runde kurz ist', () => {
  const p = newProfile('Anna', T0);
  for (const f of FAMILIES) updateCard(p, f.id, { firstOk: true, ms: 2000 }, T0);
  const learn = ['3x6', '4x7', '6x8', '7x8', '6x7', '8x9'];
  learn.forEach((id) => updateCard(p, id, { firstOk: false, ms: 5000 }, T0));
  const ids = pickWarmup(p, T0 + DAY, rng(6));
  assert.equal(ids.length, MIN_WARMUP);
  assert.equal(ids.filter((id) => learn.includes(id)).length, MAX_LEARNING);
});

test('Kalendertag: morgen ist morgen, auch nach wenigen Stunden', () => {
  const late = new Date(2026, 9, 25, 21, 0).getTime();
  const early = new Date(2026, 9, 26, 7, 0).getTime();
  assert.equal(dayIndex(early) - dayIndex(late), 1);
});

test('Kran: drei Volltreffer in Folge öffnen den nächsten Zahlenraum', () => {
  const p = newProfile('Anna', T0);
  assert.equal(recordKran(p, true, 5), null);
  assert.equal(recordKran(p, false, 50), null);
  recordKran(p, true, 5);
  recordKran(p, true, 5);
  assert.equal(recordKran(p, true, 5), 10000);
  assert.equal(p.kran.max, 10000);
  assert.equal(p.kran.streak, 0);
});

test('Turnier: jede Aufgabe gleich oft, auch bei Quadrat-Familien; nie dieselbe Familie zweimal', () => {
  const p = newProfile('Anna', T0);
  for (const f of FAMILIES) updateCard(p, f.id, { firstOk: true, ms: 1000 }, T0);
  const r = rng(7);
  const terms = {};
  let last = null;
  for (let i = 0; i < 60000; i++) {
    const id = pickBlitz(p, r, last);
    assert.notEqual(id, last);
    last = id;
    const t = makeQuestion(famById(id), r, false).term;
    terms[t] = (terms[t] || 0) + 1;
  }
  // Quadrat-Familien haben 2 Aufgaben, die anderen 4; ohne Gewicht käme 8 · 8 doppelt so oft wie 7 · 8
  assert.equal(Object.keys(terms).length, 128);
  const avg = (sq) => {
    const n = FAMILIES.filter((f) => (f.a === f.b) === sq).flatMap((f) => [`${f.a} · ${f.b}`, `${f.a * f.b} : ${f.a}`, `${f.b} · ${f.a}`, `${f.a * f.b} : ${f.b}`]);
    const list = [...new Set(n)].map((t) => terms[t]);
    return list.reduce((a, b) => a + b, 0) / list.length;
  };
  const ratio = avg(true) / avg(false);
  assert.ok(ratio > 0.9 && ratio < 1.1, `${ratio}`);
});
