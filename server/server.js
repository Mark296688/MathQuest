// Kleiner lokaler Server für MathQuest: liefert das Spiel aus und speichert Lerndaten in data/.
// Ohne Fremdpakete. Nur auf 127.0.0.1 erreichbar.
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruefeEinstellungen, ausAltenStaenden, ID_RE } from '../src/js/einstellungen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'src');
const DATA = process.env.MATHQUEST_DATA || path.join(ROOT, 'data');
const PORT = Number(process.env.MATHQUEST_PORT || 8642);
const SETTINGS = path.join(DATA, 'einstellungen.json');
const MAX_BODY = 2 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('zu groß')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Erst in eine Temp-Datei schreiben, dann umbenennen: kein halber Spielstand bei Absturz. */
async function writeAtomic(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, text, 'utf8');
  await fs.rename(tmp, file);
}

/** Schreibvorgänge pro Datei nacheinander, in der Reihenfolge des Eingangs. Sonst stört sich die Temp-Datei. */
const queues = new Map();
function writeQueued(file, text) {
  const prev = queues.get(file) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => writeAtomic(file, text));
  queues.set(file, next);
  next.finally(() => { if (queues.get(file) === next) queues.delete(file); }).catch(() => {});
  return next;
}

/**
 * Einstellungen lesen. Fehlt die Datei, aber es gibt schon Spielstände (Installationen vor den Einstellungen),
 * werden daraus Profile gemacht. Sonst: keine Profile, das Spiel zeigt die Einrichtung.
 */
async function readSettings() {
  try { return pruefeEinstellungen(JSON.parse(await fs.readFile(SETTINGS, 'utf8'))); }
  catch (e) { if (e.code !== 'ENOENT') console.error(new Date().toISOString(), 'einstellungen.json:', e.message); }
  const staende = [];
  try {
    for (const f of (await fs.readdir(path.join(DATA, 'profiles'))).sort()) {
      const id = f.replace(/\.json$/, '');
      if (!f.endsWith('.json') || !ID_RE.test(id)) continue;
      let name = id;
      try { name = JSON.parse(await fs.readFile(path.join(DATA, 'profiles', f), 'utf8')).name || id; } catch { /* kaputt: id als Name */ }
      staende.push({ id, name });
    }
  } catch { /* noch keine Spielstände */ }
  return pruefeEinstellungen(ausAltenStaenden(staende));
}

/** Spielstand und Protokoll eines gelöschten Profils kommen in den Papierkorb, nicht weg. */
async function trashProfile(id) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bin = path.join(DATA, 'papierkorb');
  await fs.mkdir(bin, { recursive: true });
  for (const [dir, ext] of [['profiles', '.json'], ['logs', '.jsonl']]) {
    try { await fs.rename(path.join(DATA, dir, id + ext), path.join(bin, `${id}-${stamp}${ext}`)); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}

async function api(req, res, parts) {
  const [kind, name] = parts;
  if (kind === 'health') return send(res, 200, JSON.stringify({ ok: true }));
  if (kind === 'einstellungen' && req.method === 'GET') return send(res, 200, JSON.stringify(await readSettings()));
  if (kind === 'einstellungen' && req.method === 'PUT') {
    let e;
    try { e = pruefeEinstellungen(JSON.parse(await readBody(req))); }
    catch (err) { return send(res, 400, JSON.stringify({ error: err.message })); }
    const before = await readSettings();
    await writeQueued(SETTINGS, JSON.stringify(e, null, 2) + '\n');
    // Weggefallene Profile: Daten in den Papierkorb
    for (const p of before.profile) if (!e.profile.some((q) => q.id === p.id)) await trashProfile(p.id);
    return send(res, 200, JSON.stringify(e));
  }
  if (!ID_RE.test(name || '') || !(await readSettings()).profile.some((p) => p.id === name)) {
    return send(res, 404, JSON.stringify({ error: 'unbekanntes Profil' }));
  }
  const stateFile = path.join(DATA, 'profiles', `${name}.json`);

  if (kind === 'state' && req.method === 'GET') {
    try { return send(res, 200, await fs.readFile(stateFile, 'utf8')); }
    catch { return send(res, 404, JSON.stringify({ error: 'neu' })); }
  }
  if (kind === 'state' && req.method === 'PUT') {
    const body = await readBody(req);
    JSON.parse(body); // nur gültiges JSON speichern
    await writeQueued(stateFile, body);
    return send(res, 200, JSON.stringify({ ok: true }));
  }
  if (kind === 'log' && req.method === 'POST') {
    const body = await readBody(req);
    const line = JSON.stringify(JSON.parse(body)) + '\n';
    await fs.mkdir(path.join(DATA, 'logs'), { recursive: true });
    await fs.appendFile(path.join(DATA, 'logs', `${name}.jsonl`), line, 'utf8');
    return send(res, 200, JSON.stringify({ ok: true }));
  }
  return send(res, 405, JSON.stringify({ error: 'nicht erlaubt' }));
}

async function serveStatic(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  const file = path.resolve(WEB, '.' + rel);
  if (!file.startsWith(WEB + path.sep)) return send(res, 403, 'verboten', 'text/plain');
  try {
    const data = await fs.readFile(file);
    send(res, 200, data, TYPES[path.extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'nicht gefunden', 'text/plain; charset=utf-8');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'api') await api(req, res, parts.slice(1));
    else await serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(new Date().toISOString(), req.method, req.url, e.message);
    if (!res.headersSent) send(res, 500, JSON.stringify({ error: e.message }));
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.log(`MathQuest läuft schon auf Port ${PORT}.`); process.exit(0); }
  throw e;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`MathQuest: http://localhost:${PORT}/  (Daten: ${DATA})`);
});
