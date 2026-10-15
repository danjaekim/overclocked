// Collision (step 7): enemy <-> player contact, projectile <-> enemy hits.
// Uses the spatial hash built earlier in the same tick. Hits are queued, not applied here.

import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { damagePlayer } from './damage.js';
import { resolveHit } from '../game/hit.js';
import { hasHit, markHit, spawnSplit } from '../game/projectiles.js';

const RICOCHET_RANGE = 180;
const RICOCHET_TTL = 0.5;

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

// A spent projectile turns toward the nearest enemy it has not hit yet instead of dying.
function ricochet(run, pr) {
  const w = run.world;
  const n = w.hash.queryRadius(pr.x, pr.y, RICOCHET_RANGE + MAX_ENEMY_RADIUS, w.scratch);
  let best = null;
  let bestD = RICOCHET_RANGE * RICOCHET_RANGE;
  for (let i = 0; i < n; i++) {
    const o = w.scratch[i];
    if (!o.alive || hasHit(pr, o.uid)) continue;
    const dx = o.x - pr.x;
    const dy = o.y - pr.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = o; }
  }
  if (!best) return false;
  const d = Math.sqrt(bestD) || 1;
  const speed = Math.hypot(pr.vx, pr.vy);
  pr.dx = (best.x - pr.x) / d;
  pr.dy = (best.y - pr.y) / d;
  pr.vx = pr.dx * speed;
  pr.vy = pr.dy * speed;
  pr.bounce--;
  pr.pierce = 0;
  if (pr.ttl < RICOCHET_TTL) pr.ttl = RICOCHET_TTL;
  return true;
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

      resolveHit(run, pr.inst, e, pr.dmg, pr.dx, pr.dy, pr.depth);

      if (pr.split > 0) spawnSplit(run, pr, e);
      if (pr.pierce-- <= 0) {          // used up: pierce 0 stops on the first enemy
        if (pr.bounce > 0 && ricochet(run, pr)) break;
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
