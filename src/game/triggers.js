// Trigger dispatch (docs/architecture.md §4.6). A weapon's `triggers` list reacts to events
// (hit / crit / kill / interval / attack); each trigger calls an effect from effects/index.js.
// Triggers are active once the weapon reaches trigger.minLevel (default 1).

import { EFFECTS } from '../effects/index.js';

// Event-driven triggers: src is the weapon instance whose hit caused the event.
export function fireTriggers(run, on, src, x, y, depth, target) {
  if (!src) return;
  fireList(run, src.def.triggers, on, src, x, y, depth, 0, target);
  if (src.extraTriggers.length) fireList(run, src.extraTriggers, on, src, x, y, depth, 0, target);   // forge affixes
}

function fireList(run, list, on, src, x, y, depth, ang = 0, target = null) {
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.on !== on || src.level < (t.minLevel || 1)) continue;
    if (t.chance !== undefined && run.rng.next() >= t.chance) continue;
    EFFECTS[t.effect](run, t, src, x, y, depth, ang, target);
  }
}

// An attack trigger fires once per attack (a swing, a volley, a cast), not once per enemy hit.
// `every: n` makes it fire on every nth attack (the count lives in inst.trigT, beside the interval
// timers). (x, y) is where the attack was aimed; ang is its direction in radians.
export function attackTriggers(run, inst, x, y, ang) {
  const list = inst.def.triggers;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.on !== 'attack' || inst.level < (t.minLevel || 1)) continue;
    if (t.every > 1) {
      if (++inst.trigT[i] < t.every) continue;
      inst.trigT[i] = 0;
    }
    if (t.chance !== undefined && run.rng.next() >= t.chance) continue;
    EFFECTS[t.effect](run, t, inst, x, y, 0, ang);
  }
  const extra = inst.extraTriggers;                          // forge affixes: their `every` counters live in inst.extraT
  for (let i = 0; i < extra.length; i++) {
    const t = extra[i];
    if (t.on !== 'attack' || inst.level < (t.minLevel || 1)) continue;
    if (t.every > 1) {
      const c = inst.extraT || (inst.extraT = []);
      if ((c[i] = (c[i] || 0) + 1) < t.every) continue;
      c[i] = 0;
    }
    if (t.chance !== undefined && run.rng.next() >= t.chance) continue;
    EFFECTS[t.effect](run, t, inst, x, y, 0, ang);
  }
}

// Time-driven triggers, called once per weapon per tick.
export function updateIntervalTriggers(run, inst, dt) {
  const list = inst.def.triggers;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.on !== 'interval' || inst.level < (t.minLevel || 1)) continue;
    inst.trigT[i] += dt;
    if (inst.trigT[i] >= t.every) {
      inst.trigT[i] -= t.every;
      EFFECTS[t.effect](run, t, inst, run.player.x, run.player.y, 0);
    }
  }
}
