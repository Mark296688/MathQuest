// Die Burg: Bauteile je Bereich und ihre Stufe, berechnet aus den Lerndaten (docs/burg.md).
import { FAMILIES } from './einmaleins.js';
import { KRAN_LEVELS } from './bau.js';
import { getCard, cardDays, dayIndex, upgradeProfile, mauerStore } from './motor.js';
import { fmt } from './parse.js';
import { GEO_PARTS } from './geo.js';
import { TOR_PARTS } from './tor.js';

export const PLAN = 0;
export const GERUEST = 1;
export const STEIN = 2;
export const FAHNE = 3;
export const STAGE_NAME = ['Bauplan', 'Gerüst', 'Stein', 'Fahne'];
/** An so vielen verschiedenen Tagen muss es klappen, für Stein bzw. Fahne. */
export const NEED_DAYS = 2;

/** Bereiche in der Reihenfolge des Schuljahrs. Geschlossene Bereiche stehen als Bauplan im Gelände. */
export const AREAS = [
  { id: 'fundament', name: 'Fundament', thema: 'Einmaleins', open: true },
  { id: 'mauer', name: 'Mauerring', thema: 'Rechnen mit Zehner- und Hunderterzahlen', open: true },
  { id: 'tuerme', name: 'Türme', thema: 'Zahlenstrahl', open: true },
  { id: 'steinmetz', name: 'Steinmetzhütte', thema: 'Formen und Faltschnitte', open: true },
  { id: 'tor', name: 'Tor', thema: 'Vergleiche und Punkt vor Strich', open: true },
  { id: 'markt', name: 'Marktplatz', thema: 'Größen und Sachaufgaben', open: false },
  { id: 'bergfried', name: 'Bergfried', thema: 'Schriftliche Multiplikation', open: false },
  { id: 'brunnen', name: 'Brunnen', thema: 'Schriftliche Division', open: false },
];

/** Teamfarben der Kenney-Paletten (assets/castle/Textures). */
export const FARBEN = {
  blau: { name: 'Blau', tex: 'colormap.png', css: '#6794d9' },
  rot: { name: 'Rot', tex: 'variation-a.png', css: '#de433e' },
  gruen: { name: 'Grün', tex: 'variation-b.png', css: '#61cb8b' },
  gelb: { name: 'Gelb', tex: 'variation-c.png', css: '#ffc044' },
};
/** Farbe der Burg: aus den Einstellungen des Profils (store.js setzt p.burg.farbe), sonst Blau. */
export function burgFarbe(p) {
  const f = p.burg && p.burg.farbe;
  return FARBEN[f] ? f : 'blau';
}

function stageFromDays(seen, okDays, fastDays) {
  if (!seen) return PLAN;
  if (okDays.length < NEED_DAYS) return GERUEST;
  if (fastDays.length < NEED_DAYS) return STEIN;
  return FAHNE;
}

function needText(stage, okDays, fastDays, start) {
  if (stage === PLAN) return start;
  if (stage === GERUEST) {
    const n = NEED_DAYS - okDays.length;
    return n === NEED_DAYS ? 'Für den Stein: an zwei verschiedenen Tagen gleich richtig.'
      : 'Für den Stein: noch einmal gleich richtig, an einem anderen Tag.';
  }
  if (stage === STEIN) {
    const n = NEED_DAYS - fastDays.length;
    return n === NEED_DAYS ? 'Für die Fahne: an zwei verschiedenen Tagen schnell richtig.'
      : 'Für die Fahne: noch einmal schnell richtig, an einem anderen Tag.';
  }
  return 'Fertig, mit Fahne!';
}

/** Stufe des Mauerstücks einer Familie, im inneren (1) oder äußeren Ring (2). */
export function mauerStage(p, id, stufe = 1) {
  const m = mauerStore(p, stufe)[id];
  return m ? stageFromDays(m.seen > 0, m.okDays, m.fastDays) : PLAN;
}

/** Stufe 2 einer Familie ist dran, wenn das Einmaleins und das Mauerstück der Stufe 1 als Stein stehen. */
export function m2Ready(p, id) {
  const { okDays, fastDays } = cardDays(getCard(p, id));
  return stageFromDays(getCard(p, id).seen > 0, okDays, fastDays) >= STEIN && mauerStage(p, id, 1) >= STEIN;
}

/** Familien für Stufe 2 und ob sie zum ersten Mal kommt (dann kurz am Stück, mit Beispiel). */
export function m2Plan(p, now) {
  upgradeProfile(p);
  const fams = FAMILIES.map((f) => f.id).filter((id) => m2Ready(p, id));
  return { fams, prefer: mauerPrefer(p, now, 3, 2), intro: Object.keys(p.mauer2).length === 0 };
}

/** Steinmetzhütte: Tage, an denen es gleich richtig war; für die Fahne zählen weitere Tage statt Tempo (docs/burg.md). */
export const GEO_STEIN_DAYS = NEED_DAYS;
export const GEO_FAHNE_DAYS = 2 * NEED_DAYS;

export function geoStage(p, id) {
  const m = upgradeProfile(p).geo[id];
  if (!m || !m.seen) return PLAN;
  if (m.okDays.length < GEO_STEIN_DAYS) return GERUEST;
  if (m.okDays.length < GEO_FAHNE_DAYS) return STEIN;
  return FAHNE;
}

/** Für die Auswahl der Aufgaben (geo.js makeSteinmetzBlock). */
export function geoInfo(p, id) {
  const m = upgradeProfile(p).geo[id];
  return { stage: geoStage(p, id), seen: m ? m.seen : 0, lastDay: m ? m.lastDay : null };
}

function geoNeed(id, stage, okDays) {
  if (stage === PLAN) {
    if (id === 'drei') return 'Kommt, sobald zwei Formen aus 2 Teilen als Stein stehen.';
    if (id === 'loch') return 'Kommt nach dem ersten Faltschnitt am Rand.';
    return 'Kommt mit der ersten Aufgabe dieser Art in der Steinmetzhütte.';
  }
  if (stage === GERUEST) {
    return okDays ? 'Für den Stein: noch einmal gleich richtig, an einem anderen Tag.' : 'Für den Stein: an zwei verschiedenen Tagen gleich richtig.';
  }
  if (stage === STEIN) {
    return okDays === GEO_FAHNE_DAYS - 1 ? 'Für die Fahne: noch einmal gleich richtig, an einem anderen Tag.' : 'Für die Fahne: an zwei weiteren Tagen gleich richtig.';
  }
  return 'Fertig, mit Fahne!';
}

/**
 * Tor: Waage (T1, T2) wie Kopfrechnen, Fahne über Tempo; Punkt vor Strich (T3, T4) mehrschrittig,
 * Fahne über zwei weitere Tage (den gemischten Rundgang gibt es noch nicht). docs/inhalte.md Abschnitt 4.
 */
export function torStage(p, id) {
  const m = upgradeProfile(p).tor[id];
  if (!m || !m.seen) return PLAN;
  if (id.startsWith('waage')) return stageFromDays(true, m.okDays, m.fastDays);
  if (m.okDays.length < NEED_DAYS) return GERUEST;
  if (m.okDays.length < 2 * NEED_DAYS) return STEIN;
  return FAHNE;
}

export function torInfo(p, id) {
  const m = upgradeProfile(p).tor[id];
  return { stage: torStage(p, id), seen: m ? m.seen : 0, okDays: m ? m.okDays.length : 0, lastDay: m ? m.lastDay : null };
}

function torNeed(id, stage, m) {
  if (stage === PLAN) {
    return {
      waage1: 'Kommt mit der ersten Waage am Tor.',
      waage2: 'Kommt, sobald die Waage mit dem Einmaleins an einem Tag gleich richtig war.',
      pvs1: 'Kommt mit der ersten Aufgabe „Punkt vor Strich“.',
      pvs2: 'Kommt, sobald Punkt vor Strich mit dem Einmaleins an einem Tag gleich richtig war.',
    }[id];
  }
  if (id.startsWith('waage')) return needText(stage, m.okDays, m.fastDays, '');
  return geoNeed(id, stage, m.okDays.length);
}

/**
 * Stationen nach der Baustelle (docs/inhalte.md Abschnitt 5): unter der Woche eine, und zwar die, die länger
 * nicht dran war; am Wochenende beide. Bei Gleichstand die Steinmetzhütte (aktueller Schulstoff).
 */
export function stationsToday(p, now) {
  const wd = new Date(now).getDay();
  if (wd === 0 || wd === 6) return ['steinmetz', 'tor'];
  const pr = upgradeProfile(p);
  const last = (rec) => Math.max(-1, ...Object.values(rec).map((m) => (m.lastDay ?? -1)));
  return last(pr.tor) < last(pr.geo) ? ['tor'] : ['steinmetz'];
}

/** Alle Bauteile der offenen Bereiche mit Stufe, Beschriftung und dem, was noch fehlt. */
export function burgParts(p) {
  upgradeProfile(p);
  const parts = [];
  for (const f of FAMILIES) {
    const c = getCard(p, f.id);
    const { okDays, fastDays } = cardDays(c);
    const stage = stageFromDays(c.seen > 0, okDays, fastDays);
    parts.push({
      id: `fundament:${f.id}`, area: 'fundament', fam: f.id, label: `${f.a} · ${f.b}`, stage,
      need: needText(stage, okDays, fastDays, `Kommt, sobald du ${f.a} · ${f.b} übst.`),
    });
  }
  for (const f of FAMILIES) {
    const stage = mauerStage(p, f.id, 1);
    const m = p.mauer[f.id] || { okDays: [], fastDays: [] };
    parts.push({
      id: `mauer:${f.id}`, area: 'mauer', ring: 1, fam: f.id, label: `${f.a} · ${f.b * 10}`, stage,
      need: needText(stage, m.okDays, m.fastDays, `Kommt mit einem Bauauftrag wie ${f.a} · ${f.b * 10}.`),
    });
  }
  // Stufe 2 als äußerer Mauerring: 6 · 700, 60 · 70 und die Umkehraufgaben
  for (const f of FAMILIES) {
    const stage = mauerStage(p, f.id, 2);
    const m = p.mauer2[f.id] || { okDays: [], fastDays: [] };
    parts.push({
      id: `mauer2:${f.id}`, area: 'mauer', ring: 2, fam: f.id, label: `${f.a} · ${f.b * 100} und ${f.a * 10} · ${f.b * 10}`, stage,
      need: needText(stage, m.okDays, m.fastDays, m2Ready(p, f.id)
        ? `Kommt mit einem Bauauftrag wie ${f.a} · ${f.b * 100}.`
        : `Kommt, sobald ${f.a} · ${f.b} im Fundament und ${f.a} · ${f.b * 10} im Mauerring Steine sind.`),
    });
  }
  KRAN_LEVELS.forEach((max, i) => {
    const lv = p.kranLv[max] || { done: 0, hitDays: [], cleared: false };
    let stage = PLAN;
    if (lv.done > 0) stage = GERUEST;
    if (lv.hitDays.length >= NEED_DAYS) stage = STEIN;
    if (stage === STEIN && lv.cleared) stage = FAHNE;
    let need;
    if (stage === PLAN) need = i === 0 ? 'Kommt mit dem ersten Kran-Wurf.' : `Kommt, wenn der Zahlenstrahl bis ${fmt(max)} frei ist.`;
    else if (stage === GERUEST) need = lv.hitDays.length ? 'Für den Stein: noch ein Volltreffer, an einem anderen Tag.' : 'Für den Stein: Volltreffer an zwei verschiedenen Tagen.';
    else if (stage === STEIN) need = 'Für die Fahne: drei Volltreffer hintereinander.';
    else need = 'Fertig, mit Fahne!';
    parts.push({ id: `tuerme:${max}`, area: 'tuerme', level: i, label: `Zahlenstrahl bis ${fmt(max)}`, stage, need });
  });
  GEO_PARTS.forEach((g, i) => {
    const stage = geoStage(p, g.id);
    const m = p.geo[g.id];
    parts.push({ id: `steinmetz:${g.id}`, area: 'steinmetz', geo: g.id, idx: i, label: g.label, stage, need: geoNeed(g.id, stage, m ? m.okDays.length : 0) });
  });
  TOR_PARTS.forEach((g) => {
    const stage = torStage(p, g.id);
    parts.push({ id: `tor:${g.id}`, area: 'tor', tor: g.id, stufe: g.stufe, label: g.label, stage, need: torNeed(g.id, stage, p.tor[g.id]) });
  });
  return parts;
}

/** Zählung je offenem Bereich. */
export function areaSummary(parts) {
  return AREAS.filter((a) => a.open).map((a) => {
    const ps = parts.filter((x) => x.area === a.id);
    const n = [0, 0, 0, 0];
    ps.forEach((x) => n[x.stage]++);
    return { ...a, total: ps.length, plan: n[PLAN], geruest: n[GERUEST], stein: n[STEIN], fahne: n[FAHNE] };
  });
}

/** Teile, die seit der letzten Bauabnahme eine Stufe höher stehen. */
export function newParts(p, parts) {
  upgradeProfile(p);
  return parts.filter((x) => x.stage > (p.burg.shown[x.id] || PLAN));
}

/** Nach der Bauabnahme: Der jetzige Stand gilt als gezeigt. */
export function markShown(p, parts) {
  upgradeProfile(p);
  for (const x of parts) if (x.stage > PLAN) p.burg.shown[x.id] = x.stage;
}

/**
 * Familien, deren Mauerstück als Nächstes wiederholt werden sollte: angefangen,
 * noch ohne Fahne, heute noch nicht dran. Gerüste vor Steinen, ältere zuerst.
 */
export function mauerPrefer(p, now, n = 3, stufe = 1) {
  const today = dayIndex(now);
  return Object.entries(mauerStore(p, stufe))
    .map(([id, m]) => ({ id, m, stage: stageFromDays(m.seen > 0, m.okDays, m.fastDays) }))
    .filter((x) => x.stage > PLAN && x.stage < FAHNE && x.m.lastDay !== today)
    .sort((a, b) => a.stage - b.stage || a.m.lastDay - b.m.lastDay || (a.id < b.id ? -1 : 1))
    .slice(0, n)
    .map((x) => x.id);
}
