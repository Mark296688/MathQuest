import test from 'node:test';
import assert from 'node:assert/strict';
import { burgParts, areaSummary, newParts, markShown, mauerPrefer, burgFarbe, PLAN, GERUEST, STEIN, FAHNE } from '../src/js/burg.js';
import { newProfile, updateCard, recordMauer, recordKran, recordBlitzAnswer, upgradeProfile, FAST_MS, MAUER_FAST_MS } from '../src/js/motor.js';
import { makeBauBlock, bauFamily } from '../src/js/bau.js';
import { FAMILIES } from '../src/js/einmaleins.js';
import { rng } from '../src/js/rng.js';

const T0 = new Date(2026, 9, 25, 17, 0).getTime();
const DAY = 86400000;
const part = (p, id) => burgParts(p).find((x) => x.id === id);

test('Bauteile: 36 Fundamentsteine, 2 × 36 Mauerstücke, 4 Türme', () => {
  const parts = burgParts(newProfile('Anna', T0));
  assert.equal(parts.filter((x) => x.area === 'fundament').length, 36);
  assert.equal(parts.filter((x) => x.area === 'mauer' && x.ring === 1).length, 36);
  assert.equal(parts.filter((x) => x.area === 'mauer' && x.ring === 2).length, 36);
  assert.equal(parts.filter((x) => x.area === 'tuerme').length, 4);
  assert.equal(new Set(parts.map((x) => x.id)).size, parts.length);
  assert.ok(parts.every((x) => x.stage === PLAN));
});

test('Fundament: Gerüst nach dem Üben, Stein an zwei Tagen, Fahne nur schnell an zwei Tagen', () => {
  const p = newProfile('Anna', T0);
  updateCard(p, '6x7', { firstOk: false, ms: 3000 }, T0);
  assert.equal(part(p, 'fundament:6x7').stage, GERUEST);
  updateCard(p, '6x7', { firstOk: true, ms: FAST_MS + 1000 }, T0);
  updateCard(p, '6x7', { firstOk: true, ms: FAST_MS + 1000 }, T0 + 3600000);
  assert.equal(part(p, 'fundament:6x7').stage, GERUEST, 'zweimal am selben Tag reicht nicht');
  assert.match(part(p, 'fundament:6x7').need, /anderen Tag/);
  updateCard(p, '6x7', { firstOk: true, ms: FAST_MS + 1000 }, T0 + DAY);
  assert.equal(part(p, 'fundament:6x7').stage, STEIN, 'langsam, aber richtig an zwei Tagen');
  updateCard(p, '6x7', { firstOk: true, ms: 2000 }, T0 + 2 * DAY);
  assert.equal(part(p, 'fundament:6x7').stage, STEIN);
  recordBlitzAnswer(p, '6x7', 1500, T0 + 3 * DAY);
  assert.equal(part(p, 'fundament:6x7').stage, FAHNE);
});

test('Was steht, bleibt stehen: ein späterer Fehler nimmt nichts weg', () => {
  const p = newProfile('Anna', T0);
  updateCard(p, '3x4', { firstOk: true, ms: 2000 }, T0);
  updateCard(p, '3x4', { firstOk: true, ms: 2000 }, T0 + DAY);
  assert.equal(part(p, 'fundament:3x4').stage, FAHNE);
  updateCard(p, '3x4', { firstOk: false, ms: 9000 }, T0 + 2 * DAY);
  assert.equal(part(p, 'fundament:3x4').stage, FAHNE);
});

test('Alte Spielstände: Tage werden aus den letzten Abfragen abgeleitet', () => {
  const p = newProfile('Ben', T0);
  p.cards['2x5'] = { box: 3, seen: 2, right: 2, wrong: 0, lastSeen: T0 + DAY, dueDay: 0,
    recent: [{ t: T0, ok: true, ms: 3000 }, { t: T0 + DAY, ok: true, ms: 9000 }] };
  delete p.mauer; delete p.kranLv; delete p.burg;
  upgradeProfile(p);
  assert.equal(part(p, 'fundament:2x5').stage, STEIN);
});

test('Mauerring: Bauaufträge zählen für das Mauerstück ihrer Familie', () => {
  const p = newProfile('Anna', T0);
  assert.equal(bauFamily({ kind: 'mauer', rows: 7, perRow: 60 }), '6x7');
  assert.equal(bauFamily({ kind: 'turm', layers: 6, perLayer: 70 }), '6x7');
  recordMauer(p, '6x7', true, 9000, T0);
  assert.equal(part(p, 'mauer:6x7').stage, GERUEST);
  assert.equal(part(p, 'mauer:6x7').label, '6 · 70');
  recordMauer(p, '6x7', true, MAUER_FAST_MS + 1, T0 + DAY);
  assert.equal(part(p, 'mauer:6x7').stage, STEIN);
  assert.deepEqual(mauerPrefer(p, T0 + 2 * DAY), ['6x7']);
  assert.deepEqual(mauerPrefer(p, T0 + DAY), [], 'heute schon dran');
});

test('Bauaufträge nehmen Mauerstücke zur Wiederholung zuerst', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const tasks = makeBauBlock(rng(seed), () => true, 1000, ['8x9', '2x2']);
    const fams = tasks.filter((t) => t.kind !== 'kran').map(bauFamily);
    assert.deepEqual(fams.slice(0, 2), ['8x9', '2x2']);
    assert.equal(new Set(fams).size, 5);
  }
});

test('Bauaufträge: nach der Wiederholung erst Mauerstücke, die noch nie dran waren, fertige zuletzt', () => {
  const plan1 = ['4x7', '6x8', '7x9'];
  const fertig1 = FAMILIES.map((f) => f.id).filter((id) => !plan1.includes(id) && id !== '8x9');
  const plan2 = ['3x4', '5x6'];
  const stage = (id, stufe) => (stufe === 1 ? (plan1.includes(id) ? PLAN : id === '8x9' ? GERUEST : FAHNE)
    : plan2.includes(id) ? PLAN : FAHNE);
  for (let seed = 1; seed <= 200; seed++) {
    const tasks = makeBauBlock(rng(seed), () => true, 1000, ['8x9'], null, stage);
    const fams = tasks.filter((t) => t.kind !== 'kran').map(bauFamily);
    assert.equal(fams[0], '8x9');
    assert.deepEqual(fams.slice(1, 4).sort(), plan1);
    assert.ok(fertig1.includes(fams[4]));
    const m2 = { fams: ['2x2', '3x4', '5x6', '6x6', '7x7', '9x9'], prefer: ['9x9'], intro: false };
    const f2 = makeBauBlock(rng(seed), () => true, 1000, [], m2, stage).filter((t) => t.stufe === 2).map(bauFamily);
    assert.equal(f2[0], '9x9');
    assert.deepEqual(f2.slice(1).sort(), plan2);
  }
});

test('Türme: ein Turm pro Zahlenraum, Fahne nach drei Volltreffern in Folge', () => {
  const p = newProfile('Anna', T0);
  recordKran(p, true, 1, T0);
  assert.equal(part(p, 'tuerme:1000').stage, GERUEST);
  recordKran(p, true, 1, T0 + DAY);
  assert.equal(part(p, 'tuerme:1000').stage, STEIN);
  assert.equal(recordKran(p, true, 1, T0 + DAY), 10000);
  assert.equal(part(p, 'tuerme:1000').stage, FAHNE);
  assert.equal(part(p, 'tuerme:10000').stage, PLAN);
});

test('Bauabnahme zeigt nur, was seit dem letzten Mal neu ist', () => {
  const p = newProfile('Anna', T0);
  FAMILIES.slice(0, 12).forEach((f) => updateCard(p, f.id, { firstOk: true, ms: 2000 }, T0));
  let parts = burgParts(p);
  assert.equal(newParts(p, parts).length, 12);
  markShown(p, parts);
  assert.equal(newParts(p, burgParts(p)).length, 0);
  updateCard(p, FAMILIES[0].id, { firstOk: true, ms: 2000 }, T0 + DAY);
  parts = burgParts(p);
  assert.deepEqual(newParts(p, parts).map((x) => x.id), [`fundament:${FAMILIES[0].id}`]);
  const sum = areaSummary(parts).find((a) => a.id === 'fundament');
  assert.deepEqual([sum.plan, sum.geruest, sum.stein, sum.fahne, sum.total], [24, 11, 0, 1, 36]);
});

test('Burgfarbe: aus den Einstellungen, sonst Blau', () => {
  assert.equal(burgFarbe(newProfile('Anna', T0)), 'blau');
  const p = newProfile('Anna', T0);
  p.burg.farbe = 'gelb';
  assert.equal(burgFarbe(p), 'gelb');
  p.burg.farbe = 'lila';
  assert.equal(burgFarbe(p), 'blau', 'unbekannte Farbe');
});
