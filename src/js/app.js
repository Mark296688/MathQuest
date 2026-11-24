// Ablauf und Bedienung: Profil → Fundament (Einmaleins) → Baustelle → Steinmetzhütte und/oder Tor → Turnier → Bauabnahme → Album.
import { rng, seedFrom } from './rng.js';
import { parseAnswer, fmt } from './parse.js';
import { FAMILIES, famById, famId, makeQuestion, judgeAbruf } from './einmaleins.js';
import { makeBauBlock, judgeBau, judgeKran, kranValue, bauFamily, bauCount } from './bau.js';
import { getCard, pickWarmup, updateCard, blitzPool, pickBlitz, cardCounts, recordBau, recordMauer, recordKran, recordBlitzAnswer, recordSpeech, recordGeo, recordTor, dayIndex, SECURE_BOX, MAX_BOX } from './motor.js';
import { AREAS, FARBEN, STAGE_NAME, GERUEST, STEIN, FAHNE, burgParts, areaSummary, newParts, markShown, mauerPrefer, mauerStage, m2Plan, burgFarbe, geoInfo, torInfo, stationsToday } from './burg.js';
import { makeSteinmetzBlock, logGeo, GEO_PARTS, SHAPE_NAME } from './geo.js';
import { playZusammen, playFalt } from './steinmetz.js';
import { makeTorBlock, torSteps, judgeStep, opChoices, torSummary, logTor, partText, TOR_PARTS, PLUS } from './tor.js';
import { torLayout, sceneTor } from './torszene.js';
import { loadProfile, saveProfile, logEvent, loadSettings, saveSettings, setKonto, lokaleKopienLoeschen } from './store.js';
import { kontoStatus, linkAusMail, anmeldung, abmelden, passwortAendern, kontoLoeschen } from './konto.js';
import { BILDER, FARB_IDS, MAX_PROFILE, MAX_NAME, defaultEinstellungen, neuesProfil, freieId, cleanName } from './einstellungen.js';
import { sceneAbruf, sceneMauer, sceneTurm, sceneReihe, sceneHof, sceneHofteil, sceneKran, kranFlag, KX0, KX1, kx, KDROP, KHOOK, KWHEEL } from './scenes.js';
import { platz, schritt, springt, SICHTBAR } from './buehne.js';
import * as snd from './sound.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const now = () => performance.now();
const famLabel = (id) => { const f = famById(id); return `${f.a} · ${f.b}`; };

const SCREENS = ['s-start', 's-intro', 's-task', 's-blitz', 's-album', 's-eltern', 's-burg', 's-setup', 's-konto'];
/** Bildschirme mit Eingabefeldern: Dort gehen Tastatur, Einfügen und Fokus normal (nicht ans Spiel). */
const formScreen = () => current === 's-setup' || current === 's-konto';

// Einstellungen (data/einstellungen.json): Profile und Bedienung
let CFG = defaultEinstellungen();
/** Online-Version (online/worker.js): angemeldetes Eltern-Konto { id, email }. Lokal null. */
let ONLINE = false;
let KONTO = null;
/** Zeigen mit der Wii Remote (Couch Workstation: A = Klick, B = Sprache, + / − = Ja / Nein) statt mit der Maus. */
const wii = () => CFG.bedienung.zeigen === 'wii';
/** Antworten per Spracherkennung (Handy fügt den Text mit Strg+V ein) statt per Ziffernfeld. */
const sprache = () => CFG.bedienung.antworten === 'sprache';
/** Sprechen: mit der Wii Remote B halten, sonst das Tastenkürzel von Handy. */
const holdTxt = () => (wii() ? 'B halten' : 'Sprach-Taste halten');
/** Hochformat (Handy hochkant): gleiche Grenze wie in style.css. */
const HOCH = matchMedia('(max-aspect-ratio: 4/5)');
/** Bedienung mit dem Finger (Handy, Tablet): Texte sagen „tippen“ statt „klicken“. Die Wii Remote geht vor. */
const finger = () => !wii() && matchMedia('(pointer: coarse)').matches;
const clickTxt = () => (wii() ? 'Zielen, dann A drücken' : finger() ? 'Mit dem Finger antippen' : 'Mit der Maus anklicken');
/** „Klick“ oder „Tipp“ am Satzanfang: „Klick auf die Stelle.“ */
const klick = () => (finger() ? 'Tipp' : 'Klick');
let current = 's-start';
// Enter drückt den grünen Hauptknopf (siehe enterKnopf), aber erst kurz nachdem er erschienen ist:
// Wer Enter doppelt drückt oder hält, soll nicht an „Richtig!“ und am Rechenweg vorbeirauschen.
const ENTER_PAUSE_MS = 500;
let enterAb = 0;
const enterBereit = () => { enterAb = now() + ENTER_PAUSE_MS; };
function show(id) {
  if (current === 's-burg' && id !== 's-burg') burgStop();
  current = id;
  enterBereit();
  document.body.dataset.screen = id; // style.css wählt danach den Hintergrund
  SCREENS.forEach((s) => { $('#' + s).hidden = s !== id; });
}

const PHASE_IMG = { warmup: 'assets/ui/fundament.png', bau: 'assets/ui/kran.png', steinmetz: 'assets/ui/steinmetz.png', tor: 'assets/ui/tor.png', blitz: 'assets/ui/turnier.png' };

// Konfetti von oben, nur transform-Animation; räumt sich nach dem Fallen selbst auf.
const CONFETTI_COLORS = ['#e84b3c', '#f5c542', '#43b649', '#2f8cf0', '#b06ce0', '#ff8e3c'];
function confetti(n = 48) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = $('#confetti');
  let h = '';
  for (let i = 0; i < n; i++) {
    const r = (a, b) => a + Math.random() * (b - a);
    h += `<i style="--x:${r(2, 98).toFixed(1)}%;--c:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};--d:${r(2.2, 3.4).toFixed(2)}s;`
      + `--w:${r(0, .6).toFixed(2)}s;--dx:${r(-6, 6).toFixed(1)}rem;--rot:${Math.round(r(-720, 720))}deg"></i>`;
  }
  box.innerHTML = h;
  clearTimeout(confetti.t);
  confetti.t = setTimeout(() => { box.innerHTML = ''; }, 4200);
}

const PHASE_LABEL = { warmup: 'Fundament · Einmaleins', bau: 'Baustelle · Mauerring und Türme', steinmetz: 'Steinmetzhütte · Formen', tor: 'Tor · Vergleichen und Punkt vor Strich', blitz: 'Turnier' };
const isGeo = (it) => it && (it.type === 'geo' || it.type === 'falt');
const BLITZ_MS = 60000;
const BLITZ_MIN_POOL = 4;
const WORDS_SHARE = 0.3; // Anteil der Aufgaben in Fachsprache, sobald eine Familie fast sitzt

const S = {
  p: null, r: null, sessionId: null, mark: 0, counted: false, round: 0,
  phase: null, phases: [], queue: [], qi: 0, item: null, rec: null, tor: null,
  state: 'idle', pending: null, note: '', hint: '', result: null, shownAt: 0,
  devBuf: '', padBuf: '', auto: null, sum: null, m2Intro: false,
};

// ---------- Sitzung und Phasen ----------

async function choosePlayer(id) {
  const cfg = CFG.profile.find((x) => x.id === id);
  if (!cfg) return;
  try { localStorage.setItem(LETZTER, id); } catch { /* gesperrt: dann steht nächstes Mal das erste Profil in der Mitte */ }
  // Als installierte App (manifest.json, display „fullscreen“) ist das Spiel schon im Vollbild. Dort nicht noch einmal
  // anfordern, sonst zeigt der Browser seinen Hinweis zum Beenden des Vollbilds über dem Ziffernfeld (Handy-Test 24.11.2026).
  // iPhone-Safari kennt requestFullscreen nicht: ohne „?.“ brach die Profilwahl dort mit einem TypeError ab (24.11.2026).
  if (!document.fullscreenElement && !matchMedia('(display-mode: fullscreen)').matches) document.documentElement.requestFullscreen?.()?.catch(() => {});
  S.p = await loadProfile(cfg);
  S.sessionId = `${id}-${new Date().toISOString()}`;
  S.mark = Date.now();
  S.counted = false;
  S.round = 0;
  newRound();
}

function newRound() {
  S.round++;
  S.r = rng(seedFrom(`${S.p.id}|${new Date().toDateString()}|${S.p.sessions}|${S.round}`));
  S.sum = { newSecure: [], abruf: 0, abrufFirst: 0, bau: 0, bauFirst: 0, kran: 0, kranHits: 0, geo: 0, geoFirst: 0, tor: 0, torFirst: 0, levelUp: null, blitz: null };
  S.phases = ['warmup', 'bau', ...stationsToday(S.p, Date.now()), 'blitz'];
  startPhase('warmup');
}

function abrufItem(id, first) {
  const words = first && getCard(S.p, id).box >= 2 && S.r() < WORDS_SHARE;
  return { type: 'abruf', fam: id, q: makeQuestion(famById(id), S.r, words), first };
}

function startPhase(phase) {
  S.phase = phase;
  S.qi = 0;
  if (phase === 'warmup') {
    S.queue = pickWarmup(S.p, Date.now(), S.r).map((id) => abrufItem(id, true));
  } else if (phase === 'bau') {
    const m2 = m2Plan(S.p, Date.now());
    S.queue = makeBauBlock(S.r, (id) => getCard(S.p, id).box >= 2, S.p.kran.max, mauerPrefer(S.p, Date.now()), m2,
      (id, stufe) => mauerStage(S.p, id, stufe))
      .map((t) => ({ type: t.kind, t }));
    S.m2Intro = m2.intro && S.queue.some((it) => it.t.stufe === 2);
  } else if (phase === 'steinmetz') {
    S.geoFirst = GEO_PARTS.every((g) => !geoInfo(S.p, g.id).seen);
    S.queue = makeSteinmetzBlock(S.r, (id) => geoInfo(S.p, id), dayIndex(Date.now()))
      .map((x) => ({ type: x.kind, part: x.part, t: x.t }));
  } else if (phase === 'tor') {
    S.torFirst = TOR_PARTS.every((g) => !torInfo(S.p, g.id).seen);
    S.queue = makeTorBlock(S.r, (id) => torInfo(S.p, id), dayIndex(Date.now()))
      .map((x) => ({ type: 'tor', part: x.part, t: x.t }));
  } else if (blitzPool(S.p).length < BLITZ_MIN_POOL) {
    S.sum.blitz = { skipped: true };
    finishRound();
    return;
  }
  showIntro();
}

function showIntro() {
  const p = S.p;
  const teil = `Teil ${S.phases.indexOf(S.phase) + 1}`;
  const set = (k, t, s, h) => {
    $('#intro-k').textContent = k;
    $('#intro-t').textContent = t;
    $('#intro-s').textContent = s;
    $('#intro-h').textContent = h;
  };
  if (S.phase === 'warmup') {
    set(S.round === 1 ? `Hallo ${p.name}!` : `Runde ${S.round}`, 'Fundament: Einmaleins',
      p.sessions === 0 && S.round === 1 ? 'Wir schauen erst, was schon sitzt.' : `${S.queue.length} Aufgaben`,
      sprache() ? `${holdTxt()}, Ergebnis sagen, loslassen. Dann „Ja“ ${wii() ? 'drücken' : 'klicken'}.` : 'Tipp das Ergebnis ein und drück OK.');
  } else if (S.phase === 'bau' && S.m2Intro) {
    // Neuer Aufgabentyp: erst ein Lösungsbeispiel, dann kurz am Stück (docs/inhalte.md, Grundsatz 4)
    const f = m2Example(S.queue);
    set(teil, 'Neu: Hunderter-Steine', 'Der äußere Mauerring und der Burghof', nb(
      `Beispiel: ${f.a} · ${f.b * 100} sind ${f.a} · ${f.b} Hunderter, also ${f.a * f.b} Hunderter = ${f.a * f.b * 100}. `
      + `Im Hof: ${f.a * 10} · ${f.b * 10} Steine sind ${f.a} · ${f.b} Platten zu je 100, also auch ${f.a * f.b * 100}.`));
  } else if (S.phase === 'bau') {
    set(teil, 'Baustelle: Mauerring und Türme', 'Mauern, Türme und der Kran',
      `Rechne aus, wie viele Steine du brauchst. Beim Kran zielst du auf den Zahlenstrahl bis ${fmt(p.kran.max)}.`);
  } else if (S.phase === 'steinmetz') {
    set(teil, 'Steinmetzhütte', S.geoFirst ? 'Neu: Formen und Faltschnitte' : 'Formen und Faltschnitte',
      `${klick()} die Teile an, die zusammengehören. Drehen darfst du sie in Gedanken.`);
  } else if (S.phase === 'tor') {
    set(teil, 'Das Tor', S.torFirst ? 'Neu: Waage und Punkt vor Strich' : 'Waage und Punkt vor Strich',
      `${sprache() ? 'Sag' : 'Tipp'} zuerst die Teilrechnungen. Ihre Ergebnisse bleiben unter dem Bogen stehen. Dann kommt das Zeichen oder das Ergebnis.`);
  } else {
    set(teil, 'Turnier: 60 Sekunden', p.blitz.best ? `Dein Rekord: ${p.blitz.best}` : 'Dein erstes Turnier!',
      'Nur Aufgaben, die du sicher kannst. Es zählt sofort, ohne „Ja“.');
  }
  $('#intro-img').src = PHASE_IMG[S.phase];
  $('#hud-icon').src = PHASE_IMG[S.phase];
  show('s-intro');
}

/** Beispiel-Familie für die Einführung: eine leichte mit zweistelligem Ergebnis, die im Block nicht als Aufgabe vorkommt. */
function m2Example(queue) {
  const used = new Set(queue.filter((it) => it.t.stufe === 2).map((it) => bauFamily(it.t)));
  return FAMILIES.find((f) => f.a !== f.b && f.a * f.b >= 12 && !used.has(f.id)) || FAMILIES[0];
}

/** Rechnungen am TV nicht umbrechen: „6 · 700 = 4200“ und „4200 : 6“ bleiben in einer Zeile. */
const nb = (s) => s.replace(/ ([·:=]) /g, '\u00a0$1\u00a0');

function goPhase() {
  if (S.phase === 'blitz') startBlitz();
  else { show('s-task'); startTask(); }
}

// ---------- Aufgaben ----------

function startTask() {
  clearTimeout(S.auto);
  S.item = S.queue[S.qi];
  S.state = 'wait';
  S.note = '';
  S.hint = '';
  S.pending = null;
  S.result = null;
  S.devBuf = '';
  S.unheard = 0;
  S.rec = { inputs: [], tries: [], unheard: 0 };
  S.tor = S.item.type !== 'tor' ? null : {
    steps: torSteps(S.item.t), si: 0, done: {}, sign: null, final: null, badOp: null, tilt: '0', fresh: null,
    miss: 0, firstOk: true, helped: false, nullErr: false, firstPick: null, L: torLayout(S.item.t),
  };
  renderHud();
  renderScene(null);
  renderPanel();
  S.shownAt = now();
  if (S.item.type === 'kran') armKran();
  if (isGeo(S.item)) armGeo();
}

function next() {
  if (S.state !== 'result') return;
  clearTimeout(S.auto);
  S.state = 'idle';
  disarmKran();
  disarmGeo();
  S.qi++;
  if (S.qi < S.queue.length) { startTask(); return; }
  const i = S.phases.indexOf(S.phase);
  if (i >= 0 && i < S.phases.length - 1) startPhase(S.phases[i + 1]);
  else finishRound();
}

function renderHud() {
  const it = S.item;
  $('#phase').textContent = PHASE_LABEL[S.phase] + (it.type === 'abruf' && !it.first ? ' · Nochmal dran' : '');
  let txt;
  if (it.type === 'abruf') {
    const verb = sprache() ? 'sag das Ergebnis.' : 'tipp das Ergebnis ein.';
    txt = it.q.words ? `Lies genau und ${verb}` : verb[0].toUpperCase() + verb.slice(1);
  }
  else if (it.type === 'mauer') txt = `Die Mauer bekommt <b>${it.t.rows} Reihen</b>. In jede Reihe kommen <b>${it.t.perRow} Steine</b>. Wie viele Steine bestellst du?`;
  else if (it.type === 'turm') txt = `<b>${fmt(it.t.total)} Steine</b> sind geliefert. Jede Lage braucht <b>${it.t.perLayer} Steine</b>. Wie viele Lagen hoch wird der Turm?`;
  else if (it.type === 'reihe') txt = `<b>${fmt(it.t.total)} Steine</b> sind geliefert. Die Mauer bekommt <b>${it.t.rows} Reihen</b>, alle gleich lang. Wie viele Steine kommen in jede Reihe?`;
  else if (it.type === 'hof') txt = `Der Burghof wird gepflastert: <b>${it.t.rows} Reihen</b> mit je <b>${it.t.perRow} Steinen</b>. Wie viele Pflastersteine bestellst du?`;
  else if (it.type === 'hofteil') txt = `<b>${fmt(it.t.total)} Pflastersteine</b> sind da. Der Hof bekommt <b>${it.t.rows} Reihen</b>, alle gleich lang. Wie viele Steine kommen in jede Reihe?`;
  else if (it.type === 'geo' && it.t.drei) txt = 'Welche <b>drei Teile</b> ergeben zusammen dieses <b>Rechteck</b>? Zwei Teile bleiben übrig.';
  else if (it.type === 'geo') txt = `Welche <b>zwei Teile</b> ergeben jeweils dieses <b>${SHAPE_NAME[it.t.form]}</b>? Ein Teil bleibt übrig.`;
  else if (it.type === 'falt') txt = 'Fenster für die Kapelle: Welches <b>gefaltete Blatt</b> ergibt <b>aufgefaltet</b> welches Fenster?';
  else if (it.type === 'tor' && it.t.kind === 'waage') txt = 'Welche Seite der Waage ist <b>schwerer</b>? Rechne beide Seiten aus. Dann wähle <b>&lt;</b>, <b>=</b> oder <b>&gt;</b>.';
  else if (it.type === 'tor') txt = 'Rechne die Aufgabe aus. Denk an <b>Punkt vor Strich</b>.';
  else txt = `Der Kran soll die Ladung bei <b>${fmt(it.t.target)}</b> abladen. ${wii() ? 'Zeig auf die Stelle und drück <b>A</b>.' : finger() ? 'Finger auflegen, zur Stelle schieben, loslassen.' : 'Klick auf die Stelle.'}`;
  $('#auftrag').innerHTML = txt;
  $('#dots').innerHTML = S.queue.map((_, i) => `<i class="${i < S.qi ? 'done' : i === S.qi ? 'now' : ''}"></i>`).join('');
}

/** view: beim Einmaleins 'ask' | 'hint' | 'ok' | 'solution', bei Mauer und Turm die Zahl (oder null). */
function renderScene(view, j, animate) {
  const it = S.item;
  const el = $('#scene');
  el.classList.remove('anim');
  if (isGeo(it)) return; // zeichnet steinmetz.js, zugeschnitten in armGeo
  if (it.type === 'tor') { if (S.tor) el.innerHTML = sceneTor(it.t, S.tor.L, torView()); fitScene(); return; }
  if (it.type === 'abruf') el.innerHTML = sceneAbruf(it.q, view || 'ask', j);
  else if (it.type === 'mauer') el.innerHTML = sceneMauer(it.t, view);
  else if (it.type === 'turm') el.innerHTML = sceneTurm(it.t, view);
  else if (it.type === 'reihe') el.innerHTML = sceneReihe(it.t, view);
  else if (it.type === 'hof') el.innerHTML = sceneHof(it.t, view);
  else if (it.type === 'hofteil') el.innerHTML = sceneHofteil(it.t, view);
  else el.innerHTML = sceneKran(it.t);
  fitScene();
  if (animate) { void el.getBoundingClientRect(); el.classList.add('anim'); }
}

/* Hochformat: Die Szenen sind für 1000 × 520 gezeichnet (16:9-Bühne). Auf der schmalen Bühne wird die viewBox auf den
   Inhalt zugeschnitten (ohne Boden, Hügel, Wolken), höchstens auf SZENE_MIN_W Breite, also bis 1,67-fach größer.
   Der Rahmen wächst innerhalb einer Aufgabe nur, damit das Bild beim Antworten nicht hin und her springt. */
const SZENE_VB = '0 0 1000 520';
const SZENE_HG = '.ground, .ground2, .k-hill, .k-cloud, .k-castle, defs, style';
const SZENE_MIN_W = 600;
const SZENE_RAND = 32;
let szeneRahmen = null;
function fitScene() {
  const svg = $('#scene');
  if (!HOCH.matches || current !== 's-task' || !S.item) {
    svg.setAttribute('viewBox', SZENE_VB);
    svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
    szeneRahmen = null;
    return;
  }
  const r = szeneRahmen && szeneRahmen.item === S.item ? szeneRahmen
    : { item: S.item, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const el of svg.children) {
    if (el.matches(SZENE_HG) || typeof el.getBBox !== 'function') continue;
    const b = el.getBBox();
    if (!b.width && !b.height) continue;
    const m = el.transform && el.transform.baseVal.consolidate();
    for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
      const px = m ? m.matrix.a * x + m.matrix.c * y + m.matrix.e : x;
      const py = m ? m.matrix.b * x + m.matrix.d * y + m.matrix.f : y;
      r.x0 = Math.min(r.x0, px); r.x1 = Math.max(r.x1, px); r.y0 = Math.min(r.y0, py); r.y1 = Math.max(r.y1, py);
    }
  }
  if (!(r.x1 > r.x0)) { svg.setAttribute('viewBox', SZENE_VB); return; }
  szeneRahmen = r;
  let x0 = Math.max(0, r.x0 - SZENE_RAND);
  let x1 = Math.min(1000, r.x1 + SZENE_RAND);
  if (x1 - x0 < SZENE_MIN_W) {
    x0 = Math.max(0, Math.min(1000 - SZENE_MIN_W, (x0 + x1 - SZENE_MIN_W) / 2));
    x1 = x0 + SZENE_MIN_W;
  }
  // Mit Boden (Baustelle, Kran): unten bis zum Rand und unten ausgerichtet, sonst mittig
  const boden = !!svg.querySelector('.ground');
  const y0 = Math.max(0, Math.min(r.y0 - SZENE_RAND, 520 - 200));
  const y1 = boden ? 520 : Math.max(y0 + 200, Math.min(520, r.y1 + SZENE_RAND));
  svg.setAttribute('viewBox', `${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}`);
  svg.setAttribute('preserveAspectRatio', boden ? 'xMidYMax meet' : 'xMidYMid meet');
}
HOCH.addEventListener('change', () => { szeneRahmen = null; if (current === 's-task' && S.item) fitScene(); });

const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const AIM = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>';
const say = (icon, t, s) => `<div class="say">${icon}<div class="say-t">${t}</div><div class="say-s">${s}</div></div>`;

function renderPanel() {
  const it = S.item;
  const p = $('#panel');
  if (S.state === 'result') {
    const r = S.result;
    p.innerHTML = `<div class="verdict ${r.ok ? 'ok' : 'warn'}">${r.title}</div>`
      + (r.msg ? `<p class="msg">${nb(r.msg)}</p>` : '')
      + (r.way ? `<p class="way">Rechenweg:<br><b>${nb(r.way)}</b></p>` : '')
      + (r.extra ? `<p class="levelup">${r.extra}</p>` : '')
      + `<button class="btn primary" data-act="next">Weiter</button>`;
    enterBereit();
    return;
  }
  if (it.type === 'kran') {
    p.innerHTML = finger() ? say(AIM, 'Schieb die Last hin', 'Finger auflegen, schieben, loslassen') : say(AIM, 'Zeig auf die Stelle', clickTxt());
    return;
  }
  if (isGeo(it)) {
    const head = it.type === 'falt' ? say(AIM, 'Blatt und Fenster', `Erst ein Blatt an${finger() ? 'tippen' : 'klicken'}, dann sein Fenster`)
      : say(AIM, `${it.t.need} Teile an${finger() ? 'tippen' : 'klicken'}`, clickTxt());
    const tip = it.type === 'falt' ? '<div class="note">Jedes Blatt ist zweimal gefaltet und dann ausgeschnitten. Gestrichelt: die Falten.</div>' : '';
    p.innerHTML = head + (S.note || S.hint
      ? `<div class="note${S.hint ? ' warn' : ''}">${S.note}${S.note && S.hint ? '<br>' : ''}${S.hint ? `<b>${nb(S.hint)}</b>` : ''}</div>` : tip);
    return;
  }
  if (it.type === 'tor' && S.state === 'wait') { p.innerHTML = torPanel(); return; }
  if (S.state === 'confirm') {
    const yes = it.type === 'mauer' || it.type === 'hof' ? 'Ja, bestellen!' : it.type === 'abruf' || it.type === 'tor' ? 'Ja!' : 'Ja, bauen!';
    p.innerHTML = `<div class="heard"><div class="heard-l">Verstanden:</div><div class="bignum">${fmt(S.pending.value)}</div>`
      + `<div class="raw">„${esc(S.pending.raw.trim())}“</div></div>`
      + `<button class="btn primary" data-act="yes">${wii() ? '<span class="wkey">+</span>' : ''}${yes}</button>`
      + `<button class="btn" data-act="no">${wii() ? '<span class="wkey">−</span>' : ''}Nein, nochmal</button>`;
    return;
  }
  const note = S.note || S.hint
    ? `<div class="note${S.hint ? ' warn' : ''}">${nb(S.note)}${S.note && S.hint ? '<br>' : ''}${S.hint ? `<b>${nb(S.hint)}</b>` : ''}</div>` : '';
  if (!sprache()) { p.innerHTML = note + inlinePad(); return; }
  // Längeres Sprechen kommt sicherer an (Messung mit Funkmikrofon: ab 1,5 s gehalten kam fast immer Text an)
  p.innerHTML = say(MIC, '„Das Ergebnis<br>ist …“', `${holdTxt()}, so sprechen, loslassen`) + note
    + (S.devBuf ? `<div class="dev">Tastatur: ${esc(S.devBuf)}</div>` : '')
    + padBtn();
}

/** Ziffernfeld im Antwort-Feld (Bedienung „Ziffern tippen“). Die Tastatur schreibt in dieselbe Anzeige. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
function inlinePad(title) {
  return (title ? `<div class="ipad-t">${title}</div>` : '')
    + `<div class="pad-display ipad-display">${esc(S.devBuf)}</div><div class="keys ipad-keys">`
    + KEYS.map((k) => `<button class="btn${k === 'ok' ? ' primary' : ''}" data-act="key" data-k="${k}"${k === 'del' ? ' aria-label="Löschen"' : ''}>${k === 'del' ? '⌫' : k === 'ok' ? 'OK' : k}</button>`).join('')
    + '</div>';
}

/** Getippte Zahl (Ziffernfeld oder Tastatur) zählt sofort, ohne Rückfrage. */
function submitTyped() {
  const v = S.devBuf;
  if (!v || !takesNumber() || S.state !== 'wait') return;
  S.devBuf = '';
  addInput(v, parseInt(v, 10), 'ziffern', 'direkt');
  evaluate(parseInt(v, 10));
}

function typeKey(k) {
  if (k === 'ok') { submitTyped(); return; }
  if (k === 'del') S.devBuf = S.devBuf.slice(0, -1);
  else if (S.devBuf.length < 7) S.devBuf += k;
  const d = document.querySelector('.ipad-display');
  if (d) d.textContent = S.devBuf; else renderPanel();
}

/** Nach zweimal „Nicht gehört“ leuchtet das Ziffernfeld auf. */
const padBtn = () => `<button class="btn${S.unheard >= 2 ? ' blue' : ''}" data-act="pad">Ziffern tippen</button>`;

// ---------- Eingabe ----------

function decide(inp, d) {
  inp.decision = d;
  if (inp.method === 'sprache') recordSpeech(S.p, d);
}

function addInput(raw, value, method, decision) {
  const inp = { raw, value, method, ms: Math.round(now() - S.shownAt), decision: null };
  S.rec.inputs.push(inp);
  if (decision) decide(inp, decision);
  return inp;
}

/** Wartet die Aufgabe gerade auf eine gesprochene oder getippte Zahl? */
function takesNumber() {
  const it = S.item;
  return current === 's-task' && $('#keypad').hidden && !!it && it.type !== 'kran' && !isGeo(it) && (it.type !== 'tor' || torSpoken())
    && (S.state === 'wait' || S.state === 'confirm');
}

/** Text von der Spracherkennung (Strg+V) oder Tastatur (Enter). */
function onText(raw, method) {
  if (current === 's-blitz') { blitzInput(raw, method); return; }
  if (!takesNumber()) {
    if (S.p) logEvent(S.p, { type: 'ignored', session: S.sessionId, at: new Date().toISOString(), raw, method, screen: current, state: S.state });
    return;
  }
  if (method === 'sprache') S.unheard = 0;
  if (S.state === 'confirm' && S.pending) decide(S.pending, 'ersetzt');
  const value = parseAnswer(raw);
  if (value === null) {
    addInput(raw, null, method, 'unverstanden');
    S.pending = null;
    S.state = 'wait';
    S.note = `Nicht verstanden: „${esc(raw.trim()) || '…'}“. Sag es nochmal.`;
    snd.soundBad();
    renderPanel();
    return;
  }
  S.pending = addInput(raw, value, method, null);
  S.state = 'confirm';
  renderPanel();
}

function evaluate(v) {
  if (S.item.type === 'tor') { if (torSpoken()) evalTor(v); }
  else if (S.item.type === 'abruf') evalAbruf(v);
  else evalBau(v);
}

// ---------- Einmaleins ----------

function evalAbruf(v) {
  const it = S.item;
  const j = judgeAbruf(it.q, v);
  S.rec.tries.push({ value: v, ok: j.ok });
  const n = S.rec.tries.length;
  if (j.ok) {
    snd.soundOk();
    renderScene('ok', j);
    S.result = { ok: true, title: n === 1 ? 'Richtig!' : 'Jetzt stimmt’s!', way: n === 1 ? '' : j.way };
    S.state = 'result';
    renderPanel();
    finishAbruf(n === 1);
    S.auto = setTimeout(next, n === 1 ? 1200 : 2600);
    return;
  }
  snd.soundBad();
  if (n === 1) {
    renderScene('hint', j);
    S.state = 'wait';
    S.note = `Noch nicht: ${fmt(v)} stimmt nicht.`;
    S.hint = j.hint;
    renderPanel();
    return;
  }
  renderScene('solution', j);
  S.result = { ok: false, title: `Die Lösung ist ${it.q.answer}`, msg: `Du hast ${fmt(v)} ${sprache() ? 'gesagt' : 'eingetippt'}.`, way: j.way };
  S.state = 'result';
  renderPanel();
  finishAbruf(false);
}

function finishAbruf(firstOk) {
  const it = S.item;
  S.sum.abruf++;
  if (firstOk) S.sum.abrufFirst++;
  let box = null;
  if (it.first) {
    const firstInput = S.rec.inputs.find((i) => i.decision === 'ja' || i.decision === 'direkt');
    box = updateCard(S.p, it.fam, {
      firstOk, ms: firstInput ? firstInput.ms : 99999, q: it.q.term, answers: S.rec.tries.map((t) => t.value),
    }, Date.now());
    if (box.before < SECURE_BOX && box.after >= SECURE_BOX) S.sum.newSecure.push(it.fam);
    if (!firstOk) S.queue.push(abrufItem(it.fam, false));
  }
  saveTask({ box });
}

// ---------- Mauer und Turm ----------

function evalBau(v) {
  const it = S.item;
  const t = it.t;
  const j = judgeBau(t, v);
  S.rec.tries.push({ value: v, ok: j.ok, nullErr: j.nullErr });
  const n = S.rec.tries.length;
  renderScene(v, j, true);
  snd.soundBlocks(bauCount(t, v));
  setTimeout(() => (j.ok ? snd.soundOk() : snd.soundBad()), 300);
  if (j.ok) {
    S.result = { ok: true, title: j.title, msg: j.msg, way: n === 1 ? '' : j.way };
    S.state = 'result';
    renderPanel();
    finishBau(n === 1);
    return;
  }
  if (n === 1) {
    S.state = 'wait';
    S.note = `<b>${j.title}.</b> ${j.msg}`;
    S.hint = j.hint;
    renderPanel();
    return;
  }
  S.result = { ok: false, title: j.title, msg: `${j.msg} Die richtige Zahl ist <b>${fmt(t.answer)}</b>.`, way: j.way };
  S.state = 'result';
  renderPanel();
  finishBau(false);
  setTimeout(() => { if (S.item === it && S.state === 'result') renderScene(t.answer, null, true); }, 2200);
}

function finishBau(firstOk) {
  recordBau(S.p, firstOk, S.rec.tries.some((t) => t.nullErr), S.item.t.stufe || 1);
  const firstInput = S.rec.inputs.find((i) => i.decision === 'ja' || i.decision === 'direkt');
  recordMauer(S.p, bauFamily(S.item.t), firstOk, firstInput ? firstInput.ms : 99999, Date.now(), S.item.t.stufe || 1);
  S.sum.bau++;
  if (firstOk) S.sum.bauFirst++;
  saveTask({});
}

// ---------- Kran ----------

let kranMove = null;
let kranClick = null;
let kranFinger = null;

function svgX(evt) {
  const svg = $('#scene');
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse()).x;
}
const clampX = (x) => Math.min(KX1, Math.max(KX0, x));

function armKran() {
  disarmKran();
  const svg = $('#scene');
  const t = S.item.t;
  kranMove = (e) => {
    if (S.state !== 'wait') return;
    $('#trolley').setAttribute('transform', `translate(${clampX(svgX(e))},0)`);
  };
  kranClick = (e) => {
    if (S.state !== 'wait') return;
    const value = kranValue((clampX(svgX(e)) - KX0) / (KX1 - KX0), t.max);
    $('#trolley').setAttribute('transform', `translate(${kx(value, t.max)},0)`);
    addInput(String(value), value, 'zeiger', 'direkt');
    const j = judgeKran(t, value);
    S.rec.tries.push({ value, ok: j.ok });
    S.state = 'dropping';
    dropLoad(() => {
      [$('#flag').innerHTML, $('#flagtop').innerHTML] = kranFlag(t, value, j.hit);
      const up = recordKran(S.p, j.hit, j.err, Date.now());
      S.sum.kran++;
      if (j.hit) S.sum.kranHits++;
      if (up) S.sum.levelUp = up;
      S.result = { ok: j.ok, title: j.title, msg: j.msg, extra: up ? `Neu: Zahlenstrahl bis ${fmt(up)}!` : '' };
      S.state = 'result';
      if (up) snd.soundRecord(); else if (j.hit) snd.soundOk(); else snd.soundBad();
      renderPanel();
      saveTask({ kranErr: j.err, kranHit: j.hit, kranLevelUp: up });
    });
  };
  svg.addEventListener('mousemove', kranMove);
  svg.addEventListener('click', kranClick);
  // Finger: auflegen und schieben fährt die Laufkatze, Loslassen lädt ab. Ein Klick danach kommt zu spät (state).
  kranFinger = (e) => {
    if (e.pointerType === 'mouse') return;
    if (e.type === 'pointerup') kranClick(e);
    else if (e.type === 'pointerdown' || e.buttons) kranMove(e);
  };
  for (const ev of ['pointerdown', 'pointermove', 'pointerup']) svg.addEventListener(ev, kranFinger);
}

function disarmKran() {
  const svg = $('#scene');
  if (kranMove) svg.removeEventListener('mousemove', kranMove);
  if (kranClick) svg.removeEventListener('click', kranClick);
  if (kranFinger) for (const ev of ['pointerdown', 'pointermove', 'pointerup']) svg.removeEventListener(ev, kranFinger);
  kranMove = kranClick = kranFinger = null;
}

/** Last absenken; das Tretrad dreht sich mit, solange das Seil abläuft. */
function dropLoad(done) {
  const load = $('#load');
  const ropes = document.querySelectorAll('#rope line');
  const tread = $('#tread');
  const [y0, y1] = KDROP;
  const [wx, wy] = KWHEEL;
  const t0 = now();
  (function step() {
    const k = Math.min(1, (now() - t0) / 450);
    const y = y0 + (y1 - y0) * k * k;
    load.setAttribute('transform', `translate(0,${y})`);
    for (const r of ropes) r.setAttribute('y2', y - KHOOK);
    tread.setAttribute('transform', `rotate(${(-(y - y0)).toFixed(1)} ${wx} ${wy})`);
    if (k < 1) requestAnimationFrame(step);
    else { load.classList.add('landed'); snd.soundDrop(); done(); }
  })();
}

// ---------- Steinmetzhütte ----------

let geoCtl = null;

function armGeo() {
  disarmGeo();
  const it = S.item;
  const play = it.type === 'falt' ? playFalt : playZusammen;
  queueMicrotask(fitScene);
  geoCtl = play($('#scene'), it.t, {
    onPick: () => snd.soundTick(),
    onRight: (found, total) => {
      snd.soundOk();
      const rest = total - found;
      S.hint = '';
      S.note = !rest ? '<b>Richtig!</b>' : it.type === 'falt'
        ? `<b>Richtig!</b> Noch ${rest === 1 ? 'ein Blatt' : `${rest} Blätter`}.` : '<b>Richtig!</b> Jetzt das zweite Paar.';
      renderPanel();
    },
    onWrong: (text, reveal) => {
      snd.soundBad();
      S.note = reveal ? '' : '<b>Passt noch nicht.</b>';
      S.hint = text;
      renderPanel();
    },
    onDone: ({ firstOk, tries, helped }) => {
      S.rec.tries = tries;
      const what = it.type === 'falt' ? 'Alle Fenster gefunden' : it.t.drei ? 'Das Rechteck ist fertig' : `Beide Formen sind fertig`;
      S.result = firstOk ? { ok: true, title: 'Richtig!', msg: `${what}, gleich beim ersten Mal.` }
        : { ok: false, title: 'Geschafft!', msg: helped ? `${what}. Mit Hilfe, das kommt bald noch einmal.` : `${what}. Beim nächsten Mal klappt es bestimmt gleich.` };
      S.state = 'result';
      renderPanel();
      recordGeo(S.p, it.part, firstOk, Date.now());
      S.sum.geo++;
      if (firstOk) S.sum.geoFirst++;
      saveTask({ helped });
    },
  });
}

function disarmGeo() {
  if (geoCtl) { geoCtl.stop(); geoCtl = null; }
}

// ---------- Tor ----------

const torStep = () => S.tor.steps[S.tor.si];
/** Teilrechnung oder Ergebnis: Antwort per Sprache oder Ziffern. Zeichen und Rechenzeichen zeigt man mit dem Zeiger. */
const torSpoken = () => !!S.tor && S.tor.si < S.tor.steps.length && ['calc', 'final'].includes(torStep().kind);

function torView() {
  const T = S.tor;
  const cur = S.state === 'result' ? null : torStep();
  return { done: T.done, cur, sign: T.sign, final: T.final, badOp: T.badOp, tilt: T.tilt, fresh: T.fresh, pick: !!cur && cur.kind === 'first' };
}

const SIGN_TXT = { '<': '&lt;', '=': '=', '>': '&gt;' };

function torPanel() {
  const step = torStep();
  const note = S.note || S.hint
    ? `<div class="note${S.hint ? ' warn' : ''}">${nb(S.note)}${S.note && S.hint ? '<br>' : ''}${S.hint ? `<b>${nb(S.hint)}</b>` : ''}</div>` : '';
  if (step.kind === 'first') return say(AIM, 'Was rechnest du zuerst?', wii() ? 'Zeig auf das Rechenzeichen' : `${klick()} auf das Rechenzeichen`) + note;
  if (step.kind === 'sign') {
    return say(AIM, 'Welches Zeichen passt?', wii() ? 'Zeig drauf, dann A' : `${klick()} drauf`)
      + `<div class="signs">${['<', '=', '>'].map((v) => `<button class="btn sign" data-act="sign" data-v="${v}">${SIGN_TXT[v]}</button>`).join('')}</div>` + note;
  }
  const what = step.kind === 'calc' ? partText(step.part) : `${fmt(step.a)} ${step.s} ${fmt(step.b)}`;
  if (!sprache()) return note + inlinePad(nb(`Ergebnis von ${what}`));
  return say(MIC, 'Sag das Ergebnis', nb(`von ${what}`)) + note
    + (S.devBuf ? `<div class="dev">Tastatur: ${esc(S.devBuf)}</div>` : '')
    + padBtn();
}

/** Antwort zum aktuellen Schritt: Zahl (Teilrechnung, Ergebnis), Zeichen (Waage) oder Index des Rechenzeichens. */
function evalTor(v) {
  const it = S.item;
  const T = S.tor;
  const step = torStep();
  const j = judgeStep(it.t, step, v);
  S.rec.tries.push({ step: step.kind, value: v, ok: j.ok, nullErr: !!j.nullErr });
  if (j.nullErr) T.nullErr = true;
  S.pending = null;
  if (j.ok) {
    snd.soundOk();
    S.note = '<b>Richtig!</b>';
    S.hint = '';
    torAccept(step, v, false);
    return;
  }
  snd.soundBad();
  T.firstOk = false;
  T.miss++;
  if (T.miss === 1) {
    if (step.kind === 'first') T.badOp = opChoices(it.t)[v].token;
    T.fresh = null;
    S.state = 'wait';
    S.note = step.kind === 'first' ? `<b>Noch nicht:</b> ${opChoices(it.t)[v].op === PLUS ? 'Plus' : 'Minus'} kommt später.`
      : step.kind === 'sign' ? `<b>Noch nicht:</b> ${SIGN_TXT[v]} passt nicht.` : `Noch nicht: ${fmt(v)} stimmt nicht.`;
    S.hint = j.hint;
    renderScene(null);
    renderPanel();
    return;
  }
  // Zweiter Fehler beim selben Schritt: Das Spiel setzt die Lösung ein und erklärt sie, dann geht es weiter.
  T.helped = true;
  S.hint = '';
  if (step.kind === 'first') {
    S.note = 'Zuerst kommt <b>mal</b> oder <b>geteilt</b>, dann plus und minus.';
    torAccept(step, opChoices(it.t).findIndex((c) => c.punkt), true);
  } else if (step.kind === 'sign') {
    S.note = `Richtig ist <b>${SIGN_TXT[step.val]}</b>. ${j.hint}`;
    torAccept(step, step.val, true);
  } else {
    S.note = `Richtig ist: <b>${j.way}</b>`;
    torAccept(step, step.val, true);
  }
}

function torAccept(step, v, given) {
  const T = S.tor;
  const t = S.item.t;
  T.miss = 0;
  T.badOp = null;
  T.fresh = null;
  if (step.kind === 'first') {
    T.firstPick = opChoices(t)[v].item;
    T.steps = torSteps(t, T.firstPick);
  } else if (step.kind === 'calc') {
    T.done[step.item] = { val: step.val, given };
    T.fresh = String(step.item);
  } else if (step.kind === 'sign') {
    T.sign = { v: step.val, given };
    T.tilt = step.val === '>' ? 'l' : step.val === '<' ? 'r' : '0';
    T.fresh = 'sign';
  } else {
    T.final = { val: step.val, given };
    T.fresh = 'final';
  }
  T.si++;
  if (T.si < T.steps.length) {
    S.state = 'wait';
    renderScene(null);
    renderPanel();
    return;
  }
  finishTor();
}

function finishTor() {
  const it = S.item;
  const T = S.tor;
  const ms = Math.round(now() - S.shownAt);
  const sum = torSummary(it.t);
  S.state = 'result';
  S.result = T.firstOk ? { ok: true, title: 'Richtig!', msg: sum }
    : { ok: false, title: 'Geschafft!', msg: sum + (sum.endsWith('.') ? '' : '.') + (T.helped ? ' Mit Hilfe, das kommt bald noch einmal.' : '') };
  renderScene(null);
  renderPanel();
  recordTor(S.p, it.part, T.firstOk, ms, Date.now(), T.nullErr);
  S.sum.tor++;
  if (T.firstOk) S.sum.torFirst++;
  saveTask({ helped: T.helped, firstPick: T.firstPick });
}

// Rechenzeichen anklicken (Punkt vor Strich: Was rechnest du zuerst?)
$('#scene').addEventListener('click', (e) => {
  const g = e.target.closest('.opt');
  if (!g || !S.item || S.item.type !== 'tor' || S.state !== 'wait' || torStep().kind !== 'first') return;
  const c = Number(g.dataset.c);
  addInput(`zeichen ${opChoices(S.item.t)[c].op}`, c, 'zeiger', 'direkt');
  evalTor(c);
});

// ---------- Speichern ----------

/** Spielzeit mitzählen; Pausen über 10 Minuten zählen nicht. */
function markPlay() {
  const t = Date.now();
  S.p.playMs += Math.min(t - S.mark, 600000);
  S.mark = t;
  if (!S.counted) { S.p.sessions++; S.counted = true; }
  S.p.lastSession = new Date(t).toISOString();
}

function saveTask(extra) {
  const it = S.item;
  markPlay();
  saveProfile(S.p);
  logEvent(S.p, {
    type: 'task', session: S.sessionId, round: S.round, phase: S.phase, at: new Date().toISOString(),
    item: it.type === 'abruf' ? { type: 'abruf', fam: it.fam, first: it.first, ...it.q } : isGeo(it) ? { part: it.part, ...logGeo(it.t) }
      : it.type === 'tor' ? { part: it.part, ...logTor(it.t) } : it.t,
    inputs: S.rec.inputs, tries: S.rec.tries, unheard: S.rec.unheard, durationMs: Math.round(now() - S.shownAt), ...extra,
  });
}

// ---------- Blitzrunde ----------

const B = { on: false, score: 0, wrong: 0, end: 0, q: null, fam: null, busy: false, raf: 0, inputs: [], shownAt: 0, miss: 0, pad: '', unheard: 0 };

function startBlitz() {
  Object.assign(B, { on: true, score: 0, wrong: 0, q: null, fam: null, busy: false, inputs: [], unheard: 0, end: now() + BLITZ_MS });
  $('#b-score').textContent = '0';
  $('#b-best').textContent = S.p.blitz.best;
  $('#b-q').style.fontSize = '';
  $('#b-next').hidden = true;
  $('#b-help').hidden = false;
  $('#b-help').textContent = (sprache() ? `${wii() ? 'Mit B sagen' : 'Sagen'} oder ${HOCH.matches ? 'unten' : 'rechts'} eintippen.` : `${HOCH.matches ? 'Unten' : 'Rechts'} eintippen und OK drücken.`) + ' Es zählt sofort, ohne „Ja“.';
  $('#b-pad').hidden = false;
  show('s-blitz');
  blitzNext();
  B.raf = requestAnimationFrame(blitzTick);
}

function blitzNext() {
  B.fam = pickBlitz(S.p, S.r, B.fam);
  B.q = makeQuestion(famById(B.fam), S.r, false);
  B.shownAt = now();
  B.busy = false;
  B.miss = 0;
  B.pad = '';
  $('#b-pad-display').textContent = '';
  $('#b-q').textContent = B.q.term;
  $('#b-fb').textContent = '';
  $('#b-fb').className = 'bfb';
}

function blitzTick() {
  if (!B.on) return;
  const left = B.end - now();
  $('#b-bar').style.transform = `scaleX(${Math.max(0, left / BLITZ_MS)})`;
  if (left <= 0) { blitzFinish(false); return; }
  B.raf = requestAnimationFrame(blitzTick);
}

function blitzInput(raw, method) {
  if (!B.on || B.busy) return;
  const value = parseAnswer(raw);
  B.inputs.push({ raw, value, method, ms: Math.round(now() - B.shownAt), q: B.q.term, answer: B.q.answer });
  const fb = $('#b-fb');
  if (value === null) {
    // Zeigen, was ankam. Beim zweiten Mal kommt ohne Strafe eine neue Aufgabe, damit niemand hängen bleibt.
    B.miss++;
    fb.textContent = `Nicht verstanden: „${raw.trim() || '…'}“`;
    fb.className = 'bfb bad';
    if (B.miss >= 2) { B.busy = true; setTimeout(() => { if (B.on) blitzNext(); }, 1200); }
    return;
  }
  B.busy = true;
  if (value === B.q.answer) {
    recordBlitzAnswer(S.p, B.fam, now() - B.shownAt, Date.now());
    B.score++;
    $('#b-score').textContent = B.score;
    fb.textContent = `✓ ${value}`;
    fb.className = 'bfb ok';
    snd.soundTick();
    setTimeout(() => { if (B.on) blitzNext(); }, 350);
  } else {
    B.wrong++;
    fb.textContent = `${B.q.term} = ${B.q.answer}`;
    fb.className = 'bfb bad';
    snd.soundBad();
    setTimeout(() => { if (B.on) blitzNext(); }, 1400);
  }
}

function blitzFinish(quit) {
  if (!B.on) return;
  B.on = false;
  cancelAnimationFrame(B.raf);
  const p = S.p;
  const best0 = p.blitz.best;
  const firstRun = p.blitz.runs.length === 0;
  if (!quit) {
    p.blitz.runs.push({ t: new Date().toISOString(), score: B.score, wrong: B.wrong });
    if (p.blitz.runs.length > 100) p.blitz.runs.shift();
  }
  const newRecord = !quit && B.score > best0;
  if (newRecord) p.blitz.best = B.score;
  S.sum.blitz = { score: B.score, best: p.blitz.best, newRecord: newRecord && !firstRun, quit };
  markPlay();
  saveProfile(p);
  logEvent(p, { type: 'blitz', session: S.sessionId, round: S.round, at: new Date().toISOString(), score: B.score, wrong: B.wrong, quit, unheard: B.unheard, inputs: B.inputs });
  if (quit) { finishRound(); return; }
  $('#b-q').style.fontSize = '6rem';
  $('#b-q').textContent = firstRun ? `${B.score} richtig!` : newRecord ? 'Neuer Rekord!' : `${B.score} richtig`;
  $('#b-fb').textContent = firstRun ? 'Das ist jetzt dein Rekord.' : newRecord ? `${B.score} richtig, vorher ${best0}` : `Dein Rekord: ${best0}`;
  $('#b-fb').className = 'bfb ok';
  $('#b-help').hidden = true;
  $('#b-pad').hidden = true;
  $('#b-next').hidden = false;
  enterBereit();
  if (newRecord) { snd.soundRecord(); confetti(); } else snd.soundOk();
}

// ---------- Album ----------

function tafelHtml(p) {
  let h = '<span class="h">·</span>';
  for (let j = 1; j <= 10; j++) h += `<span class="h">${j}</span>`;
  for (let i = 1; i <= 10; i++) {
    h += `<span class="h">${i}</span>`;
    for (let j = 1; j <= 10; j++) {
      if (i === 1 || j === 1 || i === 10 || j === 10) { h += `<span class="gift">${i * j}</span>`; continue; }
      const c = getCard(p, famId(i, j));
      const cls = c.box === 0 ? '' : c.box === 1 ? 'learn' : c.box === 2 ? 'almost' : c.box === MAX_BOX ? 'gold' : 'secure';
      h += `<span class="${cls}">${c.box >= SECURE_BOX ? i * j : ''}</span>`;
    }
  }
  return h;
}

function showAlbum() {
  clearTimeout(S.auto);
  disarmKran();
  disarmGeo();
  markPlay();
  saveProfile(S.p);
  const p = S.p;
  const sum = S.sum;
  const li = [];
  if (sum.newSecure.length) {
    const more = sum.newSecure.length > 6 ? ` und ${sum.newSecure.length - 6} weitere` : '';
    li.push(`<li class="star">Neu sicher: ${sum.newSecure.slice(0, 6).map(famLabel).join(', ')}${more}</li>`);
  }
  if (sum.abruf) li.push(`<li>Einmaleins: ${sum.abrufFirst} von ${sum.abruf} gleich richtig</li>`);
  if (sum.bau) li.push(`<li>Baustelle: ${sum.bau} Aufträge, ${sum.bauFirst} gleich beim ersten Mal richtig</li>`);
  if (sum.levelUp) li.push(`<li class="star">Neu: Zahlenstrahl bis ${fmt(sum.levelUp)}!</li>`);
  else if (sum.kran) li.push(`<li>Kran: ${sum.kranHits} von ${sum.kran} Volltreffer</li>`);
  if (sum.geo) li.push(`<li>Steinmetzhütte: ${sum.geoFirst} von ${sum.geo} gleich richtig</li>`);
  if (sum.tor) li.push(`<li>Tor: ${sum.torFirst} von ${sum.tor} gleich richtig</li>`);
  const b = sum.blitz;
  if (b && b.skipped) li.push(`<li>Das Turnier kommt, sobald ${BLITZ_MIN_POOL} Einmaleins-Familien sicher sitzen.</li>`);
  else if (b && !b.quit) li.push(b.newRecord ? `<li class="star">Turnier: neuer Rekord, ${b.score}!</li>` : `<li>Turnier: ${b.score} richtig (Rekord ${b.best})</li>`);
  if (sum.burg) li.push(`<li class="star">Burg: ${sum.burg}</li>`);
  $('#album-done').innerHTML = `<div class="album-head"><img src="assets/ui/schatz.png" alt=""><div><h2>Super, ${esc(p.name)}!</h2><h3>Das hast du geschafft</h3></div></div>`
    + `<ul class="done-list">${li.join('') || '<li>Diesmal noch nichts. Bis zum nächsten Mal!</li>'}</ul>`;
  const cc = cardCounts(p);
  const lg = (v, t) => `<span><i style="background:var(${v})"></i>${t}</span>`;
  $('#album-tafel').innerHTML = `<h3>Deine Einmaleins-Tafel: ${cc.secure} von ${cc.total} sicher</h3><div class="tafel">${tafelHtml(p)}</div>`
    + `<div class="legend">${lg('--c-gold', 'Profi')}${lg('--c-secure', 'sicher')}${lg('--c-almost', 'fast')}${lg('--c-learn', 'übst du')}${lg('--c-unseen', 'kommt noch')}</div>`;
  show('s-album');
  if (li.some((x) => x.startsWith('<li class="star">'))) confetti();
}

// ---------- Burg ----------

const DEBUG = new URLSearchParams(location.search);
let burgCtl = null;
let burgToken = 0;
let burgMode = 'ansehen';

/** Rundenende: erst die Bauabnahme (wenn es Neues gibt), dann das Album. */
function finishRound() {
  clearTimeout(S.auto);
  disarmKran();
  disarmGeo();
  S.state = 'idle';
  markPlay();
  saveProfile(S.p);
  if (newParts(S.p, burgParts(S.p)).length) showBurg('abnahme');
  else showAlbum();
}

/** „12 Gerüste, 3 Steine, 1 Fahne“ */
function countText(list) {
  const n = (st) => list.filter((x) => x.stage === st).length;
  const w = (k, one, many) => (k ? `${k} ${k === 1 ? one : many}` : '');
  return [w(n(GERUEST), 'Gerüst', 'Gerüste'), w(n(STEIN), 'Stein', 'Steine'), w(n(FAHNE), 'Fahne', 'Fahnen')].filter(Boolean).join(', ');
}

function renderAreas(parts) {
  const sum = areaSummary(parts);
  const cnt = (a) => `<span class="cnt"><span><i class="st st-g"></i>${a.geruest}</span><span><i class="st st-s"></i>${a.stein}</span><span><i class="st st-f"></i>${a.fahne}</span></span>`;
  $('#burg-areas').innerHTML = sum.map((a) => `<li><b>${a.name}</b>${cnt(a)}<span class="thema">${a.thema}: ${a.stein + a.fahne} von ${a.total} fertig</span></li>`).join('')
    + `<li class="closed">Kommt später: ${AREAS.filter((a) => !a.open).map((a) => a.name).join(', ')}</li>`
    + '<li class="burg-legend"><span><i class="st st-g"></i>Gerüst</span><span><i class="st st-s"></i>Stein</span><span><i class="st st-f"></i>Fahne</span></li>';
}

const burgHint = () => (finger() ? 'Tipp auf ein Bauteil. Dann steht hier, was es ist.'
  : `Zeig mit der ${wii() ? 'Fernbedienung' : 'Maus'} auf ein Bauteil. Dann steht hier, was es ist.`);

function burgHover(h) {
  const el = $('#burg-info');
  if (!h) { el.textContent = burgHint(); return; }
  if (h.area) { el.innerHTML = `<b>${h.area.name}</b><br>${h.area.thema}. Dieser Teil der Burg kommt später.`; return; }
  const p = h.part;
  el.innerHTML = `<b>${esc(p.label)}</b><br><span class="stage">${STAGE_NAME[h.stage]}</span><br>${esc(p.need)}`;
}

function burgSound(part, stage) {
  if (stage === GERUEST) snd.soundTick();
  else if (stage === STEIN) snd.soundDrop();
  else snd.soundOk();
}

async function showBurg(mode) {
  const p = S.p;
  const token = ++burgToken;
  burgMode = mode;
  const parts = burgParts(p);
  const shown = mode === 'abnahme' ? { ...p.burg.shown } : null;
  const fresh = mode === 'abnahme' ? newParts(p, parts) : [];
  if (mode === 'abnahme') {
    S.sum.burg = countText(fresh);
    markShown(p, parts);
    saveProfile(p);
    logEvent(p, { type: 'burg', session: S.sessionId, round: S.round, at: new Date().toISOString(), neu: fresh.map((x) => [x.id, x.stage]) });
  }
  $('#s-burg').style.setProperty('--team', FARBEN[burgFarbe(p)].css);
  $('#burg-k').textContent = mode === 'abnahme' ? 'Bauabnahme' : 'Deine Burg';
  $('#burg-t').textContent = `Burg ${p.name}`;
  $('#burg-s').textContent = fresh.length ? `Neu: ${S.sum.burg}` : '';
  $('#burg-next').textContent = mode === 'abnahme' ? 'Weiter' : 'Zurück';
  $('#burg-info').textContent = burgHint();
  $('#burg-fps').hidden = !DEBUG.has('fps');
  renderAreas(parts);
  show('s-burg');
  try {
    const m = await import('./burg3d.js');
    if (token !== burgToken || current !== 's-burg') return;
    burgCtl = await m.openBurg($('#burg-view'), {
      parts, shown, farbe: burgFarbe(p), onHover: burgHover, onStep: burgSound,
      inset: burgInset,
      onFps: (f) => { $('#burg-fps').textContent = `${f} fps`; },
    });
    if (token !== burgToken || current !== 's-burg') { burgCtl.stop(); return; }
    if (fresh.length) await burgCtl.abnahme(fresh);
  } catch (err) {
    console.error(err);
    $('#burg-info').textContent = 'Die Burg lässt sich gerade nicht zeigen. Weiter geht es trotzdem.';
    logEvent(p, { type: 'burg-fehler', session: S.sessionId, at: new Date().toISOString(), msg: String((err && err.message) || err) });
  }
}

/** Von den Karten verdeckte Ränder der 3D-Ansicht: am TV die Leiste rechts, hochkant Titel oben und Leiste unten (style.css). */
function burgInset() {
  const side = $('.burg-side').getBoundingClientRect();
  if (!HOCH.matches) return { rechts: window.innerWidth - side.left };
  return { oben: $('.burg-head').getBoundingClientRect().bottom, unten: window.innerHeight - side.top };
}

function burgStop() {
  burgToken++;
  if (burgCtl) { burgCtl.stop(); burgCtl = null; }
}

/** Stufe 2 des Mauerrings für die Eltern-Übersicht: wie viele Familien bereit sind und wie weit der äußere Ring ist. */
function m2Line(p) {
  const ready = m2Plan(p, Date.now()).fams.length;
  const ring = burgParts(p).filter((x) => x.ring === 2);
  const n = (st) => ring.filter((x) => x.stage === st).length;
  const started = ring.length - n(0);
  if (!started) return ready ? `bereit für ${ready} Familien, noch nicht geübt` : 'kommt, sobald Einmaleins und Zehnerzahl einer Familie als Stein stehen';
  const b = p.bau2;
  return `${b.firstOk} von ${b.done} gleich richtig, ${b.nullErr}× Null-Fehler; bereit für ${ready} Familien; `
    + `äußerer Ring ${n(GERUEST)}/${n(STEIN)}/${n(FAHNE)} (Gerüst/Stein/Fahne)`;
}

function burgLine(p) {
  return areaSummary(burgParts(p)).map((a) => `${a.name} ${a.geruest}/${a.stein}/${a.fahne}`).join(', ') + ' (Gerüst/Stein/Fahne)';
}

/** Steinmetzhütte für die Eltern-Übersicht: je Aufgabenart gleich richtig von gesamt. */
function geoLine(p) {
  const seen = GEO_PARTS.filter((g) => p.geo[g.id] && p.geo[g.id].seen);
  if (!seen.length) return 'noch nicht geübt';
  return seen.map((g) => `${g.label.replace('Rosettenfenster: ', '')} ${p.geo[g.id].ok}/${p.geo[g.id].seen}`).join(', ') + ' (gleich richtig/gesamt)';
}

/** Tor für die Eltern-Übersicht: je Bauteil gleich richtig von gesamt, dazu Null-Fehler. */
function torLine(p) {
  const seen = TOR_PARTS.filter((g) => p.tor[g.id] && p.tor[g.id].seen);
  if (!seen.length) return 'noch nicht geübt';
  const nulls = seen.reduce((a, g) => a + (p.tor[g.id].nullErr || 0), 0);
  return seen.map((g) => `${g.name} ${p.tor[g.id].ok}/${p.tor[g.id].seen}`).join(', ') + ' (gleich richtig/gesamt)'
    + (nulls ? `, ${nulls}× Null-Fehler` : '');
}

// ---------- Übersicht für Eltern ----------

function elternCard(p) {
  const cc = cardCounts(p);
  const sp = p.speech;
  const judged = sp.ja + sp.nein + sp.ersetzt + sp.unverstanden;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + ' %' : '–');
  const last = p.lastSession ? new Date(p.lastSession).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
  const shaky = FAMILIES.filter((f) => getCard(p, f.id).box === 1).map((f) => {
    const r = getCard(p, f.id).recent;
    const l = r[r.length - 1];
    return `<li>${f.a} · ${f.b}${l && l.q ? ` (zuletzt ${esc(l.q)}: ${esc((l.answers || []).join(', '))})` : ''}</li>`;
  });
  const runs = p.blitz.runs.slice(-5).map((r) => r.score).join(', ');
  return `<div class="card"><h3>${esc(p.name)}</h3><dl>`
    + `<dt>Sitzungen</dt><dd>${p.sessions}, zuletzt ${last}</dd>`
    + `<dt>Spielzeit</dt><dd>${Math.round(p.playMs / 60000)} Min.</dd>`
    + `<dt>Einmaleins</dt><dd>${cc.secure} sicher (${cc.gold} Profi), ${cc.almost} fast, ${cc.learning} üben, ${cc.unseen} offen</dd>`
    + `<dt>Zehnerzahlen</dt><dd>${p.bau.firstOk} von ${p.bau.done} gleich richtig, ${p.bau.nullErr}× Null-Fehler</dd>`
    + `<dt>Hunderter</dt><dd>${m2Line(p)}</dd>`
    + `<dt>Kran</dt><dd>bis ${fmt(p.kran.max)}, ${p.kran.hits} von ${p.kran.done} Volltreffer`
    + (p.kran.done ? `, Ø Abweichung ${(p.kran.sumErr / p.kran.done * 100).toFixed(1).replace('.', ',')} %` : '') + '</dd>'
    + `<dt>Turnier</dt><dd>Rekord ${p.blitz.best}${runs ? `, zuletzt ${runs}` : ''}</dd>`
    + `<dt>Formen</dt><dd>${geoLine(p)}</dd>`
    + `<dt>Tor</dt><dd>${torLine(p)}</dd>`
    + `<dt>Burg</dt><dd>${burgLine(p)}</dd>`
    + (sprache() || judged ? `<dt>Sprache</dt><dd>${sp.ja} von ${judged} gleich richtig erkannt (${pct(sp.ja, judged)})</dd>` : '')
    + `</dl><h3>Wackelig</h3>${shaky.length ? `<ul class="shaky">${shaky.join('')}</ul>` : '<p>Nichts</p>'}</div>`;
}

async function showEltern() {
  const ps = await Promise.all(CFG.profile.map(loadProfile));
  const cols = $('#eltern-cols');
  cols.style.setProperty('--n', Math.max(1, Math.min(ps.length, 3)));
  cols.innerHTML = ps.length ? ps.map(elternCard).join('') : '<div class="card"><p>Noch keine Profile. Unter „Einstellungen“ anlegen.</p></div>';
  show('s-eltern');
}

// ---------- Startseite ----------

/** Kartenfarben je Burgfarbe: hell, mittel, dunkel. */
const CARD_COLORS = {
  blau: ['#7cc6ff', '#2f8cf0', '#1a5fb4'],
  rot: ['#ff9a86', '#e84b3c', '#a92a1f'],
  gruen: ['#9be27a', '#43b649', '#2a7d2e'],
  gelb: ['#ffe58a', '#f5b829', '#b07a0c'],
};

// Bühne: Ein Profil steht groß in der Mitte, die anderen kleiner daneben. Karte am Rand anklicken, Pfeil, Wischen oder
// Pfeiltaste holt ein anderes in die Mitte, der Knopf „Los, <Name>!“ (oder die mittlere Karte) startet.
// Vorher startete jede Karte sofort: Ohne beschrifteten Knopf war nicht jedem klar, wo es losgeht (Wunsch des Users 24.11.2026).
const LETZTER = 'mathquest-letzter'; // wer in diesem Browser zuletzt gespielt hat, steht beim nächsten Mal in der Mitte
const BUEHNE = { sel: 0, wischAb: null, wischBis: 0 };

function renderStart() {
  const list = CFG.profile;
  const box = $('#players');
  box.className = `players n${Math.min(list.length, 6)}`;
  $('#buehne').className = `buehne n${Math.min(list.length, 6)}`;
  box.innerHTML = list.map((x) => {
    const [c1, c2, c3] = CARD_COLORS[x.farbe] || CARD_COLORS.blau;
    // Schriftgröße nach Länge: lange Namen mit Leerzeichen oder Bindestrich dürfen umbrechen, nach dem längsten Teil
    // (und so klein, dass der Name in zwei Zeilen passt: drei Zeilen ragten unten aus der Karte)
    const len = Math.max(4, x.name.length <= 9 ? x.name.length : Math.max(Math.ceil(x.name.length * .62), ...x.name.split(/[\s-]/).map((w) => w.length + 1)));
    return `<button class="pcard" data-id="${esc(x.id)}" style="--c1:${c1};--c2:${c2};--c3:${c3};--len:${len}">`
      + `<span class="pc-in"><img src="assets/ui/${esc(x.bild)}.png" alt=""><span class="pc-name">${esc(x.name)}</span></span></button>`;
  }).join('');
  let letzter = null;
  try { letzter = localStorage.getItem(LETZTER); } catch { /* gesperrt: dann das erste Profil */ }
  BUEHNE.sel = Math.max(0, list.findIndex((x) => x.id === letzter));
  stelleBuehne(false);
  const mehrere = list.length > 1;
  $('#pf-l').hidden = $('#pf-r').hidden = !mehrere;
  const zeigen = wii() ? 'Klicken: zielen und A drücken.' : finger() ? 'Tippen mit dem Finger.' : 'Klicken mit der Maus.';
  const antworten = !sprache() ? 'Antworten: Zahl eintippen und OK.'
    : wii() ? 'Antworten: B gedrückt halten, die Zahl sagen, loslassen.' : 'Antworten: Sprach-Taste halten, die Zahl sagen, loslassen.';
  $('#start-help').textContent = `${zeigen} ${antworten}`;
}

/** Karten auf ihre Plätze stellen und den Start-Knopf beschriften. bewegt: mit Gleiten und Hüpfer (Wechsel), sonst sofort (Aufbau). */
function stelleBuehne(bewegt) {
  const list = CFG.profile;
  const n = list.length;
  const los = $('#btn-los');
  los.hidden = !n;
  if (!n) return;
  [...$('#players').children].forEach((el, i) => {
    const d = platz(i, BUEHNE.sel, n);
    const alt = Number(el.dataset.d);
    el.classList.remove('rein-l', 'rein-r');
    if (bewegt && springt(alt, d)) { void el.offsetWidth; el.classList.add(d > 0 ? 'rein-r' : 'rein-l'); }
    el.dataset.d = d;
    el.classList.toggle('weg', Math.abs(d) > SICHTBAR);
    el.tabIndex = Math.abs(d) > SICHTBAR ? -1 : 0;
    el.setAttribute('aria-label', d === 0 ? `${list[i].name}: starten` : `${list[i].name} auswählen`);
    if (d === 0) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
  });
  const x = list[BUEHNE.sel];
  const [c1, c2] = CARD_COLORS[x.farbe] || CARD_COLORS.blau;
  los.textContent = `Los, ${x.name}!`;
  los.style.cssText = `--b1:${c1};--b2:${c2};--len:${Math.max(12, x.name.length + 7)}`;
  // Bei zwei Profilen ist die Reihe am Rand zu Ende: Der Pfeil dorthin ist blass und tut nichts.
  $('#pf-l').disabled = schritt(BUEHNE.sel, -1, n) === BUEHNE.sel;
  $('#pf-r').disabled = schritt(BUEHNE.sel, 1, n) === BUEHNE.sel;
  if (bewegt) { los.classList.remove('hupf'); void los.offsetWidth; los.classList.add('hupf'); }
}

function waehle(i) {
  if (i === BUEHNE.sel || i < 0 || i >= CFG.profile.length) return;
  BUEHNE.sel = i;
  stelleBuehne(true);
}
const blaettern = (dir) => waehle(schritt(BUEHNE.sel, dir, CFG.profile.length));
const losGehts = () => { const x = CFG.profile[BUEHNE.sel]; if (x) choosePlayer(x.id).catch(nurAbgemeldet); };

// ---------- Einstellungen ----------

const SET = { draft: null, first: false, del: null, pick: null, konto: null, kontoMsg: null };
const ZEIGEN_OPT = [
  ['maus', 'Maus oder Touchscreen', 'Klicken wie gewohnt.'],
  ['wii', 'Wii Remote', 'Zeigen und A drücken. Braucht die Couch Workstation, eine DolphinBar und eine Wii Remote (siehe Anleitung).'],
];
const ANTWORTEN_OPT = [
  ['tippen', 'Ziffern tippen', 'Ziffernfeld auf dem Bildschirm oder Tastatur.'],
  ['sprache', 'Sprechen', 'Zahl sagen, das Programm „Handy“ erkennt sie. Mit der Wii Remote: B halten. Sonst das Tastenkürzel von Handy halten.'],
];

function openSetup(first = false) {
  SET.draft = JSON.parse(JSON.stringify(CFG));
  SET.first = first;
  SET.del = null;
  SET.pick = null;
  if (first && !SET.draft.profile.length) SET.draft.profile.push({ ...neuesProfil('', SET.draft), id: null });
  SET.konto = null;
  SET.kontoMsg = null;
  $('#setup-welcome').hidden = !first;
  $('#setup-welcome').textContent = ONLINE
    ? 'Willkommen bei MathQuest! Leg hier für jedes Kind ein Profil an. Ein Vorname oder Spitzname reicht. Fortschritt und Burg werden in deinem Konto gespeichert.'
    : 'Willkommen bei MathQuest! Legt hier fest, wer spielt und wie ihr das Spiel bedient. Alles bleibt auf diesem Rechner.';
  $('#setup-h-rechts').textContent = ONLINE ? 'Konto' : 'Bedienung';
  $('#setup-cancel').hidden = first;
  $('#setup-err').hidden = true;
  renderSetup();
  show('s-setup');
  const empty = document.querySelector('#setup-profiles input');
  if (empty && !empty.value) empty.focus();
}

function renderSetup() {
  const d = SET.draft;
  $('#setup-profiles').innerHTML = d.profile.map((x, i) => {
    if (SET.del === i) {
      const wohin = ONLINE ? 'werden beim Speichern endgültig gelöscht' : 'kommen beim Speichern in den Ordner <code>data/papierkorb</code>';
      return `<div class="srow sdel" data-i="${i}"><p>Profil <b>${esc(x.name || 'ohne Namen')}</b> löschen? Spielstand und Burg ${wohin}.</p>`
        + `<button class="btn small red" data-act="del-yes">Ja, löschen</button><button class="btn small" data-act="del-no">Nein</button></div>`;
    }
    if (SET.pick === i) {
      return `<div class="srow spick" data-i="${i}"><p>Bild für <b>${esc(x.name || 'das neue Profil')}</b>:</p>`
        + BILDER.map((b) => `<button class="sbild${x.bild === b.id ? ' on' : ''}" data-act="bild-wahl" data-b="${b.id}" title="${b.name}" aria-label="${b.name}">`
          + `<img src="assets/ui/${b.id}.png" alt=""></button>`).join('')
        + '</div>';
    }
    return `<div class="srow" data-i="${i}">`
      + `<button class="sbild" data-act="bild" title="Bild aussuchen" aria-label="Bild aussuchen"><img src="assets/ui/${esc(x.bild)}.png" alt=""></button>`
      + `<input class="sname" data-act="name" value="${esc(x.name)}" maxlength="${MAX_NAME}" placeholder="Name" aria-label="Name">`
      + `<span class="sfarben">${FARB_IDS.map((f) => `<button class="sfarbe${x.farbe === f ? ' on' : ''}" data-act="farbe" data-f="${f}" style="--c:${CARD_COLORS[f][1]}" aria-label="Burgfarbe ${FARBEN[f].name}" title="Burgfarbe ${FARBEN[f].name}"></button>`).join('')}</span>`
      + `<button class="btn small" data-act="del" aria-label="Profil löschen" title="Profil löschen">✕</button></div>`;
  }).join('')
    + (d.profile.length < MAX_PROFILE ? '<button class="btn small blue sadd" data-act="add">+ Profil hinzufügen</button>' : '');
  if (ONLINE) { $('#setup-bedienung').innerHTML = kontoHtml(); return; }
  const opts = (key, list) => list.map(([v, t, h]) => `<button class="sopt${d.bedienung[key] === v ? ' on' : ''}" data-act="opt" data-k="${key}" data-v="${v}">`
    + `<b>${t}</b><span>${h}</span></button>`).join('');
  $('#setup-bedienung').innerHTML = `<div class="sgroup"><div class="slabel">Zeigen und klicken</div>${opts('zeigen', ZEIGEN_OPT)}</div>`
    + `<div class="sgroup"><div class="slabel">Antworten</div>${opts('antworten', ANTWORTEN_OPT)}</div>`;
}

/** Online statt „Bedienung“: Konto (Maus und Tippen sind dort fest eingestellt). SET.konto: null, 'pw' oder 'loeschen'. */
function kontoHtml() {
  const msg = SET.kontoMsg ? `<p class="skmsg ${SET.kontoMsg.gut ? 'good' : 'bad'}" role="status">${esc(SET.kontoMsg.text)}</p>` : '';
  const pw = (name, label, auto) => `<label>${label}<input type="password" name="${name}" autocomplete="${auto}" required></label>`;
  let inhalt;
  if (SET.konto === 'pw') {
    inhalt = '<form class="skform" data-form="pw">'
      + `<input type="email" name="email" autocomplete="username" value="${esc(KONTO.email)}" hidden readonly>`
      + pw('alt', 'Bisheriges Passwort', 'current-password') + pw('neu', 'Neues Passwort (mindestens 10 Zeichen)', 'new-password')
      + `${msg}<div class="skbtns"><button class="btn small primary" type="submit">Passwort ändern</button>`
      + '<button class="btn small" type="button" data-act="k-zu">Abbrechen</button></div></form>';
  } else if (SET.konto === 'loeschen') {
    inhalt = '<form class="skform" data-form="loeschen">'
      + '<p>Das Konto mit allen Profilen, Spielständen und Burgen wird sofort und endgültig gelöscht.</p>'
      + `<input type="email" name="email" autocomplete="username" value="${esc(KONTO.email)}" hidden readonly>`
      + pw('passwort', 'Passwort zur Bestätigung', 'current-password')
      + `${msg}<div class="skbtns"><button class="btn small red" type="submit">Endgültig löschen</button>`
      + '<button class="btn small" type="button" data-act="k-zu">Abbrechen</button></div></form>';
  } else {
    inhalt = '<div class="skbtns">'
      + '<button class="btn small" data-act="k-ab">Abmelden</button>'
      + '<button class="btn small" data-act="k-pw">Passwort ändern</button>'
      + '<button class="btn small" data-act="k-daten">Meine Daten herunterladen</button>'
      + `<button class="btn small red" data-act="k-loeschen">Konto löschen</button></div>${msg}`;
  }
  return `<div class="sgroup skonto"><div class="slabel">Angemeldet als</div><div class="skonto-mail">${esc(KONTO.email)}</div>${inhalt}`
    + '<p class="legal"><a href="/impressum" target="_blank" rel="noopener">Impressum</a> · '
    + '<a href="/datenschutz" target="_blank" rel="noopener">Datenschutz</a></p></div>';
}

$('#setup-bedienung').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!ONLINE || !b || !b.dataset.act || !b.dataset.act.startsWith('k-')) return;
  const act = b.dataset.act;
  SET.kontoMsg = null;
  if (act === 'k-ab') {
    b.disabled = true;
    await abmelden();
    lokaleKopienLoeschen(KONTO.id);
    location.replace('/');
    return;
  }
  if (act === 'k-daten') { location.href = '/api/konto/daten'; return; }
  SET.konto = act === 'k-pw' ? 'pw' : act === 'k-loeschen' ? 'loeschen' : null;
  renderSetup();
  const ein = $('#setup-bedienung input:not([hidden])');
  if (ein) ein.focus();
});

$('#setup-bedienung').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const f = Object.fromEntries(new FormData(form));
  const knopf = form.querySelector('button[type=submit]');
  knopf.disabled = true;
  knopf.textContent = 'Moment …';
  if (form.dataset.form === 'pw') {
    const r = await passwortAendern(KONTO.email, f.alt, f.neu);
    if (r.ok) SET.konto = null;
    SET.kontoMsg = { gut: r.ok, text: r.ok ? 'Passwort geändert. Andere Geräte sind jetzt abgemeldet.' : r.error };
  } else if (form.dataset.form === 'loeschen') {
    const r = await kontoLoeschen(KONTO.email, f.passwort);
    if (r.ok) {
      lokaleKopienLoeschen(KONTO.id);
      location.replace('/?geloescht');
      return;
    }
    SET.kontoMsg = { gut: false, text: r.error };
  }
  renderSetup();
});

$('#s-setup').addEventListener('input', (e) => {
  const row = e.target.closest('.srow');
  if (row && e.target.dataset.act === 'name') SET.draft.profile[+row.dataset.i].name = e.target.value;
});

$('#s-setup').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !SET.draft) return;
  const d = SET.draft;
  const row = b.closest('.srow');
  const i = row ? +row.dataset.i : -1;
  const act = b.dataset.act;
  if (act !== 'bild') SET.pick = null;
  if (act === 'bild') SET.pick = SET.pick === i ? null : i;
  else if (act === 'bild-wahl') d.profile[i].bild = b.dataset.b;
  else if (act === 'farbe') d.profile[i].farbe = b.dataset.f;
  else if (act === 'del') SET.del = i;
  else if (act === 'del-no') SET.del = null;
  else if (act === 'del-yes') { d.profile.splice(i, 1); SET.del = null; }
  else if (act === 'add' && d.profile.length < MAX_PROFILE) d.profile.push({ ...neuesProfil('', d), id: null });
  else if (act === 'opt') d.bedienung[b.dataset.k] = b.dataset.v;
  else return;
  renderSetup();
  if (act === 'add') { const ins = document.querySelectorAll('#setup-profiles input'); ins[ins.length - 1].focus(); }
});

async function saveSetup() {
  const d = SET.draft;
  const err = (m) => { $('#setup-err').textContent = m; $('#setup-err').hidden = false; };
  d.profile = d.profile.filter((x) => x.id || cleanName(x.name)); // neue Zeilen ohne Namen fallen weg
  if (!d.profile.length) { renderSetup(); err('Legt mindestens ein Profil mit Namen an.'); return; }
  if (d.profile.some((x) => !cleanName(x.name))) { err('Jedes Profil braucht einen Namen.'); return; }
  // Neue Profile bekommen eine id, die es noch nie gab. Sonst erbt ein neues Profil den Stand eines gerade gelöschten.
  const used = [...CFG.profile, ...d.profile].map((x) => x.id).filter(Boolean);
  for (const x of d.profile) if (!x.id) { x.id = freieId(cleanName(x.name), used); used.push(x.id); }
  try {
    CFG = await saveSettings(d);
  } catch (e) { err(e.message); return; }
  SET.draft = null;
  renderStart();
  show('s-start');
}

$('#setup-save').addEventListener('click', saveSetup);
$('#setup-cancel').addEventListener('click', () => { SET.draft = null; show('s-start'); });
$('#s-setup').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input.sname')) { e.preventDefault(); saveSetup(); } });

// ---------- Ziffernblock ----------

function openPad() { S.padBuf = ''; $('#pad-display').textContent = ''; $('#keypad').hidden = false; }
function closePad() { $('#keypad').hidden = true; }

$('#keys').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const k = b.dataset.k;
  if (k === 'del') S.padBuf = S.padBuf.slice(0, -1);
  else if (k === 'ok') {
    if (!S.padBuf) return;
    closePad();
    if (current !== 's-task' || !(S.state === 'wait' || S.state === 'confirm')) return;
    const v = parseInt(S.padBuf, 10);
    if (S.state === 'confirm' && S.pending) decide(S.pending, 'ersetzt');
    S.pending = null;
    addInput(S.padBuf, v, 'ziffern', 'direkt');
    evaluate(v);
    return;
  } else if (S.padBuf.length < 7) S.padBuf += k;
  $('#pad-display').textContent = S.padBuf;
});
$('#pad-close').addEventListener('click', closePad);

// Ziffernfeld im Turnier: immer sichtbar, Sprache geht parallel weiter. OK zählt sofort wie eine gesprochene Antwort.
$('#b-keys').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !B.on || B.busy) return;
  const k = b.dataset.k;
  if (k === 'del') B.pad = B.pad.slice(0, -1);
  else if (k === 'ok') {
    if (!B.pad) return;
    const v = B.pad;
    B.pad = '';
    blitzInput(v, 'ziffern');
  } else if (B.pad.length < 3) B.pad += k;
  $('#b-pad-display').textContent = B.pad;
});

// ---------- Ereignisse ----------

// Profilwahl: Karte am Rand holt sich in die Mitte, die mittlere Karte startet wie der Knopf darunter.
$('#players').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || now() < BUEHNE.wischBis) return; // der Klick am Ende eines Wischens zählt nicht
  const i = CFG.profile.findIndex((x) => x.id === b.dataset.id);
  if (i === BUEHNE.sel) losGehts(); else waehle(i);
});
$('#btn-los').addEventListener('click', losGehts);
$('#pf-l').addEventListener('click', () => blaettern(-1));
$('#pf-r').addEventListener('click', () => blaettern(1));
// Wischen (Finger, auch Maus): nach links kommt die rechte Karte. Erst ab einem deutlichen Weg, damit ein Klick
// mit leicht wackelndem Wii-Zeiger ein Klick bleibt. Hoch und runter gehört dem Scrollen (touch-action in style.css).
{
  const box = $('#buehne');
  box.addEventListener('pointerdown', (e) => { BUEHNE.wischAb = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  box.addEventListener('pointercancel', () => { BUEHNE.wischAb = null; });
  box.addEventListener('dragstart', (e) => e.preventDefault()); // sonst zieht die Maus das Wappenbild aus der Karte, statt zu wischen
  box.addEventListener('pointerup', (e) => {
    const a = BUEHNE.wischAb;
    BUEHNE.wischAb = null;
    if (!a || a.id !== e.pointerId) return;
    const dx = e.clientX - a.x;
    if (Math.abs(dx) < Math.max(40, window.innerWidth * .06) || Math.abs(dx) < Math.abs(e.clientY - a.y) * 1.5) return;
    BUEHNE.wischBis = now() + 350;
    blaettern(dx < 0 ? 1 : -1);
  });
}
$('#btn-go').addEventListener('click', goPhase);
$('#btn-quit').addEventListener('click', finishRound);
$('#b-quit').addEventListener('click', () => { if (B.on) blitzFinish(true); else finishRound(); });
$('#b-next').addEventListener('click', finishRound);
$('#btn-more').addEventListener('click', newRound);
$('#btn-burg').addEventListener('click', () => showBurg('ansehen'));
$('#burg-next').addEventListener('click', () => { if (burgMode === 'abnahme') showAlbum(); else show('s-album'); });
$('#btn-done').addEventListener('click', () => { S.p = null; show('s-start'); });
$('#btn-eltern').addEventListener('click', () => showEltern().catch(nurAbgemeldet));
$('#btn-eltern-back').addEventListener('click', () => show('s-start'));
$('#btn-setup').addEventListener('click', () => openSetup(false));

const soundBtn = $('#btn-sound');
const syncSound = () => { soundBtn.setAttribute('aria-pressed', String(snd.soundOn())); soundBtn.textContent = snd.soundOn() ? 'Ton an' : 'Ton aus'; };
soundBtn.addEventListener('click', () => { snd.setSound(!snd.soundOn()); syncSound(); });
syncSound();

/** „Ja“ oder „Nein, nochmal“ zur verstandenen Zahl: per Knopf oder mit den Wii-Tasten + und − (via). */
function answerPending(yes, via) {
  if (!S.pending) return;
  if (via) S.pending.via = via;
  decide(S.pending, yes ? 'ja' : 'nein');
  const v = S.pending.value;
  S.pending = null;
  if (yes) { evaluate(v); return; }
  S.state = 'wait';
  S.note = 'Okay. Sag die Zahl nochmal.';
  renderPanel();
}

$('#panel').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'yes' || act === 'no') answerPending(act === 'yes');
  else if (act === 'sign' && S.item && S.item.type === 'tor' && S.state === 'wait' && torStep().kind === 'sign') {
    addInput(b.dataset.v, b.dataset.v, 'zeiger', 'direkt');
    evalTor(b.dataset.v);
  } else if (act === 'pad') openPad();
  else if (act === 'key') typeKey(b.dataset.k);
  else if (act === 'next') next();
});

// Spracherkennung: Die Couch Workstation fügt den Text per Strg+V ein.
document.addEventListener('paste', (e) => {
  if (formScreen()) return; // Namen, Mailadressen und Passwörter dürfen eingefügt werden
  e.preventDefault();
  clearTimeout(pttTimer);
  onText((e.clipboardData && e.clipboardData.getData('text')) || '', 'sprache');
});

// Wii-Taste B: Die Couch Workstation hält Strg+Leertaste, Handy fängt die Leertaste ab. Das Spiel sieht also
// nur Strg ohne weitere Taste (geprüft 29.10.2026). Kommt danach kein Text, hat Handy nichts verstanden.
const PTT_MIN_MS = 400; // kürzer war am 29.10. fast immer B statt A bei einer Zeigeaufgabe
const PTT_WAIT_MS = 2500; // Text kam am 29.10. spätestens 1,4 s nach dem Loslassen (161 Texte)
let ptt = null;
let pttTimer = 0;
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Control') { if (ptt) ptt.alone = false; return; }
  if (e.repeat) return;
  clearTimeout(pttTimer);
  ptt = { at: now(), alone: true };
}, true);
document.addEventListener('keyup', (e) => {
  if (e.key !== 'Control' || !ptt) return;
  const p = ptt;
  ptt = null;
  if (p.alone && sprache() && now() - p.at >= PTT_MIN_MS) pttTimer = setTimeout(unheard, PTT_WAIT_MS);
}, true);

// Kein Browser-Zoom: Kommen Wii-Taste + oder − (Ziffernblock + und −), während B noch Strg hält, sieht Chrome
// Strg+Plus bzw. Strg+Minus und zoomt die Seite. Chrome merkt sich den Zoom für die Adresse, er bleibt also auch nach
// einem Neustart (am 13.11.2026 dreimal passiert, danach 150 %). Strg+Mausrad und Touchpad-Zoom ebenso sperren.
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (/^[-+=0]$/.test(e.key) || /^Numpad(Add|Subtract|0)$/.test(e.code))) e.preventDefault();
}, true);
document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

function unheard() {
  if (current === 's-blitz') {
    if (!B.on || B.busy) return;
    B.unheard++;
    $('#b-fb').textContent = 'Nicht gehört. Nochmal!';
    $('#b-fb').className = 'bfb bad';
    return;
  }
  if (!takesNumber() || S.state !== 'wait') return;
  S.unheard++;
  S.rec.unheard++;
  S.note = S.unheard >= 2 ? 'Wieder nicht gehört. Tipp die Zahl lieber ein.' : 'Nicht gehört. Sag es nochmal oder tipp die Zahl.';
  renderPanel();
}

/** Der grüne Hauptknopf, den Enter drückt (Wunsch 24.11.2026). Nie „Beenden“ oder „Fertig für heute“.
 *  null, solange eine Antwort erwartet wird: Dann ist Enter „OK“. */
function enterKnopf() {
  if (current === 's-intro') return $('#btn-go');
  if (current === 's-task') return S.state === 'result' ? $('#panel [data-act="next"]') : null;
  if (current === 's-blitz') return B.on ? null : $('#b-next');
  if (current === 's-burg') return $('#burg-next');
  if (current === 's-album') return $('#btn-more');
  if (current === 's-start') return $('#btn-los');
  return null;
}

/** Enter auf den Hauptknopf. true, wenn die Taste damit erledigt ist. */
function enterDruecken(e) {
  const b = enterKnopf();
  if (!b || b.hidden || b.disabled) return false;
  e.preventDefault();
  if (!e.repeat && now() >= enterAb) b.click();
  return true;
}

// Tastatur: Ziffern tippen, Enter. Bei „Ziffern tippen“ zählt Enter sofort, sonst kommt die Rückfrage wie bei der Sprache.
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey || formScreen()) return;
  if (e.key === 'Enter' && enterDruecken(e)) return;
  if (current === 's-start' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); blaettern(e.key === 'ArrowLeft' ? -1 : 1); return; }
  if (current === 's-blitz') { blitzKey(e); return; }
  const waiting = current === 's-task' && S.state === 'wait';
  if (!sprache() && waiting && /^([0-9]|Backspace|Enter)$/.test(e.key)) {
    e.preventDefault();
    typeKey(e.key === 'Enter' ? 'ok' : e.key === 'Backspace' ? 'del' : e.key);
    return;
  }
  if (/^[0-9]$/.test(e.key)) { e.preventDefault(); S.devBuf += e.key; if (waiting) renderPanel(); }
  else if (e.key === 'Backspace') { e.preventDefault(); S.devBuf = S.devBuf.slice(0, -1); if (waiting) renderPanel(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (S.devBuf) { const v = S.devBuf; S.devBuf = ''; onText(v, 'tastatur'); } }
  // Wii-Tasten + und − (die Couch Workstation sendet Numpad + und −, Vorschlag vom 29.10.2026)
  else if ((e.key === '+' || e.key === '-') && current === 's-task' && S.state === 'confirm') {
    e.preventDefault();
    answerPending(e.key === '+', e.key === '+' ? 'plus' : 'minus');
  }
});

/** Turnier: Tastatur schreibt ins Ziffernfeld rechts, Enter wie OK. */
function blitzKey(e) {
  if (!/^([0-9]|Backspace|Enter)$/.test(e.key)) return;
  e.preventDefault();
  if (!B.on || B.busy) return;
  if (e.key === 'Enter') { if (B.pad) { const v = B.pad; B.pad = ''; blitzInput(v, 'tastatur'); } }
  else if (e.key === 'Backspace') B.pad = B.pad.slice(0, -1);
  else if (B.pad.length < 3) B.pad += e.key;
  $('#b-pad-display').textContent = B.pad;
}

// Bei „Sprechen“ bleibt der Fokus auf einem unsichtbaren Feld, damit Strg+V (Spracherkennung) immer ankommt.
// Sonst kein Eingabefeld: Am Handy öffnete der Fokus darauf nach jedem Tippen die Bildschirm-Tastatur (Test des Users
// 24.11.2026, online). Ziffern und Enter von einer echten Tastatur kommen auch so an (keydown am document); den zuletzt
// geklickten Knopf nicht fokussiert lassen, sonst drückt ihn die Leertaste noch einmal. Nicht in Einstellungen und Anmeldung.
const sink = $('#sink');
const refocus = () => {
  if (formScreen()) return;
  if (sprache()) { if (document.activeElement !== sink) sink.focus({ preventScroll: true }); return; }
  const a = document.activeElement;
  if (a && a !== document.body && a.matches('button, textarea')) a.blur();
};
document.addEventListener('click', () => setTimeout(refocus, 0));
window.addEventListener('focus', refocus);
document.addEventListener('fullscreenchange', refocus);
document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input')) e.preventDefault(); });
refocus();

// Daueranimationen (schwebende Zahlen, Logo, Strahlen) anhalten, wenn länger niemand den Zeiger bewegt.
// Spart am TV ca. 15 % eines CPU-Kerns im Leerlauf (gemessen 24.10.2026).
const IDLE_MS = (Number(DEBUG.get('idle')) || 45) * 1000;
let idleTimer = 0;
const wake = () => {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), IDLE_MS);
};
['mousemove', 'mousedown', 'keydown', 'paste'].forEach((t) => document.addEventListener(t, wake, { passive: true }));
wake();

// Start: Lokal oder online? Online erst anmelden. Dann Einstellungen laden, ohne Profile (erster Start) gleich die Einrichtung.
/** Online kann die Anmeldung unterwegs ablaufen: Dann übernimmt der Handler für „mq-abgemeldet“. */
const nurAbgemeldet = (e) => { if (e.message !== 'abgemeldet') throw e; };

async function ladeEinstellungen() {
  try { CFG = await loadSettings(); } catch (e) { nurAbgemeldet(e); return; }
  renderStart();
  if (!CFG.profile.length) openSetup(true);
  else show('s-start');
  refocus(); // erst jetzt ist bekannt, ob „Sprechen“ eingestellt ist
}

async function anmelden(opts = {}) {
  KONTO = await anmeldung({ zeige: show, ...opts });
  setKonto(KONTO);
}

let wiederAnmelden = false;
window.addEventListener('mq-abgemeldet', async () => {
  if (!ONLINE || wiederAnmelden || current === 's-konto') return;
  wiederAnmelden = true;
  S.p = null;
  if (B.on) { B.on = false; cancelAnimationFrame(B.raf); }
  closePad();
  try {
    await anmelden({ hinweis: 'Du bist abgemeldet worden. Bitte melde dich wieder an.' });
    await ladeEinstellungen();
  } finally { wiederAnmelden = false; }
});

(async function start() {
  const st = await kontoStatus();
  if (!st.erreichbar) {
    const lokal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if (!lokal) $('#srv-warn').textContent = 'Keine Verbindung zum Server. Gespeichert wird vorerst nur in diesem Browser.';
    $('#srv-warn').hidden = false;
  }
  ONLINE = st.online;
  document.body.classList.toggle('online', ONLINE);
  if (ONLINE) {
    const link = linkAusMail();
    KONTO = st.konto;
    if (KONTO && !link) setKonto(KONTO);
    else await anmelden({ link });
  }
  await ladeEinstellungen();
})();

// Nur zum Testen (Adresse mit ?debug): Zugriff auf Ablauf und Burg
if (DEBUG.has('debug')) window.__mq = { S, showBurg, finishRound, choosePlayer, saveProfile, startPhase, startBlitz, showEltern, showAlbum, openSetup, cfg: () => CFG };
