// Projectile integration (step 5 of the tick). Enemies move in enemy-ai.js.

import { addPatch, nearestVortex, plantRod } from './hazards.js';
import { param } from '../game/weapon-params.js';
import { spawnProjectile } from '../game/projectiles.js';
import { strike } from '../game/hit.js';
import { MUTATIONS, STARFORGE } from '../data/starforge.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { addPuff } from '../render/fx.js';

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
    if (tr && !pr.sub) {
      pr.trailD += Math.hypot(pr.vx, pr.vy) * dt;
      while (pr.trailD >= tr.every) {
        pr.trailD -= tr.every;
        addPatch(run, pr.inst, pr.x, pr.y, tr.radius, tr.ttl, tr.tick, param(run, pr.inst, 'damage') * tr.damageFrac, 0);
      }
    }
    if (pr.ttl <= 0) {
      plantRod(run, pr);
      if (pr.look === 4) cometBurst(run, pr);                // Starforge comet: it bursts where it ends
      const eb = !pr.sub && pr.inst && pr.inst.graft && pr.inst.graft.hooks.endBurst;     // Comet: a ring of ice shards at the last enemy it pierced
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

// The Comet Volley burst: a ring of damage at the last enemy the comet passed (or where it ran out).
function cometBurst(run, pr) {
  const m = MUTATIONS.projectile;
  const bx = pr.hx === pr.hx ? pr.hx : pr.x;
  const by = pr.hy === pr.hy ? pr.hy : pr.y;
  const w = run.world;
  const n = w.hash.queryRadius(bx, by, m.burstRadius + MAX_ENEMY_RADIUS, w.scratch);
  for (let i = 0; i < n; i++) {
    const e = w.scratch[i];
    if (!e.alive) continue;
    const dx = e.x - bx;
    const dy = e.y - by;
    const rr = m.burstRadius + e.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    const d = Math.hypot(dx, dy) || 1;
    strike(run, pr.inst, e, pr.dmg * m.burstFrac, dx / d, dy / d, 1);
  }
  addPuff(run, bx, by, m.burstRadius * 0.8, STARFORGE.color);
  addPuff(run, bx, by, m.burstRadius * 0.45, STARFORGE.light);
}
