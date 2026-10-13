// Effect handlers used by triggers (docs/architecture.md §4.6).
// effect(run, trigger, src, x, y, depth): src is the weapon instance that caused the trigger,
// (x, y) where it happened. Anything that deals damage enqueues it with depth + 1.

import { param } from '../game/weapon-params.js';
import { queueDamage, KIND_PROC } from '../systems/damage-queue.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { addPuff } from '../render/fx.js';

export const MAX_TRIGGER_DEPTH = 3;

export const EFFECTS = {
  // Burst of damage around (x, y): damageFrac of the weapon's own damage, radius scaled by area.
  explode(run, t, src, x, y, depth) {
    if (!src || depth + 1 > MAX_TRIGGER_DEPTH) return;
    const w = run.world;
    const area = run.player.stats.getFor('area', src.tags);
    const radius = t.params.radius * area;
    const dmg = param(run, src, 'damage') * t.params.damageFrac;
    const n = w.hash.queryRadius(x, y, radius + MAX_ENEMY_RADIUS, w.scratch);
    for (let i = 0; i < n; i++) {
      const e = w.scratch[i];
      if (!e.alive) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const rr = radius + e.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      const d = Math.hypot(dx, dy) || 1;
      queueDamage(run, e, dmg, false, (dx / d) * 60, (dy / d) * 60, depth + 1, src, KIND_PROC);
    }
    addPuff(run, x, y, radius / 2.4, '#ff9a3c');
  },

  // A flat damage-absorbing barrier on the player, capped at max hp.
  shield(run, t) {
    const p = run.player;
    p.shield = Math.min(p.maxHp, p.shield + t.params.amount);
  },
};
