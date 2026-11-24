// Bühne der Profilwahl: Ein Profil steht in der Mitte, die anderen daneben. Hier nur die Rechnung, ohne DOM.

/** Wie viele Plätze neben der Mitte man sieht. Wer weiter weg steht (ab 6 Profilen einer), wartet unsichtbar. */
export const SICHTBAR = 2;

/**
 * Platz der Karte i, wenn Karte sel in der Mitte steht: 0 = Mitte, negativ = links, positiv = rechts.
 * Bis zwei Profile eine Reihe (die zweite Karte bleibt auf ihrer Seite), ab drei ein Ring: So stehen
 * immer auf beiden Seiten Karten, und bei gerader Anzahl steht die überzählige rechts.
 */
export function platz(i, sel, n) {
  if (n < 3) return i - sel;
  const halb = Math.floor((n - 1) / 2);
  return ((i - sel + halb) % n + n) % n - halb;
}

/** Nächstes Profil in Richtung dir (−1 links, +1 rechts). Bei zwei Profilen ist am Rand Schluss, im Ring geht es rundum. */
export function schritt(sel, dir, n) {
  if (n < 3) return Math.min(Math.max(sel + dir, 0), Math.max(n - 1, 0));
  return ((sel + dir) % n + n) % n;
}

/** Springt die Karte beim Wechsel über den Ring auf die andere Seite? Dann gleitet sie nicht quer durchs Bild, sondern kommt von außen herein. */
export const springt = (alt, neu) => Math.abs(neu - alt) > 1 && Math.sign(alt) !== Math.sign(neu) && alt !== 0 && neu !== 0;
