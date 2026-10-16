// bolt: strikes the `count` nearest enemies in range instantly (no projectile to dodge or miss),
// drawing a lightning arc to each. The hit is an ordinary weapon hit, so a shock chance chains
// onward through chainArc exactly like a javelin's would.

import { param } from '../game/weapon-params.js';
import { arcColor } from '../render/elements.js';
import { strike } from '../game/hit.js';
import { addArc } from '../render/fx.js';
import { attackTriggers } from '../game/triggers.js';

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.4;
    inst.picked = new Array(12).fill(0);   // uids already struck this volley
    inst.nPicked = 0;
    inst.fam = null;                       // Familiars: the hounds (graft hook)
  },

  draw(inst, ctx, run) {
    if (!inst.fam) return;
    ctx.fillStyle = '#d9c9ff';
    ctx.strokeStyle = '#7b6aa8';
    ctx.lineWidth = 1.5;
    for (const f of inst.fam) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2b2a24';
      ctx.fillRect(f.x - 3.5, f.y - 2, 2.2, 2.8);
      ctx.fillRect(f.x + 1.3, f.y - 2, 2.2, 2.8);
      ctx.fillStyle = '#d9c9ff';
    }
  },

  update(inst, dt, run) {
    const fam = inst.graft && inst.graft.hooks.familiars;
    if (fam) familiarStep(inst, dt, run, fam);
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

// Familiars (graft hook): hounds that hover around the player and each cast a small bolt on a timer.
function familiarStep(inst, dt, run, fam) {
  const p = run.player;
  const w = run.world;
  if (!inst.fam) inst.fam = [];
  while (inst.fam.length < fam.count) inst.fam.push({ x: p.x, y: p.y, t: fam.every * (0.3 + 0.35 * inst.fam.length) });
  const dmg = param(run, inst, 'damage') * fam.damageFrac;
  for (let i = 0; i < inst.fam.length; i++) {
    const f = inst.fam[i];
    const a = run.time * 1.4 + (i * Math.PI * 2) / inst.fam.length;
    f.x += (p.x + Math.cos(a) * 46 - f.x) * Math.min(1, 8 * dt);
    f.y += (p.y + Math.sin(a) * 46 - f.y) * Math.min(1, 8 * dt);
    f.t -= dt;
    if (f.t > 0) continue;
    const e = w.hash.queryNearest(f.x, f.y, fam.range, (o) => o.alive);
    if (!e) { f.t = 0.2; continue; }
    f.t += fam.every;
    for (let k = 0, t = e; k < (fam.targets || 1) && t; k++) {           // the hound's bolt, like the host's, strikes more than one
      const d = Math.hypot(t.x - f.x, t.y - f.y) || 1;
      addArc(run, f.x, f.y, t.x, t.y, arcColor(inst));
      strike(run, inst, t, dmg, (t.x - f.x) / d, (t.y - f.y) / d);
      const prev = t;
      t = w.hash.queryNearest(prev.x, prev.y, 120, (o) => o.alive && o !== e && o !== prev);
    }
  }
}
