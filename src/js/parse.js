// Text der Spracherkennung in eine ganze Zahl umwandeln.

const WORDS = [
  ['millionen', 'M'], ['million', 'M'],
  ['dreißig', 30], ['dreissig', 30], ['sechzehn', 16], ['siebzehn', 17],
  ['zwanzig', 20], ['vierzig', 40], ['fünfzig', 50], ['fuenfzig', 50],
  ['sechzig', 60], ['siebzig', 70], ['achtzig', 80], ['neunzig', 90],
  ['tausend', 'T'], ['hundert', 'H'],
  ['zwoelf', 12], ['zwölf', 12], ['sieben', 7], ['sechs', 6],
  ['eins', 1], ['eine', 1], ['zehn', 10], ['drei', 3], ['vier', 4],
  ['fünf', 5], ['fuenf', 5], ['acht', 8], ['neun', 9], ['zwei', 2],
  ['null', 0], ['zwo', 2], ['elf', 11], ['ein', 1], ['und', '+'],
].sort((a, b) => b[0].length - a[0].length);

/**
 * Verhörer der Spracherkennung, die eindeutig ein Zahlwort sind (aus den Protokollen).
 * Bewusst keine allgemeine Lautähnlichkeit: „frei“ klingt wie „vier“, gemeint ist aber oft „drei“.
 */
const ALIAS = { zechs: 'sechs', zex: 'sechs', sex: 'sechs', six: 'sechs', draai: 'drei', drai: 'drei' };

// Art eines Bausteins: Einer (1–9), zehn, 11–19, Zehnerzahl, Stufe (hundert/tausend/Million)
const kind = (v) => (typeof v === 'string' ? 'S' : v === 10 ? 'z' : v < 10 ? 'u' : v < 20 ? 't' : 'x');

/** Ein zusammengesetztes Zahlwort, z. B. „dreihundertsechzig“. Sonst null, auch bei „siebensieben“. */
export function parseWord(w) {
  let pos = 0;
  let total = 0;
  let cur = 0;
  let any = false;
  let prev = null; // Art des letzten Bausteins seit der letzten Stufe
  let prevVal = 0;
  while (pos < w.length) {
    const m = WORDS.find((e) => w.startsWith(e[0], pos));
    if (!m) return null;
    pos += m[0].length;
    const v = m[1];
    if (v === '+') continue;
    any = true;
    const k = kind(v);
    // Zwei Einer oder zwei Zehnerzahlen hintereinander sind zwei Zahlen, keine. Ausnahme: dreizehn bis neunzehn.
    if (k !== 'S' && prev && prev !== 'S') {
      const teen = k === 'z' && prev === 'u' && prevVal >= 3;
      const tensAfterUnit = k === 'x' && prev === 'u';
      const unitAfterTens = k === 'u' && prev === 'x';
      if (!teen && !tensAfterUnit && !unitAfterTens) return null;
    }
    // Zweimal hundert, tausend oder Million in einem Wort sind zwei Zahlen („fünfhundert zweihundertfünfzig“)
    if ((v === 'H' && cur >= 100) || (v === 'T' && total % 1000000 >= 1000) || (v === 'M' && total >= 1000000)) return null;
    prev = k;
    prevVal = typeof v === 'number' ? v : 0;
    if (v === 'M') { total += (cur || 1) * 1000000; cur = 0; }
    else if (v === 'H') cur = (cur || 1) * 100;
    else if (v === 'T') { total += (cur || 1) * 1000; cur = 0; }
    else cur += v;
  }
  return any ? total + cur : null;
}

/**
 * Versteht Ziffern („360“, „3.600“, „34 000“) und Zahlwörter („dreihundert sechzig“).
 * Bei mehreren Zahlen zählt die letzte („6 mal 60 ist 360“ → 360).
 */
export function parseAnswer(text) {
  if (typeof text !== 'string') return null;
  let s = text.toLowerCase().normalize('NFC');
  s = s.replace(/(\d)[.\s](?=\d{3}(?!\d))/g, '$1');
  const tokens = s.split(/[^a-zäöüß0-9]+/).filter(Boolean).map((t) => ALIAS[t] || t);
  const nums = [];
  let group = '';
  const flush = () => {
    if (group) {
      const v = parseWord(group);
      if (v !== null) nums.push(v);
      group = '';
    }
  };
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];
    if (/^\d+$/.test(tok)) {
      flush();
      nums.push(parseInt(tok, 10));
    } else if (tok === 'und') {
      if (group && k + 1 < tokens.length && parseWord(group + 'und' + tokens[k + 1]) !== null) group += 'und';
      else flush();
    } else if (parseWord(tok) !== null) {
      // „sieben sieben“ sind zwei Zahlen (wiederholt), nicht 14
      if (group && parseWord(group + tok) === null) flush();
      group += tok;
    } else {
      flush();
    }
  }
  flush();
  if (!nums.length) return null;
  const v = nums[nums.length - 1];
  return v > 9999999 ? null : v;
}

/** Zahl in deutscher Schreibweise, ab 10 000 mit schmalem Leerzeichen: 34 000. */
export function fmt(n) {
  const s = String(n);
  if (Math.abs(n) < 10000) return s;
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
