// Collision: enemy <-> player contact (projectile <-> enemy joins in M3).
// Uses the spatial hash built earlier in the same tick.

import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { damagePlayer } from './damage.js';

export function updateCollision(run) {
  const w = run.world;
  const p = run.player;
  const n = w.hash.queryRadius(p.x, p.y, p.r + MAX_ENEMY_RADIUS, w.scratch);
  let worst = 0;
  for (let i = 0; i < n; i++) {
    const e = w.scratch[i];
    if (!e.alive) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const rr = p.r + e.r;
    if (dx * dx + dy * dy <= rr * rr && e.damage > worst) worst = e.damage;
  }
  if (worst > 0) damagePlayer(run, worst);
}
