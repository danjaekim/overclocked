// Class traits (data/classes.js `trait`): one signature mechanic per class that works with whatever
// weapons you hold, so the same build plays differently on another class.
//   Archer    longShot   hits deal more damage the farther the target (game/hit.js); dodge (systems/damage.js)
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

const NO_TRAIT = {};

// A weapon-like instance the trait's own damage is credited to. Never in player.weapons.
function standIn(id, name, tags) {
  return {
    instanceId: id, weaponId: '', level: 1, enhance: 0,
    def: { name, behavior: 'trait', rarity: 'trait', base: {}, triggers: [], tags },
    tags: makeTags(tags), instanceTag: `trait:${id}`,
    extraTriggers: [], addTags: [], affixes: [], graft: null, trigT: [],
  };
}

export function initClassTrait(run, classId) {
  const t = (CLASSES[classId] && CLASSES[classId].trait) || NO_TRAIT;
  run.trait = t;
  run.cls = {
    frenzy: 0, frenzyT: 0,                           // Bloodlust stacks and seconds left on them
    hurtT: -1e9,                                     // run.time you were last hit (Arcane Ward recharges after a quiet spell)
    novaT: t.nova ? t.nova.every * 0.6 : 0,          // seconds to the next Holy Nova
    inst: t.nova ? standIn(-1, 'Holy Nova', ['light', 'magic'])
      : t.souls ? standIn(-2, 'Soul Harvest', ['summon', 'magic'])
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
