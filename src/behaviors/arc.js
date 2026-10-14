// arc: a melee sweep toward the nearest enemy, hitting everything inside the cone.
// With count > 1 the extra swings are spread evenly around the player (2 = front and back).

import { param } from '../game/weapon-params.js';
import { strike } from '../game/hit.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { attackTriggers } from '../game/triggers.js';

const TAU = Math.PI * 2;
const isAlive = (o) => o.alive;
const SWING_TIME = 0.14;

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.2;
    inst.swing = 0;          // seconds of swing animation left
    inst.angle = 0;
    inst.range = 0;
    inst.width = 0;
    inst.swings = 1;
  },

  update(inst, dt, run) {
    if (inst.swing > 0) inst.swing -= dt;
    inst.cd -= dt;
    if (inst.cd > 0) return;

    const p = run.player;
    const range = param(run, inst, 'range');
    const target = run.world.hash.queryNearest(p.x, p.y, range + 40, isAlive);
    if (!target) {
      inst.cd = 0;
      return;
    }

    const count = Math.max(1, Math.round(param(run, inst, 'count')));
    const width = Math.min(TAU, param(run, inst, 'arcWidth'));
    const dmg = param(run, inst, 'damage');
    const base = Math.atan2(target.y - p.y, target.x - p.x);
    const w = run.world;
    const n = w.hash.queryRadius(p.x, p.y, range + MAX_ENEMY_RADIUS, w.scratch);

    for (let s = 0; s < count; s++) {
      const a = base + (s * TAU) / count;
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      const cosHalf = Math.cos(width / 2);
      for (let i = 0; i < n; i++) {
        const e = w.scratch[i];
        if (!e.alive) continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > range + e.r) continue;
        // inside the cone if the direction to the enemy is within width/2 of the swing direction;
        // an enemy overlapping the player is always hit
        if (d > e.r + p.r && (dx * cx + dy * cy) / d < cosHalf) continue;
        strike(run, inst, e, dmg, dx / (d || 1), dy / (d || 1));
      }
    }

    inst.angle = base;
    inst.range = range;
    inst.width = width;
    inst.swings = count;
    inst.swing = SWING_TIME;
    inst.cd += param(run, inst, 'cooldown');
    attackTriggers(run, inst, target.x, target.y, base);
  },

  draw(inst, ctx, run) {
    if (inst.swing <= 0) return;
    const p = run.player;
    const u = 1 - inst.swing / SWING_TIME;
    ctx.globalAlpha = 0.7 * (1 - u);
    ctx.strokeStyle = '#ffe3a3';
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (let s = 0; s < inst.swings; s++) {
      const a = inst.angle + (s * TAU) / inst.swings;
      ctx.moveTo(p.x + Math.cos(a - inst.width / 2) * inst.range * 0.8, p.y + Math.sin(a - inst.width / 2) * inst.range * 0.8);
      ctx.arc(p.x, p.y, inst.range * 0.8, a - inst.width / 2, a + inst.width / 2);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  },
};
