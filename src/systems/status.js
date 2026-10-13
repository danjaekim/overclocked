// Status effects on enemies (docs/design-m10-m13.md §3). Three elements:
//   burn   a damage pool dealt over time; every application adds to it
//   chill  stacks that slow; at max stacks the enemy freezes (then is briefly immune)
//   shock  marks the enemy and, on a weapon hit, chains an arc to nearby enemies
// Everything lives in fixed fields on the enemy object (no arrays, no allocation).
// Application happens in damage.js#flushDamage; timers tick in updateStatuses, which runs just
// before the flush so burn damage resolves in the same tick.

import { BURN, CHILL, SHOCK, ST } from '../data/statuses.js';
import { queueDamage, KIND_PROC, KIND_DOT } from './damage-queue.js';
import { MAX_TRIGGER_DEPTH } from '../effects/index.js';
import { addArc } from '../render/fx.js';

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

export function applyBurn(run, e, src, hitAmount) {
  const stats = run.player.stats;
  const power = stats.getFor('burnPower', src.tags);
  const dur = BURN.duration * stats.getFor('statusDuration', src.tags);
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
  e.burnDps = (remaining + power * hitAmount) / dur;
  e.burnSrc = src;
  refreshMask(e);
}

export function applyChill(run, e, src) {
  const stats = run.player.stats;
  const boss = e.def.boss === true;
  const add = Math.max(1, Math.round(stats.getFor('chillStacks', src.tags)));
  const dur = CHILL.duration * stats.getFor('statusDuration', src.tags);
  if (e.freezeT > 0) { e.chillT = dur; return; }              // already frozen: just keep the timer fresh
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

export function applyShock(run, e, src) {
  e.shockT = SHOCK.duration * run.player.stats.getFor('statusDuration', src.tags);
  refreshMask(e);
}

// Arc from `from` through up to `chains` nearest un-hit enemies. Each hop is PROC damage at
// chainDamage x the original hit, shocks its target, and draws a short bolt.
export function chainArc(run, from, src, hitAmount, depth) {
  if (depth + 1 > MAX_TRIGGER_DEPTH) return;
  const stats = run.player.stats;
  const hops = Math.min(SHOCK.maxHops, Math.round(stats.getFor('chains', src.tags)));
  if (hops <= 0) return;
  const dmg = hitAmount * stats.getFor('chainDamage', src.tags);
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
    applyShock(run, best, src);
    const d = Math.sqrt(bestD) || 1;
    queueDamage(run, best, dmg, false, ((best.x - cx) / d) * 30, ((best.y - cy) / d) * 30, depth + 1, src, KIND_PROC);
    cx = best.x;
    cy = best.y;
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
