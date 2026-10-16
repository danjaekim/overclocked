// World: entity stores (fixed-capacity pools), the spatial hash, and scratch buffers.
// Capacities follow docs/architecture.md §3.2 / §7.1.

import { createPool } from '../core/pool.js';
import { createSpatialHash } from '../core/spatial-hash.js';
import { createDamageQueue } from '../systems/damage-queue.js';

export const CAPS = { enemies: 600, projectiles: 800, pickups: 600, fx: 400 };

function makeEnemy() {
  return {
    uid: 0, defId: '', def: null,
    x: 0, y: 0, r: 10,
    hp: 1, maxHp: 1, speed: 0, damage: 0,
    sx: 0, sy: 0,          // separation push (refreshed every other tick)
    kx: 0, ky: 0,          // knockback velocity, decays
    flash: 0,              // hit flash seconds left
    ai: 0, aiT: 0,         // boss state machine: 0 chase, 1 windup, 2 dash; seconds left in it
    ax: 0, ay: 0,          // boss dash direction
    aiCd: 0,               // seconds until the next charge
    prop: 0,               // 1 = a breakable prop (a supply crate), not an enemy: weapons do not aim at it (data/enemies.js PROPS)
    elite: 0, affix: '', affix2: '',   // elites (data/elites.js): flag and affix ids (the second only late in the run)
    wardT: 0,              // seconds a Shaman's ward still covers this enemy (takes half damage)
    lastHitT: 0,           // run.time of the last damage taken (regenerating elites)
    // status effects (systems/status.js)
    status: 0,             // bit flags, data/statuses.js ST (0 = untouched: skipped everywhere)
    burnDps: 0, burnT: 0, burnAcc: 0, burnSrc: null,
    chill: 0, chillT: 0, freezeT: 0, freezeImm: 0,
    shockT: 0,
    slowMul: 1,            // movement multiplier from chill
    sunderT: 0, blessT: 0, stunT: 0, // armour stripped / marked for extra damage, seconds left (effects/index.js)
    armor: 0,              // flat damage taken off every non-DoT hit (data/enemies.js armor, scaled with hp)
  };
}

function makeProjectile() {
  return {
    inst: null,
    x: 0, y: 0, dx: 0, dy: 0, vx: 0, vy: 0,
    r: 4, ttl: 0, dmg: 0, pierce: 0,
    hx: NaN, hy: NaN,                            // where the last enemy it hit stood (a rod plants there)
    sub: false, depth: 0, trailD: 0,             // distance since the last trail patch (weapons with base.trail)
    bounce: 0, split: 0, splitFrac: 0.4,   // ricochet / split perks, read at spawn
    look: 0,                                // how it is drawn: 0 streak, 1 spinning saw disc, 2 shard (graft payload shots), 3 soul (Summoner)
    hits: new Int32Array(16), nh: 0,    // uids already hit
    fall: 0,                            // Starforge Starfall: each enemy this arrow hits calls a star down (1) or not (0)
  };
}

function makePickup() {
  return { kind: 0, ore: 'iron', x: 0, y: 0, r: 4, value: 1, magnet: false, speed: 0 };   // kind 0 = xp gem, 1 = ore, 2 = chest (value = tier: 0 elite, 1 boss), 3 = heart (value = share of max hp)
}

function makeFx() {
  return { kind: 0, x: 0, y: 0, vx: 0, vy: 0, x2: 0, y2: 0, ttl: 0, maxTtl: 1, r: 0, text: '', crit: false };
}

export function createWorld() {
  return {
    enemies: createPool(makeEnemy, CAPS.enemies),
    projectiles: createPool(makeProjectile, CAPS.projectiles),
    pickups: createPool(makePickup, CAPS.pickups),
    fx: createPool(makeFx, CAPS.fx),
    hash: createSpatialHash({ cellSize: 64, tableSize: 4096, capacity: CAPS.enemies }),
    dmg: createDamageQueue(),
    scratch: [],           // reusable query output
    tick: 0,
    nextUid: 1,
    fxNumbers: 0,          // live floating damage numbers (capped in render/fx.js)
  };
}
