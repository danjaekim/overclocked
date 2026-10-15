// trail: a wake of ground you leave behind as you move (Frost Wake, Steam Wake). Every `spacing` units
// walked drops a patch under you; standing still drops one every `cooldown` seconds, so the weapon
// never goes dead. A patch is the weapon's own attack: each tick is a real weapon hit (crit, status
// chances, hit triggers, graft payloads). docs/design-m30-m33.md §4.1.

import { param } from '../game/weapon-params.js';
import { addPatch } from '../systems/hazards.js';
import { attackTriggers } from '../game/triggers.js';

export default {
  uses: ['damage', 'cooldown', 'area', 'duration', 'critChance', 'critMult', 'knockback'],

  init(inst, run) {
    inst.lastX = run.player.x;
    inst.lastY = run.player.y;
    inst.moved = 0;
    inst.cd = 0.3;
  },

  update(inst, dt, run) {
    const p = run.player;
    inst.moved += Math.hypot(p.x - inst.lastX, p.y - inst.lastY);
    inst.lastX = p.x;
    inst.lastY = p.y;
    inst.cd -= dt;
    const spacing = inst.def.base.spacing;
    if (inst.moved < spacing && inst.cd > 0) return;
    inst.moved = inst.moved >= spacing ? inst.moved - spacing : inst.moved;
    inst.cd = param(run, inst, 'cooldown');
    const b = inst.def.base;
    addPatch(run, inst, p.x, p.y, param(run, inst, 'radius'), param(run, inst, 'ttl'), b.tick * (param(run, inst, 'cooldown') / b.cooldown), param(run, inst, 'damage'), 0, false, null, undefined, true, b.look);
    attackTriggers(run, inst, p.x, p.y, 0);
  },
};
