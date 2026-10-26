// mortar: lobs `count` shells at random enemies within range. A shell lands after `fuse` seconds
// (shown as a ring closing on the target) and bursts in a circle: every enemy inside takes a
// normal weapon hit, so burn and shock land on all of them. Area scales both reach and blast.

import { param } from '../game/weapon-params.js';
import { drawShell, drawShellMark } from '../render/auras.js';
import { elementOf, accentOf } from '../render/elements.js';
import { strike } from '../game/hit.js';
import { addPuff } from '../render/fx.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { attackTriggers } from '../game/triggers.js';
import { activeMutation } from '../game/starforge.js';
import { STARFORGE, MUTATIONS } from '../data/starforge.js';

const MAX_SHELLS = 12;
const MAX_BOMBLETS = 36;

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
      for (let i = 0; i < n; i++) if (w.scratch[i].alive && w.scratch[i].prop !== 1) w.scratch[live++] = w.scratch[i];
      if (live === 0) {
        inst.cd = 0;
      } else {
        const count = Math.max(1, Math.round(param(run, inst, 'count')));
        for (let k = 0; k < count && shells.length < MAX_SHELLS; k++) {
          const e = w.scratch[Math.floor(run.rng.next() * live)];
          shells.push({ x: e.x, y: e.y, t: fuse, ox: p.x, oy: p.y });
        }
        inst.cd += param(run, inst, 'cooldown');
        attackTriggers(run, inst, p.x, p.y, 0);
      }
    }

    const dmg = param(run, inst, 'damage');
    const star = activeMutation(inst);
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i];
      s.t -= dt;
      if (s.t > 0) continue;
      shells.splice(i, 1);
      const el = elementOf(inst);
      const br = s.sub ? blast * star.size : blast;            // a bomblet's smaller blast
      const bd = s.sub ? dmg * star.frac : dmg;
      addPuff(run, s.x, s.y, br / 2.2, s.sub ? STARFORGE.color : el ? el.puff : '#ff9a3c');
      if (star && !s.sub && shells.length < MAX_BOMBLETS) {    // Cluster Shells: the burst throws bomblets around it
        const a0 = run.rng.next() * Math.PI * 2;
        for (let b = 0; b < star.bomblets; b++) {
          const a = a0 + (b * Math.PI * 2) / star.bomblets;
          shells.push({ x: s.x + Math.cos(a) * blast * star.scatter, y: s.y + Math.sin(a) * blast * star.scatter, t: star.delay, sub: true });
        }
      }
      const n = w.hash.queryRadius(s.x, s.y, br + MAX_ENEMY_RADIUS, w.scratch);
      for (let k = 0; k < n; k++) {
        const e = w.scratch[k];
        if (!e.alive) continue;
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const rr = br + e.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        const d = Math.hypot(dx, dy) || 1;
        strike(run, inst, e, bd, dx / d, dy / d, s.sub ? 1 : 0);
      }
    }
  },

  draw(inst, ctx, run) {
    const blast = param(run, inst, 'radius');
    const fuse = inst.def.base.fuse;
    const el = elementOf(inst);
    const ac = accentOf(inst);
    ctx.strokeStyle = el ? el.main : '#ff8a3c';
    ctx.lineWidth = 2;
    for (const s of inst.shells) {
      if (s.sub) {                                       // a cyan bomblet ring, closing
        const u2 = 1 - s.t / MUTATIONS.mortar.delay;
        ctx.globalAlpha = 0.3 + 0.5 * u2;
        ctx.strokeStyle = STARFORGE.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, blast * MUTATIONS.mortar.size * (1.15 - 0.15 * u2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = STARFORGE.light;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3 + 2 * u2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = el ? el.main : '#ff8a3c';
        continue;
      }
      const u = 1 - s.t / fuse;
      const col = el ? { main: el.main, light: el.light } : { main: '#ff8a3c', light: '#ffd9a0' };
      drawShellMark(ctx, s.x, s.y, blast, u, col, run.time);
      if (ac) {                                          // second element: an inner ring in its colour
        ctx.strokeStyle = ac.main;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.25 + 0.4 * u;
        ctx.beginPath();
        ctx.arc(s.x, s.y, blast * 0.7 * (1.15 - 0.15 * u), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (s.ox !== undefined) drawShell(ctx, s.ox, s.oy, s.x, s.y, u, col, run.time);
    }
    ctx.globalAlpha = 1;
  },
};
