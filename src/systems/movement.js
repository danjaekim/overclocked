// Projectile integration (step 5 of the tick). Enemies move in enemy-ai.js.

import { addPatch, plantRod, newChain, linkPatch } from './hazards.js';
import { param } from '../game/weapon-params.js';
import { spawnProjectile, turnBack } from '../game/projectiles.js';

// Seeking: curve toward the nearest enemy within 240, turning at most `homing` radians per second.
function seek(run, pr, dt) {
  const w = run.world;
  const n = w.hash.queryRadius(pr.x, pr.y, 240, w.scratch);
  let best = null;
  let bd = Infinity;
  for (let k = 0; k < n; k++) {
    const e = w.scratch[k];
    if (!e.alive || e.prop === 1) continue;
    const d = (e.x - pr.x) * (e.x - pr.x) + (e.y - pr.y) * (e.y - pr.y);
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) return;
  const sp = Math.hypot(pr.vx, pr.vy) || 1;
  const cur = Math.atan2(pr.vy, pr.vx);
  let d = Math.atan2(best.y - pr.y, best.x - pr.x) - cur;
  d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
  const turn = Math.max(-pr.homing * dt, Math.min(pr.homing * dt, d));
  pr.dx = Math.cos(cur + turn);
  pr.dy = Math.sin(cur + turn);
  pr.vx = pr.dx * sp;
  pr.vy = pr.dy * sp;
}

export function updateProjectiles(run, dt) {
  const store = run.world.projectiles;
  const list = store.active;
  for (let i = list.length - 1; i >= 0; i--) {
    const pr = list[i];
    if (pr.homing > 0) seek(run, pr, dt);
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.ttl -= dt;
    const tr = pr.inst && pr.inst.def.base.trail;          // Sunpiercer: the arrow leaves burning ground behind it
    if (tr && !pr.sub) {
      pr.trailD += Math.hypot(pr.vx, pr.vy) * dt;
      while (pr.trailD >= tr.every) {
        pr.trailD -= tr.every;
        linkPatch(addPatch(run, pr.inst, pr.x, pr.y, tr.radius, tr.ttl, tr.tick, param(run, pr.inst, 'damage') * tr.damageFrac, 0), pr.chain || (pr.chain = newChain()), pr.ci = (pr.ci || 0) + 1);
      }
    }
    if (pr.ttl <= 0 && pr.ret === 1) turnBack(run, pr);      // Return Orbit: turn around and fly back through the crowd
    if (pr.ttl <= 0) {
      plantRod(run, pr);
      const eb = !pr.sub && pr.inst && pr.inst.fusion && pr.inst.fusion.hooks.endBurst;     // Comet: a ring of ice shards at the last enemy it pierced
      if (eb) {
        const dmg = pr.dmg * eb.damageFrac;
        const bx = pr.hx === pr.hx ? pr.hx : pr.x;                // not off-screen where the arrow runs out
        const by = pr.hy === pr.hy ? pr.hy : pr.y;
        for (let k = 0; k < eb.count; k++) {
          const a = (k * Math.PI * 2) / eb.count;
          const c = spawnProjectile(run, pr.inst, bx, by, Math.cos(a), Math.sin(a), eb.speed, dmg, eb.ttl, 7, eb.pierce);
          if (c) { c.sub = true; c.depth = 1; }               // shards do not set off the arrow's own hit triggers (Comet's shatter)
        }
      }
      store.release(pr);
    }
  }
}

