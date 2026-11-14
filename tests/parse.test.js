import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswer, fmt } from '../src/js/parse.js';

test('Ziffern aus der Spracherkennung', () => {
  const cases = {
    '360': 360, '360.': 360, ' 360 ': 360, '3.600': 3600, '3 600': 3600,
    '34 000': 34000, '34 000': 34000, '1.000.000': 1000000, '1 000 000': 1000000,
    '12.000.000': null, '360 Steine': 360, '6 mal 60 ist 360': 360, 'Das sind 54.': 54,
    '': null, 'keine Ahnung': null,
  };
  for (const [text, want] of Object.entries(cases)) assert.equal(parseAnswer(text), want, JSON.stringify(text));
});

test('Zahlwörter aus der Spracherkennung', () => {
  const cases = {
    'dreihundertsechzig': 360, 'Dreihundertsechzig.': 360, 'dreihundert sechzig': 360,
    'drei hundert sechzig': 360, 'zwei-hundert-vierzig': 240, 'neun': 9, 'Neun.': 9, 'zwo': 2,
    'elf': 11, 'zwölf': 12, 'dreizehn': 13, 'sechzehn': 16, 'siebzehn': 17, 'neunzehn': 19,
    'sechsundfünfzig': 56, 'sechs und fünfzig': 56, 'dreißig': 30, 'dreissig': 30,
    'hundert': 100, 'einhundert': 100, 'hundertzwanzig': 120, 'zweihundertelf': 211,
    'achthundertzehn': 810, 'dreitausendsechshundert': 3600, 'eintausend': 1000,
    'zehntausend': 10000, 'dreihunderttausend': 300000, 'eine Million': 1000000,
    'zwei Millionen dreihunderttausend': 2300000,
    'sechs mal sechzig ist dreihundertsechzig': 360, 'Es sind dreihundert sechzig': 360,
    'Achtung': null, 'einen': null,
  };
  for (const [text, want] of Object.entries(cases)) assert.equal(parseAnswer(text), want, JSON.stringify(text));
});

test('Echte Eingaben aus dem Protokoll vom 24.10.: Wiederholung und Verhörer', () => {
  const cases = {
    'sieben sieben': 7, 'Sieben, sieben.': 7, 'sieben und sieben': 7, 'drei vier': 4,
    'Zechs': 6, 'Zex.': 6, 'Zex': 6, 'Draai.': 3,
    'Rai.': null, 'X': null, 'Ah.': null, 'Es geht nicht richtig': null,
    'sechs und dreißig': 36, 'neun und vierzig': 49, 'ein hundertvierzig': 140, 'achtzehn': 18,
    'vierzehn': 14, 'fünfzehn': 15, 'dreiundzwanzig': 23, 'zwanzig und drei': 23,
  };
  for (const [text, want] of Object.entries(cases)) assert.equal(parseAnswer(text), want, JSON.stringify(text));
});

test('Echte Eingaben vom 29.10. (Funkmikrofon): Sätze, vorgelesene Aufgaben, zwei Zahlen', () => {
  const cases = {
    'fünfhundert zweihundertfünfzig Steine': 250, 'Ich brauche zwei hundert fünfzig Steine.': 250,
    'Die Hälfte von vier ist zwei.': 2, 'Das Ergebnis ist fünf und vierzig.': 45, 'Das Ergebnisse achthundert.': 800,
    'Ich brauche sechs Lagen.': 6, 'sieben und zwanzig': 27, 'neun neun vierzig': 49, 'Es ist Zex.': 6, 'Six.': 6,
    'Das Ergebnis ist': null, 'Film wohnt.': null, 'Nein.': null,
    'dreitausend zweitausend': 2000, 'dreitausendzweitausend': null, 'hundert hundert': 100,
    'zwei Millionen eine Million': 1000000, 'dreihunderttausendzweihundert': 300200,
  };
  for (const [text, want] of Object.entries(cases)) assert.equal(parseAnswer(text), want, JSON.stringify(text));
});

test('Zahlen schreiben', () => {
  assert.equal(fmt(360), '360');
  assert.equal(fmt(3600), '3600');
  assert.equal(fmt(34000), '34 000');
  assert.equal(fmt(1000000), '1 000 000');
});
