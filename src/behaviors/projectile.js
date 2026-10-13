// projectile: fires `count` shots in a fan at the nearest enemy in range.
// All per-shot numbers come from the weapon's base params combined with stats via param().

import { param } from '../game/weapon-params.js';
import { spawnProjectile } from '../game/projectiles.js';

const isAlive = (o) => o.alive;

export default {
  // stats this behavior reads (used later to avoid offering useless upgrades)
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'pierce', 'duration', 'projSpeed', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.25;                        // first shot almost immediately
  },

  update(inst, dt, run) {
    inst.cd -= dt;
    if (inst.cd > 0) return;

    const p = run.player;
    const range = param(run, inst, 'range');
    const target = run.world.hash.queryNearest(p.x, p.y, range, isAlive);
    if (!target) {                          // nothing to shoot: stay ready, don't bank a burst
      inst.cd = 0;
      return;
    }

    const count = Math.max(1, Math.round(param(run, inst, 'count')));
    const spread = inst.def.base.spread;
    const base = Math.atan2(target.y - p.y, target.x - p.x);
    const dmg = param(run, inst, 'damage');
    const speed = param(run, inst, 'speed');
    const ttl = param(run, inst, 'ttl');
    const radius = param(run, inst, 'radius');
    const pierce = Math.floor(param(run, inst, 'pierce'));

    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * spread;
      spawnProjectile(run, inst, p.x, p.y, Math.cos(a), Math.sin(a), speed, dmg, ttl, radius, pierce);
    }
    inst.cd += param(run, inst, 'cooldown');
  },
};
