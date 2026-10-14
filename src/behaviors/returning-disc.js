// boomerang: throws `count` discs toward the nearest enemy; each flies out `range` units, then
// returns to the player, cutting every enemy it overlaps (each at most once per `tickEvery`).
// Discs are kept on the instance (a small fixed array), not in the projectile pool.

import { param } from '../game/weapon-params.js';
import { attackTriggers } from '../game/triggers.js';
import { strike } from '../game/hit.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';

const MAX_DISCS = 10;
const FAN = 0.35;                 // radians between discs thrown together
const CATCH = 16;                 // distance at which a returning disc is caught

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'projSpeed', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.4;
    inst.discs = [];
  },

  update(inst, dt, run) {
    const p = run.player;
    const discs = inst.discs;
    const speed = param(run, inst, 'speed');
    const reach = param(run, inst, 'range');
    const radius = param(run, inst, 'radius');
    const dmg = param(run, inst, 'damage');
    const tickEvery = inst.def.base.tickEvery * param(run, inst, 'cooldown');
    const w = run.world;

    // throw
    inst.cd -= dt;
    if (inst.cd <= 0) {
      const target = w.hash.queryNearest(p.x, p.y, reach * 1.1, (o) => o.alive);
      if (!target) {
        inst.cd = 0;
      } else {
        const count = Math.max(1, Math.round(param(run, inst, 'count')));
        const base = Math.atan2(target.y - p.y, target.x - p.x);
        for (let i = 0; i < count && discs.length < MAX_DISCS; i++) {
          const a = base + (i - (count - 1) / 2) * FAN;
          discs.push({ x: p.x, y: p.y, dx: Math.cos(a), dy: Math.sin(a), out: 0, back: false, spin: 0, hit: new Map() });
        }
        inst.cd += param(run, inst, 'cooldown');
        attackTriggers(run, inst, target.x, target.y, base);
      }
    }

    // fly, cut, catch
    for (let i = discs.length - 1; i >= 0; i--) {
      const d = discs[i];
      d.spin += dt * 14;
      if (!d.back) {
        d.x += d.dx * speed * dt;
        d.y += d.dy * speed * dt;
        d.out += speed * dt;
        if (d.out >= reach) d.back = true;
      } else {
        const hx = p.x - d.x;
        const hy = p.y - d.y;
        const hd = Math.hypot(hx, hy);
        if (hd < CATCH) { discs.splice(i, 1); continue; }
        d.x += (hx / hd) * speed * 1.25 * dt;
        d.y += (hy / hd) * speed * 1.25 * dt;
      }
      const n = w.hash.queryRadius(d.x, d.y, radius + MAX_ENEMY_RADIUS, w.scratch);
      for (let k = 0; k < n; k++) {
        const e = w.scratch[k];
        if (!e.alive) continue;
        const ex = e.x - d.x;
        const ey = e.y - d.y;
        const rr = radius + e.r;
        if (ex * ex + ey * ey > rr * rr) continue;
        const last = d.hit.get(e.uid);                      // each enemy is cut at most once per tickEvery by one disc,
        if (last !== undefined && run.time - last < tickEvery) continue;   // so a fast pass still hits and a lingering one keeps cutting
        d.hit.set(e.uid, run.time);
        const ed = Math.hypot(ex, ey) || 1;
        strike(run, inst, e, dmg, ex / ed, ey / ed);
      }
    }
  },

  draw(inst, ctx) {
    ctx.strokeStyle = '#d9dde8';
    ctx.fillStyle = '#aeb6c8';
    ctx.lineWidth = 2;
    for (const d of inst.discs) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.spin);
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * inst.def.base.radius, Math.sin(a) * inst.def.base.radius);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
};
