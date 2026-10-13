// Collision (step 7): enemy <-> player contact, projectile <-> enemy hits.
// Uses the spatial hash built earlier in the same tick. Hits are queued, not applied here.

import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { damagePlayer } from './damage.js';
import { resolveHit } from '../game/hit.js';
import { hasHit, markHit } from '../game/projectiles.js';

function playerContact(run) {
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

function projectileHits(run) {
  const w = run.world;
  const list = w.projectiles.active;

  for (let i = list.length - 1; i >= 0; i--) {
    const pr = list[i];
    const n = w.hash.queryRadius(pr.x, pr.y, pr.r + MAX_ENEMY_RADIUS, w.scratch);
    for (let k = 0; k < n; k++) {
      const e = w.scratch[k];
      if (!e.alive) continue;
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      const rr = pr.r + e.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (hasHit(pr, e.uid)) continue;
      markHit(pr, e.uid);

      resolveHit(run, pr.inst, e, pr.dmg, pr.dx, pr.dy);

      if (pr.pierce-- <= 0) {          // used up: pierce 0 stops on the first enemy
        w.projectiles.release(pr);
        break;
      }
    }
  }
}

export function updateCollision(run) {
  playerContact(run);
  projectileHits(run);
}
