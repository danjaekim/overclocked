// Projectile spawning and helpers. The projectile store lives in world.js.

export function spawnProjectile(run, inst, x, y, dx, dy, speed, dmg, ttl, radius, pierce) {
  const pr = run.world.projectiles.acquire();
  if (!pr) return null;
  pr.inst = inst;
  pr.x = x;
  pr.y = y;
  pr.dx = dx;
  pr.dy = dy;
  pr.vx = dx * speed;
  pr.vy = dy * speed;
  pr.r = radius;
  pr.ttl = ttl;
  pr.dmg = dmg;
  pr.pierce = pierce;
  pr.nh = 0;
  return pr;
}

// Hit-set: a small fixed ring of enemy uids this projectile has already damaged.
export function hasHit(pr, uid) {
  const n = pr.nh < pr.hits.length ? pr.nh : pr.hits.length;
  for (let i = 0; i < n; i++) if (pr.hits[i] === uid) return true;
  return false;
}

export function markHit(pr, uid) {
  pr.hits[pr.nh % pr.hits.length] = uid;
  pr.nh++;
}
