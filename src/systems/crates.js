// Supply crates: sparse breakable props that drop a little help (data/crates.js).
// A crate is an entity in the enemy pool with `prop === 1` (data/enemies.js PROPS), so every weapon
// hits it like an enemy, but damage.js hands its death to `breakCrate` instead of the kill path:
// no kill count, no xp, no on-kill triggers, no lifesteal. Weapons never aim at one (the spatial
// hash's aiming query skips props).

import { CRATES } from '../data/crates.js';
import { ORES } from '../data/ores.js';
import { xpToNext } from '../game/xp.js';
import { spawnEnemy } from '../game/director.js';
import { spawnGem, spawnOre, spawnHeal, spawnMagnet, KIND_GEM, KIND_ORE } from './pickups.js';
import { addPuff } from '../render/fx.js';

export function liveCrates(run) {
  let n = 0;
  const list = run.world.enemies.active;
  for (let i = 0; i < list.length; i++) if (list[i].prop === 1) n++;
  return n;
}

// Just past the left or right view edge (the view is tall and narrow), at the least crowded of a few
// random spots. Returns the crate, or null if two are already out there.
export function spawnCrate(run, at = null) {
  if (!at && liveCrates(run) >= CRATES.maxActive) return null;
  let x;
  let y;
  if (at) {
    x = at.x;
    y = at.y;
  } else {
    const pl = CRATES.placement;
    const w = run.world;
    const p = run.player;
    const half = run.view.w / 2;
    let bestCrowd = Infinity;
    for (let i = 0; i < pl.candidates; i++) {
      const side = run.rng.next() < 0.5 ? -1 : 1;
      const cx = p.x + side * (half + pl.edgeMin + run.rng.next() * (pl.edgeMax - pl.edgeMin));
      const cy = p.y + (run.rng.next() * 2 - 1) * pl.maxDy;
      const crowd = w.hash.queryRadius(cx, cy, 80, w.scratch);
      if (crowd < bestCrowd) { bestCrowd = crowd; x = cx; y = cy; }
    }
  }
  const e = spawnEnemy(run, 'crate', x, y);
  if (e) e.aiCd = CRATES.ttl;
  return e;
}

// The weights of one roll: a heal counts for more the lower your hp, and not at all at full health.
export function lootWeights(run) {
  const L = CRATES.loot;
  const p = run.player;
  let heal = 0;
  if (p.hp < p.maxHp) {
    heal = L.heal.weight;
    const f = p.hp / p.maxHp;
    for (const [below, mult] of CRATES.hurt) if (f <= below) { heal *= mult; break; }
  }
  let magnet = 0;
  let loose = 0;
  const ground = run.world.pickups.active;
  for (let i = 0; i < ground.length; i++) if (ground[i].kind === KIND_GEM || ground[i].kind === KIND_ORE) loose++;
  if (loose >= L.magnet.minOnGround) magnet = L.magnet.weight;
  return { heal, xp: L.xp.weight, ore: L.ore.weight, magnet };
}

export function rollLoot(run) {
  const w = lootWeights(run);
  let r = run.rng.next() * (w.heal + w.xp + w.ore + w.magnet);
  if ((r -= w.heal) < 0) return 'heal';
  if ((r -= w.xp) < 0) return 'xp';
  if ((r -= w.ore) < 0) return 'ore';
  return 'magnet';
}

// A crate was broken: drop its loot where it stood (a heart, xp gems, ore, or a magnet).
export function breakCrate(run, e) {
  const L = CRATES.loot;
  const x = e.x;
  const y = e.y;
  const what = rollLoot(run);
  if (what === 'heal') {
    spawnHeal(run, x, y, L.heal.frac);
  } else if (what === 'magnet') {
    spawnMagnet(run, x, y);
  } else if (what === 'xp') {
    const value = Math.max(2, Math.round(xpToNext(run.player.level) * L.xp.perGem));
    for (let k = 0; k < L.xp.gems; k++) {
      const a = (k / L.xp.gems) * Math.PI * 2 + run.rng.next();
      spawnGem(run, x + Math.cos(a) * 14, y + Math.sin(a) * 14, value);
    }
  } else {
    spawnOre(run, x, y, L.ore.type, L.ore.amount);
  }
  addPuff(run, x, y, e.r, '#d8b070');
  addPuff(run, x, y, e.r * 0.6, '#fff1d6');
  run.sfx('crate');
  run.world.enemies.release(e);
  return what;
}
