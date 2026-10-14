// bolt: strikes the `count` nearest enemies in range instantly (no projectile to dodge or miss),
// drawing a lightning arc to each. The hit is an ordinary weapon hit, so a shock chance chains
// onward through chainArc exactly like a javelin's would.

import { param } from '../game/weapon-params.js';
import { strike } from '../game/hit.js';
import { addArc } from '../render/fx.js';
import { attackTriggers } from '../game/triggers.js';

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.4;
    inst.picked = new Array(12).fill(0);   // uids already struck this volley
    inst.nPicked = 0;
  },

  update(inst, dt, run) {
    inst.cd -= dt;
    if (inst.cd > 0) return;
    const p = run.player;
    const range = param(run, inst, 'range');
    const w = run.world;
    const n = w.hash.queryRadius(p.x, p.y, range, w.scratch);
    const count = Math.min(12, Math.max(1, Math.round(param(run, inst, 'count'))));
    const dmg = param(run, inst, 'damage');
    let any = false;
    let first = null;
    for (let k = 0; k < count; k++) {
      let best = null;
      let bestD = range * range;
      for (let i = 0; i < n; i++) {
        const e = w.scratch[i];
        if (!e || !e.alive || e.hp <= 0) continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = dx * dx + dy * dy;
        if (d < bestD && !picked(inst, e)) { bestD = d; best = e; }
      }
      if (!best) break;
      any = true;
      if (!first) first = best;
      inst.picked[k] = best.uid;
      inst.nPicked = k + 1;
      const d = Math.sqrt(bestD) || 1;
      addArc(run, p.x, p.y, best.x, best.y);
      strike(run, inst, best, dmg, (best.x - p.x) / d, (best.y - p.y) / d);
    }
    inst.nPicked = 0;
    if (any) {
      inst.cd += param(run, inst, 'cooldown');
      attackTriggers(run, inst, first.x, first.y, Math.atan2(first.y - p.y, first.x - p.x));
    }
    else inst.cd = 0;
  },
};

function picked(inst, e) {
  for (let k = 0; k < inst.nPicked; k++) if (inst.picked[k] === e.uid) return true;
  return false;
}
