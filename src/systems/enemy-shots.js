// Slinger shots: slow straight bolts aimed at where the player stood when they were thrown, so a
// moving player dodges them. A shot that reaches the player while they are in their post-hit
// invulnerability passes through instead of being wasted.

import { damagePlayer } from './damage.js';

export function spawnEnemyShot(run, e) {
  const r = e.def.ranged;
  const p = run.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  run.enemyShots.push({
    x: e.x, y: e.y, vx: (dx / d) * r.shotSpeed, vy: (dy / d) * r.shotSpeed,
    ttl: r.shotTtl, r: r.shotR, dmg: r.shotDamage * (run.director ? run.director.damageScale : 1),
  });
}

export function updateEnemyShots(run, dt) {
  const list = run.enemyShots;
  if (list.length === 0) return;
  const p = run.player;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.ttl -= dt;
    let dead = s.ttl <= 0;
    if (!dead) {
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const rr = p.r + s.r;
      if (dx * dx + dy * dy <= rr * rr && p.iframes <= 0) {
        damagePlayer(run, s.dmg);
        dead = true;
      }
    }
    if (dead) {
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}
