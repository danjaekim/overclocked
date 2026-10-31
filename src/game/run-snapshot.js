// Run snapshots: a run frozen into plain JSON and thawed back, so a paused run survives closing the app.
//
// The run is a graph of plain objects, arrays, Maps, Sets and typed arrays with shared references
// (hazards point at weapon instances, enemies at their burn source, ...). The encoder walks that
// graph from the run, writes every object once into a node table and replaces references with node
// ids. Three kinds of thing are not copied:
//   * static data (weapon, enemy, perk defs, masterwork hooks ...) is written as a path into the
//     data modules and resolved again on load, so identity with the shipped data is kept;
//   * pooled entities (enemies, projectiles, pickups) are re-acquired from the new run's pools in
//     their original order, so `pool.active` iterates exactly as before;
//   * visuals (the fx pool, damage numbers) and per-tick scratch (the spatial hash, damage queue)
//     are dropped; the hash is rebuilt on load.
// Closures hold the rest of the state and have explicit hooks: the rngs (getState/setState), the
// director (getState/setState) and the player's StatBlock (rebuilt from its modifier lists).
// A function anywhere else in the graph throws, so a new closure cannot silently lose state.
//
// The chain rig (rig/rig.js) is not copied: it is rebuilt from run.rigState on load (rig/editor.js), which also makes its
// weapon instances again. The graph refers to those instances (projectiles, burning enemies), so they are written as
// their index in run.rig.insts and pointed at the rebuilt ones afterwards. What the rig held in flight (queued payloads,
// Echo's second shots, the activation timers) starts over; each chain's battery is kept.
//
// Saved at pause time, which is always between ticks, so nothing is half-applied.

import { createOverclockedRun } from './ovrun.js';
import { applyRig } from './sandbox.js';
import { migrateRig } from '../rig/editor.js';
import { removeRig } from '../rig/rig.js';
import { StatBlock } from '../stats/stats.js';
import { STATS } from '../stats/stat-defs.js';
import { CONDITIONS } from '../stats/conditions.js';
import { getInstanceCounter, setInstanceCounter } from './weapons.js';

import * as classes from '../data/classes.js';
import * as elites from '../data/elites.js';
import * as enemies from '../data/enemies.js';
import * as evolutions from '../data/evolutions.js';
import * as forge from '../data/forge.js';
import * as fusions from '../data/fusions.js';
import * as ores from '../data/ores.js';
import * as passives from '../data/passives.js';
import * as perks from '../data/perks.js';
import * as progression from '../data/progression.js';
import * as rarities from '../data/rarities.js';
import * as starforge from '../data/starforge.js';
import * as resonance from '../data/resonance.js';
import * as crates from '../data/crates.js';
import * as statuses from '../data/statuses.js';
import * as titles from '../data/titles.js';
import * as waves from '../data/waves.js';
import * as weapons from '../data/weapons.js';

// Bump when the encoding changes; an older snapshot is then dropped instead of misread.
export const SNAPSHOT_FORMAT = 2;

const DATA = { crates, classes, elites, enemies, evolutions, forge, fusions, ores, passives, perks, progression, rarities, resonance, starforge, statuses, titles, waves, weapons };
const POOLS = ['enemies', 'projectiles', 'pickups'];       // entity pools that are saved (fx is visual only)
const SKIP_TOP = new Set(['view', 'debug', 'sfx', 'world', 'rng', 'fxRng', 'director', 'rig', 'discover']);

let registry = null;                                         // static data object -> path

function buildRegistry() {
  const map = new Map();
  const walk = (o, path) => {
    if (!o || typeof o !== 'object' || map.has(o)) return;
    map.set(o, path);
    const keys = Array.isArray(o) ? o.keys() : Object.keys(o);
    for (const k of keys) walk(o[k], [...path, k]);
  };
  for (const [mod, ns] of Object.entries(DATA)) {
    for (const k of Object.keys(ns)) walk(ns[k], [mod, k]);
  }
  return map;
}

function resolvePath(path) {
  let o = DATA[path[0]];
  for (let i = 1; i < path.length; i++) {
    if (o == null) throw new Error(`snapshot: missing data ${path.join('.')}`);
    o = o[path[i]];
  }
  if (o == null || typeof o !== 'object') throw new Error(`snapshot: missing data ${path.join('.')}`);
  return o;
}

const TYPED = { Int32Array, Uint8Array, Uint16Array, Float32Array, Float64Array };

export function snapshotRun(run) {
  if (!registry) registry = buildRegistry();
  const w = run.world;
  const poolOf = new Map();
  for (const name of POOLS) for (const o of w[name].active) poolOf.set(o, name);

  const nodes = [];
  const ids = new Map();
  const trail = [];
  const instIdx = new Map();                                 // a rig weapon instance -> its index in run.rig.insts
  if (run.rig) run.rig.insts.forEach((inst, i) => instIdx.set(inst, i));

  function val(v) {
    switch (typeof v) {
      case 'number': return Number.isFinite(v) ? v : { n: String(v) };
      case 'string': case 'boolean': return v;
      case 'undefined': return { u: 1 };
      case 'function': throw new Error(`snapshot: function at ${trail.join('.')}`);
      case 'object': break;
      default: throw new Error(`snapshot: unsupported ${typeof v} at ${trail.join('.')}`);
    }
    if (v === null) return null;
    const path = registry.get(v);
    if (path) return { d: path };
    if (instIdx.has(v)) return { i: instIdx.get(v) };
    const ctor = v.constructor && v.constructor.name;
    if (TYPED[ctor] && ArrayBuffer.isView(v)) return { t: ctor, v: Array.from(v, val) };
    return { r: node(v) };
  }

  function fields(o, skip) {
    const out = {};
    for (const k of Object.keys(o)) {
      if (skip && skip.has(k)) continue;
      trail.push(k);
      out[k] = val(o[k]);
      trail.pop();
    }
    return out;
  }

  const POOL_SKIP = new Set(['_i', 'alive']);

  function node(o) {
    let id = ids.get(o);
    if (id !== undefined) return id;
    id = nodes.length;
    ids.set(o, id);
    nodes.push(null);
    if (Array.isArray(o)) nodes[id] = { a: o.map((x, i) => { trail.push(i); const r = val(x); trail.pop(); return r; }) };
    else if (o instanceof Map) nodes[id] = { m: [...o].map(([k, x]) => [val(k), val(x)]) };
    else if (o instanceof Set) nodes[id] = { s: [...o].map(val) };
    else if (o instanceof StatBlock) nodes[id] = { sb: val(o.mods) };
    else if (poolOf.has(o)) nodes[id] = { o: fields(o, POOL_SKIP) };
    else nodes[id] = { o: fields(o) };
    return id;
  }

  const top = {};
  for (const k of Object.keys(run)) {
    const v = run[k];
    if (SKIP_TOP.has(k) || typeof v === 'function') continue;
    trail.length = 0; trail.push(k);
    top[k] = val(v);
  }
  const pools = {};
  for (const name of POOLS) {
    trail.length = 0; trail.push(`world.${name}`);
    pools[name] = w[name].active.map((o) => node(o));
  }
  return {
    format: SNAPSHOT_FORMAT,
    seed: run.seed,
    classId: run.player.classId,
    time: run.time,
    level: run.player.level,
    kills: run.kills,
    nextInstance: getInstanceCounter(),
    batteries: run.rig ? run.rig.chains.map((c) => c.bat.pool) : [],
    rng: run.rng.getState(),
    fxRng: run.fxRng.getState(),
    director: run.director.getState(),
    world: { tick: w.tick, nextUid: w.nextUid, pools },
    top,
    nodes,
  };
}

// Builds a run from a snapshot. Throws if it cannot (the caller then drops the snapshot).
export function restoreRun(snap, { view, debug, sfx }) {
  if (!snap || snap.format !== SNAPSHOT_FORMAT) throw new Error('snapshot: wrong format');
  const run = createOverclockedRun({ seed: snap.seed, view, debug, sfx });
  removeRig(run);                                            // the fresh run's rig and its stat modifiers: the saved ones replace them
  const w = run.world;
  const fix = [];                                            // rig instances to point at once the rig is rebuilt: [object, key | index, inst index]
  const shells = new Array(snap.nodes.length);

  for (const name of POOLS) {
    w[name].releaseAll();
    for (const id of snap.world.pools[name]) {
      const o = w[name].acquire();
      if (!o) throw new Error(`snapshot: ${name} pool overflow`);
      shells[id] = o;
    }
  }
  snap.nodes.forEach((n, i) => {
    if (shells[i]) return;
    if (n.a) shells[i] = [];
    else if (n.m) shells[i] = new Map();
    else if (n.s) shells[i] = new Set();
    else if (n.sb) shells[i] = new StatBlock(STATS, { conditions: CONDITIONS, getContext: () => run });
    else shells[i] = {};
  });

  function val(v) {
    if (v === null || typeof v !== 'object') return v;
    if (v.r !== undefined) return shells[v.r];
    if (v.i !== undefined) return { inst: v.i };             // swapped for the rebuilt instance below
    if (v.d) return resolvePath(v.d);
    if (v.n !== undefined) return Number(v.n);
    if (v.u) return undefined;
    if (v.t) return TYPED[v.t].from(v.v.map(val));
    throw new Error('snapshot: bad value');
  }

  snap.nodes.forEach((n, i) => {
    const o = shells[i];
    if (n.a) n.a.forEach((x) => { const y = val(x); o.push(y); if (y && y.inst !== undefined) fix.push([o, o.length - 1, y.inst]); });
    else if (n.m) { for (const [k, x] of n.m) { const y = val(x); o.set(val(k), y); if (y && y.inst !== undefined) fix.push([o, val(k), y.inst, true]); } }
    else if (n.s) { for (const x of n.s) o.add(val(x)); }
    else if (n.sb) o.mods = val(n.sb);
    else {
      for (const k of Object.keys(n.o)) {
        const x = val(n.o[k]);
        if (x && x.inst !== undefined && Object.keys(x).length === 1) { fix.push([o, k, x.inst]); continue; }
        if (ArrayBuffer.isView(o[k]) && ArrayBuffer.isView(x) && o[k].length === x.length) o[k].set(x);   // pooled entities keep their buffers
        else o[k] = x;
      }
    }
  });

  snap.nodes.forEach((n, i) => {                    // after every list is filled: recount the gated modifiers
    if (!n.sb) return;
    const o = shells[i];
    for (const id of Object.keys(o.mods)) o.conditional[id] = o.mods[id].reduce((c, m) => c + (m.when ? 1 : 0), 0);
  });

  for (const k of Object.keys(snap.top)) {
    const x = val(snap.top[k]);
    if (x && x.inst !== undefined && Object.keys(x).length === 1) fix.push([run, k, x.inst]); else run[k] = x;
  }
  run.rng.setState(snap.rng);
  run.fxRng.setState(snap.fxRng);
  run.director.setState(snap.director);
  w.tick = snap.world.tick;
  w.nextUid = snap.world.nextUid;
  w.fxNumbers = 0;
  setInstanceCounter(snap.nextInstance);
  run.player.stats.removeBySource('rig:');                   // the saved weapon modifiers belong to the old instances; applyRig makes new ones
  migrateRig(run.rigState);                                  // a run saved before Pierce became Sunder
  applyRig(run);
  const insts = run.rig.insts;
  for (const [o, k, i, isMap] of fix) {
    if (!insts[i]) throw new Error('snapshot: rig changed');
    if (isMap) o.set(k, insts[i]); else o[k] = insts[i];
  }
  run.rig.chains.forEach((c, i) => { if (snap.batteries[i] !== undefined) c.bat.pool = Math.min(c.bat.size, snap.batteries[i]); });
  w.hash.rebuild(w.enemies.active, w.enemies.count);
  return run;
}
