// pulse: rings of light that expand from you (Halo Pulse, Radiant Pulse). Every `cooldown` seconds a
// ring leaves you and grows to `range`, hitting each enemy once as its edge reaches it. `count` rings
// (the projectiles stat adds more) leave 0.2 s apart. The ring is the weapon's own attack: real hits.
// docs/design-m30-m33.md §4.2.

import { param } from '../game/weapon-params.js';
import { addRing } from '../systems/hazards.js';
import { attackTriggers } from '../game/triggers.js';

const RING_GAP = 0.2;

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.4;
    inst.queued = [];                       // seconds until each extra ring of the current pulse leaves
    inst.auraR = 0;
  },

  update(inst, dt, run) {
    const p = run.player;
    inst.auraR = param(run, inst, 'range');
    for (let i = inst.queued.length - 1; i >= 0; i--) {
      inst.queued[i] -= dt;
      if (inst.queued[i] <= 0) { inst.queued.splice(i, 1); this.ring(inst, run); }
    }
    inst.cd -= dt;
    if (inst.cd > 0) return;
    inst.cd += param(run, inst, 'cooldown');
    const n = Math.max(1, Math.round(param(run, inst, 'count')));
    this.ring(inst, run);
    for (let i = 1; i < n; i++) inst.queued.push(RING_GAP * i);
    attackTriggers(run, inst, p.x, p.y, 0);
  },

  ring(inst, run) {
    const b = inst.def.base;
    const p = run.player;
    addRing(run, inst, p.x, p.y, param(run, inst, 'range'), b.speed, param(run, inst, 'damage'), 0,
      { follow: true, direct: true, thick: b.thick || 5, color: b.color || '#ffe28a' });
  },
};
