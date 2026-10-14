// mortar: lobs `count` shells at random enemies within range. A shell lands after `fuse` seconds
// (shown as a ring closing on the target) and bursts in a circle: every enemy inside takes a
// normal weapon hit, so burn and shock land on all of them. Area scales both reach and blast.

import { param } from '../game/weapon-params.js';
import { strike } from '../game/hit.js';
import { addPuff } from '../render/fx.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { attackTriggers } from '../game/triggers.js';

const MAX_SHELLS = 12;

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.5;
    inst.shells = [];
  },

  update(inst, dt, run) {
    const p = run.player;
    const shells = inst.shells;
    const w = run.world;
    const blast = param(run, inst, 'radius');
    const fuse = inst.def.base.fuse;

    inst.cd -= dt;
    if (inst.cd <= 0) {
      const range = param(run, inst, 'range');
      const n = w.hash.queryRadius(p.x, p.y, range, w.scratch);
      let live = 0;
      for (let i = 0; i < n; i++) if (w.scratch[i].alive) w.scratch[live++] = w.scratch[i];
      if (live === 0) {
        inst.cd = 0;
      } else {
        const count = Math.max(1, Math.round(param(run, inst, 'count')));
        for (let k = 0; k < count && shells.length < MAX_SHELLS; k++) {
          const e = w.scratch[Math.floor(run.rng.next() * live)];
          shells.push({ x: e.x, y: e.y, t: fuse });
        }
        inst.cd += param(run, inst, 'cooldown');
        attackTriggers(run, inst, p.x, p.y, 0);
      }
    }

    const dmg = param(run, inst, 'damage');
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i];
      s.t -= dt;
      if (s.t > 0) continue;
      shells.splice(i, 1);
      addPuff(run, s.x, s.y, blast / 2.2, '#ff9a3c');
      const n = w.hash.queryRadius(s.x, s.y, blast + MAX_ENEMY_RADIUS, w.scratch);
      for (let k = 0; k < n; k++) {
        const e = w.scratch[k];
        if (!e.alive) continue;
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const rr = blast + e.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        const d = Math.hypot(dx, dy) || 1;
        strike(run, inst, e, dmg, dx / d, dy / d);
      }
    }
  },

  draw(inst, ctx, run) {
    const blast = param(run, inst, 'radius');
    const fuse = inst.def.base.fuse;
    ctx.strokeStyle = '#ff8a3c';
    ctx.lineWidth = 2;
    for (const s of inst.shells) {
      const u = 1 - s.t / fuse;
      ctx.globalAlpha = 0.25 + 0.4 * u;
      ctx.beginPath();
      ctx.arc(s.x, s.y, blast * (1.15 - 0.15 * u), 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4 + 4 * u, 0, Math.PI * 2);
      ctx.fillStyle = '#ffb347';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
};
