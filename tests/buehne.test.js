import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platz, schritt, springt, SICHTBAR } from '../src/js/buehne.js';

const plaetze = (sel, n) => Array.from({ length: n }, (_, i) => platz(i, sel, n));

test('Bühne: Bei jeder Auswahl steht genau eine Karte in der Mitte, und kein Platz ist doppelt besetzt', () => {
  for (let n = 1; n <= 6; n++) {
    for (let sel = 0; sel < n; sel++) {
      const p = plaetze(sel, n);
      assert.equal(p[sel], 0, `n=${n} sel=${sel}`);
      assert.equal(new Set(p).size, n, `n=${n} sel=${sel}: ${p}`);
    }
  }
});

test('Bühne: Ab drei Profilen stehen auf beiden Seiten Karten, höchstens eine mehr rechts als links', () => {
  for (let n = 3; n <= 6; n++) {
    for (let sel = 0; sel < n; sel++) {
      const p = plaetze(sel, n);
      const links = p.filter((d) => d < 0).length;
      const rechts = p.filter((d) => d > 0).length;
      assert.ok(links >= 1 && rechts >= 1, `n=${n} sel=${sel}: ${p}`);
      assert.ok(rechts - links === 0 || rechts - links === 1, `n=${n} sel=${sel}: ${p}`);
    }
  }
});

test('Bühne: Bis fünf Profile sind alle sichtbar, bei sechs wartet genau eines', () => {
  for (let n = 1; n <= 6; n++) {
    const versteckt = plaetze(0, n).filter((d) => Math.abs(d) > SICHTBAR).length;
    assert.equal(versteckt, n === 6 ? 1 : 0, `n=${n}`);
  }
});

test('Bühne: Zwei Profile bleiben eine Reihe, die zweite Karte wechselt nicht die Seite', () => {
  assert.deepEqual(plaetze(0, 2), [0, 1]);
  assert.deepEqual(plaetze(1, 2), [-1, 0]);
  assert.equal(schritt(0, -1, 2), 0);
  assert.equal(schritt(1, 1, 2), 1);
  assert.equal(schritt(0, 1, 2), 1);
  assert.equal(schritt(0, 1, 1), 0);
});

test('Bühne: Der Pfeil nach rechts holt die rechte Nachbarkarte in die Mitte, und nach n Schritten ist man wieder am Anfang', () => {
  for (let n = 3; n <= 6; n++) {
    let sel = 0;
    for (let k = 0; k < n; k++) {
      const next = schritt(sel, 1, n);
      assert.equal(platz(next, sel, n), 1, `n=${n} sel=${sel}`);
      assert.equal(platz(schritt(sel, -1, n), sel, n), -1, `n=${n} sel=${sel}`);
      sel = next;
    }
    assert.equal(sel, 0);
  }
});

test('Bühne: Nur der Wechsel von einer Seite auf die andere gilt als Sprung', () => {
  assert.equal(springt(-1, 1), true);
  assert.equal(springt(2, -2), true);
  assert.equal(springt(1, 0), false);
  assert.equal(springt(0, -1), false);
  assert.equal(springt(2, 1), false);
  assert.equal(springt(1, -1), true);
});
