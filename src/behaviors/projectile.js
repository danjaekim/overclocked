// projectile: fires `count` shots at the nearest enemy in range as a tight volley: a small angular
// `spread` plus a sideways `gap` between shots, so extra projectiles keep hitting a lone target
// instead of fanning past it (balance finding, docs/roadmap.md M9).
// All per-shot numbers come from the weapon's base params combined with stats via param().

import { param } from '../game/weapon-params.js';
import { spawnProjectile } from '../game/projectiles.js';
import { attackTriggers } from '../game/triggers.js';
import { activeMutation } from '../game/starforge.js';

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
    const gap = inst.def.base.gap || 0;
    const base = Math.atan2(target.y - p.y, target.x - p.x);
    const dmg = param(run, inst, 'damage');
    const speed = param(run, inst, 'speed');
    const ttl = param(run, inst, 'ttl');
    const radius = param(run, inst, 'radius');
    const pierce = Math.floor(param(run, inst, 'pierce'));

    const star = activeMutation(inst);                      // Starforge: every Nth volley is one huge comet
    inst.volley = (inst.volley || 0) + 1;
    if (star && inst.volley % star.every === 0) {
      const dx = Math.cos(base);
      const dy = Math.sin(base);
      const c = spawnProjectile(run, inst, p.x, p.y, dx, dy, speed, dmg * count * star.damage, ttl, radius * star.size, 999);
      if (c) { c.look = 4; c.bounce = 0; c.split = 0; c.big = new Set(); c.aux = dmg * count * star.damage; }          // the comet remembers every enemy it has hit, so a dense pile is hit once each
      inst.cd += param(run, inst, 'cooldown');
      attackTriggers(run, inst, target.x, target.y, base);
      return;
    }
    for (let i = 0; i < count; i++) {
      const k = i - (count - 1) / 2;
      const a = base + k * spread;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      // sideways offset perpendicular to the aim (-dy, dx)
      spawnProjectile(run, inst, p.x - dy * k * gap, p.y + dx * k * gap, dx, dy, speed, dmg, ttl, radius, pierce);
    }
    inst.cd += param(run, inst, 'cooldown');
    attackTriggers(run, inst, target.x, target.y, base);
  },
};
