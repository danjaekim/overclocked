// Status effects on enemies (docs/design-m10-m13.md §3). Three elements:
//   burn   a damage pool dealt over time; every application adds to it
//   chill  stacks that slow; at max stacks the enemy freezes (then is briefly immune)
//   shock  marks the enemy and, on a weapon hit, chains an arc to nearby enemies
// Everything lives in fixed fields on the enemy object (no arrays, no allocation).
// Application happens in damage.js#flushDamage; timers tick in updateStatuses, which runs just
// before the flush so burn damage resolves in the same tick.

import { BURN, CHILL, SHOCK, ST } from '../data/statuses.js';
import { queueDamage, KIND_PROC, KIND_DOT, CAUSE } from './damage-queue.js';
import { MAX_TRIGGER_DEPTH } from '../effects/index.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { addArc, addPuff } from '../render/fx.js';

const visited = new Int32Array(SHOCK.maxHops + 2);

function refreshMask(e) {
  let m = e.status & ST.TIMERS ? ST.TIMERS : 0;
  if (e.burnT > 0) m |= ST.BURN;
  if (e.chill > 0) m |= ST.CHILL;
  if (e.freezeT > 0) m |= ST.FROZEN;
  if (e.shockT > 0) m |= ST.SHOCK;
  if (e.burnT > 0 || e.chillT > 0 || e.freezeT > 0 || e.freezeImm > 0 || e.shockT > 0) m |= ST.TIMERS;
  else m &= ~ST.TIMERS;
  e.status = m;
}

// Adds `pool` damage to the enemy's burn (dealt evenly over the burn duration).
export function addBurnPool(run, e, src, pool) {
  const dur = BURN.duration * run.player.stats.getFor('statusDuration', src.tags);
  let remaining = 0;
  if (e.burnT > 0) {
    remaining = e.burnDps * e.burnT;
    if (e.burnAcc > 0) {                                      // pay out what has accrued at the OLD rate first,
      queueDamage(run, e, e.burnDps * e.burnAcc, false, 0, 0, 0, e.burnSrc, KIND_DOT);   // so the pool total stays exact
      e.burnAcc = 0;
    }
  } else {
    e.burnAcc = (e.uid % 15) / 60;                            // stagger tick phases so ticks don't all land together
  }
  e.burnT = dur;
  e.burnDps = (remaining + pool) / dur;
  e.burnSrc = src;
  refreshMask(e);
}

export function applyBurn(run, e, src, hitAmount, depth = 0) {
  addBurnPool(run, e, src, run.player.stats.getFor('burnPower', src.tags) * hitAmount);
  if (run.rules.quench && (e.status & ST.BURN) && (e.status & (ST.CHILL | ST.FROZEN))) quench(run, e, src, depth);
}

export function applyChill(run, e, src, depth = 0) {
  const stats = run.player.stats;
  const boss = e.def.boss === true;
  const add = Math.max(1, Math.round(stats.getFor('chillStacks', src.tags)));
  const dur = CHILL.duration * stats.getFor('statusDuration', src.tags);
  if (e.freezeT > 0) {                                        // already frozen: just keep the timer fresh
    e.chillT = dur;
  } else {
    let cap = boss ? CHILL.bossMaxStacks : CHILL.maxStacks;
    if (e.freezeImm > 0 && cap > CHILL.maxStacks - 1) cap = CHILL.maxStacks - 1;   // immune: can't reach the freeze
    e.chill = Math.min(cap, e.chill + add);
    e.chillT = dur;
    if (!boss && e.chill >= CHILL.maxStacks) {                 // freeze
      const elite = e.elite ? CHILL.eliteFreezeMult : 1;
      e.freezeT = CHILL.freezeTime * stats.getFor('statusDuration', src.tags) * elite;
      e.freezeImm = e.freezeT + CHILL.freezeImmune;
      e.chill = 0;
      e.chillT = 0;
      e.slowMul = 0;
    } else {
      e.slowMul = 1 - CHILL.slowPerStack * e.chill;
    }
    refreshMask(e);
  }
  if (run.rules.quench && (e.status & ST.BURN) && (e.status & (ST.CHILL | ST.FROZEN))) quench(run, e, src, depth);
}

// Queues PROC damage to every living enemy within `radius` of (x, y).
function burst(run, x, y, radius, dmg, src, depth, cause) {
  if (depth + 1 > MAX_TRIGGER_DEPTH) return;
  const w = run.world;
  const n = w.hash.queryRadius(x, y, radius + MAX_ENEMY_RADIUS, w.scratch);
  for (let i = 0; i < n; i++) {
    const o = w.scratch[i];
    if (!o.alive) continue;
    const dx = o.x - x;
    const dy = o.y - y;
    const rr = radius + o.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    const d = Math.hypot(dx, dy) || 1;
    queueDamage(run, o, dmg, false, (dx / d) * 50, (dy / d) * 50, depth + 1, src, KIND_PROC, cause);
  }
}

// Alloy (fire + frost): an enemy that is burning AND chilled flashes to steam. Both statuses are
// consumed and the burn it had left is dealt instantly (x mult) to everything around it.
const QUENCH_RADIUS = 60;
function quench(run, e, src, depth) {
  const pool = e.burnDps * e.burnT;
  e.burnT = e.burnDps = e.burnAcc = 0;
  e.chill = 0;
  e.chillT = 0;
  e.freezeT = 0;
  e.slowMul = 1;
  refreshMask(e);
  addPuff(run, e.x, e.y, QUENCH_RADIUS / 2.4, '#eaf6ff');
  if (pool > 0) burst(run, e.x, e.y, QUENCH_RADIUS, pool * run.rules.quench.mult, src, depth, CAUSE.QUENCH);
}

export function applyShock(run, e, src) {
  e.shockT = SHOCK.duration * run.player.stats.getFor('statusDuration', src.tags);
  refreshMask(e);
}

// Arc from `from` through up to `chains` nearest un-hit enemies. Each hop is PROC damage at
// chainDamage x the original hit, shocks its target, and draws a short bolt.
// hopsOverride / dmgFrac (>= 0) replace the weapon's `chains` / `chainDamage` (Thunderclap).
export function chainArc(run, from, src, hitAmount, depth, hopsOverride = -1, dmgFrac = -1, cause = CAUSE.CHAIN) {
  if (depth + 1 > MAX_TRIGGER_DEPTH) return;
  const stats = run.player.stats;
  const hops = Math.min(SHOCK.maxHops, hopsOverride >= 0 ? hopsOverride : Math.round(stats.getFor('chains', src.tags)));
  if (hops <= 0) return;
  const dmg = hitAmount * (dmgFrac >= 0 ? dmgFrac : stats.getFor('chainDamage', src.tags));
  const w = run.world;
  let cx = from.x;
  let cy = from.y;
  visited[0] = from.uid;
  let nv = 1;
  for (let h = 0; h < hops; h++) {
    let best = null;
    let bestD = SHOCK.chainRange * SHOCK.chainRange;
    const n = w.hash.queryRadius(cx, cy, SHOCK.chainRange + 20, w.scratch);
    for (let i = 0; i < n; i++) {
      const o = w.scratch[i];
      if (!o.alive || o.hp <= 0) continue;
      let seen = false;
      for (let k = 0; k < nv; k++) if (visited[k] === o.uid) { seen = true; break; }
      if (seen) continue;
      const dx = o.x - cx;
      const dy = o.y - cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = o; }
    }
    if (!best) break;
    visited[nv++] = best.uid;
    addArc(run, cx, cy, best.x, best.y);
    if (cause !== CAUSE.FORK) applyShock(run, best, src);      // a fork is plain damage, not a shock
    const d = Math.sqrt(bestD) || 1;
    queueDamage(run, best, dmg, false, ((best.x - cx) / d) * 30, ((best.y - cy) / d) * 30, depth + 1, src, KIND_PROC, cause);
    if (run.rules.overload && (best.status & ST.BURN)) overload(run, best, src, dmg, depth);
    cx = best.x;
    cy = best.y;
  }
}

// Alloy (fire + storm): a chain hop that lands on a burning enemy explodes, igniting what it hits.
const OVERLOAD_RADIUS = 60;
function overload(run, e, src, hopDmg, depth) {
  const dmg = hopDmg * run.rules.overload.frac;
  const w = run.world;
  const n = w.hash.queryRadius(e.x, e.y, OVERLOAD_RADIUS + MAX_ENEMY_RADIUS, w.scratch);
  addPuff(run, e.x, e.y, OVERLOAD_RADIUS / 2.4, '#ffb347');
  for (let i = 0; i < n; i++) {
    const o = w.scratch[i];
    if (!o.alive) continue;
    const dx = o.x - e.x;
    const dy = o.y - e.y;
    const rr = OVERLOAD_RADIUS + o.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    const d = Math.hypot(dx, dy) || 1;
    queueDamage(run, o, dmg, false, (dx / d) * 50, (dy / d) * 50, depth + 1, src, KIND_PROC, CAUSE.OVERLOAD);
    addBurnPool(run, o, src, run.player.stats.getFor('burnPower', src.tags) * dmg);
  }
}

// What a dying enemy was carrying pays off here (Wildfire, Shatter, Thunderclap). Called by the
// damage flush right after the kill with a snapshot taken before it.
const WILDFIRE_RADIUS = 90;
const SHATTER_RADIUS = 70;
const THUNDERCLAP_FRAC = 0.6;
export function onStatusDeath(run, e, src, depth, mask, maxHp, burnLeft, amount) {
  const rules = run.rules;
  if ((mask & ST.BURN) && rules.wildfire && burnLeft > 0) {
    const r = rules.wildfire;
    const w = run.world;
    const n = w.hash.queryRadius(e.x, e.y, WILDFIRE_RADIUS + MAX_ENEMY_RADIUS, w.scratch);
    const share = (burnLeft * r.mult) / r.n;
    // the r.n nearest living enemies in range, found by repeated selection over the candidate list
    for (let pick = 0; pick < r.n; pick++) {
      let best = null;
      let bestD = WILDFIRE_RADIUS * WILDFIRE_RADIUS;
      for (let i = 0; i < n; i++) {
        const o = w.scratch[i];
        if (!o.alive || o === e) continue;
        let taken = false;
        for (let k = 0; k < pick; k++) if (visited[k] === o.uid) { taken = true; break; }
        if (taken) continue;
        const dx = o.x - e.x;
        const dy = o.y - e.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = o; }
      }
      if (!best) break;
      visited[pick] = best.uid;
      addBurnPool(run, best, src, share);
    }
  }
  if ((mask & ST.FROZEN) && rules.shatter) {
    addPuff(run, e.x, e.y, SHATTER_RADIUS / 2.4, '#bfeaff');
    burst(run, e.x, e.y, SHATTER_RADIUS, maxHp * rules.shatter.frac, src, depth, CAUSE.SHATTER);
  }
  if ((mask & ST.SHOCK) && rules.thunderclap) {
    chainArc(run, e, src, amount, depth, rules.thunderclap.hops, THUNDERCLAP_FRAC, CAUSE.THUNDERCLAP);
  }
}

// Timers, slow, and burn ticks. Untouched enemies cost one integer test.
export function updateStatuses(run, dt) {
  const list = run.world.enemies.active;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.status === 0) continue;

    if (e.burnT > 0) {
      const step = dt < e.burnT ? dt : e.burnT;
      e.burnT -= dt;
      e.burnAcc += step;
      if (e.burnAcc >= BURN.tickEvery || e.burnT <= 0) {
        const amount = e.burnDps * e.burnAcc;
        e.burnAcc = 0;
        if (e.burnT <= 0) e.burnDps = 0;
        if (amount > 0) queueDamage(run, e, amount, false, 0, 0, 0, e.burnSrc, KIND_DOT);
      }
    }
    if (e.freezeT > 0) {
      e.freezeT -= dt;
      if (e.freezeT <= 0) { e.freezeT = 0; e.slowMul = 1 - CHILL.slowPerStack * e.chill; }
    }
    if (e.freezeImm > 0) e.freezeImm -= dt;
    if (e.chillT > 0 && e.freezeT <= 0) {
      e.chillT -= dt;
      if (e.chillT <= 0) { e.chill = 0; e.chillT = 0; e.slowMul = 1; }
    }
    if (e.shockT > 0) e.shockT -= dt;
    refreshMask(e);
  }
}

// Chain Reaction (any build): a dying enemy bursts for a share of its own max HP. The burst's kills
// burst in turn, down to MAX_TRIGGER_DEPTH, so a packed swarm goes off like a string of crackers.
// Bosses do not burst (their max HP would flatten the room), and the burst is capped.
const REACTION_CAP = 400;
export function chainReaction(run, e, src, depth, maxHp) {
  if (e.def.boss) return;
  const r = run.rules.chainReaction;
  addPuff(run, e.x, e.y, r.radius / 2.4, '#ffb347');
  burst(run, e.x, e.y, r.radius, Math.min(maxHp * r.frac, REACTION_CAP), src, depth, CAUSE.REACTION);
}

// Forked Strikes (any build): a direct hit sometimes forks to the nearest other enemy.
export function forkStrike(run, e, src, amount, depth) {
  const r = run.rules.fork;
  if (run.rng.next() >= r.chance) return;
  chainArc(run, e, src, amount, depth, r.hops, r.frac, CAUSE.FORK);
}
