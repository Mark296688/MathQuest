// Die Burg in 3D: Three.js mit Modellen aus dem Kenney Castle Kit (CC0, assets/castle).
// Nur Darstellung und Animation. Welche Stufe ein Teil hat, rechnet burg.js aus.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AREAS, FARBEN, PLAN, GERUEST, STEIN, FAHNE } from './burg.js';

const MODELS = [
  'tower-square-base-border', 'wall', 'wall-doorway', 'tower-square-base', 'tower-square-mid',
  'tower-square-mid-windows', 'tower-square-top-roof-high', 'flag', 'flag-pennant', 'flag-banner-short',
  'gate', 'bridge-draw', 'metal-gate', 'tower-square-arch', 'tower-square-top', 'tower-top', 'tree-large', 'tree-small', 'rocks-large', 'rocks-small',
  'tower-hexagon-base', 'tower-hexagon-roof', 'wall-narrow-wood-fence', 'tower-slant-roof',
];
const R = 5; // Abstand der Mauer von der Mitte
const WALL_ROT = 0; // Drehung des Mauermodells, damit die Zinnen nach außen zeigen
const TOWER_SCALE = 1.3;
const BLOCK_H = 0.45;
const WALL_H = 1.31;
// Äußerer Mauerring (Stufe 2): niedriger und weiter draußen, 9 Stücke je Seite ohne Lücke
const R2 = R + 1.7;
const STEP2 = (2 * R2) / 9;
const WALL2 = [STEP2, 0.7, 0.6]; // Skalierung des Mauermodells
const WALL2_H = WALL_H * WALL2[1];

/** Kamerapositionen: Ziel, Abstand, Neigung (0 = von oben), Richtung. */
const FOCUS = {
  all: { x: 0, y: 1.2, z: 0, r: 30, pol: 0.98 },
  fundament: { x: 0, y: 0.2, z: 0.5, r: 13, pol: 0.82 },
  mauer: { x: 0, y: 0.8, z: 0, r: 25, pol: 0.92 },
  tuerme: { x: 0, y: 2.5, z: 0, r: 25, pol: 1.02 },
  steinmetz: { x: -9.0, y: 0.6, z: 4.9, r: 13, pol: 0.95 },
  tor: { x: 0, y: 0.7, z: R2 + 1.0, r: 12, pol: 0.97 },
};

// Tor vorn vor dem äußeren Mauerring: Torhaus mit Fallgitter, davor die Zugbrücke. Die Torflügel sitzen im inneren Tor.
const GATE_Z = R2 + 0.55;
const BRIDGE_L = 1.3;
const TOR_PLACE = {
  waage1: { kind: 'fluegel', x: 0, z: R + 0.42, size: [0.8, 1.0, 0.3] },
  waage2: { kind: 'bruecke', x: 0, z: GATE_Z + 0.47 + BRIDGE_L / 2, size: [1.05, 0.15, BRIDGE_L] },
  pvs1: { kind: 'gitter', x: 0, z: GATE_Z + 0.5, size: [0.7, 0.75, 0.15] },
  pvs2: { kind: 'torhaus', x: 0, z: GATE_Z, size: [1.0, 1.35, 1.0] },
};

// Steinmetzhütte links vor der Burg: Hütte hinten, davor die Werkstücke, links und rechts die Rosettenfenster.
// Lokal zeigt +z zur Kamera am Anfang (Drehung YARD.rot).
const YARD = { x: -9.5, z: 5.3, rot: 0.6 };
const yardPos = (lx, lz) => [YARD.x + lx * Math.cos(YARD.rot) + lz * Math.sin(YARD.rot), YARD.z - lx * Math.sin(YARD.rot) + lz * Math.cos(YARD.rot)];
const WERK_H = 0.3;
const ROSE_H = 1.25;

let A = null; // geladene Modelle und Materialien
let G = null; // Renderer, Szene, Kamera, solange die Burg zu sehen ist

const params = new URLSearchParams(location.search);
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const ease = (k) => 1 - (1 - k) ** 3;

// ---------- Modelle und Materialien ----------

async function loadAssets() {
  if (A) return A;
  THREE.Cache.enabled = true;
  const loader = new GLTFLoader();
  const loaded = await Promise.all(MODELS.map(async (n) => [n, (await loader.loadAsync(`assets/castle/${n}.glb`)).scene]));
  const tpl = Object.fromEntries(loaded);
  let base = null;
  tpl.wall.traverse((o) => { if (o.isMesh && !base) base = o.material; });
  A = {
    tpl, base, team: {}, edgeCache: new Map(), scaffoldCache: new Map(),
    ghost: new THREE.MeshBasicMaterial({ color: 0xd8e9ff, transparent: true, opacity: 0.3, depthWrite: false }),
    ghostDim: new THREE.MeshBasicMaterial({ color: 0xe4efff, transparent: true, opacity: 0.14, depthWrite: false }),
    edge: new THREE.LineBasicMaterial({ color: 0x4f86d6, transparent: true, opacity: 0.55 }),
    edgeDim: new THREE.LineBasicMaterial({ color: 0x6d9be0, transparent: true, opacity: 0.22 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xa8703f, roughness: 0.9 }),
    ground: new THREE.MeshStandardMaterial({ color: 0x7fbb5c, roughness: 1 }),
    sand: new THREE.MeshStandardMaterial({ color: 0xe3cfa2, roughness: 1 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xd8d0c2, roughness: 0.85 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xc4573a, roughness: 0.8 }),
    glassBlue: new THREE.MeshStandardMaterial({ color: 0x4f86d6, emissive: 0x17345f, roughness: 0.3 }),
    glassRed: new THREE.MeshStandardMaterial({ color: 0xd9534f, emissive: 0x5a1512, roughness: 0.3 }),
  };
  return A;
}

/** Ein Material pro Teamfarbe: das Kenney-Material mit der passenden Palette. */
function teamMaterial(farbe) {
  if (A.team[farbe]) return A.team[farbe];
  const src = A.base.map;
  const tex = new THREE.TextureLoader().load(`assets/castle/Textures/${FARBEN[farbe].tex}`);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (src) { tex.magFilter = src.magFilter; tex.minFilter = src.minFilter; tex.wrapS = src.wrapS; tex.wrapT = src.wrapT; }
  const m = A.base.clone();
  m.map = tex;
  A.team[farbe] = m;
  return m;
}

function model(name, mat) {
  const o = A.tpl[name].clone(true);
  o.traverse((m) => { if (m.isMesh) { m.material = mat; m.castShadow = true; m.receiveShadow = true; } });
  return o;
}

function edgesOf(geo) {
  let e = A.edgeCache.get(geo.uuid);
  if (!e) { e = new THREE.EdgesGeometry(geo, 25); A.edgeCache.set(geo.uuid, e); }
  return e;
}

/** Als Bauplan zeigen: durchscheinend mit Kanten. */
function ghostOf(obj, dim) {
  const meshes = [];
  obj.traverse((m) => { if (m.isMesh) meshes.push(m); });
  for (const m of meshes) {
    m.material = dim ? A.ghostDim : A.ghost;
    m.castShadow = false;
    m.receiveShadow = false;
    m.add(new THREE.LineSegments(edgesOf(m.geometry), dim ? A.edgeDim : A.edge));
  }
  return obj;
}

/** Holzgerüst um ein Bauteil (eine Geometrie, ein Draw-Call). */
function scaffold([w, h, d]) {
  const key = `${w}|${h}|${d}`;
  let geo = A.scaffoldCache.get(key);
  if (!geo) {
    const gs = [];
    const box = (sx, sy, sz, x, y, z, rz = 0) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      if (rz) g.rotateZ(rz);
      g.translate(x, y, z);
      gs.push(g);
    };
    const hx = w / 2 + 0.04;
    const hz = d / 2 + 0.04;
    const top = h + 0.12;
    for (const x of [-hx, hx]) for (const z of [-hz, hz]) box(0.06, top, 0.06, x, top / 2, z);
    for (const y of [h * 0.5, top]) {
      box(w + 0.14, 0.05, 0.05, 0, y, -hz);
      box(w + 0.14, 0.05, 0.05, 0, y, hz);
      box(0.05, 0.05, d + 0.14, -hx, y, 0);
      box(0.05, 0.05, d + 0.14, hx, y, 0);
    }
    const len = Math.hypot(2 * hx, h * 0.5);
    box(len, 0.04, 0.04, 0, h * 0.25, hz + 0.02, Math.atan2(h * 0.5, 2 * hx));
    geo = mergeGeometries(gs);
    A.scaffoldCache.set(key, geo);
  }
  const mesh = new THREE.Mesh(geo, A.wood);
  mesh.castShadow = true;
  return mesh;
}

// ---------- Bauteile ----------

function towerHeight(level) {
  return (1.01 + (level + 1) * 1.01 + 1.35) * TOWER_SCALE;
}

function towerStack(level, mat, scale = TOWER_SCALE) {
  const g = new THREE.Group();
  let y = 0;
  const put = (n, h) => { const o = model(n, mat); o.position.y = y; g.add(o); y += h; };
  put('tower-square-base', 1.01);
  for (let i = 0; i <= level; i++) put(i % 2 ? 'tower-square-mid' : 'tower-square-mid-windows', 1.01);
  put('tower-square-top-roof-high', 1.35);
  g.scale.setScalar(scale);
  return g;
}

/** Wo jedes Bauteil steht. Lokal zeigt +z immer nach außen. */
function layout(parts) {
  const places = new Map();
  parts.filter((p) => p.area === 'fundament').forEach((p, i) => {
    places.set(p.id, { kind: 'block', x: (i % 6) - 2.5, z: Math.floor(i / 6) - 2.5, rot: 0, size: [1, BLOCK_H, 1] });
  });
  const sides = (r) => [(t) => [t, r, 0], (t) => [r, -t, Math.PI / 2], (t) => [-t, -r, Math.PI], (t) => [-r, t, -Math.PI / 2]];
  parts.filter((p) => p.area === 'mauer' && p.ring !== 2).forEach((p, i) => {
    const s = Math.floor(i / 9);
    const j = i % 9;
    const [x, z, rot] = sides(R)[s](j - 4);
    places.set(p.id, { kind: s === 0 && j === 4 ? 'door' : 'wall', x, z, rot, size: [1, WALL_H, 1] });
  });
  parts.filter((p) => p.ring === 2).forEach((p, i) => {
    const s = Math.floor(i / 9);
    const j = i % 9;
    const [x, z, rot] = sides(R2)[s]((j - 4) * STEP2);
    places.set(p.id, { kind: s === 0 && j === 4 ? 'door2' : 'wall2', x, z, rot, size: [STEP2, WALL2_H, WALL2[2]] });
  });
  // Erster Turm vorn links (gut zu sehen), der letzte vorn rechts, wo die Kamera beginnt: als Bauplan verdeckt er nichts
  const corners = [[-R, R], [-R, -R], [R, -R], [R, R]];
  parts.filter((p) => p.area === 'tuerme').forEach((p) => {
    const [x, z] = corners[p.level];
    places.set(p.id, { kind: 'tower', level: p.level, x, z, rot: 0, size: [1.3, towerHeight(p.level), 1.3] });
  });
  parts.filter((p) => p.area === 'steinmetz').forEach((p) => {
    const rose = p.geo === 'falt' || p.geo === 'loch';
    const [x, z] = rose ? yardPos(p.geo === 'falt' ? -2.35 : 2.35, -0.55) : yardPos(-1.5 + p.idx, 0.75);
    places.set(p.id, rose
      ? { kind: 'rosette', geo: p.geo, x, z, rot: YARD.rot, size: [1.0, ROSE_H, 0.4] }
      : { kind: 'werk', geo: p.geo, x, z, rot: YARD.rot, size: [0.85, WERK_H + 0.1, 0.85] });
  });
  parts.filter((p) => p.area === 'tor').forEach((p) => {
    places.set(p.id, { ...TOR_PLACE[p.tor], rot: 0 });
  });
  return places;
}

/** Bauteile des Tors aus dem Kenney-Kit. Torflügel, Gitter und Brücke liegen im Modell quer und werden gedreht. */
function torPart(kind, mat) {
  const g = new THREE.Group();
  const add = (o, x, y, z, rot, s) => { o.position.set(x, y, z); o.rotation.y = rot; o.scale.setScalar(s); g.add(o); };
  if (kind === 'fluegel') add(model('gate', mat), 0, 0, 0, Math.PI / 2, 1.0);
  else if (kind === 'gitter') add(model('metal-gate', mat), 0, 0, 0, Math.PI / 2, 0.95);
  else if (kind === 'bruecke') add(model('bridge-draw', mat), 0, 0.01, -BRIDGE_L / 2, Math.PI / 2, BRIDGE_L);
  else {
    add(model('tower-square-arch', mat), 0, 0, 0, 0, 1.0);
    add(model('tower-square-top', mat), 0, 1.01, 0, 0, 0.94);
  }
  return g;
}

// ---------- Steinmetzhütte ----------

const flatGeo = (gs) => mergeGeometries(gs.map((p) => (p.index ? p.toNonIndexed() : p)));

/** Werkstück auf einer Holzpalette: Quadrat, Rechteck, Dreieck oder Rechteck aus drei Teilen. */
function werkstueck(geo) {
  const g = new THREE.Group();
  const pal = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.8), A.wood);
  pal.position.y = 0.04;
  pal.receiveShadow = true;
  g.add(pal);
  const parts = [];
  const box = (w, d, x, z) => { const b = new THREE.BoxGeometry(w, WERK_H - 0.08, d); b.translate(x, 0.08 + (WERK_H - 0.08) / 2, z); parts.push(b); };
  if (geo === 'quadrat') box(0.62, 0.62, 0, 0);
  else if (geo === 'rechteck') box(0.74, 0.42, 0, 0);
  else if (geo === 'drei') { box(0.3, 0.46, -0.21, 0); box(0.4, 0.21, 0.16, -0.125); box(0.4, 0.21, 0.16, 0.125); }
  else {
    const s = new THREE.Shape();
    s.moveTo(-0.32, -0.32);
    s.lineTo(0.32, -0.32);
    s.lineTo(-0.32, 0.32);
    s.closePath();
    const e = new THREE.ExtrudeGeometry(s, { depth: WERK_H - 0.08, bevelEnabled: false });
    e.rotateX(-Math.PI / 2);
    e.translate(0, 0.08, 0);
    parts.push(e);
  }
  const m = new THREE.Mesh(flatGeo(parts), A.stone);
  m.castShadow = true;
  g.add(m);
  return g;
}

/** Rosettenfenster aus Stein (Maßwerk) mit buntem Glas auf einem Sockel. */
function rosette(geo) {
  const g = new THREE.Group();
  const cy = 0.72;
  const gs = [];
  const ring = new THREE.TorusGeometry(0.42, 0.07, 6, 28);
  ring.translate(0, cy, 0);
  const hub = new THREE.TorusGeometry(0.12, 0.045, 6, 16);
  hub.translate(0, cy, 0);
  gs.push(ring, hub);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.BoxGeometry(0.05, 0.6, 0.06);
    b.translate(0, 0.27, 0);
    b.rotateZ((i * Math.PI) / 2 + (geo === 'loch' ? Math.PI / 4 : 0));
    b.translate(0, cy, 0);
    gs.push(b);
  }
  const plinth = new THREE.BoxGeometry(0.62, 0.22, 0.32);
  plinth.translate(0, 0.11, 0);
  gs.push(plinth);
  const stone = new THREE.Mesh(flatGeo(gs), A.stone);
  stone.castShadow = true;
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.4, 28), geo === 'loch' ? A.glassRed : A.glassBlue);
  glass.position.set(0, cy, 0.005);
  const back = glass.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.005;
  g.add(stone, glass, back);
  return g;
}

/** Hütte mit Pultdach und Werkbank. Gehört zum offenen Bereich, ist aber kein Bauteil. */
function steinmetzHut() {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(3.0, 1.35, 0.12), A.wood, 0, 0.675, -1.75);
  for (const x of [-1.5, 1.5]) {
    add(new THREE.BoxGeometry(0.12, 1.35, 1.1), A.wood, x, 0.675, -1.25);
    add(new THREE.BoxGeometry(0.12, 1.05, 0.12), A.wood, x, 0.525, -0.6);
  }
  add(new THREE.BoxGeometry(3.4, 0.09, 1.65), A.roof, 0, 1.25, -1.15, 0.28);
  add(new THREE.BoxGeometry(1.7, 0.08, 0.5), A.wood, 0, 0.62, -1.38);
  for (const x of [-0.75, 0.75]) add(new THREE.BoxGeometry(0.08, 0.6, 0.4), A.wood, x, 0.3, -1.38);
  add(new THREE.BoxGeometry(0.42, 0.3, 0.32), A.stone, -0.25, 0.81, -1.38);
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.6), A.sand);
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(0, 0.006, -0.35);
  yard.receiveShadow = true;
  g.add(yard);
  g.position.set(YARD.x, 0, YARD.z);
  g.rotation.y = YARD.rot;
  return g;
}

const TOR_KINDS = new Set(['fluegel', 'gitter', 'bruecke', 'torhaus']);

function buildPart(L, mat) {
  if (TOR_KINDS.has(L.kind)) return torPart(L.kind, mat);
  if (L.kind === 'werk') return werkstueck(L.geo);
  if (L.kind === 'rosette') return rosette(L.geo);
  if (L.kind === 'block') return model('tower-square-base-border', mat);
  if (L.kind === 'tower') return towerStack(L.level, mat);
  const g = new THREE.Group();
  g.rotation.y = WALL_ROT;
  if (L.kind === 'wall' || L.kind === 'wall2') g.add(model('wall', mat));
  else {
    const b = model('wall-doorway', mat);
    b.scale.x = -1;
    g.add(model('wall-doorway', mat), b);
  }
  if (L.kind === 'wall2' || L.kind === 'door2') g.scale.set(...WALL2);
  return g;
}

function buildFlag(L, mat) {
  if (TOR_KINDS.has(L.kind)) {
    const big = L.kind === 'torhaus';
    const f = model(big ? 'flag' : 'flag-pennant', mat);
    f.scale.setScalar(big ? 1.0 : 0.45);
    const pos = { fluegel: [0.36, 0.9, 0], gitter: [0.3, 0.7, 0.04], bruecke: [0.5, 0.08, BRIDGE_L / 2 - 0.1], torhaus: [0, 1.28, 0] }[L.kind];
    f.position.set(...pos);
    return f;
  }
  if (L.kind === 'werk' || L.kind === 'rosette') {
    const f = model('flag-pennant', mat);
    f.scale.setScalar(0.5);
    f.position.set(L.kind === 'werk' ? 0.25 : 0, L.kind === 'werk' ? WERK_H : 1.2, 0);
    return f;
  }
  if (L.kind === 'block') {
    const f = model('flag-pennant', mat);
    f.scale.setScalar(0.5);
    f.position.y = BLOCK_H;
    return f;
  }
  if (L.kind === 'tower') {
    const f = model('flag', mat);
    f.scale.setScalar(1.4);
    f.position.y = towerHeight(L.level) - 0.1;
    return f;
  }
  if (L.kind === 'wall2' || L.kind === 'door2') {
    const f = model('flag-pennant', mat);
    f.scale.setScalar(0.6);
    f.position.y = WALL2_H - 0.05;
    return f;
  }
  const f = model('flag-banner-short', mat);
  f.rotation.y = -Math.PI / 2;
  f.position.set(0, WALL_H - 0.95, 0.53);
  return f;
}

function visual(L, stage, mat) {
  const v = new THREE.Group();
  const tag = (o, role) => { o.userData.role = role; v.add(o); return o; };
  if (stage <= GERUEST) tag(ghostOf(buildPart(L, mat), false), 'ghost');
  if (stage === GERUEST) tag(scaffold(L.size), 'scaffold');
  if (stage >= STEIN) tag(buildPart(L, mat), 'solid');
  if (stage === FAHNE) tag(buildFlag(L, mat), 'flag');
  return v;
}

/** Bereiche, die noch nicht offen sind: blasser Bauplan im Gelände. */
function closedAreas(mat) {
  const groups = [];
  const area = (id, ...objs) => {
    const g = new THREE.Group();
    objs.forEach((o) => g.add(o));
    ghostOf(g, true);
    g.userData.area = id;
    groups.push(g);
  };
  const at = (o, x, y, z, rot = 0, s = 1) => { o.position.set(x, y, z); o.rotation.y = rot; o.scale.multiplyScalar(s); return o; };

  // Nur der Grundriss: ein hoher Bauplan in der Mitte würde das Fundament verdecken
  area('bergfried', at(model('tower-square-base-border', mat), 0, BLOCK_H, 0, 0, 1.8));
  const roof = at(model('tower-hexagon-roof', mat), 0, 0.95, 0, 0, 0.8);
  const well = new THREE.Group();
  well.add(at(model('tower-hexagon-base', mat), 0, 0, 0, 0, 0.8), roof);
  well.children[0].scale.y = 0.3;
  area('brunnen', at(well, 3.6, 0, 3.4));
  const stalls = [];
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Group();
    st.add(model('wall-narrow-wood-fence', mat), at(model('tower-slant-roof', mat), 0, 0.55, 0, 0, 0.75));
    stalls.push(at(st, R + 3.2 + i * 1.3, 0, R + 2.6 - i * 0.6, -0.5));
  }
  area('markt', ...stalls);
  return groups;
}

const DECOR = [
  ['tree-large', -11.9, 0.4, 1.5], ['tree-small', -13.2, 3.0, 1.4], ['tree-large', -10.4, -1.5, 1.7],
  ['tree-small', -8.2, -6.3, 1.3], ['tree-large', -4.8, -9.3, 1.6], ['tree-small', -1.2, -10.4, 1.4],
  ['tree-large', 3.6, -9.6, 1.5], ['tree-small', 8.8, -7.2, 1.4], ['tree-large', 10.2, -2.8, 1.7],
  ['tree-small', 9.6, 0.6, 1.3], ['tree-large', -6.0, 11.6, 1.5], ['tree-small', -4.6, 10.6, 1.3],
  ['rocks-large', -9.0, -3.8, 1.2], ['rocks-small', 7.6, -9.4, 1.4], ['rocks-small', -12.6, 8.6, 1.2],
];

// ---------- Renderer und Szene ----------

function pixelRatio() {
  const q = Number(params.get('pr'));
  return q > 0 ? q : Math.min(window.devicePixelRatio || 1, 1.5);
}

function makeGraphics() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe2efff, 40, 75);
  scene.add(new THREE.HemisphereLight(0xe3efff, 0x6f8f55, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(9, 16, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 45 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const flat = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  flat(new THREE.CircleGeometry(70, 48), A.ground, 0, 0, 0);
  flat(new THREE.PlaneGeometry(2 * R, 2 * R), A.sand, 0, 0.004, 0);
  flat(new THREE.PlaneGeometry(1.7, 13), A.sand, 0, 0.003, R + 7);
  const plain = teamMaterial('blau');
  for (const [n, x, z, s] of DECOR) {
    const o = model(n, plain);
    o.position.set(x, 0, z);
    o.rotation.y = x * 1.7 + z;
    o.scale.setScalar(s);
    scene.add(o);
  }

  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 200);
  return { renderer, scene, camera, world: null, ctl: null };
}

// ---------- Öffnen, Animation, Zeigen ----------

/**
 * Burg im Element el anzeigen.
 * opts: parts, shown (Stufe je Teil vor der Bauabnahme, sonst null), farbe,
 *       onHover({part}|{area}|null), onStep(part, stage), onFps(fps),
 *       inset() → Breite in Pixeln, die rechts von einer Leiste verdeckt ist
 */
export async function openBurg(el, opts) {
  await loadAssets();
  if (G && G.ctl) G.ctl.stop();
  if (!G) G = makeGraphics();
  const g = G;
  const { renderer, scene, camera } = g;
  if (renderer.domElement.parentElement !== el) el.appendChild(renderer.domElement);
  const resize = () => {
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    // Bildmitte in die freie Fläche links der Leiste schieben
    const inset = opts.inset ? opts.inset() : 0;
    if (inset > 0) camera.setViewOffset(w, h, inset / 2, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  resize();

  if (g.world) scene.remove(g.world);
  const world = new THREE.Group();
  g.world = world;
  scene.add(world);
  const mat = teamMaterial(opts.farbe);
  const places = layout(opts.parts);
  const slots = new Map();
  const pickables = [];
  for (const part of opts.parts) {
    const L = places.get(part.id);
    const slot = new THREE.Group();
    slot.position.set(L.x, 0, L.z);
    slot.rotation.y = L.rot;
    slot.userData.partId = part.id;
    const stage = opts.shown ? Math.min(part.stage, opts.shown[part.id] || PLAN) : part.stage;
    const v = visual(L, stage, mat);
    slot.add(v);
    world.add(slot);
    pickables.push(slot);
    slots.set(part.id, { part, L, slot, visual: v, stage, lift: 0 });
  }
  for (const g of closedAreas(mat)) { world.add(g); pickables.push(g); }
  if (opts.parts.some((p) => p.area === 'steinmetz')) world.add(steinmetzHut());

  // Kamera: Kugelkoordinaten um ein Ziel
  const cam = { ...FOCUS.all, az: 0.55 };
  const placeCamera = () => {
    const s = Math.sin(cam.pol);
    camera.position.set(cam.x + cam.r * s * Math.sin(cam.az), cam.y + cam.r * Math.cos(cam.pol), cam.z + cam.r * s * Math.cos(cam.az));
    camera.lookAt(cam.x, cam.y, cam.z);
  };
  placeCamera();

  const tweens = [];
  const tween = (dur, fn, delay = 0) => new Promise((res) => tweens.push({ t0: performance.now() + delay, dur, fn, res }));
  let busy = 0;
  const moveCamera = (to, dur) => {
    const from = { ...cam };
    const az1 = from.az + 0.35;
    return tween(dur, (k) => {
      const e = ease(k);
      for (const key of ['x', 'y', 'z', 'r', 'pol']) cam[key] = from[key] + (to[key] - from[key]) * e;
      cam.az = from.az + (az1 - from.az) * e;
    });
  };

  // Zeigen mit dem Wii-Zeiger: Teil anheben und beschreiben
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2(2, 2);
  let pickDirty = false;
  let lastPick = 0;
  let hovered = null;
  const onMove = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    pickDirty = true;
  };
  const onLeave = () => { ndc.set(2, 2); pickDirty = true; };
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerleave', onLeave);
  const pick = () => {
    ray.setFromCamera(ndc, camera);
    const owner = (x) => { while (x && !x.userData.partId && !x.userData.area) x = x.parent; return x; };
    // Bauteile vor Bauplänen: Der Bergfried-Plan soll die Steine darunter nicht verdecken.
    const hits = ray.intersectObjects(pickables, true).filter((h) => h.object.isMesh).map((h) => owner(h.object)).filter(Boolean);
    const o = hits.find((x) => x.userData.partId) || hits[0] || null;
    const key = o ? o.userData.partId || `area:${o.userData.area}` : null;
    if (key === (hovered && hovered.key)) return;
    hovered = o ? { key, slot: o.userData.partId ? slots.get(o.userData.partId) : null } : null;
    if (!opts.onHover) return;
    if (!o) opts.onHover(null);
    else if (o.userData.partId) { const s = slots.get(o.userData.partId); opts.onHover({ part: s.part, stage: s.stage }); }
    else opts.onHover({ area: AREAS.find((a) => a.id === o.userData.area) });
  };

  let frames = 0;
  let fpsT0 = performance.now();
  let last = performance.now();
  let running = true;
  const frame = () => {
    const t = performance.now();
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (t < tw.t0) continue;
      const k = Math.min(1, (t - tw.t0) / tw.dur);
      tw.fn(k);
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
    if (!busy) cam.az += dt * 0.05;
    placeCamera();
    if (pickDirty && t - lastPick > 80) { pickDirty = false; lastPick = t; pick(); }
    for (const s of slots.values()) {
      const want = hovered && hovered.slot === s ? 0.18 : 0;
      if (s.lift !== want) { s.lift += (want - s.lift) * Math.min(1, dt * 12); if (Math.abs(want - s.lift) < 0.002) s.lift = want; s.slot.position.y = s.lift; }
    }
    renderer.render(scene, camera);
    frames++;
    if (t - fpsT0 >= 1000) {
      if (opts.onFps) opts.onFps(Math.round((frames * 1000) / (t - fpsT0)));
      frames = 0;
      fpsT0 = t;
    }
  };
  renderer.setAnimationLoop(frame);
  window.addEventListener('resize', resize);

  /** Ein Teil auf seine neue Stufe bringen, mit kleiner Animation. */
  const upgrade = async (s, to, delay) => {
    await sleep(delay);
    if (!running) return;
    const from = s.stage;
    const old = s.visual;
    const nv = visual(s.L, to, mat);
    s.visual = nv;
    s.stage = to;
    const role = (r) => nv.children.find((c) => c.userData.role === r);
    const solid = role('solid');
    const sc = role('scaffold');
    const flag = role('flag');
    if (flag) flag.scale.multiplyScalar(0.001);
    const flagScale = flag ? flag.scale.x * 1000 : 1;
    s.slot.add(nv);
    if (opts.onStep) opts.onStep(s.part, to);
    if (sc) {
      s.slot.remove(old);
      await tween(450, (k) => { sc.scale.y = Math.max(0.001, ease(k)); });
    } else if (solid && from < STEIN) {
      const y0 = 3;
      solid.position.y = y0;
      await tween(420, (k) => { solid.position.y = y0 * (1 - k * k); });
      s.slot.remove(old);
    } else s.slot.remove(old);
    if (flag) await tween(380, (k) => flag.scale.setScalar(Math.max(0.001, flagScale * ease(k))));
  };

  const ctl = {
    /** Bauabnahme: Bereich für Bereich die neuen Teile einsetzen. */
    async abnahme(fresh) {
      busy++;
      for (const a of AREAS) {
        const list = fresh.filter((p) => p.area === a.id);
        if (!list.length || !running) continue;
        await moveCamera({ ...FOCUS[a.id] }, 1100);
        const step = Math.min(160, 2400 / list.length);
        await Promise.all(list.map((p, i) => upgrade(slots.get(p.id), p.stage, i * step)));
        await sleep(500);
      }
      if (running) await moveCamera({ ...FOCUS.all }, 1300);
      busy--;
    },
    stop() {
      if (!running) return;
      running = false;
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', resize);
      tweens.splice(0).forEach((tw) => tw.res());
      // Grafikspeicher freigeben (gemessen ca. 300 MB): die Burg ist nur kurz zu sehen, der Laptop hat wenig RAM
      renderer.domElement.remove();
      renderer.dispose();
      renderer.forceContextLoss();
      if (G === g) G = null;
    },
  };
  g.ctl = ctl;
  return ctl;
}
