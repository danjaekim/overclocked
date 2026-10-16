// projectile: fires `count` shots at the nearest enemy in range as a tight volley: a small angular
// `spread` plus a sideways `gap` between shots, so extra projectiles keep hitting a lone target
// instead of fanning past it (balance finding, docs/roadmap.md M9).
// All per-shot numbers come from the weapon's base params combined with stats via param().
// Starforge (Starfall): every Nth volley is marked; each enemy those arrows hit calls a star down on that
// spot a moment later (inst.falls), a small blast drawn as a cyan streak from above.

import { param } from '../game/weapon-params.js';
import { spawnProjectile } from '../game/projectiles.js';
import { attackTriggers } from '../game/triggers.js';
import { activeMutation } from '../game/starforge.js';
import { MUTATIONS, STARFORGE } from '../data/starforge.js';
import { strike } from '../game/hit.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { addPuff } from '../render/fx.js';

const isAlive = (o) => o.alive;
const FALL_H = 150;                        // how far above the spot a falling star is first drawn

// Called by collision when a Starfall arrow hits: queue a star on that spot.
export function callStar(run, inst, x, y, dmg) {
  const m = MUTATIONS.projectile;
  if (!inst.falls) inst.falls = [];
  if (inst.falls.length >= 40) return;     // a cap, so a piercing volley through a huge crowd stays cheap
  inst.falls.push({ x, y, t: m.delay, dmg: dmg * m.frac });
}

function updateFalls(inst, dt, run) {
  const falls = inst.falls;
  const m = MUTATIONS.projectile;
  const w = run.world;
  for (let i = falls.length - 1; i >= 0; i--) {
    const f = falls[i];
    f.t -= dt;
    if (f.t > 0) continue;
    falls.splice(i, 1);
    const n = w.hash.queryRadius(f.x, f.y, m.radius + MAX_ENEMY_RADIUS, w.scratch);
    for (let k = 0; k < n; k++) {
      const e = w.scratch[k];
      if (!e.alive) continue;
      const dx = e.x - f.x;
      const dy = e.y - f.y;
      const rr = m.radius + e.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      const d = Math.hypot(dx, dy) || 1;
      strike(run, inst, e, f.dmg, dx / d, dy / d, 1);      // depth 1: a star sets off no triggers of its own
    }
    addPuff(run, f.x, f.y, m.radius * 0.8, STARFORGE.color);
    addPuff(run, f.x, f.y, m.radius * 0.4, STARFORGE.light);
  }
}

export default {
  // stats this behavior reads (used later to avoid offering useless upgrades)
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'pierce', 'duration', 'projSpeed', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.25;                        // first shot almost immediately
  },

  update(inst, dt, run) {
    if (inst.falls && inst.falls.length) updateFalls(inst, dt, run);
    inst.cd -= dt;
    if (inst.cd > 0) return;

    const p = run.player;
    const range = param(run, inst, 'range');
    const target = run.world.hash.queryNearest(p.x, p.y, range, isAlive);
    if (!target) {                          // nothing to shoot: stay ready, don't bank a burst
      inst.cd = 0;
      return;
    }

    const count = Math.max(1, Math.round(param(run, inst, 'count')));
    const spread = inst.def.base.spread;
    const gap = inst.def.base.gap || 0;
    const base = Math.atan2(target.y - p.y, target.x - p.x);
    const dmg = param(run, inst, 'damage');
    const speed = param(run, inst, 'speed');
    const ttl = param(run, inst, 'ttl');
    const radius = param(run, inst, 'radius');
    const pierce = Math.floor(param(run, inst, 'pierce'));
    const star = activeMutation(inst);
    inst.volley = (inst.volley || 0) + 1;
    const falling = star && inst.volley % star.every === 0 ? 1 : 0;

    for (let i = 0; i < count; i++) {
      const k = i - (count - 1) / 2;
      const a = base + k * spread;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      // sideways offset perpendicular to the aim (-dy, dx)
      const pr = spawnProjectile(run, inst, p.x - dy * k * gap, p.y + dx * k * gap, dx, dy, speed, dmg, ttl, radius, pierce);
      if (pr) pr.fall = falling;
    }
    inst.cd += param(run, inst, 'cooldown');
    attackTriggers(run, inst, target.x, target.y, base);
  },

  // Falling stars: a cyan target ring that tightens as a streak drops onto it.
  draw(inst, ctx) {
    const falls = inst.falls;
    if (!falls || !falls.length) return;
    const m = MUTATIONS.projectile;
    ctx.lineCap = 'round';
    for (const f of falls) {
      const u = 1 - f.t / m.delay;                            // 0 just called .. 1 landing
      ctx.globalAlpha = 0.25 + 0.45 * u;
      ctx.strokeStyle = STARFORGE.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, m.radius * (1 - 0.45 * u), 0, Math.PI * 2);
      ctx.stroke();
      const sy = f.y - FALL_H * (1 - u);
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(f.x + 18 * (1 - u) + 10, sy - 34);
      ctx.lineTo(f.x + 18 * (1 - u), sy);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = STARFORGE.light;
      ctx.beginPath();
      ctx.arc(f.x + 18 * (1 - u), sy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  },
};
