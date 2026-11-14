import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeZusammen, makeFalt, checkZusammen, checkFalt, validGroups, hintZusammen, hintFalt, solve, unfold, unfoldWrong,
  normalize, rotateN, mirror, shapeKey, congruent, connected, area, bbox, outline, full, half, makeSteinmetzBlock,
  GEO_PARTS, MAX_LEN, Q,
} from '../src/js/geo.js';
import { rng } from '../src/js/rng.js';
import { newProfile, recordGeo } from '../src/js/motor.js';
import { burgParts, geoStage, geoInfo, PLAN, GERUEST, STEIN, FAHNE } from '../src/js/burg.js';

const SEEDS = 60;
const key = (u) => u.join(',');

/** Teile laut Lösung in die Form legen: deckt alles genau einmal ab? */
function covers(target, pieces, sol) {
  const want = new Set(normalize(target).map(key));
  const got = new Map();
  pieces.forEach((u, j) => {
    const { k, m, dx, dy } = sol[j];
    for (const [x, y, q] of normalize(rotateN(m ? mirror(u) : u, k))) {
      const kk = key([x + dx, y + dy, q]);
      got.set(kk, (got.get(kk) || 0) + 1);
    }
  });
  return got.size === want.size && [...got].every(([kk, n]) => n === 1 && want.has(kk));
}

/** Fläche der Umrisse (Gaußsche Trapezformel), Löcher laufen andersherum und zählen negativ; in Kästchen. */
function outlineArea(units) {
  let a = 0;
  for (const loop of outline(units)) {
    for (let i = 0; i < loop.length; i++) {
      const [x1, y1] = loop[i];
      const [x2, y2] = loop[(i + 1) % loop.length];
      a += x1 * y2 - x2 * y1;
    }
  }
  return Math.abs(a) / 2 / 4;
}

for (const [form, opts] of [['quadrat', {}], ['rechteck', {}], ['dreieck', {}], ['rechteck', { drei: true }]]) {
  const name = opts.drei ? 'drei Teile' : form;
  test(`Zusammensetzen (${name}): genau die gedachten Teile ergeben die Form, auch wenn man umklappt`, () => {
    for (let s = 1; s <= SEEDS; s++) {
      const t = makeZusammen(rng(s), form, opts);
      const need = opts.drei ? 3 : 2;
      assert.equal(t.need, need);
      assert.equal(t.pieces.length, 5);
      assert.equal(t.groups.length, opts.drei ? 1 : 2);
      const found = validGroups(t.target, t.pieces.map((p) => p.units), need);
      assert.deepEqual(found.map((g) => g.join()), t.groups.map((g) => g.join()), `Seed ${s}: andere Lösungen`);
      if (opts.drei) assert.equal(validGroups(t.target, t.pieces.map((p) => p.units), 2).length, 0, `Seed ${s}: zwei Teile reichen`);
      for (const g of t.groups) {
        const sol = checkZusammen(t, g);
        assert.ok(sol, `Seed ${s}: Gruppe passt nicht`);
        assert.ok(covers(t.target, g.map((i) => t.pieces[i].units), sol), `Seed ${s}: Lösung deckt die Form nicht genau ab`);
        assert.ok(solve(t.target, g.map((i) => t.pieces[i].units), false), `Seed ${s}: geht nur umgeklappt`);
        assert.equal(g.reduce((a, i) => a + area(t.pieces[i].units), 0), area(t.target));
      }
      // Jedes Teil hängt zusammen, ist höchstens MAX_LEN lang, kein Teil gleicht einem anderen
      t.pieces.forEach((p, i) => {
        assert.ok(connected(p.units), `Seed ${s}: Teil ${p.id} zerfällt`);
        const b = bbox(p.units);
        assert.ok(Math.max(b.w, b.h) <= MAX_LEN, `Seed ${s}: Teil ${p.id} zu lang`);
        t.pieces.forEach((q, j) => { if (j > i) assert.ok(!congruent(p.units, q.units), `Seed ${s}: ${p.id} gleicht ${q.id}`); });
        assert.ok(p.rot >= 0 && p.rot <= 3);
      });
      assert.deepEqual(t.pieces.map((p) => p.id), ['A', 'B', 'C', 'D', 'E']);
    }
  });
}

test('Zusammensetzen: gleicher Seed, gleiche Aufgabe; ohne Drehen alle Teile ungedreht', () => {
  assert.deepEqual(makeZusammen(rng(7), 'quadrat'), makeZusammen(rng(7), 'quadrat'));
  assert.notDeepEqual(makeZusammen(rng(7), 'quadrat'), makeZusammen(rng(8), 'quadrat'));
  for (let s = 1; s <= 10; s++) assert.ok(makeZusammen(rng(s), 'rechteck', { turn: false }).pieces.every((p) => p.rot === 0));
});

test('Zusammensetzen: Tipp nach falscher Wahl nennt Kästchen, aber nie ein richtiges Paar', () => {
  for (let s = 1; s <= SEEDS; s++) {
    const t = makeZusammen(rng(s), 'dreieck');
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        if (t.groups.some((g) => g.join() === [i, j].join())) continue;
        assert.equal(checkZusammen(t, [i, j]), null);
        const h = hintZusammen(t, [i, j]);
        assert.match(h, /Kästchen/);
        for (const g of t.groups) {
          const ids = g.map((x) => t.pieces[x].id);
          assert.ok(!(h.includes(`${ids[0]} und ${ids[1]}`) && i !== g[0]), `Seed ${s}: Tipp verrät ${ids}`);
        }
      }
    }
  }
});

test('Umriss: Fläche stimmt, auch mit Loch und halben Kästchen', () => {
  const ring = [];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) if (x !== 1 || y !== 1) ring.push(...full(x, y));
  assert.equal(outline(ring).length, 2);
  assert.equal(outlineArea(ring), 8);
  assert.equal(outlineArea([...full(0, 0), ...half(1, 0, 'sw')]), 1.5);
  for (let s = 1; s <= 20; s++) {
    const t = makeZusammen(rng(s), 'dreieck');
    assert.equal(outlineArea(t.target), area(t.target));
    for (const p of t.pieces) assert.equal(outlineArea(p.units), area(p.units));
    const f = makeFalt(rng(s), s % 2 ? 'falt' : 'loch');
    for (const o of f.open) assert.equal(outlineArea(o.units), area(o.units));
  }
});

test('Faltschnitt: jedes Blatt passt zu genau einem Fenster, eines bleibt übrig', () => {
  for (const kind of ['falt', 'loch']) {
    for (let s = 1; s <= SEEDS; s++) {
      const t = makeFalt(rng(s), kind);
      assert.equal(t.folded.length, 3);
      assert.equal(t.open.length, 4);
      t.folded.forEach((f, fi) => {
        const fits = t.open.map((_, oi) => checkFalt(t, fi, oi));
        assert.equal(fits.filter(Boolean).length, 1, `${kind} Seed ${s}: Blatt ${f.id}`);
        assert.equal(fits.indexOf(true), t.match[fi]);
        assert.ok(connected(f.units), `${kind} Seed ${s}: Blatt zerfällt`);
        // Das Blatt hängt an beiden Falten (oben und rechts), sonst fiele es beim Auffalten auseinander
        assert.ok(f.units.some(([, y, q]) => y === 0 && q === 0));
        assert.ok(f.units.some(([x, , q]) => x === Q - 1 && q === 1));
        assert.ok(f.units.every(([x, y]) => x >= 0 && y >= 0 && x < Q && y < Q));
      });
      const rest = [0, 1, 2, 3].filter((o) => !t.match.includes(o));
      assert.equal(rest.length, 1);
      // Aufgefaltet ist jedes Fenster an beiden Falten gespiegelt
      for (const o of t.open) {
        const ks = new Set(o.units.map(key));
        for (const [x, y, q] of o.units) {
          assert.ok(ks.has(key([2 * Q - 1 - x, y, q === 1 ? 3 : q === 3 ? 1 : q])), `${kind} Seed ${s}: nicht symmetrisch`);
          assert.ok(ks.has(key([x, 2 * Q - 1 - y, q === 0 ? 2 : q === 2 ? 0 : q])));
        }
      }
      t.open.forEach((a, i) => t.open.forEach((b, j) => { if (j > i) assert.ok(!congruent(a.units, b.units)); }));
      assert.equal(area(t.open[t.match[0]].units), 4 * area(t.folded[0].units));
      assert.match(hintFalt(t, 0), /^Tipp/);
    }
  }
});

test('Faltschnitt: Ausschnitt an der Ecke zwischen den Falten wird ein Loch in der Mitte', () => {
  const q = [];
  for (let x = 0; x < Q; x++) for (let y = 0; y < Q; y++) if (!(x === Q - 1 && y === 0)) q.push(...full(x, y));
  const open = unfold(q);
  assert.equal(outline(open).length, 2, 'Rand und ein Loch');
  assert.equal(area(open), 4 * Q * Q - 4);
  // Falsch herum aufgefaltet: die Ecken fehlen statt der Mitte
  assert.equal(outline(unfoldWrong(q)).length, 1);
  assert.notEqual(shapeKey(open), shapeKey(unfoldWrong(q)));
});

test('Runde: zwei Formen und ein Faltschnitt, das erste Mal ungedreht, neue Arten erst später', () => {
  const fresh = () => ({ stage: PLAN, seen: 0, lastDay: null });
  const b = makeSteinmetzBlock(rng(3), fresh, 100);
  assert.deepEqual(b.map((x) => x.kind), ['geo', 'falt', 'geo']);
  assert.ok(b[0].t.pieces.every((p) => p.rot === 0), 'erste Aufgabe ungedreht');
  assert.ok(b.every((x) => x.part !== 'drei' && x.part !== 'loch'));
  assert.notEqual(b[0].part, b[2].part);
  const info = (st) => (id) => ({ stage: st[id] ?? PLAN, seen: st[id] ? 1 : 0, lastDay: st[id] ? 99 : null });
  for (let s = 1; s <= 20; s++) {
    const st = { quadrat: STEIN, rechteck: STEIN, dreieck: FAHNE, falt: GERUEST };
    const bb = makeSteinmetzBlock(rng(s), info(st), 100);
    assert.ok(bb.some((x) => x.part === 'drei'), 'drei Teile kommen dran, wenn sie noch Bauplan sind');
    assert.equal(bb[1].part, 'loch');
    assert.ok(bb.every((x) => x.part !== 'dreieck'), 'die Fahne wartet');
  }
});

test('Steinmetzhütte in der Burg: Gerüst, Stein an zwei Tagen, Fahne an vier Tagen gleich richtig', () => {
  const T0 = new Date(2026, 9, 29, 17, 0).getTime();
  const DAY = 86400000;
  const p = newProfile('Anna', T0);
  const part = (id) => burgParts(p).find((x) => x.id === `steinmetz:${id}`);
  assert.equal(burgParts(p).filter((x) => x.area === 'steinmetz').length, GEO_PARTS.length);
  assert.equal(part('quadrat').stage, PLAN);
  recordGeo(p, 'quadrat', false, T0);
  assert.equal(geoStage(p, 'quadrat'), GERUEST);
  recordGeo(p, 'quadrat', true, T0);
  recordGeo(p, 'quadrat', true, T0 + 3600000);
  assert.equal(geoStage(p, 'quadrat'), GERUEST, 'zweimal am selben Tag reicht nicht');
  assert.match(part('quadrat').need, /anderen Tag/);
  recordGeo(p, 'quadrat', true, T0 + DAY);
  assert.equal(geoStage(p, 'quadrat'), STEIN);
  recordGeo(p, 'quadrat', false, T0 + 2 * DAY);
  assert.equal(geoStage(p, 'quadrat'), STEIN, 'ein Fehler nimmt nichts weg');
  recordGeo(p, 'quadrat', true, T0 + 3 * DAY);
  recordGeo(p, 'quadrat', true, T0 + 4 * DAY);
  assert.equal(part('quadrat').stage, FAHNE);
  assert.deepEqual(geoInfo(p, 'quadrat'), { stage: FAHNE, seen: 7, lastDay: p.geo.quadrat.lastDay });
  assert.match(part('drei').need, /zwei Formen/);
});
