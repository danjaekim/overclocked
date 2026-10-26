// Weapon hits. Projectile collisions and direct hits (arc swings, orbiting blades, auras) all
// resolve through resolveHit, so crit, knockback and the damage queue behave identically.

import { queueDamage, KIND_HIT } from '../systems/damage-queue.js';
import { ST } from '../data/statuses.js';
import { classHit } from './class-traits.js';

export const KNOCKBACK_IMPULSE = 140;   // world units / second, scaled by the knockback stat and enemy size

// base: damage before crit. (dx, dy): unit vector the enemy is pushed along.
export function resolveHit(run, inst, e, base, dx, dy, depth = 0) {
  const stats = run.player.stats;
  const tags = inst.tags;
  let crit = run.rng.next() < stats.getFor('critChance', tags);
  let mult = 1;
  // Superconduct (frost + storm alloy): a chilled AND shocked target is always crit
  const sc = run.rules.superconduct;
  const both = sc !== undefined && (e.status & ST.SHOCK) !== 0 && (e.status & (ST.CHILL | ST.FROZEN)) !== 0;
  if (both) crit = true;
  if (crit) mult = stats.getFor('critMult', tags) + (both ? sc.bonus : 0);
  const lh = stats.getFor('lowHpDamage', tags);        // Whirlwind Cleaver: stronger the closer you are to death
  if (lh > 0) {
    const p = run.player;
    const f = (1 - p.hp / p.maxHp) / 0.75;
    mult *= 1 + lh * (f < 0 ? 0 : f > 1 ? 1 : f);
  }
  if (run.trait !== undefined) mult *= classHit(run, e, depth);   // Long Shot, Heavy Blows (game/class-traits.js)
  const amount = base * mult;
  const kb = KNOCKBACK_IMPULSE * stats.getFor('knockback', tags) * (10 / e.r);
  queueDamage(run, e, amount, crit, dx * kb, dy * kb, depth, inst, KIND_HIT);
}

export const strike = resolveHit;
