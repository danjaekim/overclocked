// nova: when an enemy is in range, fires `count` projectiles evenly around a full circle, rotated
// by a random offset each volley. Shots are ordinary projectiles, so pierce, ricochet, split and
// on-hit statuses all work on them.

import { param } from '../game/weapon-params.js';
import { spawnProjectile } from '../game/projectiles.js';
import { attackTriggers } from '../game/triggers.js';
import { playerCtx } from '../game/fire-ctx.js';
import { activeMutation } from '../game/starforge.js';

const TAU = Math.PI * 2;
const isAlive = (o) => o.alive;

// One ring of `count` shots from (ctx.x, ctx.y). False when no enemy is within range of that point.
function fire(inst, run, ctx) {
  if (!run.world.hash.queryNearest(ctx.x, ctx.y, param(run, inst, 'range'), isAlive)) return false;
  const count = Math.max(1, Math.round(param(run, inst, 'count')));
  const dmg = param(run, inst, 'damage') * ctx.mult;
  const speed = param(run, inst, 'speed');
  const ttl = param(run, inst, 'ttl');
  const radius = param(run, inst, 'radius');
  const pierce = Math.floor(param(run, inst, 'pierce'));
  const off = run.rng.next() * TAU;
  const star = activeMutation(inst);
  for (let i = 0; i < count; i++) {
    const a = off + (i * TAU) / count;
    const pr = spawnProjectile(run, inst, ctx.x, ctx.y, Math.cos(a), Math.sin(a), speed, dmg, ttl, radius, pierce);
    if (pr === null) continue;
    pr.atk = ctx.atk;
    if (star) { pr.ret = 1; pr.pierce0 = pierce; pr.ttl0 = ttl; }      // Return Orbit: it turns at the end of its flight
  }
  ctx.ax = ctx.x;
  ctx.ay = ctx.y;
  ctx.aa = off;
  return true;
}

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'pierce', 'duration', 'projSpeed', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.4;
  },

  fire,

  update(inst, dt, run) {
    if (inst.manual) return;
    inst.cd -= dt;
    if (inst.cd > 0) return;
    const ctx = playerCtx(run.player);
    if (!fire(inst, run, ctx)) {
      inst.cd = 0;
      return;
    }
    inst.cd += param(run, inst, 'cooldown');
    attackTriggers(run, inst, ctx.ax, ctx.ay, ctx.aa);
  },
};
