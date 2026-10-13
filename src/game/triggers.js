// Trigger dispatch (docs/architecture.md §4.6). A weapon's `triggers` list reacts to events
// (hit / crit / kill / interval); each trigger calls an effect from effects/index.js.
// Triggers are active once the weapon reaches trigger.minLevel (default 1).

import { EFFECTS } from '../effects/index.js';

// Event-driven triggers: src is the weapon instance whose hit caused the event.
export function fireTriggers(run, on, src, x, y, depth) {
  if (!src) return;
  const list = src.def.triggers;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.on !== on || src.level < (t.minLevel || 1)) continue;
    if (t.chance !== undefined && run.rng.next() >= t.chance) continue;
    EFFECTS[t.effect](run, t, src, x, y, depth);
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
