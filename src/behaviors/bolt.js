// bolt: strikes the `count` nearest enemies in range instantly (no projectile to dodge or miss),
// drawing a lightning arc to each. The hit is an ordinary weapon hit, so a shock chance chains
// onward through chainArc exactly like a javelin's would.

import { param } from '../game/weapon-params.js';
import { arcColor } from '../render/elements.js';
import { strike } from '../game/hit.js';
import { addArc } from '../render/fx.js';
import { attackTriggers } from '../game/triggers.js';
import { activeMutation } from '../game/starforge.js';
import { STARFORGE } from '../data/starforge.js';

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
    let homed = null;
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
      addArc(run, p.x, p.y, best.x, best.y, arcColor(inst));
      strike(run, inst, best, dmg, (best.x - p.x) / d, (best.y - p.y) / d);
      const star = activeMutation(inst);
      if (star) {                                          // Seeking Bolt: it homes on one more enemy near the one it struck
        const e2 = w.hash.queryNearest(best.x, best.y, star.range, (o) => o.alive && o.hp > 0 && o !== best && !picked(inst, o));
        if (e2) {
          const d2 = Math.hypot(e2.x - best.x, e2.y - best.y) || 1;
          addArc(run, best.x, best.y, e2.x, e2.y, STARFORGE.color);
          strike(run, inst, e2, dmg * star.frac, (e2.x - best.x) / d2, (e2.y - best.y) / d2, 1);
          if (!homed) { homed = e2; attackTriggers(run, inst, e2.x, e2.y, Math.atan2(e2.y - best.y, e2.x - best.x)); }   // the first homing bolt also sets off the weapon's attack effects where it lands
        }
      }
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
