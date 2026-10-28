// Element reactions (docs/overclocked-spec.md, "Elements"). The compile step names a node's reaction from
// the order of its held element modifiers (rig/chain.js); this is what each one does. A reaction fires on
// the node's own direct hits (depth 0), so its shards and clouds cannot set each other off.
//
//   steam     fire then frost: a cloud where the attack hits. Enemies in it go blind and wander at 60% speed for 2 s
//   shatter   frost then fire: a chilled enemy that is hit cracks, then ice shards fly out and hit each enemy they reach
//   overload  fire then storm: a burning enemy that is hit explodes (its burn is spent), hitting its neighbours
//   plasma    storm then fire: a hit leaves burning ground that scorches whatever walks through it
//   static    storm then frost: a hit draws nearby enemies in together, setting up area attacks
//   superconduct  frost then storm: +75% crit chance on the weapon (set where the instance is built)
//   intensify_*   the same element twice: a stronger status (stat changes set where the instance is built)

import { ST } from '../data/statuses.js';
import { param } from '../game/weapon-params.js';
import { addSteam, addShatter, addBlast, addPatch, addVortex } from '../systems/hazards.js';
import { CAUSE } from '../systems/damage-queue.js';

export const STEAM = { radius: 55, ttl: 2.2, every: 0.5 };           // a node makes at most one cloud per `every` seconds
export const SHATTER = { radius: 62, frac: 0.35 };                     // shard damage as a share of the weapon's hit
export const OVERLOAD = { radius: 60, frac: 0.4, tele: 0.08 };       // the burst's damage as a share of the weapon's hit
export const PLASMA = { radius: 34, ttl: 2.2, tick: 0.5, frac: 0.3, every: 0.45 };
export const STATIC = { radius: 75, ttl: 1.1, pull: 70, every: 0.8 };
export const SUPERCONDUCT_CRIT = 0.75;
// The same element twice: stat modifiers on the weapon (see makeInstance in rig.js).
export const INTENSIFY = {
  fire: [{ stat: 'burnPower', op: 'inc', value: 1 }],
  frost: [{ stat: 'chillStacks', op: 'flat', value: 1 }],
  storm: [{ stat: 'chains', op: 'flat', value: 2 }],
};

export function reactOnHit(run, node, inst, target) {
  if (node.reaction === 'steam') {
    if (run.time - inst.reactAt < STEAM.every) return;
    inst.reactAt = run.time;
    addSteam(run, inst, target.x, target.y, STEAM.radius, STEAM.ttl);
  } else if (node.reaction === 'shatter') {
    if (!target.alive || (target.status & (ST.CHILL | ST.FROZEN)) === 0) return;
    shatter(run, inst, target);
  } else if (node.reaction === 'overload') {
    if (!target.alive || (target.status & ST.BURN) === 0) return;
    target.burnT = 0;                                                // the fire is spent in the blast
    target.status &= ~ST.BURN;
    addBlast(run, inst, target.x, target.y, OVERLOAD.radius, OVERLOAD.tele, param(run, inst, 'damage') * OVERLOAD.frac, 1, {}, CAUSE.OVERLOAD);
  } else if (node.reaction === 'plasma') {
    if (run.time - inst.reactAt < PLASMA.every) return;
    inst.reactAt = run.time;
    addPatch(run, inst, target.x, target.y, PLASMA.radius, PLASMA.ttl, PLASMA.tick, param(run, inst, 'damage') * PLASMA.frac, 1, false, 'burn', CAUSE.REACTION);
  } else if (node.reaction === 'static') {
    if (run.time - inst.reactAt < STATIC.every) return;
    inst.reactAt = run.time;
    addVortex(run, inst, target.x, target.y, STATIC.radius, STATIC.ttl, STATIC.pull, 0, 1);
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
