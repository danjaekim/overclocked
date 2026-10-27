// Element reactions (docs/overclocked-spec.md, "Elements"). The compile step names a node's reaction from
// the order of its held element modifiers (rig/chain.js); this is what each one does. A reaction fires on
// the node's own direct hits (depth 0), so its shards and clouds cannot set each other off.
//
//   steam     fire then frost: a cloud where the attack hits. Enemies in it go blind and wander at 60% speed for 2 s
//   shatter   frost then fire: a chilled enemy that is hit cracks, then ice shards fly out and hit each enemy they reach

import { ST } from '../data/statuses.js';
import { param } from '../game/weapon-params.js';
import { addSteam, addShatter } from '../systems/hazards.js';

export const STEAM = { radius: 55, ttl: 2.2, every: 0.5 };           // a node makes at most one cloud per `every` seconds
export const SHATTER = { radius: 62, frac: 0.6 };                     // shard damage as a share of the weapon's hit

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
  addShatter(run, inst, target.x, target.y, SHATTER.radius, param(run, inst, 'damage') * SHATTER.frac, target.uid);
}
