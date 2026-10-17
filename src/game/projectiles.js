import { MUTATIONS } from '../data/starforge.js';

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
  pr.fall = 0;
  pr.ret = 0;
  pr.pierce0 = 0;
  pr.ttl0 = 0;
  pr.hx = pr.hy = NaN;
  pr.trailD = 0;
  pr.chain = 0;
  pr.ci = 0;
  pr.sub = false;                  // a secondary projectile: no trail, no end burst
  pr.look = 0;
  pr.depth = 0;                    // trigger depth its hits resolve at (fusion payload shots use 1: they never fire payloads)
  const stats = run.player.stats;
  pr.bounce = Math.round(stats.getFor('ricochet', inst.tags));
  pr.split = Math.round(stats.getFor('split', inst.tags));
  pr.splitFrac = stats.getFor('splitDamage', inst.tags);
  return pr;
}

// Starforge Return Orbit (nova): a shard at the end of its flight, or spent on a hit, turns round and flies
// back to the player at reduced damage, with its pierce and hit-set renewed. It only turns once.
export function turnBack(run, pr) {
  const p = run.player;
  const sp = Math.hypot(pr.vx, pr.vy) || 1;
  const dx = p.x - pr.x;
  const dy = p.y - pr.y;
  const d = Math.hypot(dx, dy) || 1;
  pr.ret = 2;
  pr.dx = dx / d;
  pr.dy = dy / d;
  pr.vx = pr.dx * sp;
  pr.vy = pr.dy * sp;
  pr.ttl = d / sp + 0.12;
  pr.dmg *= MUTATIONS.nova.frac;
  pr.pierce = pr.pierce0;
  pr.nh = 0;
}

const SPLIT_STEP = 0.44;       // radians between split shots

// Children of a split: weaker, short-lived, never split or bounce themselves, and they skip the
// enemy the parent just hit.
export function spawnSplit(run, parent, hitEnemy) {
  const n = parent.split;
  parent.split = 0;
  const base = Math.atan2(parent.dy, parent.dx);
  const speed = Math.hypot(parent.vx, parent.vy);
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * SPLIT_STEP;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const c = spawnProjectile(run, parent.inst, hitEnemy.x, hitEnemy.y, dx, dy, speed, parent.dmg * parent.splitFrac,
      0.5, parent.r * 0.8, 0);
    if (!c) return;
    c.bounce = 0;
    c.split = 0;
    markHit(c, hitEnemy.uid);
  }
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
