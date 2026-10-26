// Class traits (data/classes.js `trait`): one signature mechanic per class that works with whatever
// weapons you hold, so the same build plays differently on another class.
//   Archer    longShot   hits deal more damage the farther the target (game/hit.js); dodge (systems/damage.js);
//             rain       Rain of Arrows: a volley falls on the thickest knot of enemies, if you hold a ranged weapon
//   Smith     heavyBlows direct hits may stagger; staggered enemies take more damage (game/hit.js)
//   Berserker frenzy     kills stack attack speed for a few seconds (game/weapon-params.js reads it)
//   Summoner  souls      kills release a soul that flies at the nearest enemy
//   Saint     nova       a ring of light bursts from you every few seconds
//   Mage      ward       a shield that refills after a few seconds without being hit (the rest is stat modifiers)
// State lives in run.cls, plain data, so run snapshots keep it.
// Damage from the soul and the nova is credited to a stand-in weapon instance, so it shows in the
// damage breakdown under its own name and scales with your damage and crit like any weapon.

import { CLASSES } from '../data/classes.js';
import { makeTags } from '../stats/stats.js';
import { addRing } from '../systems/hazards.js';
import { spawnProjectile } from './projectiles.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { param } from './weapon-params.js';
import { resolveHit } from './hit.js';
import { addPuff, addBurst, BURST_PLAIN } from '../render/fx.js';
import { drawFallingArrows } from '../render/shots.js';

const NO_TRAIT = {};

// A weapon-like instance the trait's own damage is credited to. Never in player.weapons.
function standIn(id, name, tags) {
  return {
    instanceId: id, weaponId: '', level: 1, enhance: 0,
    def: { name, behavior: 'trait', rarity: 'trait', base: {}, triggers: [], tags },
    tags: makeTags(tags), instanceTag: `trait:${id}`,
    extraTriggers: [], addTags: [], affixes: [], fusion: null, trigT: [],
  };
}

export function initClassTrait(run, classId) {
  const t = (CLASSES[classId] && CLASSES[classId].trait) || NO_TRAIT;
  run.trait = t;
  run.cls = {
    frenzy: 0, frenzyT: 0,                           // Bloodlust stacks and seconds left on them
    hurtT: -1e9,                                     // run.time you were last hit (Arcane Ward recharges after a quiet spell)
    novaT: t.nova ? t.nova.every * 0.6 : 0,          // seconds to the next Holy Nova
    rainT: t.rain ? t.rain.every * 0.5 : 0,           // seconds to the next Rain of Arrows
    rain: [],                                        // arrows still falling { x, y, t, d, dmg, r }
    inst: t.nova ? standIn(-1, 'Holy Nova', ['light', 'magic'])
      : t.souls ? standIn(-2, 'Soul Harvest', ['summon', 'magic'])
        : t.rain ? standIn(-3, 'Rain of Arrows', ['projectile', 'ranged', 'physical'])
          : null,
  };
}

// Berserker: the cooldown multiplier from Frenzy stacks (1 when none).
export function frenzyMult(run) {
  const f = run.trait.frenzy;
  return f && run.cls.frenzy > 0 ? 1 - f.per * run.cls.frenzy : 1;
}

// Step 3b of the tick: timers.
export function updateClassTrait(run, dt) {
  const t = run.trait;
  const c = run.cls;
  if (t.frenzy && c.frenzy > 0 && (c.frenzyT -= dt) <= 0) { c.frenzy = 0; c.frenzyT = 0; }
  if (t.rain) rainStep(run, dt);
  if (t.ward && run.time - c.hurtT >= t.ward.delay && run.player.shield < t.ward.amount) run.player.shield = t.ward.amount;
  if (t.nova && (c.novaT -= dt) <= 0) {
    const n = t.nova;
    c.novaT += n.every;
    const stats = run.player.stats;
    const dmg = (n.base + n.perLevel * run.player.level) * stats.getFor('damage', c.inst.tags);
    const r = n.radius * stats.getFor('area', c.inst.tags);
    addRing(run, c.inst, run.player.x, run.player.y, r, n.speed, dmg, 0, { follow: true, status: 'bless', heal: n.heal, thick: 7, color: '#fff3b0', kb: 90 });
  }
}

// Archer: Rain of Arrows. Every `every` s, if you hold a ranged weapon, `arrows` arrows (+`perProj` for each extra
// projectile that weapon fires) fall on the thickest knot of enemies within its range. Each lands at a random spot
// within `spread` of the knot's centre and hits what is within `radius` of it for `frac` x that weapon's damage, so
// the rain grows with the weapon's damage, its projectile count and your area.
function rainStep(run, dt) {
  const r = run.trait.rain;
  const c = run.cls;
  if (c.rain.length) {
    for (let i = c.rain.length - 1; i >= 0; i--) {
      const a = c.rain[i];
      if ((a.t -= dt) > 0) continue;
      c.rain.splice(i, 1);
      landArrow(run, a);
    }
  }
  if ((c.rainT -= dt) > 0) return;
  const w = rangedWeapon(run);
  if (!w) { c.rainT = 0.5; return; }                // no ranged weapon: no rain (try again shortly)
  const p = run.player;
  const range = Math.min(param(run, w, 'range') || 300, r.reach);
  const knot = thickest(run, p.x, p.y, range, r.spread);
  if (!knot) { c.rainT = 0.3; return; }
  c.rainT = r.every;
  const stats = p.stats;
  const area = stats.getFor('area', w.tags);
  const extra = Math.max(0, Math.round(stats.getFor('projectiles', w.tags)));
  const n = Math.min(r.max, r.arrows + r.perProj * extra);
  const dmg = param(run, w, 'damage') * r.frac;
  const spread = r.spread * area;
  for (let k = 0; k < n; k++) {
    const ang = run.rng.next() * Math.PI * 2;
    const dist = Math.sqrt(run.rng.next()) * spread;
    c.rain.push({ x: knot.x + Math.cos(ang) * dist, y: knot.y + Math.sin(ang) * dist, t: r.delay + k * r.stagger, d: r.delay + k * r.stagger, dmg, r: r.radius * area });
  }
}

// The ranged weapon the rain is drawn from: the one that hits hardest.
function rangedWeapon(run) {
  let best = null;
  let bd = 0;
  for (const w of run.player.weapons) {
    if (!w.tags.set.has('ranged')) continue;
    const d = param(run, w, 'damage');
    if (d > bd) { bd = d; best = w; }
  }
  return best;
}

// The enemy (among up to 24 sampled within range) with the most others within `spread` of it, nearer knots
// preferred (a knot at the edge of range counts half): the rain covers what is closing in on you, and the gems
// it drops land where you can reach them.
function thickest(run, x, y, range, spread) {
  const w = run.world;
  const n = w.hash.queryRadius(x, y, range, w.scratch);
  if (!n) return null;
  const step = Math.max(1, Math.floor(n / 24));
  let best = null;
  let bc = -1;
  const s2 = spread * spread;
  for (let i = 0; i < n; i += step) {
    const a = w.scratch[i];
    if (!a.alive || a.prop === 1) continue;
    let cnt = 0;
    for (let j = 0; j < n; j++) {
      const b = w.scratch[j];
      if (b.alive && (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y) <= s2) cnt++;
    }
    const score = cnt * (1 - 0.5 * Math.min(1, Math.hypot(a.x - x, a.y - y) / range));
    if (score > bc) { bc = score; best = a; }
  }
  return best ? { x: best.x, y: best.y } : null;
}

function landArrow(run, a) {
  const w = run.world;
  const n = w.hash.queryRadius(a.x, a.y, a.r + MAX_ENEMY_RADIUS, w.scratch);
  for (let i = 0; i < n; i++) {
    const e = w.scratch[i];
    if (!e.alive) continue;
    const dx = e.x - a.x;
    const dy = e.y - a.y;
    const rr = a.r + e.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    const d = Math.hypot(dx, dy) || 1;
    resolveHit(run, run.cls.inst, e, a.dmg, dx / d * 0.3, dy / d * 0.3, 1);    // depth 1: the rain sets off no on-hit chains of its own
  }
  addBurst(run, a.x, a.y, a.r, '#e9c48a', BURST_PLAIN, '#fff3d6');
}

// Falling arrows: a shadow on the ground that tightens, and the arrow dropping onto it (the shared arrow shape, render/shots.js).
const dropping = [];
export function drawClassTrait(ctx, run) {
  const c = run.cls;
  if (!c || !c.rain || !c.rain.length) return;
  dropping.length = 0;
  for (const a of c.rain) {
    const u = 1 - a.t / a.d;                                 // 0 loosed .. 1 landing
    ctx.globalAlpha = 0.2 + 0.35 * u;
    ctx.fillStyle = '#3a2a18';
    ctx.beginPath();
    ctx.ellipse(a.x, a.y, a.r * (1 - 0.5 * u), a.r * 0.5 * (1 - 0.5 * u), 0, 0, Math.PI * 2);
    ctx.fill();
    const h = 140 * (1 - u);
    const tipX = a.x - 6 * (1 - u) + 3;
    const tipY = a.y - h;
    const dx = 3 / 22.2;
    const dy = 22 / 22.2;
    dropping.push({ x: tipX - dx * 8.3, y: tipY - dy * 8.3, dx, dy, r: 3.2, star: false });
  }
  ctx.globalAlpha = 1;
  drawFallingArrows(ctx, dropping);
}

// Called for every enemy death with the weapon that killed it (null for some world deaths).
export function onClassKill(run, src, x, y) {
  const t = run.trait;
  const c = run.cls;
  if (t.frenzy) {
    if (c.frenzy < t.frenzy.max) c.frenzy++;
    c.frenzyT = t.frenzy.time;
  }
  if (t.souls && src && src !== c.inst) soul(run, t.souls, x, y);
}

// Summoner: a soul leaves the body for one of the enemies closest to YOU (a guardian, so the kills,
// and the gems, stay near you). It picks at random among the nearest few so a burst of kills spreads.
const near = [];
function soul(run, s, x, y) {
  const w = run.world;
  const inst = run.cls.inst;
  let live = 0;
  const list = w.projectiles.active;
  for (let i = 0; i < list.length; i++) if (list[i].inst === inst) live++;
  if (live >= s.max) return;
  const p = run.player;
  const n = w.hash.queryRadius(p.x, p.y, s.range + MAX_ENEMY_RADIUS, w.scratch);
  near.length = 0;
  for (let i = 0; i < n; i++) {
    const o = w.scratch[i];
    if (!o.alive || o.prop === 1) continue;
    const d = (o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y);
    if (d > s.range * s.range) continue;
    let k = near.length;
    while (k > 0 && near[k - 1].d > d) k--;
    if (k < 4) { near.splice(k, 0, { o, d }); if (near.length > 4) near.pop(); }
  }
  if (!near.length) return;
  const t = near[Math.floor(run.rng.next() * near.length)].o;
  const dx = t.x - x;
  const dy = t.y - y;
  const d = Math.hypot(dx, dy) || 1;
  const dmg = (s.base + s.perLevel * p.level) * p.stats.getFor('damage', inst.tags);
  const ttl = Math.min(1.6, d / s.speed + 0.25);
  const pr = spawnProjectile(run, inst, x, y, dx / d, dy / d, s.speed, dmg, ttl, 7, 0);
  if (!pr) return;
  pr.sub = true;
  pr.look = 3;
}

// Archer and Smith: per-hit effects, called from resolveHit for every weapon hit.
// Returns the damage multiplier (Long Shot); may stagger the target (Heavy Blows).
export function classHit(run, e, depth) {
  const t = run.trait;
  let mult = 1;
  if (t.longShot) {
    const ls = t.longShot;
    const p = run.player;
    const f = (Math.hypot(e.x - p.x, e.y - p.y) - ls.near) / (ls.far - ls.near);
    if (f > 0) mult = 1 + ls.bonus * (f > 1 ? 1 : f);
  }
  if (t.heavyBlows) {
    const hb = t.heavyBlows;
    if (e.stunT > 0) mult *= 1 + hb.vsStunned;                // crush the staggered (any stagger: slams, quakes, Millstone...)
    if (depth === 0 && run.rng.next() < hb.chance) {
      const v = e.def.boss ? hb.stun * 0.5 : hb.stun;
      if (v > e.stunT) e.stunT = v;
    }
  }
  return mult;
}
