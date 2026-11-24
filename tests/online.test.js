// Online-Version (online/worker.js): Konten, Trennung der Haushalte, Bremse, Mails, Aufräumen.
// Läuft gegen echtes SQLite (node:sqlite) in der Form von Cloudflare D1. Fehlt online/ oder node:sqlite, wird übersprungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { leiteSchluesselAb, normMail, RUNDEN } from '../src/js/schluessel.js';

test('src/_headers: CSP erlaubt genau das Importmap-Skript aus index.html', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const kopf = readFileSync(new URL('../src/_headers', import.meta.url), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(inline.length, 1, 'genau ein eingebettetes Skript (das Importmap)');
  const hash = `'sha256-${createHash('sha256').update(inline[0]).digest('base64')}'`;
  assert.ok(kopf.includes(hash), `src/_headers braucht ${hash}`);
});

test('app.js: Vollbild nur anfordern, wenn der Browser es kann (iPhone-Safari hat kein requestFullscreen)', () => {
  const app = readFileSync(new URL('../src/js/app.js', import.meta.url), 'utf8');
  const aufrufe = [...app.matchAll(/requestFullscreen\S*/g)].map((m) => m[0]).filter((a) => a.includes('('));
  assert.ok(aufrufe.length > 0, 'Aufruf gefunden');
  for (const a of aufrufe) assert.ok(a.startsWith('requestFullscreen?.()?.'), `ungeschützter Aufruf: ${a}`);
});

let worker; let d1; let migriere; let aufraeumen;
let fehlt = false;
try {
  ({ default: worker } = await import('../online/worker.js'));
  ({ d1, migriere } = await import('../online/lokal/d1.js'));
  ({ aufraeumen } = await import('../online/konto.js'));
} catch (e) { fehlt = `Online-Teil nicht verfügbar: ${e.message}`; }

const ORIGIN = 'https://mathquest.test';
const S1 = 'a'.repeat(64);
const S2 = 'b'.repeat(64);
const S3 = 'c'.repeat(64);
const MIN = 60 * 1000;
const STD = 60 * MIN;
const TAG = 24 * STD;

function umgebung(extra = {}) {
  const db = d1();
  migriere(db);
  const mails = [];
  let uhr = Date.UTC(2026, 10, 24, 12);
  const env = { DB: db, GEHEIMNIS: 'test', MAIL_ABFANG: mails, UHR: () => uhr, ...extra };
  async function rufe(methode, pfad, daten, { keks, origin = ORIGIN, ip = '203.0.113.7', typ = 'application/json', roh } = {}) {
    const offen = [];
    const headers = { 'CF-Connecting-IP': ip };
    if (origin) headers.Origin = origin;
    if (keks) headers.Cookie = keks;
    let body;
    if (methode !== 'GET') {
      headers['Content-Type'] = typ;
      body = roh ?? (daten === undefined ? '' : JSON.stringify(daten));
    }
    const res = await worker.fetch(new Request(ORIGIN + pfad, { method: methode, headers, body }), env, { waitUntil: (p) => offen.push(p) });
    await Promise.all(offen);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* kein JSON */ }
    const setCookie = res.headers.getSetCookie();
    return { status: res.status, json, text, res, setCookie, keks: setCookie.length ? setCookie[0].split(';')[0] : null };
  }
  const zahl = (tabelle) => db.roh.prepare(`SELECT COUNT(*) AS n FROM ${tabelle}`).get().n;
  return { env, db, mails, rufe, zahl, vor: (ms) => { uhr += ms; }, jetzt: () => uhr };
}

const letzteMail = (u, an, vorlage) => u.mails.filter((m) => m.an === an && m.vorlage === vorlage).at(-1);
const tokenAus = (m, param) => new URL(m.link).searchParams.get(param);

async function neuesKonto(u, email = 'anna@example.org', s = S1) {
  await u.rufe('POST', '/api/konto/registrieren', { email, schluessel: s, zustimmung: true });
  const b = await u.rufe('POST', '/api/konto/bestaetigen', { token: tokenAus(letzteMail(u, email, 'bestaetigen'), 'bestaetigen') });
  assert.equal(b.status, 200);
  const a = await u.rufe('POST', '/api/konto/anmelden', { email, schluessel: s });
  assert.equal(a.status, 200);
  return a.keks;
}

const einst = (...ids) => ({ profile: ids.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) })) });

test('Schlüssel aus Passwort: gleiche Adresse (vereinheitlicht) und gleiches Passwort ergeben denselben Wert', async () => {
  assert.equal(RUNDEN, 600000);
  const a = await leiteSchluesselAb(' Anna@Example.org ', 'Burgfräulein-42', 1000);
  const b = await leiteSchluesselAb('anna@example.org', 'Burgfräulein-42', 1000);
  const c = await leiteSchluesselAb('ben@example.org', 'Burgfräulein-42', 1000);
  const d = await leiteSchluesselAb('anna@example.org', 'Burgfräulein-43', 1000);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.equal(normMail('kein-at.example.org'), null);
  assert.equal(normMail(' Ben@Example.ORG'), 'ben@example.org');
});

test('Anlegen, Bestätigen, Anmelden: erst nach der Bestätigung, Cookie sicher gesetzt', { skip: fehlt }, async () => {
  const u = umgebung();
  const h0 = await u.rufe('GET', '/api/health');
  assert.deepEqual(h0.json, { ok: true, modus: 'online', konto: null });

  const r = await u.rufe('POST', '/api/konto/registrieren', { email: 'Anna@Example.org', schluessel: S1, zustimmung: true });
  assert.equal(r.status, 200);
  const m = letzteMail(u, 'anna@example.org', 'bestaetigen');
  assert.ok(m, 'Bestätigungsmail geschickt');
  assert.match(m.link, /^https:\/\/mathquest\.test\/\?bestaetigen=[A-Za-z0-9_-]{43}$/);

  const vorher = await u.rufe('POST', '/api/konto/anmelden', { email: 'anna@example.org', schluessel: S1 });
  assert.equal(vorher.status, 403);
  assert.equal(vorher.json.unbestaetigt, true);

  const b = await u.rufe('POST', '/api/konto/bestaetigen', { token: tokenAus(m, 'bestaetigen') });
  assert.deepEqual(b.json, { ok: true, email: 'anna@example.org' });
  assert.equal(b.setCookie.length, 0, 'Bestätigen meldet nicht an');
  const nochmal = await u.rufe('POST', '/api/konto/bestaetigen', { token: tokenAus(m, 'bestaetigen') });
  assert.equal(nochmal.status, 400, 'Link nur einmal gültig');

  const a = await u.rufe('POST', '/api/konto/anmelden', { email: 'anna@example.org', schluessel: S1 });
  assert.equal(a.status, 200);
  const sc = a.setCookie[0];
  assert.match(sc, /^__Host-mq_sitzung=[A-Za-z0-9_-]{43};/);
  for (const teil of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(sc.includes(teil), teil);

  const h1 = await u.rufe('GET', '/api/health', undefined, { keks: a.keks });
  assert.equal(h1.json.konto.email, 'anna@example.org');
  assert.match(h1.json.konto.id, /^[0-9a-f]{32}$/);

  const falsch = await u.rufe('POST', '/api/konto/anmelden', { email: 'anna@example.org', schluessel: S2 });
  assert.equal(falsch.status, 401);
  const unbekannt = await u.rufe('POST', '/api/konto/anmelden', { email: 'niemand@example.org', schluessel: S1 });
  assert.equal(unbekannt.status, 401);
  assert.equal(unbekannt.json.error, falsch.json.error, 'gleiche Meldung, ob Konto existiert oder nicht');
});

test('Nochmal anlegen: bestätigtes Konto bleibt unverändert, unbestätigtes übernimmt das neue Passwort', { skip: fehlt }, async () => {
  const u = umgebung();
  await neuesKonto(u, 'anna@example.org', S1);
  const neu = await u.rufe('POST', '/api/konto/registrieren', { email: 'anna@example.org', schluessel: S2, zustimmung: true });
  assert.deepEqual(neu.json, { ok: true }, 'gleiche Antwort wie bei einer neuen Adresse');
  assert.ok(letzteMail(u, 'anna@example.org', 'schonDa'));
  assert.equal((await u.rufe('POST', '/api/konto/anmelden', { email: 'anna@example.org', schluessel: S2 })).status, 401);
  assert.equal((await u.rufe('POST', '/api/konto/anmelden', { email: 'anna@example.org', schluessel: S1 })).status, 200);

  await u.rufe('POST', '/api/konto/registrieren', { email: 'ben@example.org', schluessel: S1, zustimmung: true });
  const ersterLink = tokenAus(letzteMail(u, 'ben@example.org', 'bestaetigen'), 'bestaetigen');
  await u.rufe('POST', '/api/konto/registrieren', { email: 'ben@example.org', schluessel: S2, zustimmung: true });
  assert.equal((await u.rufe('POST', '/api/konto/bestaetigen', { token: ersterLink })).status, 400, 'alter Link ungültig');
  await u.rufe('POST', '/api/konto/bestaetigen', { token: tokenAus(letzteMail(u, 'ben@example.org', 'bestaetigen'), 'bestaetigen') });
  assert.equal((await u.rufe('POST', '/api/konto/anmelden', { email: 'ben@example.org', schluessel: S1 })).status, 401);
  assert.equal((await u.rufe('POST', '/api/konto/anmelden', { email: 'ben@example.org', schluessel: S2 })).status, 200);
});

test('Anlegen prüft Eingaben; Honigtopf-Feld legt nichts an', { skip: fehlt }, async () => {
  const u = umgebung();
  assert.equal((await u.rufe('POST', '/api/konto/registrieren', { email: 'quatsch', schluessel: S1, zustimmung: true })).status, 400);
  assert.equal((await u.rufe('POST', '/api/konto/registrieren', { email: 'anna@example.org', schluessel: 'kurz', zustimmung: true })).status, 400);
  assert.equal((await u.rufe('POST', '/api/konto/registrieren', { email: 'anna@example.org', schluessel: S1 })).status, 400, 'ohne Zustimmung');
  const bot = await u.rufe('POST', '/api/konto/registrieren', { email: 'anna@example.org', schluessel: S1, zustimmung: true, website: 'http://spam.example' });
  assert.equal(bot.status, 200);
  assert.equal(u.zahl('konten'), 0);
  assert.equal(u.mails.length, 0);
});

test('REGISTRIERUNG: vor dem Start nur freigegebene Adressen, Anmelden bleibt möglich', { skip: fehlt }, async () => {
  const u = umgebung();
  await neuesKonto(u, 'anna@example.org', S1);
  u.env.REGISTRIERUNG = 'zu';
  const zu = await u.rufe('POST', '/api/konto/registrieren', { email: 'ben@example.org', schluessel: S2, zustimmung: true });
  assert.equal(zu.status, 403);
  assert.equal(u.mails.filter((m) => m.an === 'ben@example.org').length, 0);
  assert.equal((await u.rufe('POST', '/api/konto/anmelden', { email: 'anna@example.org', schluessel: S1 })).status, 200);
  u.env.REGISTRIERUNG = ' Ben@Example.org , test@example.org';
  assert.equal((await u.rufe('POST', '/api/konto/registrieren', { email: 'ben@example.org', schluessel: S2, zustimmung: true })).status, 200);
  assert.ok(letzteMail(u, 'ben@example.org', 'bestaetigen'));
  u.env.REGISTRIERUNG = 'offen';
  assert.equal((await u.rufe('POST', '/api/konto/registrieren', { email: 'mia@example.org', schluessel: S3, zustimmung: true })).status, 200);
});

test('Haushalte sind getrennt, auch bei gleichen Profil-ids', { skip: fehlt }, async () => {
  const u = umgebung();
  const a = await neuesKonto(u, 'anna@example.org', S1);
  const b = await neuesKonto(u, 'ben@example.org', S2);
  assert.equal((await u.rufe('PUT', '/api/einstellungen', einst('mia', 'tom'), { keks: a })).status, 200);
  assert.equal((await u.rufe('PUT', '/api/einstellungen', einst('mia'), { keks: b })).status, 200);

  assert.equal((await u.rufe('PUT', '/api/state/mia', { name: 'Mia', burg: 'von A' }, { keks: a })).status, 200);
  assert.equal((await u.rufe('PUT', '/api/state/tom', { name: 'Tom', burg: 'von A' }, { keks: a })).status, 200);

  const bMia = await u.rufe('GET', '/api/state/mia', undefined, { keks: b });
  assert.equal(bMia.status, 404, 'B sieht nicht den Stand von A');
  assert.equal(bMia.json.error, 'neu');
  assert.equal((await u.rufe('GET', '/api/state/tom', undefined, { keks: b })).status, 404, 'Profil von A gibt es bei B nicht');
  assert.equal((await u.rufe('PUT', '/api/state/tom', { burg: 'von B' }, { keks: b })).json.error, 'unbekanntes Profil');

  assert.equal((await u.rufe('PUT', '/api/state/mia', { name: 'Mia', burg: 'von B' }, { keks: b })).status, 200);
  assert.equal((await u.rufe('GET', '/api/state/mia', undefined, { keks: a })).json.burg, 'von A', 'A bleibt unverändert');
  assert.equal((await u.rufe('GET', '/api/state/mia', undefined, { keks: b })).json.burg, 'von B');
  assert.deepEqual((await u.rufe('GET', '/api/einstellungen', undefined, { keks: b })).json.profile.map((p) => p.id), ['mia']);
});

test('Ohne Anmeldung: keine Daten; fremde Seiten und Nicht-JSON werden abgewiesen', { skip: fehlt }, async () => {
  const u = umgebung();
  const a = await neuesKonto(u);
  assert.equal((await u.rufe('GET', '/api/einstellungen')).status, 401);
  assert.equal((await u.rufe('GET', '/api/state/mia')).status, 401);
  assert.equal((await u.rufe('GET', '/api/einstellungen', undefined, { keks: 'mq=falsch' })).status, 401);
  assert.equal((await u.rufe('GET', '/api/einstellungen', undefined, { keks: `__Host-mq_sitzung=${'x'.repeat(43)}` })).status, 401);
  assert.equal((await u.rufe('PUT', '/api/einstellungen', einst('mia'), { keks: a, origin: 'https://boese.example' })).status, 403);
  assert.equal((await u.rufe('PUT', '/api/einstellungen', einst('mia'), { keks: a, origin: null })).status, 403);
  assert.equal((await u.rufe('PUT', '/api/einstellungen', einst('mia'), { keks: a, typ: 'text/plain' })).status, 415);
  assert.equal((await u.rufe('PUT', '/api/einstellungen', undefined, { keks: a, roh: '{kaputt' })).status, 400);
  assert.equal((await u.rufe('GET', '/api/gibtsnicht', undefined, { keks: a })).status, 404);
});

test('Einstellungen online: immer Maus und Tippen; gelöschtes Profil verliert seinen Spielstand', { skip: fehlt }, async () => {
  const u = umgebung();
  const a = await neuesKonto(u);
  const e = await u.rufe('PUT', '/api/einstellungen', { ...einst('mia', 'tom'), bedienung: { zeigen: 'wii', antworten: 'sprache' }, start: { mikrofon: 'X' } }, { keks: a });
  assert.deepEqual(e.json.bedienung, { zeigen: 'maus', antworten: 'tippen' });
  assert.deepEqual(e.json.start, { mikrofon: '', couchWorkstation: '' });
  assert.equal((await u.rufe('PUT', '/api/einstellungen', { profile: [{ id: '../x', name: 'X' }] }, { keks: a })).status, 400);

  await u.rufe('PUT', '/api/state/mia', { n: 1 }, { keks: a });
  await u.rufe('PUT', '/api/state/tom', { n: 2 }, { keks: a });
  assert.equal(u.zahl('spielstaende'), 2);
  await u.rufe('PUT', '/api/einstellungen', einst('tom'), { keks: a });
  assert.equal(u.zahl('spielstaende'), 1);
  assert.equal((await u.rufe('GET', '/api/state/tom', undefined, { keks: a })).json.n, 2);
});

test('Spielstand: Größe, gültiges JSON-Objekt; Lernprotokoll wird online nicht gespeichert', { skip: fehlt }, async () => {
  const u = umgebung();
  const a = await neuesKonto(u);
  await u.rufe('PUT', '/api/einstellungen', einst('mia'), { keks: a });
  assert.equal((await u.rufe('PUT', '/api/state/mia', [1, 2], { keks: a })).status, 400);
  assert.equal((await u.rufe('PUT', '/api/state/mia', { x: 'y'.repeat(260 * 1024) }, { keks: a })).status, 413);
  assert.equal((await u.rufe('POST', '/api/log/mia', { type: 'task' }, { keks: a })).status, 204);
  assert.equal(u.zahl('spielstaende'), 0);
});

test('Bremse: nach 10 Fehlversuchen ist das Konto 15 Minuten gesperrt, auch mit richtigem Passwort', { skip: fehlt }, async () => {
  const u = umgebung();
  await neuesKonto(u);
  for (let i = 0; i < 10; i++) {
    assert.equal((await u.rufe('POST', '/api/konto/anmelden', { email: 'anna@example.org', schluessel: S2 }, { ip: `198.51.100.${i}` })).status, 401);
  }
  assert.equal((await u.rufe('POST', '/api/konto/anmelden', { email: 'anna@example.org', schluessel: S1 })).status, 429);
  u.vor(16 * MIN);
  assert.equal((await u.rufe('POST', '/api/konto/anmelden', { email: 'anna@example.org', schluessel: S1 })).status, 200);
  const zeilen = u.db.roh.prepare('SELECT schluessel FROM bremse').all().map((r) => r.schluessel).join(' ');
  assert.ok(!zeilen.includes('anna') && !zeilen.includes('203.0.113'), 'Adressen nur als HMAC');
});

test('Bremse: Konten anlegen je IP begrenzt', { skip: fehlt }, async () => {
  const u = umgebung();
  for (let i = 0; i < 10; i++) {
    assert.equal((await u.rufe('POST', '/api/konto/registrieren', { email: `kind${i}@example.org`, schluessel: S1, zustimmung: true })).status, 200);
  }
  assert.equal((await u.rufe('POST', '/api/konto/registrieren', { email: 'noch@example.org', schluessel: S1, zustimmung: true })).status, 429);
  assert.equal((await u.rufe('POST', '/api/konto/registrieren', { email: 'noch@example.org', schluessel: S1, zustimmung: true }, { ip: '192.0.2.1' })).status, 200);
});

test('Passwort vergessen: Mail nur für bekannte Adressen, höchstens 3 je Stunde und Adresse; setzt neu und meldet überall ab', { skip: fehlt }, async () => {
  const u = umgebung();
  const alt = await neuesKonto(u);
  u.vor(2 * STD);
  const unbekannt = await u.rufe('POST', '/api/konto/vergessen', { email: 'niemand@example.org' });
  assert.deepEqual(unbekannt.json, { ok: true });
  assert.equal(u.mails.filter((m) => m.vorlage === 'passwort').length, 0);

  for (let i = 0; i < 4; i++) assert.deepEqual((await u.rufe('POST', '/api/konto/vergessen', { email: 'anna@example.org' })).json, { ok: true });
  assert.equal(u.mails.filter((m) => m.vorlage === 'passwort').length, 3);

  const token = tokenAus(letzteMail(u, 'anna@example.org', 'passwort'), 'passwort');
  assert.deepEqual((await u.rufe('POST', '/api/konto/marke', { token })).json, { ok: true, email: 'anna@example.org' });
  assert.equal((await u.rufe('POST', '/api/konto/marke', { token: 'x'.repeat(43) })).json.linkUngueltig, true);
  const neu = await u.rufe('POST', '/api/konto/passwort-neu', { token, schluessel: S3 });
  assert.equal(neu.status, 200);
  assert.ok(neu.keks, 'gleich angemeldet');
  assert.equal((await u.rufe('GET', '/api/einstellungen', undefined, { keks: alt })).status, 401, 'alte Sitzung beendet');
  assert.equal((await u.rufe('GET', '/api/einstellungen', undefined, { keks: neu.keks })).status, 200);
  assert.equal((await u.rufe('POST', '/api/konto/anmelden', { email: 'anna@example.org', schluessel: S1 })).status, 401);
  assert.equal((await u.rufe('POST', '/api/konto/anmelden', { email: 'anna@example.org', schluessel: S3 })).status, 200);
  assert.equal((await u.rufe('POST', '/api/konto/passwort-neu', { token, schluessel: S2 })).status, 400, 'Link nur einmal');
});

test('Passwort vergessen bestätigt ein unbestätigtes Konto; Link gilt eine Stunde', { skip: fehlt }, async () => {
  const u = umgebung();
  await u.rufe('POST', '/api/konto/registrieren', { email: 'ben@example.org', schluessel: S1, zustimmung: true });
  await u.rufe('POST', '/api/konto/vergessen', { email: 'ben@example.org' });
  const token = tokenAus(letzteMail(u, 'ben@example.org', 'passwort'), 'passwort');
  u.vor(61 * MIN);
  assert.equal((await u.rufe('POST', '/api/konto/passwort-neu', { token, schluessel: S2 })).status, 400);
  await u.rufe('POST', '/api/konto/vergessen', { email: 'ben@example.org' });
  const t2 = tokenAus(letzteMail(u, 'ben@example.org', 'passwort'), 'passwort');
  assert.equal((await u.rufe('POST', '/api/konto/passwort-neu', { token: t2, schluessel: S2 })).status, 200);
  assert.equal((await u.rufe('POST', '/api/konto/anmelden', { email: 'ben@example.org', schluessel: S2 })).status, 200);
});

test('Passwort ändern: altes Passwort nötig, andere Geräte werden abgemeldet', { skip: fehlt }, async () => {
  const u = umgebung();
  const hier = await neuesKonto(u);
  const dort = (await u.rufe('POST', '/api/konto/anmelden', { email: 'anna@example.org', schluessel: S1 })).keks;
  assert.equal((await u.rufe('POST', '/api/konto/passwort-aendern', { alt: S2, neu: S3 }, { keks: hier })).status, 401);
  assert.equal((await u.rufe('POST', '/api/konto/passwort-aendern', { alt: S1, neu: S3 }, { keks: hier })).status, 200);
  assert.equal((await u.rufe('GET', '/api/einstellungen', undefined, { keks: hier })).status, 200);
  assert.equal((await u.rufe('GET', '/api/einstellungen', undefined, { keks: dort })).status, 401);
  assert.equal((await u.rufe('POST', '/api/konto/anmelden', { email: 'anna@example.org', schluessel: S3 })).status, 200);
  assert.equal((await u.rufe('POST', '/api/konto/passwort-aendern', { alt: S1, neu: S3 })).status, 401, 'nur angemeldet');
});

test('Abmelden beendet die Sitzung und löscht das Cookie', { skip: fehlt }, async () => {
  const u = umgebung();
  const a = await neuesKonto(u);
  const r = await u.rufe('POST', '/api/konto/abmelden', undefined, { keks: a });
  assert.equal(r.status, 200);
  assert.match(r.setCookie[0], /Max-Age=0/);
  assert.equal((await u.rufe('GET', '/api/einstellungen', undefined, { keks: a })).status, 401);
});

test('Daten herunterladen und Konto löschen', { skip: fehlt }, async () => {
  const u = umgebung();
  const a = await neuesKonto(u);
  const b = await neuesKonto(u, 'ben@example.org', S2);
  await u.rufe('PUT', '/api/einstellungen', einst('mia'), { keks: a });
  await u.rufe('PUT', '/api/state/mia', { burg: 'A' }, { keks: a });
  await u.rufe('PUT', '/api/einstellungen', einst('tom'), { keks: b });
  await u.rufe('PUT', '/api/state/tom', { burg: 'B' }, { keks: b });

  const d = await u.rufe('GET', '/api/konto/daten', undefined, { keks: a });
  assert.equal(d.status, 200);
  assert.match(d.res.headers.get('Content-Disposition'), /attachment/);
  assert.equal(d.json.konto.email, 'anna@example.org');
  assert.deepEqual(d.json.einstellungen.profile.map((p) => p.id), ['mia']);
  assert.deepEqual(d.json.spielstaende.mia.stand, { burg: 'A' });
  assert.ok(!d.text.includes('v1$'), 'kein Passwort-Prüfwert in der Auskunft');

  assert.equal((await u.rufe('POST', '/api/konto/loeschen', { schluessel: S2 }, { keks: a })).status, 401);
  const weg = await u.rufe('POST', '/api/konto/loeschen', { schluessel: S1 }, { keks: a });
  assert.equal(weg.status, 200);
  assert.match(weg.setCookie[0], /Max-Age=0/);
  assert.equal(u.zahl('konten'), 1);
  assert.equal(u.zahl('spielstaende'), 1);
  assert.equal(u.db.roh.prepare("SELECT COUNT(*) AS n FROM sitzungen s JOIN konten k ON k.id = s.konto WHERE k.email = 'anna@example.org'").get().n, 0);
  assert.equal((await u.rufe('GET', '/api/einstellungen', undefined, { keks: a })).status, 401);
  assert.equal((await u.rufe('POST', '/api/konto/anmelden', { email: 'anna@example.org', schluessel: S1 })).status, 401);
  assert.equal((await u.rufe('GET', '/api/state/tom', undefined, { keks: b })).json.burg, 'B', 'anderes Konto unberührt');
});

test('Aufräumen: unbestätigte Konten nach 3 Tagen, abgelaufene Sitzungen, Konten 2 Jahre ohne Anmeldung', { skip: fehlt }, async () => {
  const u = umgebung();
  const a = await neuesKonto(u);
  await u.rufe('PUT', '/api/einstellungen', einst('mia'), { keks: a });
  await u.rufe('PUT', '/api/state/mia', { burg: 'A' }, { keks: a });
  await u.rufe('POST', '/api/konto/registrieren', { email: 'ben@example.org', schluessel: S2, zustimmung: true });
  assert.equal(u.zahl('konten'), 2);

  u.vor(4 * TAG);
  await aufraeumen(u.env, u.jetzt());
  assert.equal(u.zahl('konten'), 1, 'unbestätigtes Konto weg');
  assert.equal(u.zahl('marken'), 0);
  assert.equal((await u.rufe('GET', '/api/einstellungen', undefined, { keks: a })).status, 200, 'Sitzung lebt und wird verlängert');

  u.vor(91 * TAG);
  assert.equal((await u.rufe('GET', '/api/einstellungen', undefined, { keks: a })).status, 401, 'nach 90 Tagen ohne Nutzung abgelaufen');
  await aufraeumen(u.env, u.jetzt());
  assert.equal(u.zahl('sitzungen'), 0);
  assert.equal(u.zahl('konten'), 1);

  u.vor(640 * TAG);
  await aufraeumen(u.env, u.jetzt());
  assert.equal(u.zahl('konten'), 0, '2 Jahre ohne Anmeldung');
  assert.equal(u.zahl('spielstaende'), 0);
});

test('Impressum und Datenschutz kommen aus der Datenbank; Sicherheits-Kopfzeilen', { skip: fehlt }, async () => {
  const u = umgebung();
  const fehltNoch = await u.rufe('GET', '/impressum');
  assert.equal(fehltNoch.status, 404);
  u.db.roh.prepare('INSERT INTO seiten (name, titel, html, geaendert) VALUES (?, ?, ?, ?)').run('impressum', 'Impressum', '<h1>Impressum</h1><p>Musterstraße 1</p>', 1);
  const r = await u.rufe('GET', '/impressum');
  assert.equal(r.status, 200);
  assert.match(r.text, /Musterstraße 1/);
  assert.match(r.res.headers.get('Content-Type'), /text\/html/);
  assert.match(r.res.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(r.res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal((await u.rufe('GET', '/irgendwas')).status, 404);
});
