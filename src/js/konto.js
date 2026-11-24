// Online-Version: Anmeldung der Eltern (Bildschirm s-konto) und Konto-Aktionen für die Einstellungen.
// Das Passwort verlässt den Browser nie. Geschickt wird der Schlüssel aus schluessel.js (PBKDF2).
// In der lokalen Version wird nichts davon benutzt: Der lokale Server meldet keinen Online-Modus.
import { leiteSchluesselAb, normMail, MIN_PASSWORT } from './schluessel.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEINE_VERBINDUNG = 'Keine Verbindung zum Server. Bitte prüf die Internetverbindung und versuch es noch einmal.';

async function post(pfad, daten) {
  let r;
  try {
    r = await fetch(pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(daten ?? {}) });
  } catch { return { ok: false, status: 0, error: KEINE_VERBINDUNG }; }
  const j = await r.json().catch(() => ({}));
  return { ...j, ok: r.ok, status: r.status, error: j.error || (r.ok ? '' : 'Das hat nicht geklappt. Bitte versuch es noch einmal.') };
}

/** Lokale oder Online-Version, und wer ist angemeldet? */
export async function kontoStatus() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (!r.ok) return { erreichbar: false, online: false, konto: null };
    const j = await r.json();
    return { erreichbar: true, online: j.modus === 'online', konto: j.konto || null };
  } catch { return { erreichbar: false, online: false, konto: null }; }
}

/** Links aus Mails (?bestaetigen=…, ?passwort=…, ?vergessen) und ?geloescht. Nimmt sie aus der Adresse (Verlauf, Lesezeichen). */
export function linkAusMail() {
  const q = new URLSearchParams(location.search);
  let r = null;
  if (q.get('bestaetigen')) r = { art: 'bestaetigen', token: q.get('bestaetigen') };
  else if (q.get('passwort')) r = { art: 'passwort', token: q.get('passwort') };
  else if (q.has('vergessen')) r = { art: 'vergessen' };
  else if (q.has('geloescht')) r = { art: 'geloescht' };
  if (r) {
    ['bestaetigen', 'passwort', 'vergessen', 'geloescht'].forEach((k) => q.delete(k));
    history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : ''));
  }
  return r;
}

// ---------- Anmeldeseite ----------

const K = { ansicht: 'anmelden', email: '', hinweis: '', fehler: '', token: null, unbestaetigt: null, fertig: null };

const INTRO = '<p class="k-intro">Mathe-Lernspiel für die 4. Klasse: Jedes Kind baut mit seinen Aufgaben eine eigene 3D-Burg. '
  + 'Das Konto ist für Eltern. Darin bekommt jedes Kind ein Profil, ohne eigene E-Mail.</p>';

const feld = (name, label, typ, auto, wert = '', extra = '') => `<label class="k-feld"><span>${label}</span>`
  + `<input name="${name}" type="${typ}" autocomplete="${auto}" value="${esc(wert)}" required ${extra}></label>`;
const pwFeld = (label = 'Passwort (mindestens 10 Zeichen)') => feld('passwort', label, 'password', 'new-password', '', `minlength="${MIN_PASSWORT}"`);
const meldungen = () => (K.hinweis ? `<p class="k-hinweis" role="status">${esc(K.hinweis)}</p>` : '')
  + (K.fehler ? `<p class="k-fehler" role="alert">${esc(K.fehler)}</p>` : '')
  + (K.unbestaetigt ? '<button type="button" class="btn small" data-act="nochmal">Bestätigungsmail nochmal schicken</button>' : '');
const link = (ansicht, text) => `<button type="button" class="k-link" data-ansicht="${ansicht}">${text}</button>`;

const ANSICHTEN = {
  anmelden: () => `<h2>Anmelden</h2>${INTRO}<form data-form="anmelden">`
    + feld('email', 'E-Mail', 'email', 'username', K.email)
    + feld('passwort', 'Passwort', 'password', 'current-password')
    + `${meldungen()}<button class="btn primary" type="submit">Anmelden</button></form>`
    + `<p class="k-links">${link('vergessen', 'Passwort vergessen?')}${link('registrieren', 'Neu hier? Konto anlegen')}</p>`,
  registrieren: () => `<h2>Konto anlegen</h2>${INTRO}<form data-form="registrieren">`
    + feld('email', 'E-Mail', 'email', 'username', K.email) + pwFeld()
    + '<label class="k-check"><input type="checkbox" name="zustimmung" required><span>Ich bin mindestens 18 Jahre alt und habe die '
    + '<a href="/datenschutz" target="_blank" rel="noopener">Datenschutzhinweise</a> gelesen.</span></label>'
    + '<div class="k-hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>'
    + `${meldungen()}<button class="btn primary" type="submit">Konto anlegen</button></form>`
    + `<p class="k-links">${link('anmelden', 'Schon ein Konto? Anmelden')}</p>`,
  gesendet: () => '<h2>Fast geschafft</h2>'
    + `<p>Wir haben eine Mail an <b>${esc(K.email)}</b> geschickt. Klick auf den Link darin, danach meldest du dich hier an.</p>`
    + '<p class="k-klein">Keine Mail da? Schau im Spam-Ordner nach. Der Link gilt 48 Stunden.</p>'
    + `<p class="k-links">${link('anmelden', 'Zur Anmeldung')}</p>`,
  vergessen: () => '<h2>Passwort vergessen</h2>'
    + '<p>Gib die Adresse deines Kontos ein. Wir schicken dir einen Link, mit dem du ein neues Passwort setzt.</p>'
    + `<form data-form="vergessen">${feld('email', 'E-Mail', 'email', 'username', K.email)}${meldungen()}`
    + `<button class="btn primary" type="submit">Link schicken</button></form><p class="k-links">${link('anmelden', 'Zurück zur Anmeldung')}</p>`,
  vergessenGesendet: () => '<h2>Mail ist unterwegs</h2>'
    + `<p>Wenn es ein Konto mit <b>${esc(K.email)}</b> gibt, haben wir dir einen Link geschickt. Damit setzt du ein neues Passwort.</p>`
    + '<p class="k-klein">Der Link gilt eine Stunde. Keine Mail da? Schau im Spam-Ordner nach.</p>'
    + `<p class="k-links">${link('anmelden', 'Zur Anmeldung')}</p>`,
  neu: () => `<h2>Neues Passwort</h2><p>Für das Konto <b>${esc(K.email)}</b>.</p><form data-form="neu">`
    + `<input type="email" name="email" autocomplete="username" value="${esc(K.email)}" hidden readonly>`
    + `${pwFeld('Neues Passwort (mindestens 10 Zeichen)')}${meldungen()}<button class="btn primary" type="submit">Passwort speichern</button></form>`,
  warten: () => '<h2>Einen Moment</h2><p>Der Link wird geprüft …</p>',
};

function render() {
  $('#konto-card').innerHTML = ANSICHTEN[K.ansicht]();
  const leer = [...document.querySelectorAll('#konto-card input:not([type=hidden]):not([hidden]):not([type=checkbox])')]
    .find((i) => !i.value && !i.closest('.k-hp'));
  if (leer) leer.focus();
}

function wechsle(ansicht, { hinweis = '', fehler = '' } = {}) {
  K.ansicht = ansicht;
  K.hinweis = hinweis;
  K.fehler = fehler;
  if (ansicht !== 'anmelden') K.unbestaetigt = null;
  render();
}

function fehlerZeigen(text) {
  K.fehler = text;
  K.hinweis = '';
  render();
}

async function absenden(form) {
  const f = Object.fromEntries(new FormData(form));
  const knopf = form.querySelector('button[type=submit]');
  const art = form.dataset.form;
  const email = normMail(f.email);
  if (f.email !== undefined) K.email = email || String(f.email).trim();
  if (art !== 'neu' && !email) { fehlerZeigen('Bitte gib eine gültige E-Mail-Adresse ein.'); return; }
  if ((art === 'registrieren' || art === 'neu') && String(f.passwort).length < MIN_PASSWORT) {
    fehlerZeigen(`Das Passwort braucht mindestens ${MIN_PASSWORT} Zeichen.`);
    return;
  }
  knopf.disabled = true;
  const text = knopf.textContent;
  knopf.textContent = 'Moment …';
  try {
    if (art === 'anmelden') {
      const schluessel = await leiteSchluesselAb(email, f.passwort);
      const r = await post('/api/konto/anmelden', { email, schluessel });
      if (r.ok) { K.fertig(r.konto); return; }
      K.unbestaetigt = r.unbestaetigt ? { email, schluessel } : null;
      fehlerZeigen(r.error);
    } else if (art === 'registrieren') {
      const schluessel = await leiteSchluesselAb(email, f.passwort);
      const r = await post('/api/konto/registrieren', { email, schluessel, zustimmung: f.zustimmung === 'on', website: f.website || '' });
      if (r.ok) wechsle('gesendet'); else fehlerZeigen(r.error);
    } else if (art === 'vergessen') {
      const r = await post('/api/konto/vergessen', { email });
      if (r.ok) wechsle('vergessenGesendet'); else fehlerZeigen(r.error);
    } else if (art === 'neu') {
      const r = await post('/api/konto/passwort-neu', { token: K.token, schluessel: await leiteSchluesselAb(K.email, f.passwort) });
      if (r.ok) { K.token = null; K.fertig(r.konto); return; }
      if (r.linkUngueltig) wechsle('vergessen', { fehler: `${r.error} Fordere einfach einen neuen an.` });
      else fehlerZeigen(r.error);
    }
  } finally {
    if (knopf.isConnected) { knopf.disabled = false; knopf.textContent = text; }
  }
}

async function bestaetige(token) {
  wechsle('warten');
  const r = await post('/api/konto/bestaetigen', { token });
  if (r.ok) {
    K.email = r.email;
    wechsle('anmelden', { hinweis: 'Danke, deine Adresse ist bestätigt. Melde dich jetzt mit deinem Passwort an.' });
  } else {
    wechsle('anmelden', { fehler: r.linkUngueltig ? `${r.error} Hast du schon bestätigt? Dann melde dich einfach an.` : r.error });
  }
}

async function ladeReset(token) {
  wechsle('warten');
  const r = await post('/api/konto/marke', { token });
  if (r.ok) { K.token = token; K.email = r.email; wechsle('neu'); } else wechsle('vergessen', { fehler: `${r.error} Fordere einfach einen neuen an.` });
}

$('#s-konto').addEventListener('submit', (e) => {
  e.preventDefault();
  absenden(e.target);
});
$('#s-konto').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.ansicht) wechsle(b.dataset.ansicht);
  else if (b.dataset.act === 'nochmal' && K.unbestaetigt) {
    b.disabled = true;
    const r = await post('/api/konto/registrieren', { ...K.unbestaetigt, zustimmung: true });
    if (r.ok) wechsle('gesendet'); else fehlerZeigen(r.error);
  }
});

/**
 * Zeigt die Anmeldung und wartet, bis jemand angemeldet ist. Gibt das Konto ({ id, email }) zurück.
 * zeige: Bildschirm wechseln (app.js). link: Ergebnis von linkAusMail(). hinweis: Text über dem Formular.
 */
export function anmeldung({ zeige, link: mailLink = null, hinweis = '' }) {
  return new Promise((resolve) => {
    K.fertig = (konto) => { K.fertig = null; resolve(konto); };
    K.unbestaetigt = null;
    zeige('s-konto');
    if (mailLink && mailLink.art === 'bestaetigen') bestaetige(mailLink.token);
    else if (mailLink && mailLink.art === 'passwort') ladeReset(mailLink.token);
    else if (mailLink && mailLink.art === 'vergessen') wechsle('vergessen');
    else if (mailLink && mailLink.art === 'geloescht') wechsle('anmelden', { hinweis: 'Dein Konto und alle Spielstände sind gelöscht.' });
    else wechsle('anmelden', { hinweis });
  });
}

// ---------- Aktionen aus den Einstellungen ----------

export async function abmelden() { return post('/api/konto/abmelden'); }

export async function passwortAendern(email, alt, neu) {
  if (String(neu).length < MIN_PASSWORT) return { ok: false, error: `Das neue Passwort braucht mindestens ${MIN_PASSWORT} Zeichen.` };
  const [a, n] = await Promise.all([leiteSchluesselAb(email, alt), leiteSchluesselAb(email, neu)]);
  return post('/api/konto/passwort-aendern', { alt: a, neu: n });
}

export async function kontoLoeschen(email, passwort) {
  return post('/api/konto/loeschen', { schluessel: await leiteSchluesselAb(email, passwort) });
}
