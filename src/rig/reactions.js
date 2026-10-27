// Element reactions (docs/overclocked-spec.md, "Elements"). The compile step names a node's reaction from
// the order of its held element modifiers (rig/chain.js); this is what each one does. A reaction fires on
// the node's own direct hits (depth 0), so its shards and clouds cannot set each other off.
//
//   steam     fire then frost: a cloud where the attack hits. Enemies in it go blind and wander at 60% speed for 2 s
//   shatter   frost then fire: a chilled enemy that is hit bursts into shards that hit nearby enemies

import { ST } from '../data/statuses.js';
import { param } from '../game/weapon-params.js';
import { queueDamage, KIND_PROC, CAUSE } from '../systems/damage-queue.js';
import { addSteam } from '../systems/hazards.js';
import { addPuff } from '../render/fx.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';

export const STEAM = { radius: 55, ttl: 2.2, every: 0.5 };           // a node makes at most one cloud per `every` seconds
export const SHATTER = { radius: 62, frac: 0.6, shards: 6 };         // shard damage as a share of the weapon's hit

export function reactOnHit(run, node, inst, target) {
  if (node.reaction === 'steam') {
    if (run.time - inst.reactAt < STEAM.every) return;
    inst.reactAt = run.time;
    addSteam(run, inst, target.x, target.y, STEAM.radius, STEAM.ttl);
  } else if (node.reaction === 'shatter') {
    if (!target.alive || (target.status & (ST.CHILL | ST.FROZEN)) === 0) return;
    shatter(run, inst, target);
  }
}

function shatter(run, inst, target) {
  target.chill = 0;                                                  // the ice is spent
  target.chillT = 0;
  target.freezeT = 0;
  target.slowMul = 1;
  target.status &= ~(ST.CHILL | ST.FROZEN);
  const dmg = param(run, inst, 'damage') * SHATTER.frac;
  const w = run.world;
  const n = w.hash.queryRadius(target.x, target.y, SHATTER.radius + MAX_ENEMY_RADIUS, w.scratch);
  for (let i = 0; i < n; i++) {
    const e = w.scratch[i];
    if (e === target || !e.alive || e.prop === 1) continue;
    const dx = e.x - target.x;
    const dy = e.y - target.y;
    const rr = SHATTER.radius + e.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    const d = Math.hypot(dx, dy) || 1;
    queueDamage(run, e, dmg, false, (dx / d) * 40, (dy / d) * 40, 1, inst, KIND_PROC, CAUSE.SHATTER);
  }
  for (let k = 0; k < SHATTER.shards; k++) {                         // shards flying out
    const a = (k / SHATTER.shards) * Math.PI * 2 + target.uid;
    addPuff(run, target.x + Math.cos(a) * SHATTER.radius * 0.6, target.y + Math.sin(a) * SHATTER.radius * 0.6, 8, '#bfeaff');
  }
  addPuff(run, target.x, target.y, 16, '#ecf8ff');
}
