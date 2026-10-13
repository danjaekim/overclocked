// Pickups: XP gems for now (ore and shrines join later). Gems drop where enemies die, are
// pulled to the player once inside the pickup radius, and are collected on contact.
// When the pool is full a new gem merges into the gem farthest from the player, so no XP is lost.

import { GEM } from '../data/progression.js';
import { gainXp } from '../game/xp.js';

export function gemTier(value) {
  let t = 0;
  for (let i = 0; i < GEM.tiers.length; i++) if (value >= GEM.tiers[i][0]) t = i;
  return t;
}

export function spawnGem(run, x, y, value) {
  const store = run.world.pickups;
  let g = store.acquire();
  if (!g) {
    const p = run.player;
    let far = null;
    let farD2 = -1;
    const list = store.active;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const d2 = (c.x - p.x) * (c.x - p.x) + (c.y - p.y) * (c.y - p.y);
      if (d2 > farD2) { farD2 = d2; far = c; }
    }
    if (far) {
      far.value += value;
      far.r = GEM.tiers[gemTier(far.value)][1];
    }
    return far;
  }
  g.x = x;
  g.y = y;
  g.value = value;
  g.r = GEM.tiers[gemTier(value)][1];
  g.magnet = false;
  g.speed = GEM.baseMagnet;
  return g;
}

export function updatePickups(run, dt) {
  const p = run.player;
  const store = run.world.pickups;
  const list = store.active;
  const radius = p.stats.get('pickupRadius');
  const radius2 = radius * radius;
  const xpGain = p.stats.get('xpGain');

  for (let i = list.length - 1; i >= 0; i--) {
    const g = list[i];
    let dx = p.x - g.x;
    let dy = p.y - g.y;
    let d2 = dx * dx + dy * dy;
    if (!g.magnet && d2 <= radius2) g.magnet = true;

    if (g.magnet) {
      g.speed = Math.min(g.speed + GEM.accel * dt, GEM.maxSpeed);
      const d = Math.sqrt(d2);
      if (d > 1e-3) {
        const step = Math.min(g.speed * dt, d);
        g.x += (dx / d) * step;
        g.y += (dy / d) * step;
        dx = p.x - g.x;
        dy = p.y - g.y;
        d2 = dx * dx + dy * dy;
      }
    }

    const rr = p.r + g.r;
    if (d2 <= rr * rr) {
      gainXp(run, g.value * xpGain);
      store.release(g);
    }
  }
}
