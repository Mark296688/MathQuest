// Einstellungen: Profile (Name, Bild, Burgfarbe) und Bedienung. Reine Logik, läuft im Browser und im Server.
// Gespeichert in data/einstellungen.json (siehe server/server.js).

export const VERSION = 1;
export const MAX_PROFILE = 6;
export const MAX_NAME = 16;

/** Bilder der Profilkarten (src/assets/ui/<id>.png). */
export const BILDER = [
  { id: 'helm', name: 'Ritterhelm' },
  { id: 'drache', name: 'Drache' },
  { id: 'krone', name: 'Krone' },
  { id: 'einhorn', name: 'Einhorn' },
  { id: 'eule', name: 'Eule' },
  { id: 'zauberhut', name: 'Zauberhut' },
];

/** Burgfarben, gleiche Schlüssel wie FARBEN in burg.js (Kenney-Paletten). */
export const FARB_IDS = ['blau', 'rot', 'gruen', 'gelb'];

/** Zeigen: Wii Remote über die Couch Workstation oder Maus/Touch. Antworten: Sprache (Handy) oder Ziffern tippen. */
export const ZEIGEN = ['maus', 'wii'];
export const ANTWORTEN = ['tippen', 'sprache'];

export function defaultEinstellungen() {
  return {
    version: VERSION,
    profile: [],
    bedienung: { zeigen: 'maus', antworten: 'tippen' },
    start: { mikrofon: '', couchWorkstation: '' },
  };
}

// Dateinamen, die Windows nicht erlaubt
const RESERVIERT = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Dateiname zum Anzeigenamen: „Jörg-Ünal“ → „joerg-uenal“. */
export function slug(name) {
  let s = String(name).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 28).replace(/-+$/, '');
  if (!s) s = 'profil';
  if (RESERVIERT.test(s)) s += '-profil';
  return s;
}

/** Neue, noch nicht vergebene id für einen Namen. */
export function freieId(name, vergeben) {
  const used = new Set(vergeben);
  const base = slug(name);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

export function cleanName(name) {
  return String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

/**
 * Prüft und vereinheitlicht Einstellungen. Wirft einen Fehler mit deutscher Meldung, wenn etwas nicht passt.
 * Unbekannte Felder fallen weg, fehlende bekommen den Standard.
 */
export function pruefeEinstellungen(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Einstellungen fehlen');
  const d = defaultEinstellungen();
  const list = Array.isArray(raw.profile) ? raw.profile : [];
  if (list.length > MAX_PROFILE) throw new Error(`Höchstens ${MAX_PROFILE} Profile`);
  const ids = new Set();
  const names = new Set();
  const profile = list.map((p) => {
    const id = String(p && p.id || '');
    if (!ID_RE.test(id) || RESERVIERT.test(id)) throw new Error(`Ungültige Profil-id „${id}“`);
    if (ids.has(id)) throw new Error(`Profil-id „${id}“ doppelt`);
    ids.add(id);
    const name = cleanName(p.name);
    if (!name) throw new Error('Jedes Profil braucht einen Namen');
    if (names.has(name.toLowerCase())) throw new Error(`Der Name „${name}“ kommt zweimal vor`);
    names.add(name.toLowerCase());
    const bild = BILDER.some((b) => b.id === p.bild) ? p.bild : BILDER[0].id;
    const farbe = FARB_IDS.includes(p.farbe) ? p.farbe : FARB_IDS[0];
    return { id, name, bild, farbe };
  });
  const b = raw.bedienung || {};
  const bedienung = {
    zeigen: ZEIGEN.includes(b.zeigen) ? b.zeigen : d.bedienung.zeigen,
    antworten: ANTWORTEN.includes(b.antworten) ? b.antworten : d.bedienung.antworten,
  };
  const s = raw.start || {};
  const text = (v) => (typeof v === 'string' ? v.trim().slice(0, 260) : '');
  return { version: VERSION, profile, bedienung, start: { mikrofon: text(s.mikrofon), couchWorkstation: text(s.couchWorkstation) } };
}

/**
 * Für Spielstände aus der Zeit vor den Einstellungen: aus vorhandenen Profil-Dateien Profile machen.
 * staende: [{ id, name }] aus data/profiles/<id>.json.
 */
export function ausAltenStaenden(staende) {
  const e = defaultEinstellungen();
  staende.slice(0, MAX_PROFILE).forEach((s, i) => {
    e.profile.push({ id: s.id, name: cleanName(s.name) || s.id, bild: BILDER[i % BILDER.length].id, farbe: FARB_IDS[i % FARB_IDS.length] });
  });
  return e;
}

/** Nächste Farbe und nächstes Bild für ein neues Profil: zuerst die noch nicht benutzten. */
export function neuesProfil(name, e) {
  const nimm = (alle, key) => alle.find((x) => !e.profile.some((p) => p[key] === x)) || alle[e.profile.length % alle.length];
  return {
    id: freieId(name, e.profile.map((p) => p.id)),
    name: cleanName(name),
    bild: nimm(BILDER.map((b) => b.id), 'bild'),
    farbe: nimm(FARB_IDS, 'farbe'),
  };
}
