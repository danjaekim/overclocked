// orbit: `count` blades circle the player and damage whatever they touch every `tickEvery`
// seconds (scaled by the cooldown stat). Area scales orbit radius and blade size.

import { param } from '../game/weapon-params.js';
import { strike } from '../game/hit.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';

const TAU = Math.PI * 2;

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'projSpeed', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.angle = 0;
    inst.tick = 0.2;
    inst.blades = 1;
    inst.orbitR = 0;
    inst.bladeR = 0;
  },

  update(inst, dt, run) {
    const p = run.player;
    const count = Math.max(1, Math.round(param(run, inst, 'count')));
    inst.blades = count;
    inst.orbitR = param(run, inst, 'range');
    inst.bladeR = param(run, inst, 'radius');
    inst.angle = (inst.angle + param(run, inst, 'speed') * dt) % TAU;

    inst.tick -= dt;
    if (inst.tick > 0) return;
    inst.tick += inst.def.base.tickEvery * param(run, inst, 'cooldown');

    const dmg = param(run, inst, 'damage');
    const w = run.world;
    for (let b = 0; b < count; b++) {
      const a = inst.angle + (b * TAU) / count;
      const bx = p.x + Math.cos(a) * inst.orbitR;
      const by = p.y + Math.sin(a) * inst.orbitR;
      const n = w.hash.queryRadius(bx, by, inst.bladeR + MAX_ENEMY_RADIUS, w.scratch);
      for (let i = 0; i < n; i++) {
        const e = w.scratch[i];
        if (!e.alive) continue;
        const dx = e.x - bx;
        const dy = e.y - by;
        const rr = inst.bladeR + e.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        const ox = e.x - p.x;
        const oy = e.y - p.y;
        const od = Math.hypot(ox, oy) || 1;
        strike(run, inst, e, dmg, ox / od, oy / od);    // pushed away from the player
      }
    }
  },

  draw(inst, ctx, run) {
    const p = run.player;
    ctx.fillStyle = '#9fd8ff';
    ctx.beginPath();
    for (let b = 0; b < inst.blades; b++) {
      const a = inst.angle + (b * TAU) / inst.blades;
      const bx = p.x + Math.cos(a) * inst.orbitR;
      const by = p.y + Math.sin(a) * inst.orbitR;
      ctx.moveTo(bx + inst.bladeR, by);
      ctx.arc(bx, by, inst.bladeR, 0, TAU);
    }
    ctx.fill();
  },
};
