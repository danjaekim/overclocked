// judge: every `cooldown` seconds calls a pillar of light on the toughest enemies within `range`
// (the boss first, then elites, then whoever has the most hp). With count > 1 each pillar picks a
// different target. The pillar is a hazard (systems/hazards.js), so it telegraphs before it lands.

import { param } from '../game/weapon-params.js';
import { addPillar } from '../systems/hazards.js';
import { attackTriggers } from '../game/triggers.js';

const TELE = 0.35;

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles'],

  init(inst) {
    inst.cd = 0.6;
    inst.picked = [0, 0, 0, 0, 0, 0];
  },

  update(inst, dt, run) {
    inst.cd -= dt;
    if (inst.cd > 0) return;
    const p = run.player;
    const w = run.world;
    const range = param(run, inst, 'range');
    const n = w.hash.queryRadius(p.x, p.y, range, w.scratch);
    if (n === 0) { inst.cd = 0; return; }
    const count = Math.min(inst.picked.length, Math.max(1, Math.round(param(run, inst, 'count'))));
    const dmg = param(run, inst, 'damage');
    const radius = param(run, inst, 'radius');
    let fired = 0;
    for (let k = 0; k < count; k++) {
      let best = null;
      let bestScore = -1;
      for (let i = 0; i < n; i++) {
        const e = w.scratch[i];
        if (!e || !e.alive || e.prop === 1) continue;
        let used = false;
        for (let j = 0; j < k; j++) if (inst.picked[j] === e.uid) used = true;
        if (used) continue;
        const score = (e.def.boss ? 1e7 : 0) + (e.elite ? 1e6 : 0) + e.hp;
        if (score > bestScore) { bestScore = score; best = e; }
      }
      if (!best) break;
      inst.picked[k] = best.uid;
      addPillar(run, inst, best.x, best.y, radius, TELE, dmg, 0);
      fired++;
    }
    if (fired) {
      inst.cd += param(run, inst, 'cooldown');
      attackTriggers(run, inst, p.x, p.y, 0);
    } else inst.cd = 0;
  },
};
