// World: entity stores (fixed-capacity pools), the spatial hash, and scratch buffers.
// Capacities follow docs/architecture.md §3.2 / §7.1.

import { createPool } from '../core/pool.js';
import { createSpatialHash } from '../core/spatial-hash.js';
import { createDamageQueue } from '../systems/damage-queue.js';

export const CAPS = { enemies: 600, projectiles: 800, fx: 400 };

function makeEnemy() {
  return {
    uid: 0, defId: '', def: null,
    x: 0, y: 0, r: 10,
    hp: 1, maxHp: 1, speed: 0, damage: 0,
    sx: 0, sy: 0,          // separation push (refreshed every other tick)
    kx: 0, ky: 0,          // knockback velocity, decays
    flash: 0,              // hit flash seconds left
  };
}

function makeProjectile() {
  return {
    inst: null,
    x: 0, y: 0, dx: 0, dy: 0, vx: 0, vy: 0,
    r: 4, ttl: 0, dmg: 0, pierce: 0,
    hits: new Int32Array(16), nh: 0,    // uids already hit
  };
}

function makeFx() {
  return { kind: 0, x: 0, y: 0, vx: 0, vy: 0, ttl: 0, maxTtl: 1, r: 0, text: '', crit: false };
}

export function createWorld() {
  return {
    enemies: createPool(makeEnemy, CAPS.enemies),
    projectiles: createPool(makeProjectile, CAPS.projectiles),
    fx: createPool(makeFx, CAPS.fx),
    hash: createSpatialHash({ cellSize: 64, tableSize: 4096, capacity: CAPS.enemies }),
    dmg: createDamageQueue(),
    scratch: [],           // reusable query output
    tick: 0,
    nextUid: 1,
    fxNumbers: 0,          // live floating damage numbers (capped in render/fx.js)
  };
}
