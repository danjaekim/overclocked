// chain: one bolt that jumps from enemy to enemy (Chain Lightning). It strikes the nearest enemy in
// range as an ordinary weapon hit, then leaps up to `chains` times (+2 per extra projectile) to the
// nearest enemy within `jump` units that it has not struck yet, losing 12% damage per jump and
// shocking each. docs/design-m30-m33.md §5.2.

import { param } from '../game/weapon-params.js';
import { strike } from '../game/hit.js';
import { addArc } from '../render/fx.js';
import { attackTriggers } from '../game/triggers.js';
import { queueDamage, KIND_PROC, CAUSE } from '../systems/damage-queue.js';
import { applyShock } from '../systems/status.js';

const FALLOFF = 0.88;
const MAX_JUMPS = 14;

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.4;
    inst.seen = new Int32Array(MAX_JUMPS + 2);
  },

  update(inst, dt, run) {
    inst.cd -= dt;
    if (inst.cd > 0) return;
    const p = run.player;
    const b = inst.def.base;
    const range = param(run, inst, 'range');
    const first = run.world.hash.queryNearest(p.x, p.y, range, (o) => o.alive && o.hp > 0);
    if (!first) { inst.cd = 0; return; }

    const w = run.world;
    const jumps = Math.min(MAX_JUMPS, b.chains + Math.round(run.player.stats.getFor('chains', inst.tags)) + 2 * (Math.max(1, Math.round(param(run, inst, 'count'))) - 1));
    const jump = param(run, inst, 'jump');
    let dmg = param(run, inst, 'damage');
    const d0 = Math.hypot(first.x - p.x, first.y - p.y) || 1;
    addArc(run, p.x, p.y, first.x, first.y);
    strike(run, inst, first, dmg, (first.x - p.x) / d0, (first.y - p.y) / d0);
    inst.seen[0] = first.uid;
    let ns = 1;
    let cx = first.x;
    let cy = first.y;
    for (let j = 0; j < jumps; j++) {
      let best = null;
      let bestD = jump * jump;
      const n = w.hash.queryRadius(cx, cy, jump + 20, w.scratch);
      for (let i = 0; i < n; i++) {
        const o = w.scratch[i];
        if (!o.alive || o.hp <= 0) continue;
        let used = false;
        for (let k = 0; k < ns; k++) if (inst.seen[k] === o.uid) { used = true; break; }
        if (used) continue;
        const d = (o.x - cx) * (o.x - cx) + (o.y - cy) * (o.y - cy);
        if (d < bestD) { bestD = d; best = o; }
      }
      if (!best) break;
      inst.seen[ns++] = best.uid;
      dmg *= FALLOFF;
      addArc(run, cx, cy, best.x, best.y);
      applyShock(run, best, inst);
      const d = Math.sqrt(bestD) || 1;
      queueDamage(run, best, dmg, false, ((best.x - cx) / d) * 30, ((best.y - cy) / d) * 30, 1, inst, KIND_PROC, CAUSE.CHAIN);
      cx = best.x;
      cy = best.y;
    }
    inst.cd += param(run, inst, 'cooldown');
    attackTriggers(run, inst, first.x, first.y, Math.atan2(first.y - p.y, first.x - p.x));
  },
};
