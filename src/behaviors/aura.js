// aura: a ring around the player that damages every enemy inside it once per cooldown.

import { param } from '../game/weapon-params.js';
import { drawAxeSpin } from '../render/melee.js';
import { drawEmberWard } from '../render/auras.js';
import { elementOf } from '../render/elements.js';
import { strike } from '../game/hit.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { attackTriggers } from '../game/triggers.js';
import { activeMutation } from '../game/starforge.js';
import { addRing } from '../systems/hazards.js';
import { STARFORGE } from '../data/starforge.js';

const PULSE_TIME = 0.25;

export default {
  uses: ['damage', 'cooldown', 'area', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.3;
    inst.pulse = 0;
    inst.auraR = 0;
    inst.wave = 0;
  },

  update(inst, dt, run) {
    const p = run.player;
    inst.auraR = param(run, inst, 'range');
    if (inst.pulse > 0) inst.pulse -= dt;
    const star = activeMutation(inst);
    if (star) {                                            // Shockwave: a ring that rolls out to twice the aura's radius
      inst.wave = (inst.wave || 0) - dt;
      if (inst.wave <= 0) {
        inst.wave = star.every;
        addRing(run, inst, p.x, p.y, inst.auraR * star.reach, inst.auraR * star.speed, param(run, inst, 'damage') * star.frac, 0,
          { follow: true, color: STARFORGE.color, thick: 7, kb: 90 });
      }
    }
    inst.cd -= dt;
    if (inst.cd > 0) return;
    inst.cd += param(run, inst, 'cooldown');
    inst.pulse = PULSE_TIME;

    const dmg = param(run, inst, 'damage');
    const w = run.world;
    const n = w.hash.queryRadius(p.x, p.y, inst.auraR + MAX_ENEMY_RADIUS, w.scratch);
    for (let i = 0; i < n; i++) {
      const e = w.scratch[i];
      if (!e.alive) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const rr = inst.auraR + e.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      const d = Math.hypot(dx, dy) || 1;
      strike(run, inst, e, dmg, dx / d, dy / d);
    }
    attackTriggers(run, inst, p.x, p.y, 0);
  },

  draw(inst, ctx, run) {
    const p = run.player;
    const el = elementOf(inst);
    if (inst.def.base.spin) {                              // Whirlwind Cleaver: a ring of blades turning around you
      drawAxeSpin(ctx, p, run.time * 9, inst.auraR, 3, inst.pulse > 0, el);
      return;
    }
    drawEmberWard(ctx, p, inst.auraR, run.time, inst.pulse > 0 ? 1 - inst.pulse / PULSE_TIME : -1, inst.def.base.range > 100, el);
  },
};
