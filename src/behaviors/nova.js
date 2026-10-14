// nova: when an enemy is in range, fires `count` projectiles evenly around a full circle, rotated
// by a random offset each volley. Shots are ordinary projectiles, so pierce, ricochet, split and
// on-hit statuses all work on them.

import { param } from '../game/weapon-params.js';
import { spawnProjectile } from '../game/projectiles.js';
import { attackTriggers } from '../game/triggers.js';

const TAU = Math.PI * 2;
const isAlive = (o) => o.alive;

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'pierce', 'duration', 'projSpeed', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.4;
  },

  update(inst, dt, run) {
    inst.cd -= dt;
    if (inst.cd > 0) return;
    const p = run.player;
    if (!run.world.hash.queryNearest(p.x, p.y, param(run, inst, 'range'), isAlive)) {
      inst.cd = 0;
      return;
    }
    const count = Math.max(1, Math.round(param(run, inst, 'count')));
    const dmg = param(run, inst, 'damage');
    const speed = param(run, inst, 'speed');
    const ttl = param(run, inst, 'ttl');
    const radius = param(run, inst, 'radius');
    const pierce = Math.floor(param(run, inst, 'pierce'));
    const off = run.rng.next() * TAU;
    for (let i = 0; i < count; i++) {
      const a = off + (i * TAU) / count;
      spawnProjectile(run, inst, p.x, p.y, Math.cos(a), Math.sin(a), speed, dmg, ttl, radius, pierce);
    }
    inst.cd += param(run, inst, 'cooldown');
    attackTriggers(run, inst, p.x, p.y, off);
  },
};
