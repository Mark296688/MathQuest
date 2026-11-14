// Lernmotor: Karteikasten pro Einmaleins-Familie, Profil-Daten, Auswertung.
import { FAMILIES, famById } from './einmaleins.js';
import { shuffle, pickWeighted } from './rng.js';
import { KRAN_LEVELS } from './bau.js';

/** Abstand in Tagen bis zur nächsten Abfrage, je Fach (0 = unbekannt, 1 = übt, 3+ = sicher). */
export const INTERVAL_DAYS = [0, 0, 1, 2, 4, 8];
export const MAX_BOX = 5;
export const SECURE_BOX = 3;
/** Bis hierhin gilt eine Antwort als flüssig: ab Anzeige bis Text da, inkl. ca. 0,7 s Erkennung. 7 s seit 29.10.2026 (vorher 6 s, Entscheidung des Users). */
export const FAST_MS = 7000;
/** Dasselbe für Bauaufträge (Text lesen, Zehnerzahl rechnen). Startwert, mit echten Daten einstellen. */
export const MAUER_FAST_MS = 15000;
export const WARMUP_SIZE = 12;
/** Sitzt alles, gibt es nur so viele Aufgaben, aufgefüllt mit Wiederholung (Wunsch des Users 25.10.2026). */
export const MIN_WARMUP = 6;
/** Fällige sichere Karten (Fach 3+) je Runde höchstens; der Rest wartet, im Turnier kommen sie ohnehin. */
export const MAX_REVIEW = 6;
export const MAX_LEARNING = 4;

const DAY = 86400000;

/** Kalendertag (lokal) als Zahl, damit „morgen“ auch nach 20 Stunden morgen ist. */
export function dayIndex(t) {
  return Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / DAY);
}

export function newProfile(name, now) {
  return {
    version: 1,
    name,
    createdAt: new Date(now).toISOString(),
    cards: {},
    bau: { done: 0, firstOk: 0, nullErr: 0, recent: [] },
    bau2: { done: 0, firstOk: 0, nullErr: 0, recent: [] },
    kran: { max: KRAN_LEVELS[0], streak: 0, done: 0, hits: 0, sumErr: 0 },
    blitz: { best: 0, runs: [] },
    speech: { total: 0, ja: 0, nein: 0, ersetzt: 0, unverstanden: 0 },
    sessions: 0,
    lastSession: null,
    playMs: 0,
    mauer: {},
    mauer2: {},
    kranLv: {},
    geo: {},
    tor: {},
    burg: { shown: {}, farbe: null },
  };
}

/** Ältere Spielstände um die Felder für die Burg ergänzen. */
export function upgradeProfile(p) {
  p.mauer ||= {};
  p.mauer2 ||= {};
  p.bau2 ||= { done: 0, firstOk: 0, nullErr: 0, recent: [] };
  p.kranLv ||= {};
  p.geo ||= {};
  p.tor ||= {};
  p.burg ||= { shown: {}, farbe: null };
  p.burg.shown ||= {};
  return p;
}

export function getCard(p, id) {
  return p.cards[id] || { box: 0, seen: 0, right: 0, wrong: 0, lastSeen: null, dueDay: 0, recent: [] };
}

const MAX_DAYS = 6;

/** Tag in eine sortierte Liste ohne Dopplungen aufnehmen (die letzten 6 reichen). */
export function addDay(list, day) {
  if (!list.includes(day)) {
    list.push(day);
    list.sort((a, b) => a - b);
    if (list.length > MAX_DAYS) list.shift();
  }
  return list;
}

/**
 * Tage, an denen die Karte im ersten Versuch richtig bzw. schnell richtig war.
 * Spielstände von vor der Burg haben die Listen nicht; dann aus den letzten Abfragen ableiten.
 */
export function cardDays(c) {
  if (c.okDays) return { okDays: c.okDays, fastDays: c.fastDays || [] };
  const okDays = [];
  const fastDays = [];
  for (const r of c.recent || []) {
    if (r.ok) addDay(okDays, dayIndex(r.t));
    if (r.ok && r.ms <= FAST_MS) addDay(fastDays, dayIndex(r.t));
  }
  return { okDays, fastDays };
}

export const isSecure = (c) => c.box >= SECURE_BOX;

/**
 * Auswahl fürs Aufwärmen: erst Karten, die gerade geübt werden (höchstens 4), dann fällige
 * (davon sichere höchstens MAX_REVIEW), dann unbekannte (prüft, was schon sitzt). Nicht fällige
 * Wiederholung und weitere Übungskarten nur, bis es MIN_WARMUP sind; so wird die Runde kurz, wenn alles sitzt.
 */
export function pickWarmup(p, now, r, n = WARMUP_SIZE, min = MIN_WARMUP) {
  const today = dayIndex(now);
  const ids = FAMILIES.map((f) => f.id);
  const c = (id) => getCard(p, id);
  const chosen = [];
  const take = (list, max) => {
    for (const id of list) {
      if (chosen.length >= n || max <= 0) break;
      if (!chosen.includes(id)) { chosen.push(id); max--; }
    }
  };
  take(ids.filter((id) => c(id).box === 1).sort((a, b) => (c(a).lastSeen || 0) - (c(b).lastSeen || 0)), MAX_LEARNING);
  const due = (id) => c(id).dueDay <= today;
  const byDue = (a, b) => c(a).box - c(b).box || c(a).dueDay - c(b).dueDay;
  take(ids.filter((id) => c(id).box === 2 && due(id)).sort(byDue), n);
  take(ids.filter((id) => c(id).box >= SECURE_BOX && due(id)).sort(byDue), MAX_REVIEW);
  take(ids.filter((id) => c(id).box === 0), n);
  take(ids.filter((id) => c(id).box >= 2).sort((a, b) => c(a).dueDay - c(b).dueDay), min - chosen.length);
  take(ids.filter((id) => c(id).box === 1), min - chosen.length);
  return shuffle(r, chosen);
}

/**
 * Karte nach der ersten Abfrage in einer Sitzung einordnen.
 * firstOk: im ersten Versuch richtig; ms: Zeit bis zur ersten Antwort.
 */
export function updateCard(p, id, { firstOk, ms, answers, q }, now) {
  const before = getCard(p, id);
  const days = cardDays(before);
  const c = { ...before, recent: before.recent.slice(), okDays: days.okDays.slice(), fastDays: days.fastDays.slice() };
  const fast = firstOk && ms <= FAST_MS;
  if (firstOk) addDay(c.okDays, dayIndex(now));
  if (fast) addDay(c.fastDays, dayIndex(now));
  if (c.box === 0) c.box = fast ? SECURE_BOX : firstOk ? 2 : 1;
  else if (fast) c.box = Math.min(MAX_BOX, c.box + 1);
  else if (firstOk) c.box = Math.max(2, c.box);
  else c.box = 1;
  c.seen++;
  if (firstOk) c.right++; else c.wrong++;
  c.lastSeen = now;
  c.dueDay = dayIndex(now) + INTERVAL_DAYS[c.box];
  c.recent.push({ t: now, ok: firstOk, ms, q, answers });
  if (c.recent.length > 8) c.recent.shift();
  p.cards[id] = c;
  return { before: before.box, after: c.box };
}

/** Richtige Antwort in der Blitzrunde: zählt für die Burg, ändert aber das Fach nicht. */
export function recordBlitzAnswer(p, id, ms, now) {
  const before = p.cards[id];
  if (!before) return;
  const days = cardDays(before);
  const c = { ...before, okDays: days.okDays.slice(), fastDays: days.fastDays.slice() };
  addDay(c.okDays, dayIndex(now));
  if (ms <= FAST_MS) addDay(c.fastDays, dayIndex(now));
  p.cards[id] = c;
}

export function blitzPool(p) {
  return FAMILIES.map((f) => f.id).filter((id) => isSecure(getCard(p, id)));
}

/**
 * Familie für die nächste Turnier-Aufgabe, nie dieselbe wie eben. Jede Aufgabe soll gleich oft kommen:
 * Quadrat-Familien haben nur 2 Aufgaben (8 · 8, 64 : 8) statt 4, darum halbes Gewicht.
 */
export function pickBlitz(p, r, last) {
  const all = blitzPool(p);
  const others = all.filter((id) => id !== last);
  const weight = (id) => (famById(id).a === famById(id).b ? 1 : 2);
  return pickWeighted(r, others.length ? others : all, weight);
}

export function cardCounts(p) {
  const out = { secure: 0, gold: 0, learning: 0, almost: 0, unseen: 0, total: FAMILIES.length };
  for (const f of FAMILIES) {
    const c = getCard(p, f.id);
    if (c.box === 0) out.unseen++;
    else if (c.box === 1) out.learning++;
    else if (c.box === 2) out.almost++;
    else out.secure++;
    if (c.box === MAX_BOX) out.gold++;
  }
  return out;
}

/** Bauauftrag verbuchen. */
/** Bauauftrag zählen, getrennt nach Stufe (1: Zehnerzahlen, 2: Hunderter und Zehner mal Zehner). */
export function recordBau(p, firstOk, nullErr, stufe = 1) {
  const b = stufe === 2 ? upgradeProfile(p).bau2 : p.bau;
  b.done++;
  if (firstOk) b.firstOk++;
  if (nullErr) b.nullErr++;
  b.recent.push(firstOk);
  if (b.recent.length > 10) b.recent.shift();
}

/** Mauerstücke einer Stufe: 1 = Zehnerzahlen (6 · 70), 2 = Hunderter und Zehner mal Zehner (6 · 700, 60 · 70). */
export function mauerStore(p, stufe = 1) {
  upgradeProfile(p);
  return stufe === 2 ? p.mauer2 : p.mauer;
}

/** Bauauftrag für das Mauerstück seiner Einmaleins-Familie und Stufe verbuchen. */
export function recordMauer(p, id, firstOk, ms, now, stufe = 1) {
  const store = mauerStore(p, stufe);
  const m = store[id] || { seen: 0, okDays: [], fastDays: [], lastDay: null };
  m.seen++;
  m.lastDay = dayIndex(now);
  if (firstOk) addDay(m.okDays, m.lastDay);
  if (firstOk && ms <= MAUER_FAST_MS) addDay(m.fastDays, m.lastDay);
  store[id] = m;
}

/** Kran-Wurf verbuchen; nach 3 Volltreffern in Folge wird der nächste Zahlenraum frei. */
export function recordKran(p, hit, err, now = Date.now()) {
  upgradeProfile(p);
  const k = p.kran;
  const lv = p.kranLv[k.max] || { done: 0, hits: 0, hitDays: [], cleared: false };
  lv.done++;
  if (hit) { lv.hits++; addDay(lv.hitDays, dayIndex(now)); }
  p.kranLv[k.max] = lv;
  k.done++;
  k.sumErr += err / k.max;
  if (hit) { k.hits++; k.streak++; } else k.streak = 0;
  if (k.streak >= 3) lv.cleared = true;
  const i = KRAN_LEVELS.indexOf(k.max);
  if (k.streak >= 3 && i >= 0 && i < KRAN_LEVELS.length - 1) {
    k.max = KRAN_LEVELS[i + 1];
    k.streak = 0;
    return k.max;
  }
  return null;
}

/** Aufgabe der Steinmetzhütte verbuchen (id: quadrat, rechteck, dreieck, drei, falt, loch). Ohne Zeitgrenze. */
export function recordGeo(p, id, firstOk, now) {
  upgradeProfile(p);
  const m = p.geo[id] || { seen: 0, ok: 0, okDays: [], lastDay: null };
  m.seen++;
  m.lastDay = dayIndex(now);
  if (firstOk) { m.ok++; addDay(m.okDays, m.lastDay); }
  p.geo[id] = m;
}

/** Ganze Tor-Aufgabe (alle Schritte) bis hierhin als flüssig. Startwert, mit echten Daten einstellen. */
export const TOR_FAST_MS = 25000;
/** „Richtig“ heißt beim Tor: diese Aufgabe gleich richtig und höchstens 1 Fehler in den letzten 5 (docs/inhalte.md, Abschnitt 4). */
const TOR_RECENT = 5;

/** Tor-Aufgabe verbuchen (id: waage1, waage2, pvs1, pvs2). ms: Zeit für die ganze Aufgabe; nullErr: Faktor 10 daneben. */
export function recordTor(p, id, firstOk, ms, now, nullErr = false) {
  upgradeProfile(p);
  const m = p.tor[id] || { seen: 0, ok: 0, nullErr: 0, recent: [], okDays: [], fastDays: [], lastDay: null };
  m.seen++;
  if (nullErr) m.nullErr = (m.nullErr || 0) + 1;
  m.lastDay = dayIndex(now);
  if (firstOk) m.ok++;
  m.recent.push(firstOk);
  if (m.recent.length > TOR_RECENT) m.recent.shift();
  const good = firstOk && m.recent.filter((x) => !x).length <= 1;
  if (good) addDay(m.okDays, m.lastDay);
  if (good && ms <= TOR_FAST_MS) addDay(m.fastDays, m.lastDay);
  p.tor[id] = m;
  return good;
}

export function recordSpeech(p, decision) {
  p.speech.total++;
  if (p.speech[decision] !== undefined) p.speech[decision]++;
}
