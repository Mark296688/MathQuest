// Tor: Zeichnung der Aufgabe. Oben die Rechnung wie im Buch (S. 12): Bogen unter jeder Punktrechnung,
// darunter das Teilergebnis. Bei der Waage unten eine Balkenwaage, die sich nach der Antwort zur schwereren Seite neigt.
// Koordinaten: viewBox 0 0 1000 520 wie die anderen Szenen.
import { pvsTokens, opChoices } from './tor.js';
import { fmt } from './parse.js';

const n1 = (v) => +v.toFixed(1);
const FS = 84;
// Grundlinie der Rechnung: Bei der Waage oben, darunter die Waage; Punkt vor Strich etwas tiefer, mittig im freien Feld
const baseY = (t) => (t.kind === 'waage' ? 150 : 215);

/** Breite eines Zeichens in der Display-Schrift (geschätzt, jedes Zeichen sitzt mittig in seinem Kasten). */
const width = (tok) => {
  if (tok === '○') return 104;
  if (typeof tok === 'number') return fmt(tok).length * FS * 0.56 + 24;
  return FS * 1.12; // Platz für den Knopf um das Rechenzeichen
};

/** Kästen für alle Zeichen der Rechnung und die Glieder, unter denen ein Bogen steht. */
export function torLayout(t) {
  const toks = t.kind === 'waage'
    ? [t.left.a, t.left.op, t.left.b, '○', t.right.a, t.right.op, t.right.b]
    : [...pvsTokens(t), '=', '?'];
  // Das Fragezeichen bekommt so viel Platz wie das Ergebnis, damit die Zeile mittig bleibt
  const ws = toks.map((tok) => (tok === '?' ? width(t.val) : width(tok)));
  const total = ws.reduce((a, b) => a + b, 0);
  const k = Math.min(1, 900 / total);
  let x = 500 - (total * k) / 2;
  const boxes = toks.map((tok, i) => { const b = { tok, x, w: ws[i] * k, cx: x + (ws[i] * k) / 2 }; x += ws[i] * k; return b; });
  const groups = [];
  if (t.kind === 'waage') groups.push({ item: 0, from: 0, to: 2 }, { item: 1, from: 4, to: 6 });
  else {
    let i = 0;
    t.items.forEach((it, item) => {
      if (typeof it === 'number') { groups.push({ item, from: i, to: i, num: true }); i += 2; } else { groups.push({ item, from: i, to: i + 2 }); i += 4; }
    });
  }
  for (const g of groups) {
    g.x1 = boxes[g.from].x + 10 * k;
    g.x2 = boxes[g.to].x + boxes[g.to].w - 10 * k;
    g.cx = (g.x1 + g.x2) / 2;
  }
  const Y = baseY(t);
  return { boxes, groups, fs: FS * k, Y, ZW: Y + 138 };
}

const SIGN_SVG = { '<': '&lt;', '>': '&gt;', '=': '=' };
const txt = (x, y, size, cls, s) => `<text class="${cls}" x="${n1(x)}" y="${n1(y)}" text-anchor="middle" font-size="${n1(size)}">${s}</text>`;

/**
 * Szene zeichnen. st: { done: {Glied: {val, given}}, cur: aktueller Schritt oder null, sign: {v, given} | null,
 * final: {val, given} | null, badOp: Token eines falsch gezeigten Zeichens, pick: Rechenzeichen anklickbar,
 * tilt: 'l' | 'r' | '0' (Waage), fresh: was gerade dazukam ('0', '1', 'sign', 'final') }
 * given: vom Spiel eingesetzt (nach dem zweiten Fehlversuch), orange statt blau.
 */
export function sceneTor(t, L, st) {
  const { boxes, groups, fs, Y, ZW } = L;
  const cur = st.cur;
  const pop = (key) => (st.fresh === key ? ' tor-pop' : '');
  let s = '';
  if (cur && cur.kind === 'calc') {
    const g = groups.find((x) => x.item === cur.item);
    s += `<rect class="tor-now" x="${n1(g.x1 - 14)}" y="${n1(Y - fs * 0.86)}" width="${n1(g.x2 - g.x1 + 28)}" height="${n1(fs * 1.12)}" rx="16"/>`;
  }
  if (cur && cur.kind === 'final') {
    const x1 = groups[0].x1 - 20;
    s += `<rect class="tor-now" x="${n1(x1)}" y="${n1(ZW - fs * 0.86)}" width="${n1(groups[1].x2 + 20 - x1)}" height="${n1(fs * 1.06)}" rx="16"/>`;
  }
  for (const b of boxes) {
    if (b.tok === '○') {
      s += `<circle class="tor-circ${cur && cur.kind === 'sign' ? ' now' : st.sign ? ' set' : ''}" cx="${n1(b.cx)}" cy="${n1(Y - fs * 0.33)}" r="${n1(fs * 0.46)}"/>`;
      if (st.sign) s += txt(b.cx, Y - 2, fs * 0.9, `term ${st.sign.given ? 'given' : 'ok'}${pop('sign')}`, SIGN_SVG[st.sign.v]);
      continue;
    }
    if (b.tok === '?') {
      s += st.final ? txt(b.cx, Y, fs, `term ${st.final.given ? 'given' : 'ok'}${pop('final')}`, fmt(st.final.val)) : txt(b.cx, Y, fs, 'term tor-q', '?');
      continue;
    }
    s += txt(b.cx, Y, fs, 'term', typeof b.tok === 'number' ? fmt(b.tok) : b.tok);
  }
  // Bögen und Teilergebnisse
  for (const g of groups) {
    if (g.num) continue;
    const d = st.done[g.item];
    const now = cur && cur.kind === 'calc' && cur.item === g.item;
    // Solange gefragt ist, was zuerst kommt, verrät der Bogen nichts: noch keiner da
    if (!d && !now && st.pick) continue;
    const y = Y + 22;
    s += `<path class="tor-arc${d ? ' done' : now ? ' now' : ''}" d="M${n1(g.x1)} ${y}Q${n1(g.cx)} ${y + 62} ${n1(g.x2)} ${y}"/>`;
    if (d) s += txt(g.cx, ZW, fs * 0.8, `tor-zw${d.given ? ' given' : ''}${pop(String(g.item))}`, fmt(d.val));
    else if (now) s += txt(g.cx, ZW, fs * 0.8, 'tor-zw q', '?');
  }
  // Punkt vor Strich: Sind alle Punktrechnungen fertig, kommen Strichzeichen und einzelne Zahlen in die Zeile der Teilergebnisse
  if (t.kind === 'pvs' && groups.every((g) => g.num || st.done[g.item])) {
    s += txt(boxes[groups[0].to + 1].cx, ZW, fs * 0.8, 'tor-zw line2', t.s);
    for (const g of groups) if (g.num) s += txt(g.cx, ZW, fs * 0.8, 'tor-zw line2', fmt(t.items[g.item]));
  }
  // Was rechnest du zuerst? Jedes Rechenzeichen ist ein Knopf.
  if (st.pick && t.kind === 'pvs') {
    opChoices(t).forEach((c, ci) => {
      const b = boxes[c.token];
      s += `<g class="opt${st.badOp === c.token ? ' bad' : ''}" data-c="${ci}"><circle cx="${n1(b.cx)}" cy="${n1(Y - fs * 0.3)}" r="${n1(Math.max(44, fs * 0.55))}"/></g>`;
    });
  }
  if (t.kind === 'waage') s += waage(st);
  return s;
}

/** Balkenwaage unten. Die Teilergebnisse liegen als Steine in den Schalen; geneigt wird erst nach der Antwort. */
function waage(st) {
  const PX = 500;
  const PY = 336;
  const ARM = 230;
  const tilt = st.tilt || '0';
  const pan = (side) => {
    const x = PX + (side ? ARM : -ARM);
    const d = st.done[side];
    const stone = d ? `<g class="${st.fresh === String(side) ? 'tor-pop' : ''}"><rect class="w-stone" x="${x - 70}" y="${PY + 68}" width="140" height="56" rx="12"/>`
      + `<text class="w-num" x="${x}" y="${PY + 109}" text-anchor="middle">${fmt(d.val)}</text></g>` : '';
    return `<g class="w-pan-g tilt-${tilt}-${side ? 'r' : 'l'}">`
      + `<path class="w-string" d="M${x} ${PY}L${x - 84} ${PY + 124}M${x} ${PY}L${x + 84} ${PY + 124}"/>`
      + stone
      + `<path class="w-pan" d="M${x - 100} ${PY + 124}H${x + 100}Q${x + 80} ${PY + 158} ${x} ${PY + 158}Q${x - 80} ${PY + 158} ${x - 100} ${PY + 124}Z"/></g>`;
  };
  return `<g class="waage"><path class="w-post" d="M${PX - 70} 516H${PX + 70}L${PX + 24} 494V${PY + 8}H${PX - 24}V494Z"/>`
    + `<g class="w-beam-g tilt-${tilt}"><rect class="w-beam" x="${PX - ARM - 14}" y="${PY - 9}" width="${2 * ARM + 28}" height="18" rx="9"/>`
    + `<circle class="w-hub" cx="${PX}" cy="${PY}" r="15"/></g>`
    + pan(0) + pan(1) + '</g>';
}
