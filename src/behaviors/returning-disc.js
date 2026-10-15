// boomerang: throws `count` discs toward the nearest enemy; each flies out `range` units, then
// returns to the player, cutting every enemy it overlaps (each at most once per `tickEvery`).
// Discs are kept on the instance (a small fixed array), not in the projectile pool.
// Branches (docs/design-m30-m33.md §6.1), by the weapon's base params:
//   bounce { n, gain, range }  Ricochet Saw: the disc hops between up to n enemies (each within `range` of
//                              the last, never the same one twice), +gain damage per bounce so far, then
//                              returns when it runs out of enemies or has flown 2x its reach.
//   park { time, pull }        Gyre: the disc stops at the far end of its throw and spins as a buzzsaw for
//                              `time` s (cutting twice as often), dragging enemies in `pull` units/s.

import { param } from '../game/weapon-params.js';
import { attackTriggers } from '../game/triggers.js';
import { strike } from '../game/hit.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { stagger } from '../systems/status.js';
import { addRod } from '../systems/hazards.js';
import { addPuff } from '../render/fx.js';

const MILL_TELE = 0.22;

const MAX_DISCS = 10;
const FAN = 0.35;                 // radians between discs thrown together
const CATCH = 16;                 // distance at which a returning disc is caught

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'projSpeed', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.4;
    inst.discs = [];
    inst.mill = [];                 // Millstone: craters waiting to land { x, y, t }
  },

  update(inst, dt, run) {
    const p = run.player;
    const discs = inst.discs;
    const speed = param(run, inst, 'speed');
    const reach = param(run, inst, 'range');
    const radius = param(run, inst, 'radius');
    const dmg = param(run, inst, 'damage');
    const bs = inst.def.base;
    const tickEvery = bs.tickEvery * param(run, inst, 'cooldown');
    const w = run.world;

    if (inst.mill.length) millStep(inst, dt, run, dmg);

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
          discs.push({ x: p.x, y: p.y, dx: Math.cos(a), dy: Math.sin(a), out: 0, back: false, spin: 0, hit: new Map(), n: 0, tgt: null, parked: 0 });
        }
        inst.cd += param(run, inst, 'cooldown');
        attackTriggers(run, inst, target.x, target.y, base);
      }
    }

    // fly, cut, catch
    for (let i = discs.length - 1; i >= 0; i--) {
      const d = discs[i];
      d.spin += dt * (d.parked > 0 ? 30 : 14);
      if (d.parked > 0) {                                  // Gyre: parked and spinning, dragging the crowd in
        d.parked -= dt;
        if (d.parked <= 0) {
          d.parked = 0;
          d.back = true;
          const ms = inst.graft && inst.graft.hooks.millstone;
          if (ms) inst.mill.push({ x: d.x, y: d.y, t: MILL_TELE });   // the maul comes down where the saw gathered them
        }
        pullIn(run, d, radius * 3, bs.park.pull * dt);
      } else if (!d.back && bs.bounce) {                   // Ricochet Saw: hop to the nearest enemy this disc has not cut
        if (!d.tgt || !d.tgt.alive || d.hit.has(d.tgt.uid)) {
          if (d.tgt && d.hit.has(d.tgt.uid)) {
            d.n++;
            const sr = inst.graft && inst.graft.hooks.bounceRod;   // Storm Saw: each bounce plants a short rod
            if (sr) addRod(run, inst, d.tgt.x, d.tgt.y, sr.radius * run.player.stats.getFor('area', inst.tags), sr.ttl, dmg * sr.frac, { every: sr.every, zaps: sr.zaps, max: sr.max, link: sr.link });
          }
          d.tgt = d.n >= bs.bounce.n ? null : nearestUncut(run, d, d.n === 0 ? reach * 1.1 : bs.bounce.range, p);
          if (!d.tgt) d.back = true;
        }
        if (d.tgt) {
          const tx = d.tgt.x - d.x;
          const ty = d.tgt.y - d.y;
          const td = Math.hypot(tx, ty) || 1;
          d.dx = tx / td;
          d.dy = ty / td;
          const step = Math.min(speed * 1.15 * dt, td + 4);
          d.x += d.dx * step;
          d.y += d.dy * step;
          d.out += step;
          if (d.out >= reach * 2) d.back = true;
        }
      } else if (!d.back) {
        d.x += d.dx * speed * dt;
        d.y += d.dy * speed * dt;
        d.out += speed * dt;
        if (d.out >= reach) { if (bs.park) d.parked = bs.park.time; else d.back = true; }
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
        if (last !== undefined && run.time - last < (d.parked > 0 ? tickEvery * 0.5 : tickEvery)) continue;   // so a fast pass still hits and a lingering one keeps cutting
        d.hit.set(e.uid, run.time);
        const ed = Math.hypot(ex, ey) || 1;
        strike(run, inst, e, bs.bounce ? dmg * (1 + bs.bounce.gain * d.n) : dmg, ex / ed, ey / ed);
      }
    }
  },

  draw(inst, ctx, run) {
    const ms = inst.graft && inst.graft.hooks.millstone;
    if (ms) {
      for (const m of inst.mill) {                         // the maul's shadow before it lands
        const u = 1 - m.t / MILL_TELE;
        ctx.globalAlpha = 0.2 + 0.35 * u;
        ctx.fillStyle = '#1a1208';
        ctx.beginPath();
        ctx.arc(m.x, m.y, ms.radius * (0.5 + 0.5 * u), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffd9a0';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const col = inst.def.base.color;
    ctx.strokeStyle = col || '#d9dde8';
    ctx.fillStyle = col || '#aeb6c8';
    ctx.lineWidth = 2;
    for (const d of inst.discs) {
      if (d.parked > 0) {                                  // the drag zone of a parked Gyre
        ctx.globalAlpha = 0.18 + 0.1 * Math.sin(d.spin * 0.5);
        ctx.beginPath();
        ctx.arc(d.x, d.y, param(run, inst, 'radius') * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.spin);
      ctx.beginPath();
      const rad = param(run, inst, 'radius');
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
};

// Nearest living enemy within `range` of the disc that this disc has not cut yet.
function nearestUncut(run, d, range, p) {
  const w = run.world;
  const cx = d.n === 0 ? p.x : d.x;
  const cy = d.n === 0 ? p.y : d.y;
  const n = w.hash.queryRadius(cx, cy, range + MAX_ENEMY_RADIUS, w.scratch);
  let best = null;
  let bd = range * range;
  for (let i = 0; i < n; i++) {
    const e = w.scratch[i];
    if (!e.alive || d.hit.has(e.uid)) continue;
    const dd = (e.x - cx) * (e.x - cx) + (e.y - cy) * (e.y - cy);
    if (dd < bd) { bd = dd; best = e; }
  }
  return best;
}

// Gyre: drags every enemy within `radius` of the parked disc toward it by `step` units (bosses resist).
function pullIn(run, d, radius, step) {
  const w = run.world;
  const n = w.hash.queryRadius(d.x, d.y, radius + MAX_ENEMY_RADIUS, w.scratch);
  for (let i = 0; i < n; i++) {
    const e = w.scratch[i];
    if (!e.alive) continue;
    const dx = d.x - e.x;
    const dy = d.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 10 || dist > radius) continue;
    const k = (e.def.boss ? 0.3 : 1) * step / dist;
    e.x += dx * k;
    e.y += dy * k;
  }
}

// Millstone: the maul lands on each spot a parked saw has finished spinning: a crater that hits and
// staggers everything inside.
function millStep(inst, dt, run, dmg) {
  const ms = inst.graft.hooks.millstone;
  const w = run.world;
  for (let i = inst.mill.length - 1; i >= 0; i--) {
    const m = inst.mill[i];
    m.t -= dt;
    if (m.t > 0) continue;
    inst.mill.splice(i, 1);
    const r = ms.radius * run.player.stats.getFor('area', inst.tags);
    const n = w.hash.queryRadius(m.x, m.y, r + MAX_ENEMY_RADIUS, w.scratch);
    for (let k = 0; k < n; k++) {
      const e = w.scratch[k];
      if (!e.alive) continue;
      const dx = e.x - m.x;
      const dy = e.y - m.y;
      if (dx * dx + dy * dy > (r + e.r) * (r + e.r)) continue;
      const d = Math.hypot(dx, dy) || 1;
      strike(run, inst, e, dmg * ms.damageFrac, (dx / d) * 2, (dy / d) * 2);
      stagger(e, ms.stun);
    }
    addPuff(run, m.x, m.y, r / 2, '#d9c3a0');
    addPuff(run, m.x, m.y, r / 3.2, '#fff1d6');
  }
}
