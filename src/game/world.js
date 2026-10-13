// World: entity stores (fixed-capacity pools), the spatial hash, and scratch buffers.
// Capacities follow docs/architecture.md §3.2 / §7.1.

import { createPool } from '../core/pool.js';
import { createSpatialHash } from '../core/spatial-hash.js';

export const CAPS = { enemies: 600 };

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

export function createWorld() {
  return {
    enemies: createPool(makeEnemy, CAPS.enemies),
    hash: createSpatialHash({ cellSize: 64, tableSize: 4096, capacity: CAPS.enemies }),
    scratch: [],           // reusable query output
    tick: 0,
    nextUid: 1,
  };
}
