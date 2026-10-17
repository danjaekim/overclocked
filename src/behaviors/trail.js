// trail: a wake of ground you leave behind as you move (Frost Wake, Steam Wake). Every `spacing` units
// walked drops a patch under you; standing still drops one every `cooldown` seconds, so the weapon
// never goes dead. A patch is the weapon's own attack: each tick is a real weapon hit (crit, status
// chances, hit triggers, graft payloads). docs/design-m30-m33.md §4.1.

import { param } from '../game/weapon-params.js';
import { addPatch, addRing, newChain, linkPatch } from '../systems/hazards.js';
import { attackTriggers } from '../game/triggers.js';
import { activeMutation } from '../game/starforge.js';

export default {
  uses: ['damage', 'cooldown', 'area', 'duration', 'critChance', 'critMult', 'knockback'],

  init(inst, run) {
    inst.lastX = run.player.x;
    inst.lastY = run.player.y;
    inst.moved = 0;
    inst.cd = 0.3;
    inst.drops = 0;
    inst.chain = 0;                        // visual: patches dropped in a run of movement are drawn as one ribbon
    inst.chainN = 0;
    inst.dropX = inst.dropY = 0;
    inst.beacons = [];                     // Aurora Wake: { x, y, t, left } rings still to send
  },

  update(inst, dt, run) {
    const p = run.player;
    const au = inst.graft && inst.graft.hooks.aurora;
    if (au && inst.beacons.length) beaconStep(inst, dt, run, au);
    inst.moved += Math.hypot(p.x - inst.lastX, p.y - inst.lastY);
    inst.lastX = p.x;
    inst.lastY = p.y;
    inst.cd -= dt;
    const spacing = inst.def.base.spacing;
    if (inst.moved < spacing && inst.cd > 0) return;
    inst.moved = inst.moved >= spacing ? inst.moved - spacing : inst.moved;
    inst.cd = param(run, inst, 'cooldown');
    const b = inst.def.base;
    const patch = addPatch(run, inst, p.x, p.y, param(run, inst, 'radius'), param(run, inst, 'ttl'), b.tick * (param(run, inst, 'cooldown') / b.cooldown), param(run, inst, 'damage'), 0, false, null, undefined, true, b.look);
    if (patch) {
      if (!inst.chain || Math.hypot(p.x - inst.dropX, p.y - inst.dropY) > spacing * 2.5) { inst.chain = newChain(); inst.chainN = 0; }
      inst.dropX = p.x;
      inst.dropY = p.y;
      linkPatch(patch, inst.chain, ++inst.chainN);
    }
    const star = activeMutation(inst);
    if (patch && star) patch.pulse = star;                    // Pulse Wake: read when the patch is about to end
    if (au) {                                                 // Aurora Wake: the wake blesses, and every nth patch is a beacon
      if (patch) patch.bless = true;
      if (++inst.drops % au.every === 0) inst.beacons.push({ x: p.x, y: p.y, t: 0, left: au.rings });
    }
    attackTriggers(run, inst, p.x, p.y, 0);
  },
};

// Aurora Wake: each beacon sends `rings` rings of light from where it was laid, `gap` s apart.
function beaconStep(inst, dt, run, au) {
  for (let i = inst.beacons.length - 1; i >= 0; i--) {
    const bc = inst.beacons[i];
    bc.t -= dt;
    if (bc.t > 0) continue;
    bc.t += au.gap;
    addRing(run, inst, bc.x, bc.y, au.range * run.player.stats.getFor('area', inst.tags), au.speed, param(run, inst, 'damage') * au.damageFrac, 0,
      { status: 'bless', heal: au.heal, color: '#ffe9a0', thick: 5 });
    if (--bc.left <= 0) inst.beacons.splice(i, 1);
  }
}
