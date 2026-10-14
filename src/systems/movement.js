// Projectile integration (step 5 of the tick). Enemies move in enemy-ai.js.

import { addPatch, nearestVortex } from './hazards.js';
import { param } from '../game/weapon-params.js';

export function updateProjectiles(run, dt) {
  const store = run.world.projectiles;
  const list = store.active;
  for (let i = list.length - 1; i >= 0; i--) {
    const pr = list[i];
    if (pr.inst && pr.inst.graft && pr.inst.graft.hooks.bend && run.hazards.length) {   // Eventide Volley: arrows curve toward a vortex
      const v = nearestVortex(run, pr.x, pr.y, 260);
      if (v) {
        const sp = Math.hypot(pr.vx, pr.vy) || 1;
        const want = Math.atan2(v.y - pr.y, v.x - pr.x);
        const cur = Math.atan2(pr.vy, pr.vx);
        let d = want - cur;
        d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
        const turn = Math.max(-7 * dt, Math.min(7 * dt, d));
        pr.vx = Math.cos(cur + turn) * sp;
        pr.vy = Math.sin(cur + turn) * sp;
      }
    }
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.ttl -= dt;
    const tr = pr.inst && pr.inst.def.base.trail;          // Sunpiercer: the arrow leaves burning ground behind it
    if (tr) {
      pr.trailD += Math.hypot(pr.vx, pr.vy) * dt;
      while (pr.trailD >= tr.every) {
        pr.trailD -= tr.every;
        addPatch(run, pr.inst, pr.x, pr.y, tr.radius, tr.ttl, tr.tick, param(run, pr.inst, 'damage') * tr.damageFrac, 0);
      }
    }
    if (pr.ttl <= 0) store.release(pr);
  }
}
