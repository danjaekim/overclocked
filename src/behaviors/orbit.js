// orbit: `count` blades circle the player and damage whatever they touch every `tickEvery`
// seconds (scaled by the cooldown stat). Area scales orbit radius and blade size.

import { param } from '../game/weapon-params.js';
import { strike } from '../game/hit.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { attackTriggers } from '../game/triggers.js';

const TAU = Math.PI * 2;

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'projSpeed', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.angle = 0;
    inst.tick = 0.2;
    inst.blades = 1;
    inst.orbitR = 0;
    inst.bladeR = 0;
    inst.launchT = 0;       // Spear Wheel: seconds until the next launch, and the phase of the current one
    inst.launchPhase = 0;   // 0 orbiting, 1 flying out, 2 flying back
    inst.launchU = 0;       // 0..1 how far out the blades are
    inst.launchHit = new Set();
  },

  update(inst, dt, run) {
    const p = run.player;
    const count = Math.max(1, Math.round(param(run, inst, 'count')));
    inst.blades = count;
    inst.orbitR = param(run, inst, 'range');
    inst.bladeR = param(run, inst, 'radius');
    inst.angle = (inst.angle + param(run, inst, 'speed') * dt) % TAU;
    const launch = inst.graft && inst.graft.hooks.launch;
    if (launch) launchStep(inst, dt, run, launch, count);

    inst.tick -= dt;
    if (inst.tick > 0) return;
    inst.tick += inst.def.base.tickEvery * param(run, inst, 'cooldown');

    const dmg = param(run, inst, 'damage');
    const w = run.world;
    attackTriggers(run, inst, p.x, p.y, inst.angle);
    const out = launchRadius(inst);
    for (let b = 0; b < count; b++) {
      const a = inst.angle + (b * TAU) / count;
      const bx = p.x + Math.cos(a) * out;
      const by = p.y + Math.sin(a) * out;
      const n = w.hash.queryRadius(bx, by, inst.bladeR + MAX_ENEMY_RADIUS, w.scratch);
      for (let i = 0; i < n; i++) {
        const e = w.scratch[i];
        if (!e.alive) continue;
        const dx = e.x - bx;
        const dy = e.y - by;
        const rr = inst.bladeR + e.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        const ox = e.x - p.x;
        const oy = e.y - p.y;
        const od = Math.hypot(ox, oy) || 1;
        strike(run, inst, e, dmg, ox / od, oy / od);    // pushed away from the player
      }
    }
  },

  draw(inst, ctx, run) {
    const p = run.player;
    const out = launchRadius(inst);
    ctx.fillStyle = inst.launchU > 0 ? '#ffe9a0' : '#9fd8ff';
    ctx.beginPath();
    for (let b = 0; b < inst.blades; b++) {
      const a = inst.angle + (b * TAU) / inst.blades;
      const bx = p.x + Math.cos(a) * out;
      const by = p.y + Math.sin(a) * out;
      ctx.moveTo(bx + inst.bladeR, by);
      ctx.arc(bx, by, inst.bladeR, 0, TAU);
    }
    ctx.fill();
  },
};

// Current distance of the blades from the player (the orbit radius, or further out mid-launch).
function launchRadius(inst) {
  const l = inst.graft && inst.graft.hooks.launch;
  return l ? inst.orbitR + (l.dist - inst.orbitR) * inst.launchU : inst.orbitR;
}

// Spear Wheel (graft hook): every `every` seconds the blades shoot out to `dist` and come back. They
// cut everything they pass, once per leg, checked every frame so a fast blade skips nothing.
function launchStep(inst, dt, run, l, count) {
  const p = run.player;
  if (inst.launchPhase === 0) {
    inst.launchT += dt;
    if (inst.launchT >= l.every) { inst.launchT = 0; inst.launchPhase = 1; inst.launchHit.clear(); }
    inst.launchU = 0;
    return;
  }
  const span = Math.max(1, l.dist - inst.orbitR);
  inst.launchU += (inst.launchPhase === 1 ? 1 : -1) * (l.speed * dt) / span;
  if (inst.launchPhase === 1 && inst.launchU >= 1) { inst.launchU = 1; inst.launchPhase = 2; inst.launchHit.clear(); }
  else if (inst.launchPhase === 2 && inst.launchU <= 0) { inst.launchU = 0; inst.launchPhase = 0; return; }
  const dmg = param(run, inst, 'damage') * 1.4;
  const out = launchRadius(inst);
  const w = run.world;
  const r = inst.bladeR * 1.5;
  for (let b = 0; b < count; b++) {
    const a = inst.angle + (b * TAU) / count;
    const bx = p.x + Math.cos(a) * out;
    const by = p.y + Math.sin(a) * out;
    const n = w.hash.queryRadius(bx, by, r + MAX_ENEMY_RADIUS, w.scratch);
    for (let i = 0; i < n; i++) {
      const e = w.scratch[i];
      if (!e.alive || inst.launchHit.has(e.uid)) continue;
      const dx = e.x - bx;
      const dy = e.y - by;
      const rr = r + e.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      inst.launchHit.add(e.uid);
      strike(run, inst, e, dmg, Math.cos(a), Math.sin(a));
    }
  }
}
