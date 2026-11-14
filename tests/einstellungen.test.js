import test from 'node:test';
import assert from 'node:assert/strict';
import { slug, freieId, pruefeEinstellungen, defaultEinstellungen, ausAltenStaenden, neuesProfil, cleanName, ID_RE, MAX_PROFILE, BILDER, FARB_IDS } from '../src/js/einstellungen.js';

test('slug: Umlaute, Sonderzeichen, leere und reservierte Namen', () => {
  assert.equal(slug('Anna'), 'anna');
  assert.equal(slug('Jörg-Ünal'), 'joerg-uenal');
  assert.equal(slug('Großvater'), 'grossvater');
  assert.equal(slug('  Léa  Marie '), 'lea-marie');
  assert.equal(slug('!!!'), 'profil');
  assert.equal(slug('Con'), 'con-profil');
  assert.equal(slug('x'.repeat(50)).length, 28);
  for (const n of ['Anna', 'Jörg', '!!!', 'Con', 'a b c', 'Émile', '名前', 'x'.repeat(50)]) assert.match(slug(n), ID_RE, n);
});

test('freieId: hängt eine Nummer an, wenn die id schon vergeben ist', () => {
  assert.equal(freieId('Anna', []), 'anna');
  assert.equal(freieId('Anna', ['anna']), 'anna-2');
  assert.equal(freieId('Anna', ['anna', 'anna-2']), 'anna-3');
});

test('cleanName: Leerraum, Steuerzeichen, Länge', () => {
  assert.equal(cleanName('  Anna   Lena '), 'Anna Lena');
  assert.equal(cleanName('<b>Ben</b>'), 'bBen/b');
  assert.equal(cleanName('x'.repeat(40)).length, 16);
  assert.equal(cleanName(null), '');
});

test('pruefeEinstellungen: Standardwerte und Bereinigung', () => {
  const e = pruefeEinstellungen({ profile: [{ id: 'anna', name: ' Anna ', bild: 'unbekannt', farbe: 'lila', extra: 1 }], foo: 2 });
  assert.deepEqual(e.profile, [{ id: 'anna', name: 'Anna', bild: BILDER[0].id, farbe: FARB_IDS[0] }]);
  assert.deepEqual(e.bedienung, { zeigen: 'maus', antworten: 'tippen' });
  assert.deepEqual(e.start, { mikrofon: '', couchWorkstation: '' });
  assert.equal(e.foo, undefined);
  assert.deepEqual(pruefeEinstellungen(defaultEinstellungen()), defaultEinstellungen());
  const w = pruefeEinstellungen({ bedienung: { zeigen: 'wii', antworten: 'sprache' }, start: { mikrofon: ' USB ' } });
  assert.deepEqual(w.bedienung, { zeigen: 'wii', antworten: 'sprache' });
  assert.equal(w.start.mikrofon, 'USB');
});

test('pruefeEinstellungen: lehnt Ungültiges ab', () => {
  const p = (id, name) => ({ id, name });
  assert.throws(() => pruefeEinstellungen(null));
  assert.throws(() => pruefeEinstellungen({ profile: [p('../x', 'X')] }), /Ungültige/);
  assert.throws(() => pruefeEinstellungen({ profile: [p('Anna', 'Anna')] }), /Ungültige/);
  assert.throws(() => pruefeEinstellungen({ profile: [p('nul', 'Nul')] }), /Ungültige/);
  assert.throws(() => pruefeEinstellungen({ profile: [p('anna', 'Anna'), p('anna', 'Ben')] }), /doppelt/);
  assert.throws(() => pruefeEinstellungen({ profile: [p('anna', 'Anna'), p('anna-2', 'anna')] }), /zweimal/);
  assert.throws(() => pruefeEinstellungen({ profile: [p('anna', '   ')] }), /Namen/);
  const many = Array.from({ length: MAX_PROFILE + 1 }, (_, i) => p(`k${i}`, `Kind ${i}`));
  assert.throws(() => pruefeEinstellungen({ profile: many }), /Höchstens/);
});

test('ausAltenStaenden: vorhandene Spielstände werden Profile mit verschiedenen Bildern und Farben', () => {
  const e = ausAltenStaenden([{ id: 'anna', name: 'Anna' }, { id: 'ben', name: 'Ben' }, { id: 'carla', name: '' }]);
  assert.deepEqual(e.profile.map((x) => [x.id, x.name]), [['anna', 'Anna'], ['ben', 'Ben'], ['carla', 'carla']]);
  assert.equal(new Set(e.profile.map((x) => x.bild)).size, 3);
  assert.equal(new Set(e.profile.map((x) => x.farbe)).size, 3);
  assert.doesNotThrow(() => pruefeEinstellungen(e));
});

test('neuesProfil: freie id, zuerst unbenutzte Bilder und Farben', () => {
  const e = defaultEinstellungen();
  e.profile.push(neuesProfil('Anna', e));
  e.profile.push(neuesProfil('anna', e));
  assert.deepEqual(e.profile.map((x) => x.id), ['anna', 'anna-2']);
  assert.notEqual(e.profile[0].farbe, e.profile[1].farbe);
  assert.notEqual(e.profile[0].bild, e.profile[1].bild);
  const voll = defaultEinstellungen();
  for (let i = 0; i < MAX_PROFILE; i++) voll.profile.push(neuesProfil(`Kind ${i}`, voll));
  assert.equal(new Set(voll.profile.map((x) => x.bild)).size, Math.min(MAX_PROFILE, BILDER.length), 'jedes Profil ein eigenes Bild');
  for (let i = 0; i < MAX_PROFILE - 2; i++) e.profile.push(neuesProfil(`Kind ${i}`, e));
  assert.throws(() => pruefeEinstellungen(e), /zweimal/, 'anna und Anna');
  e.profile[1].name = 'Ben';
  assert.doesNotThrow(() => pruefeEinstellungen(e));
});
