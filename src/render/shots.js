// Shots: every projectile is drawn from a SHAPE (what it is) plus a SKIN (what it carries).
//
// SHAPE comes from the weapon: a weapon's `shot` ('arrow' | 'javelin' | 'shard' | 'disc' | 'blade'), else its behavior
// (projectile -> arrow, rod -> javelin, nova -> shard, boomerang -> disc), else a blade. A few shots are fixed by a `look`
// the code that spawned them sets: 1 disc (saw), 2 shard, 3 soul, 4 arrow (fusion volleys), 5 blade (Bladestorm).
// Shafts, fletching and blade bodies stay neutral steel and wood, so the silhouette reads the same whatever the element.
//
// SKIN comes from the elements the weapon carries, and from Starforge:
//   head    the head (or rim, or crystal) is the colour of the first element: frost blue, fire orange, storm yellow,
//           the Starforge star cyan (Starfall arrows, Return Orbit shards), steel when there is none
//   bands   every further element is a coloured band behind the head (a shard: across its middle)
//   trails  every element leaves its own trail, side by side: ice flecks, embers, a spark zigzag, star glints
// Discs wear their elements as arcs of the rim.
//
// One batched path per layer and skin, so a crowd of shots stays cheap. Nothing here knows about the run except the
// shot list; behaviors and traits can import it to draw their own shots (falling arrows, thrown discs).

const TAU = Math.PI * 2;

export const F_FROST = 1;
export const F_FIRE = 2;
export const F_STORM = 4;
export const F_STAR = 16;
const NONE = 8;                                        // no element: the steel skin
const KEYS = [NONE, F_FROST, F_FIRE, F_STORM, F_STAR];
const BITS = [F_FROST, F_FIRE, F_STORM, F_STAR];

const S_BLADE = 0;
const S_ARROW = 1;
const S_JAVELIN = 2;
const S_SHARD = 3;
const S_DISC = 4;
const S_SOUL = 5;
const SHOT_BY_NAME = { blade: S_BLADE, arrow: S_ARROW, javelin: S_JAVELIN, shard: S_SHARD, disc: S_DISC };
const SHOT_BY_BEHAVIOR = { projectile: S_ARROW, rod: S_JAVELIN, nova: S_SHARD, boomerang: S_DISC };
const SHOT_BY_LOOK = [-1, S_DISC, S_SHARD, S_SOUL, S_ARROW, S_BLADE];

const SKIN = {
  [F_FROST]: { head: '#8fd8ff', body: '#7fcfff', edge: '#ecf8ff', trail: '#cfeaff' },
  [F_FIRE]: { head: '#ff7a2e', body: '#ff8a2e', edge: '#ffd9a0', trail: '#ff9a3c' },
  [F_STORM]: { head: '#ffe066', body: '#ffd23a', edge: '#fffbe0', trail: '#ffd23a' },
  [F_STAR]: { head: '#7fe9ff', body: '#7fe9ff', edge: '#e6fbff', trail: '#bff4ff' },
  [NONE]: { head: '#d9dee8', body: '#e8ecf4', edge: '#ffffff', trail: null },
};
const SHAFT = '#c9b38a';
const FLETCH = '#ece6d4';
const STEEL = '#d9dee8';

// Geometry, in multiples of the shot's hit radius r. A shot is drawn centred on its position and pointing along (dx, dy).
const TIP = { [S_ARROW]: 2.6, [S_JAVELIN]: 3.4, [S_SHARD]: 2.2, [S_BLADE]: 2.4 };            // tip, ahead of the centre
const TAIL = { [S_ARROW]: 2.86, [S_JAVELIN]: 3.74, [S_SHARD]: 1.76, [S_BLADE]: 1.4 };          // where the trail starts, behind it
const BAND_AT = { [S_ARROW]: 0.9, [S_JAVELIN]: 1.0, [S_SHARD]: 0.3, [S_BLADE]: 0.4 };          // first band, along the axis
const BAND_HW = { [S_ARROW]: 0.9, [S_JAVELIN]: 1.1, [S_SHARD]: 0.6, [S_BLADE]: 0.8 };          // half the band's length across
const BAND_STEP = 0.8;

const elemCache = new WeakMap();                       // inst.tags -> element bits (tags are replaced when they change)
export function elemBits(inst) {
  if (!inst) return 0;
  const tags = inst.tags;
  if (!tags || !tags.set) return 0;
  let e = elemCache.get(tags);
  if (e === undefined) {
    e = (tags.set.has('frost') ? F_FROST : 0) | (tags.set.has('fire') ? F_FIRE : 0) | (tags.set.has('storm') ? F_STORM : 0);
    elemCache.set(tags, e);
  }
  return e;
}
const popcount = (n) => { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; };

// The skin bits a shot carries: its weapon's elements, plus the star on Starfall arrows and returning Return Orbit shards.
function bitsOf(p) {
  let m = elemBits(p.inst);
  if (p.fall || p.ret === 2) m |= F_STAR;
  return m;
}
const primaryOf = (m) => (m & F_STAR ? F_STAR : m & F_FROST ? F_FROST : m & F_FIRE ? F_FIRE : m & F_STORM ? F_STORM : NONE);

function weaponShape(def) {
  if (!def) return S_BLADE;
  let s = def._shot;
  if (s === undefined) {
    s = SHOT_BY_NAME[def.shot];
    if (s === undefined) s = SHOT_BY_BEHAVIOR[def.behavior];
    if (s === undefined) s = S_BLADE;
    def._shot = s;
  }
  return s;
}
function shapeOf(p) {
  const l = SHOT_BY_LOOK[p.look];
  return l >= 0 ? l : weaponShape(p.inst && p.inst.def);
}

// The part of the world in view; null draws every shot given (the arrows that fall from above are not in the pool).
let box = null;
const seen = (p) => box === null || (p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1);

// ---- neutral parts -----------------------------------------------------------------------------------------------

function drawShafts(ctx, list, shape) {
  const jav = shape === S_JAVELIN;
  ctx.lineCap = 'round';
  ctx.strokeStyle = SHAFT;
  ctx.lineWidth = jav ? 3 : 1.8;
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!seen(p) || shapeOf(p) !== shape) continue;
    const r = p.r;
    ctx.moveTo(p.x - p.dx * TAIL[shape] * r, p.y - p.dy * TAIL[shape] * r);
    ctx.lineTo(p.x + p.dx * TIP[shape] * r * 0.55, p.y + p.dy * TIP[shape] * r * 0.55);
  }
  ctx.stroke();
  if (!jav) {                                          // arrows: two short vanes at the tail
    ctx.strokeStyle = FLETCH;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!seen(p) || shapeOf(p) !== shape) continue;
      const r = p.r;
      const tx = p.x - p.dx * TAIL[shape] * r;
      const ty = p.y - p.dy * TAIL[shape] * r;
      const nx = -p.dy * r * 0.7;
      const ny = p.dx * r * 0.7;
      const bx = p.dx * r;
      const by = p.dy * r;
      ctx.moveTo(tx + bx, ty + by);
      ctx.lineTo(tx - bx * 0.3 + nx, ty - by * 0.3 + ny);
      ctx.moveTo(tx + bx, ty + by);
      ctx.lineTo(tx - bx * 0.3 - nx, ty - by * 0.3 - ny);
    }
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

// ---- heads, crystals and blades, one path per skin ------------------------------------------------------------------

function drawHeads(ctx, list, shape, key) {
  const jav = shape === S_JAVELIN;
  ctx.fillStyle = SKIN[key].head;
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!seen(p) || shapeOf(p) !== shape || primaryOf(bitsOf(p)) !== key) continue;
    const r = p.r;
    const hl = r * (jav ? 2.4 : 1.7);
    const hw = r * (jav ? 1.0 : 0.8);
    const tx = p.x + p.dx * TIP[shape] * r;
    const ty = p.y + p.dy * TIP[shape] * r;
    const bx = tx - p.dx * hl;
    const by = ty - p.dy * hl;
    const nx = -p.dy * hw;
    const ny = p.dx * hw;
    ctx.moveTo(tx, ty);
    if (jav) {                                         // a leaf blade
      ctx.lineTo(bx + p.dx * hl * 0.3 + nx, by + p.dy * hl * 0.3 + ny);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + p.dx * hl * 0.3 - nx, by + p.dy * hl * 0.3 - ny);
    } else {
      ctx.lineTo(bx + nx, by + ny);
      ctx.lineTo(bx - nx, by - ny);
    }
    ctx.closePath();
  }
  ctx.fill();
}

// Shards: a long crystal in the element's colour, a pale edge, a glint along its axis.
function drawCrystals(ctx, list, key) {
  const skin = SKIN[key];
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!seen(p) || shapeOf(p) !== S_SHARD || primaryOf(bitsOf(p)) !== key) continue;
    const L = p.r * TIP[S_SHARD];
    const W = p.r * 0.62 * 1.15;
    const ax = p.dx * L;
    const ay = p.dy * L;
    const nx = -p.dy * W;
    const ny = p.dx * W;
    ctx.moveTo(p.x + ax, p.y + ay);
    ctx.lineTo(p.x + ax * 0.25 + nx, p.y + ay * 0.25 + ny);
    ctx.lineTo(p.x - ax * 0.8 + nx * 0.5, p.y - ay * 0.8 + ny * 0.5);
    ctx.lineTo(p.x - ax * 0.8 - nx * 0.5, p.y - ay * 0.8 - ny * 0.5);
    ctx.lineTo(p.x + ax * 0.25 - nx, p.y + ay * 0.25 - ny);
    ctx.closePath();
  }
  ctx.fillStyle = skin.body;
  ctx.fill();
  ctx.strokeStyle = skin.edge;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.lineJoin = 'miter';
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!seen(p) || shapeOf(p) !== S_SHARD || primaryOf(bitsOf(p)) !== key) continue;
    ctx.moveTo(p.x + p.dx * p.r * 0.9 + p.r * 0.28, p.y + p.dy * p.r * 0.9);
    ctx.arc(p.x + p.dx * p.r * 0.9, p.y + p.dy * p.r * 0.9, p.r * 0.28, 0, TAU);
  }
  ctx.fill();
}

// Blades (Bladestorm, and any weapon with no shape): a small steel kite with an edge in the element's colour.
function drawBlades(ctx, list, key) {
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!seen(p) || shapeOf(p) !== S_BLADE || primaryOf(bitsOf(p)) !== key) continue;
    const r = p.r;
    const nx = -p.dy * r * 0.9;
    const ny = p.dx * r * 0.9;
    ctx.moveTo(p.x + p.dx * r * TIP[S_BLADE], p.y + p.dy * r * TIP[S_BLADE]);
    ctx.lineTo(p.x + nx, p.y + ny);
    ctx.lineTo(p.x - p.dx * r * 1.4, p.y - p.dy * r * 1.4);
    ctx.lineTo(p.x - nx, p.y - ny);
    ctx.closePath();
  }
  ctx.fillStyle = STEEL;
  ctx.fill();
  ctx.strokeStyle = key === NONE ? '#8d96a8' : SKIN[key].head;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.lineJoin = 'miter';
}

// ---- extra elements: bands across the shot, one stroke path per colour -------------------------------------------------

function drawBands(ctx, list, shape, bit) {
  ctx.strokeStyle = SKIN[bit].head;
  ctx.lineWidth = shape === S_JAVELIN ? 3 : 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!seen(p) || shapeOf(p) !== shape) continue;
    const m = bitsOf(p);
    const first = primaryOf(m);
    if (!(m & bit) || first === bit) continue;
    const idx = popcount((m & ~first) & (bit - 1));        // which band this is, counting back from the head
    const r = p.r;
    const along = (BAND_AT[shape] - idx * BAND_STEP) * r;
    const hw = BAND_HW[shape] * r;
    const cx = p.x + p.dx * along;
    const cy = p.y + p.dy * along;
    ctx.moveTo(cx - -p.dy * hw, cy - p.dx * hw);
    ctx.lineTo(cx + -p.dy * hw, cy + p.dx * hw);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
}

// ---- trails: every element its own, side by side ---------------------------------------------------------------------

function drawTrails(ctx, list, shape, bit) {
  const skin = SKIN[bit];
  ctx.fillStyle = skin.trail;
  ctx.strokeStyle = skin.trail;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const zig = bit === F_STORM;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!seen(p) || shapeOf(p) !== shape) continue;
    const m = bitsOf(p);
    if (!(m & bit)) continue;
    const r = p.r;
    const lane = (popcount(m & (bit - 1)) - (popcount(m) - 1) / 2) * r * 0.95;    // side by side with the other elements' trails
    const nx = -p.dy;
    const ny = p.dx;
    const tx = p.x - p.dx * TAIL[shape] * r + nx * lane;
    const ty = p.y - p.dy * TAIL[shape] * r + ny * lane;
    if (zig) {
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - p.dx * r * 1.2 + nx * r * 0.6, ty - p.dy * r * 1.2 + ny * r * 0.6);
      ctx.lineTo(tx - p.dx * r * 2.2 - nx * r * 0.6, ty - p.dy * r * 2.2 - ny * r * 0.6);
      ctx.lineTo(tx - p.dx * r * 3.2, ty - p.dy * r * 3.2);
    } else {
      const big = bit === F_FIRE ? 0.8 : bit === F_STAR ? 0.34 : 0.45;
      const n = bit === F_STAR ? 3 : 2;
      for (let k = 1; k <= n; k++) {
        const rr = r * big * (k === 1 ? 1 : 0.65);
        const cx = tx - p.dx * r * 1.5 * k;
        const cy = ty - p.dy * r * 1.5 * k;
        ctx.moveTo(cx + rr, cy);
        ctx.arc(cx, cy, rr, 0, TAU);
      }
    }
  }
  if (zig) ctx.stroke();
  else { ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1; }
  ctx.lineJoin = 'miter';
}

// ---- discs -----------------------------------------------------------------------------------------------------------

// A spinning disc: four steel blades and a hub; the rim is the element. With several elements the rim is split into one
// arc each, and turns with the disc. `mask` holds element bits (F_STAR for the Starforge cyan).
export function drawDisc(ctx, x, y, rad, spin, mask) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = STEEL;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const a = spin + (k * Math.PI) / 2;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.stroke();
  const rr = rad * 0.8;
  ctx.lineWidth = 2.6;
  const n = popcount(mask & 23);
  if (!n) {
    ctx.strokeStyle = '#8d96a8';
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, TAU);
    ctx.stroke();
  } else {
    let i = 0;
    for (const bit of BITS) {
      if (!(mask & bit)) continue;
      const a0 = spin * 0.5 + (i * TAU) / n;
      ctx.strokeStyle = SKIN[bit].head;
      ctx.beginPath();
      ctx.arc(x, y, rr, a0, a0 + TAU / n - (n > 1 ? 0.3 : 0));
      ctx.stroke();
      i++;
    }
  }
  ctx.fillStyle = '#aeb6c8';
  ctx.beginPath();
  ctx.arc(x, y, Math.max(3, rad * 0.2), 0, TAU);
  ctx.fill();
  ctx.lineCap = 'butt';
}

function drawSouls(ctx, list) {                        // souls (the Summoner's): a violet wisp with a fading tail
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!seen(p) || shapeOf(p) !== S_SOUL) continue;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#b48cff';
    ctx.beginPath();
    ctx.arc(p.x - p.dx * 9, p.y - p.dy * 9, 4, 0, TAU);
    ctx.arc(p.x - p.dx * 16, p.y - p.dy * 16, 2.5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#e4d6ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, TAU);
    ctx.fill();
  }
}

// Draws every shot in `list` (each { x, y, dx, dy, r, inst, look, fall, ret }) in the current `box`.
function drawList(ctx, list, time) {
  let present = 0;
  for (let i = 0; i < list.length; i++) if (seen(list[i])) present |= 1 << shapeOf(list[i]);
  if (!present) return;

  for (const shape of [S_ARROW, S_JAVELIN]) {
    if (!(present & (1 << shape))) continue;
    drawShafts(ctx, list, shape);
    for (const key of KEYS) drawHeads(ctx, list, shape, key);
  }
  if (present & (1 << S_SHARD)) for (const key of KEYS) drawCrystals(ctx, list, key);
  if (present & (1 << S_BLADE)) for (const key of KEYS) drawBlades(ctx, list, key);

  for (const shape of [S_ARROW, S_JAVELIN, S_SHARD, S_BLADE]) {
    if (!(present & (1 << shape))) continue;
    for (const bit of BITS) drawBands(ctx, list, shape, bit);
    for (const bit of BITS) drawTrails(ctx, list, shape, bit);
  }

  if (present & (1 << S_DISC)) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!seen(p) || shapeOf(p) !== S_DISC) continue;
      drawDisc(ctx, p.x, p.y, p.r * 1.4, time * 22 + i, bitsOf(p));
    }
  }
  if (present & (1 << S_SOUL)) drawSouls(ctx, list);
}

export function drawProjectiles(ctx, view, run) {
  const list = run.world.projectiles.active;
  if (list.length === 0) return;
  const cam = run.cam;
  box = { x0: cam.x - view.w / 2 - 20, x1: cam.x + view.w / 2 + 20, y0: cam.y - view.h / 2 - 20, y1: cam.y + view.h / 2 + 20 };
  drawList(ctx, list, run.time);
  box = null;
}

// Arrows that are not in the projectile pool: the Archer's Rain of Arrows and Starfall's falling arrows. `items` are
// { x, y, dx, dy, r, star } with (x, y) the arrow's centre; `star` gives the Starforge cyan head and star-glint trail.
const loose = [];
export function drawFallingArrows(ctx, items) {
  loose.length = 0;
  for (const a of items) loose.push({ x: a.x, y: a.y, dx: a.dx, dy: a.dy, r: a.r, inst: null, look: 4, fall: a.star ? 1 : 0, ret: 0 });
  box = null;
  drawList(ctx, loose, 0);
}
