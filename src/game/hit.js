// Direct (non-projectile) hits: arc swings, orbiting blades and auras all deal damage through
// here, so crit, knockback and the damage queue behave exactly like projectile hits.

import { queueDamage } from '../systems/damage-queue.js';

export const KNOCKBACK_IMPULSE = 140;   // world units / second, scaled by the knockback stat and enemy size

// dx, dy: unit vector the enemy is pushed along.
export function strike(run, inst, e, dmg, dx, dy) {
  const stats = run.player.stats;
  const tags = inst.tags;
  const crit = run.rng.next() < stats.getFor('critChance', tags);
  const amount = dmg * (crit ? stats.getFor('critMult', tags) : 1);
  const kb = KNOCKBACK_IMPULSE * stats.getFor('knockback', tags) * (10 / e.r);
  queueDamage(run, e, amount, crit, dx * kb, dy * kb, 0, inst);
}
