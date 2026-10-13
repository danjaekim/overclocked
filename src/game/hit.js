// Weapon hits. Projectile collisions and direct hits (arc swings, orbiting blades, auras) all
// resolve through resolveHit, so crit, knockback and the damage queue behave identically.

import { queueDamage, KIND_HIT } from '../systems/damage-queue.js';

export const KNOCKBACK_IMPULSE = 140;   // world units / second, scaled by the knockback stat and enemy size

// base: damage before crit. (dx, dy): unit vector the enemy is pushed along.
export function resolveHit(run, inst, e, base, dx, dy) {
  const stats = run.player.stats;
  const tags = inst.tags;
  const crit = run.rng.next() < stats.getFor('critChance', tags);
  const amount = base * (crit ? stats.getFor('critMult', tags) : 1);
  const kb = KNOCKBACK_IMPULSE * stats.getFor('knockback', tags) * (10 / e.r);
  queueDamage(run, e, amount, crit, dx * kb, dy * kb, 0, inst, KIND_HIT);
}

export const strike = resolveHit;
