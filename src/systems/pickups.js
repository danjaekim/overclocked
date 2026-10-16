// Pickups: XP gems (kind 0) and ore (kind 1). Gems drop where enemies die, are
// pulled to the player once inside the pickup radius, and are collected on contact.
// When the pool is full a new gem merges into the gem farthest from the player, so no XP is lost.

import { GEM } from '../data/progression.js';
import { gainXp } from '../game/xp.js';
import { ORES } from '../data/ores.js';
import { addPuff } from '../render/fx.js';

export const KIND_GEM = 0;
export const KIND_ORE = 1;
export const KIND_CHEST = 2;
export const KIND_HEAL = 3;

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
      if (c.kind !== KIND_GEM) continue;          // only gems merge
      const d2 = (c.x - p.x) * (c.x - p.x) + (c.y - p.y) * (c.y - p.y);
      if (d2 > farD2) { farD2 = d2; far = c; }
    }
    if (far) {
      far.value += value;
      far.r = GEM.tiers[gemTier(far.value)][1];
    }
    return far;
  }
  g.kind = KIND_GEM;
  g.x = x;
  g.y = y;
  g.value = value;
  g.r = GEM.tiers[gemTier(value)][1];
  g.magnet = false;
  g.speed = GEM.baseMagnet;
  return g;
}

// A chest (value = tier: 0 elite, 1 boss). It never magnetises or expires; touching it queues it
// for game.js to open. If the pool is full it is queued directly so it can never be lost.
export function spawnChest(run, x, y, tier) {
  const g = run.world.pickups.acquire();
  if (!g) {
    run.pendingChests.push(tier);
    return null;
  }
  g.kind = KIND_CHEST;
  g.x = x;
  g.y = y;
  g.value = tier;
  g.r = 13;
  g.magnet = false;
  g.speed = 0;
  return g;
}

// A heart (value = share of max hp). It waits on the ground until you are hurt: at full health it is
// neither pulled in nor taken, so a heal is never wasted, and it never expires. If the pool is full it
// heals straight away.
export function spawnHeal(run, x, y, frac) {
  const g = run.world.pickups.acquire();
  if (!g) {
    healPlayer(run, frac);
    return null;
  }
  g.kind = KIND_HEAL;
  g.x = x;
  g.y = y;
  g.value = frac;
  g.r = 10;
  g.magnet = false;
  g.speed = GEM.baseMagnet;
  return g;
}

export function healPlayer(run, frac) {
  const p = run.player;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + p.maxHp * frac);
  return p.hp - before;
}

function bankOre(run, type, amount) {
  if (ORES[type].bank === 'starsteel') run.starsteel += amount;
  else run.ore += amount;
}

// Ore never merges: if the pool is full it is banked directly so nothing is lost.
export function spawnOre(run, x, y, type, amount = 1) {
  const o = ORES[type];
  const g = run.world.pickups.acquire();
  if (!g) {
    bankOre(run, type, amount);
    return null;
  }
  g.kind = KIND_ORE;
  g.ore = type;
  g.x = x;
  g.y = y;
  g.value = amount;
  g.r = o.r;
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
    if (g.kind === KIND_HEAL && p.hp >= p.maxHp) continue;     // a heart is saved for when you need it
    if (g.kind !== KIND_CHEST && !g.magnet && d2 <= radius2) g.magnet = true;

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
      if (g.kind === KIND_CHEST) { run.pendingChests.push(g.value); run.sfx('chest'); }
      else if (g.kind === KIND_ORE) { bankOre(run, g.ore, g.value); run.sfx('ore'); }
      else if (g.kind === KIND_HEAL) {
        healPlayer(run, g.value);
        addPuff(run, p.x, p.y, p.r * 1.4, '#7dff9a');
        run.sfx('heal');
      }
      else { gainXp(run, g.value * xpGain); run.sfx('gem'); }
      store.release(g);
    }
  }
}
