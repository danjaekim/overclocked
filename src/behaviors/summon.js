// summon: keeps up to `count` spirit minions alive, one more arriving every `cooldown` seconds.
// A minion hunts the nearest enemy within `range` of the player and cuts it on contact (each
// enemy at most once per `tickEvery` per minion); with nothing to hunt it drifts back to
// hover beside the player. Minions are spirits: they cannot be hurt, so no minion hp system is
// needed. Their hits are ordinary weapon hits, so every status, perk and trigger applies.

import { param } from '../game/weapon-params.js';
import { strike } from '../game/hit.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';

const MAX_MINIONS = 14;
const TAU = Math.PI * 2;

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'projSpeed', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.5;
    inst.minions = [];
    inst.t = 0;
  },

  update(inst, dt, run) {
    const p = run.player;
    const w = run.world;
    const list = inst.minions;
    const want = Math.min(MAX_MINIONS, Math.max(1, Math.round(param(run, inst, 'count'))));
    const speed = param(run, inst, 'speed');
    const leash = param(run, inst, 'range');
    const radius = param(run, inst, 'radius');
    const dmg = param(run, inst, 'damage');
    const tickEvery = inst.def.base.tickEvery;
    inst.t += dt;

    inst.cd -= dt;
    if (inst.cd <= 0 && list.length < want) {
      const a = run.rng.next() * TAU;
      list.push({ x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 24, slot: list.length, hit: new Map(), bob: a });
      inst.cd += param(run, inst, 'cooldown');
    } else if (list.length >= want) {
      inst.cd = Math.max(inst.cd, 0);
    }
    while (list.length > want) list.pop();                 // e.g. after a salvage-free stat loss

    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      let target = w.hash.queryNearest(m.x, m.y, 150, isAlive);
      if (target) {                                        // only hunt what is still near the player
        const pdx = target.x - p.x;
        const pdy = target.y - p.y;
        if (pdx * pdx + pdy * pdy > leash * leash) target = null;
      }
      let tx;
      let ty;
      if (target) {
        tx = target.x;
        ty = target.y;
      } else {                                             // hover: spread around the player
        const a = inst.t * 1.3 + (i * TAU) / Math.max(1, list.length);
        tx = p.x + Math.cos(a) * 40;
        ty = p.y + Math.sin(a) * 40;
      }
      const dx = tx - m.x;
      const dy = ty - m.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = target ? speed : speed * (d > 90 ? 1.8 : 1);
      const step = Math.min(d, sp * dt);
      m.x += (dx / d) * step;
      m.y += (dy / d) * step;

      const n = w.hash.queryRadius(m.x, m.y, radius + MAX_ENEMY_RADIUS, w.scratch);
      for (let k = 0; k < n; k++) {
        const e = w.scratch[k];
        if (!e.alive) continue;
        const ex = e.x - m.x;
        const ey = e.y - m.y;
        const rr = radius + e.r;
        if (ex * ex + ey * ey > rr * rr) continue;
        const last = m.hit.get(e.uid);
        if (last !== undefined && run.time - last < tickEvery) continue;
        m.hit.set(e.uid, run.time);
        const ed = Math.hypot(ex, ey) || 1;
        strike(run, inst, e, dmg, ex / ed, ey / ed);
      }
      if (m.hit.size > 24) {                               // forget stale entries
        for (const [uid, t] of m.hit) if (run.time - t > tickEvery * 2) m.hit.delete(uid);
      }
    }
  },

  draw(inst, ctx) {
    const r = inst.def.base.radius;
    ctx.fillStyle = '#e8e2cf';
    ctx.strokeStyle = '#7d7660';
    ctx.lineWidth = 1.5;
    for (const m of inst.minions) {
      ctx.beginPath();
      ctx.arc(m.x, m.y, r * 0.8, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2b2a24';                           // two eye sockets
      ctx.fillRect(m.x - 3.5, m.y - 2.5, 2.4, 3);
      ctx.fillRect(m.x + 1.1, m.y - 2.5, 2.4, 3);
      ctx.fillStyle = '#e8e2cf';
    }
  },
};

function isAlive(o) { return o.alive; }
