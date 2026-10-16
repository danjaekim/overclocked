// arc: a melee sweep toward the nearest enemy, hitting everything inside the cone.
// With count > 1 the extra swings are spread evenly around the player (2 = front and back).

import { param } from '../game/weapon-params.js';
import { elementOf } from '../render/elements.js';
import { drawAxeSwing } from '../render/melee.js';
import { strike } from '../game/hit.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { attackTriggers } from '../game/triggers.js';
import { activeMutation } from '../game/starforge.js';
import { STARFORGE } from '../data/starforge.js';

const TAU = Math.PI * 2;
const isAlive = (o) => o.alive;
const SWING_TIME = 0.26;                                  // how long the axe is drawn swinging; the hit lands on the first frame
const MAX_ECHOES = 8;

// One cone sweep of `count` swings from (ox, oy) toward `base`. depth > 0 for an afterimage: it sets off nothing.
function sweep(run, inst, ox, oy, base, count, range, width, dmg, depth) {
  const p = run.player;
  const w = run.world;
  const n = w.hash.queryRadius(ox, oy, range + MAX_ENEMY_RADIUS, w.scratch);
  const cosHalf = Math.cos(width / 2);
  for (let s = 0; s < count; s++) {
    const a = base + (s * TAU) / count;
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    for (let i = 0; i < n; i++) {
      const e = w.scratch[i];
      if (!e.alive) continue;
      const dx = e.x - ox;
      const dy = e.y - oy;
      const d = Math.hypot(dx, dy);
      if (d > range + e.r) continue;
      // inside the cone if the direction to the enemy is within width/2 of the swing direction;
      // an enemy overlapping the player is always hit
      if (d > e.r + p.r && (dx * cx + dy * cy) / d < cosHalf) continue;
      strike(run, inst, e, dmg, dx / (d || 1), dy / (d || 1), depth);
    }
  }
}

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.2;
    inst.swing = 0;          // seconds of swing animation left
    inst.swingTime = SWING_TIME;
    inst.dir = 1;            // which way the axe travels; alternates each swing
    inst.angle = 0;
    inst.range = 0;
    inst.width = 0;
    inst.swings = 1;
  },

  update(inst, dt, run) {
    if (inst.swing > 0) inst.swing -= dt;
    const echoes = inst.echoes;
    if (echoes && echoes.length) {                         // Afterimage: the crescents left behind cut again
      for (let i = echoes.length - 1; i >= 0; i--) {
        const f = echoes[i];
        f.t -= dt;
        if (f.t > 0) continue;
        echoes.splice(i, 1);
        sweep(run, inst, f.x, f.y, f.a, f.n, f.range, f.width, f.dmg, 1);
        (inst.flashes || (inst.flashes = [])).push({ ...f, t: 0.12 });
      }
    }
    if (inst.flashes && inst.flashes.length) {
      for (let i = inst.flashes.length - 1; i >= 0; i--) if ((inst.flashes[i].t -= dt) <= 0) inst.flashes.splice(i, 1);
    }
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
    sweep(run, inst, p.x, p.y, base, count, range, width, dmg, undefined);
    const star = activeMutation(inst);
    if (star) {
      if (!inst.echoes) inst.echoes = [];
      if (inst.echoes.length < MAX_ECHOES) inst.echoes.push({ x: p.x, y: p.y, a: base, n: count, range, width, dmg: dmg * star.frac, t: star.delay, d: star.delay });
    }

    inst.angle = base;
    inst.range = range;
    inst.width = width;
    inst.swings = count;
    inst.swing = SWING_TIME;
    inst.dir = -inst.dir;
    inst.cd += param(run, inst, 'cooldown');
    attackTriggers(run, inst, target.x, target.y, base);
  },

  draw(inst, ctx, run) {
    const ec = inst.echoes;
    if (ec && ec.length) {                                 // the crescents hanging in the air, brightening until they cut
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      for (const f of ec) {
        const u = 1 - f.t / f.d;
        ctx.globalAlpha = 0.12 + 0.5 * u;
        ctx.strokeStyle = STARFORGE.color;
        ctx.beginPath();
        for (let s = 0; s < f.n; s++) {
          const a = f.a + (s * TAU) / f.n;
          ctx.moveTo(f.x + Math.cos(a - f.width / 2) * f.range * 0.8, f.y + Math.sin(a - f.width / 2) * f.range * 0.8);
          ctx.arc(f.x, f.y, f.range * 0.8, a - f.width / 2, a + f.width / 2);
        }
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    const fl = inst.flashes;
    if (fl && fl.length) {                                 // the cut itself: a bright, wide flash
      ctx.lineWidth = 12;
      ctx.strokeStyle = STARFORGE.light;
      for (const f of fl) {
        ctx.globalAlpha = f.t / 0.12;
        ctx.beginPath();
        for (let s = 0; s < f.n; s++) {
          const a = f.a + (s * TAU) / f.n;
          ctx.moveTo(f.x + Math.cos(a - f.width / 2) * f.range * 0.9, f.y + Math.sin(a - f.width / 2) * f.range * 0.9);
          ctx.arc(f.x, f.y, f.range * 0.9, a - f.width / 2, a + f.width / 2);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (inst.swing <= 0) return;
    drawAxeSwing(ctx, run.player, inst.angle, inst.width, inst.range, inst.swings, inst.dir, 1 - inst.swing / SWING_TIME, elementOf(inst));
    ctx.globalAlpha = 1;
  },
};
