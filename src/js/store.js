// Spielstand und Einstellungen laden und speichern: über den lokalen Server in data/, mit Kopie im Browser als Rückfall.
import { newProfile, upgradeProfile } from './motor.js';
import { pruefeEinstellungen, defaultEinstellungen } from './einstellungen.js';

const LOCAL = (id) => `mathquest-profile-${id}`;
const LOCAL_SETTINGS = 'mathquest-einstellungen';

function localGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function localSet(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* voll oder gesperrt */ }
}

export let serverOk = true;

/** Profil-id: Dateiname des Spielstands. Ältere Stände ohne id: Name in Kleinbuchstaben (so hießen die Dateien). */
export const profileId = (p) => p.id || p.name.toLowerCase();

// ---------- Einstellungen ----------

export async function loadSettings() {
  try {
    const res = await fetch('/api/einstellungen', { cache: 'no-store' });
    serverOk = res.ok;
    if (res.ok) { const e = await res.json(); localSet(LOCAL_SETTINGS, e); return e; }
  } catch { serverOk = false; }
  try { return pruefeEinstellungen(localGet(LOCAL_SETTINGS) || defaultEinstellungen()); } catch { return defaultEinstellungen(); }
}

/** Speichert und gibt die geprüften Einstellungen zurück. Wirft bei ungültigen Angaben (Meldung vom Server). */
export async function saveSettings(e) {
  const checked = pruefeEinstellungen(e);
  localSet(LOCAL_SETTINGS, checked);
  let res;
  try {
    res = await fetch('/api/einstellungen', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(checked) });
  } catch { serverOk = false; return checked; }
  serverOk = true;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Speichern fehlgeschlagen');
  return body;
}

// ---------- Spielstand ----------

/** Lädt den Spielstand zum Profil aus den Einstellungen ({ id, name, farbe }). */
export async function loadProfile(cfg) {
  const p = upgradeProfile(await loadRaw(cfg));
  p.id = cfg.id;
  p.name = cfg.name; // umbenannt in den Einstellungen
  if (cfg.farbe) p.burg.farbe = cfg.farbe;
  return p;
}

async function loadRaw(cfg) {
  try {
    const res = await fetch(`/api/state/${cfg.id}`, { cache: 'no-store' });
    serverOk = true;
    if (res.ok) return await res.json();
    if (res.status === 404) return localGet(LOCAL(cfg.id)) || newProfile(cfg.name, Date.now());
  } catch { serverOk = false; }
  return localGet(LOCAL(cfg.id)) || newProfile(cfg.name, Date.now());
}

const saving = new Map(); // je Profil: laufende Speicherung und ob danach noch einmal gespeichert werden muss

/**
 * Speichern, immer nur eine Anfrage pro Profil gleichzeitig. Kommt währenddessen eine neue,
 * wird danach der dann aktuelle Stand geschickt. So überholt nie ein alter Stand einen neueren.
 */
export function saveProfile(p) {
  const id = profileId(p);
  localSet(LOCAL(id), p);
  const q = saving.get(id) || { busy: null, again: null };
  saving.set(id, q);
  if (q.busy) { q.again = p; return q.busy; }
  q.busy = (async () => {
    for (let cur = p; cur; cur = q.again) {
      q.again = null;
      try {
        const res = await fetch(`/api/state/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cur),
        });
        serverOk = res.ok;
      } catch { serverOk = false; }
    }
    q.busy = null;
  })();
  return q.busy;
}

/** Eine Zeile ins Protokoll (data/logs/<id>.jsonl). Fehler werden nur vermerkt. */
export async function logEvent(p, ev) {
  try {
    const res = await fetch(`/api/log/${profileId(p)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev),
    });
    serverOk = res.ok;
  } catch { serverOk = false; }
}
