// summon: keeps up to `count` spirit minions alive, one more arriving every `cooldown` seconds.
// A minion hunts the nearest enemy within `range` of the player and cuts it on contact (each
// enemy at most once per `tickEvery` per minion); with nothing to hunt it drifts back to
// hover beside the player. Minions are spirits: they cannot be hurt, so no minion hp system is
// needed. Their hits are ordinary weapon hits, so every status, perk and trigger applies.

import { param } from '../game/weapon-params.js';
import { elementOf } from '../render/elements.js';
import { strike } from '../game/hit.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { attackTriggers } from '../game/triggers.js';
import { queueDamage, KIND_PROC } from '../systems/damage-queue.js';
import { applyBurn } from '../systems/status.js';
import { addRing } from '../systems/hazards.js';
import { activeMutation } from '../game/starforge.js';
import { STARFORGE } from '../data/starforge.js';

const MAX_MINIONS = 15;
const TAU = Math.PI * 2;

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'projSpeed', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.5;
    inst.frenzyT = 0;
    inst.minions = [];
    inst.t = 0;
  },

  update(inst, dt, run) {
    const p = run.player;
    const w = run.world;
    const list = inst.minions;
    const star = activeMutation(inst);
    const want = Math.min(MAX_MINIONS, Math.max(1, Math.round(param(run, inst, 'count'))) + (star ? 1 : 0));   // Star-touched: one extra
    if (inst.frenzyT > 0) inst.frenzyT -= dt;
    const speed = param(run, inst, 'speed') * (inst.frenzyT > 0 ? 1.3 : 1);   // Grave Legion's kill frenzy
    const leash = param(run, inst, 'range');
    const radius = param(run, inst, 'radius');
    const dmg = param(run, inst, 'damage');
    const aura = inst.fusion && inst.fusion.hooks.minionAura;   // Hellhounds
    const pulse = inst.fusion && inst.fusion.hooks.minionPulse; // Sanctum Titan
    const tickEvery = inst.def.base.tickEvery;
    inst.t += dt;

    inst.cd -= dt;
    if (inst.cd <= 0 && list.length < want) {
      const a = run.rng.next() * TAU;
      list.push({ x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 24, slot: list.length, hit: new Map(), bob: a, stomp: 0, auraT: 0 });
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

      if (m.stomp > 0) m.stomp -= dt;
      if (aura) auraTick(run, inst, m, aura, dt, dmg);
      if (pulse) pulseTick(run, inst, m, pulse, dt, dmg);
      let bit = false;
      const big = star && i === 0;                         // the star-touched one: bigger and harder-hitting
      const mr = big ? radius * star.size : radius;
      const n = w.hash.queryRadius(m.x, m.y, mr + MAX_ENEMY_RADIUS, w.scratch);
      for (let k = 0; k < n; k++) {
        const e = w.scratch[k];
        if (!e.alive) continue;
        const ex = e.x - m.x;
        const ey = e.y - m.y;
        const rr = mr + e.r;
        if (ex * ex + ey * ey > rr * rr) continue;
        const last = m.hit.get(e.uid);
        if (last !== undefined && run.time - last < tickEvery) continue;
        m.hit.set(e.uid, run.time);
        const ed = Math.hypot(ex, ey) || 1;
        strike(run, inst, e, big ? dmg * star.frac : dmg, ex / ed, ey / ed);
        bit = true;
      }
      if (bit && m.stomp <= 0 && inst.def.triggers.length) {   // Bone Colossus: each bite is a stomp (attack triggers)
        m.stomp = 0.5;
        attackTriggers(run, inst, m.x, m.y, 0);
      }
      if (m.hit.size > 24) {                               // forget stale entries
        for (const [uid, t] of m.hit) if (run.time - t > tickEvery * 2) m.hit.delete(uid);
      }
    }
  },

  draw(inst, ctx, run) {
    const aura = inst.fusion && inst.fusion.hooks.minionAura;
    if (aura) {                                            // the halo each minion carries
      ctx.strokeStyle = aura.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      for (const m of inst.minions) { ctx.moveTo(m.x + aura.radius, m.y); ctx.arc(m.x, m.y, aura.radius, 0, TAU); }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const r = param(run, inst, 'radius');                  // the real hit radius, so area (Wide, Heavy ...) shows
    const k = r / inst.def.base.radius;
    const el = elementOf(inst);
    if (el) {                                              // infused minions glow in the element's colour
      ctx.fillStyle = el.main;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      for (const m of inst.minions) { ctx.moveTo(m.x + r * 1.3, m.y); ctx.arc(m.x, m.y, r * 1.3, 0, TAU); }
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const star = activeMutation(inst);
    if (star && inst.minions.length) {                     // Star-touched: a glow round the first minion
      const m0 = inst.minions[0];
      ctx.fillStyle = STARFORGE.color;
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(run.time * 6);
      ctx.beginPath();
      ctx.arc(m0.x, m0.y, r * star.size * 1.5, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#e8e2cf';
    ctx.strokeStyle = el ? el.main : '#7d7660';
    ctx.lineWidth = el ? 2.5 : 1.5;
    for (let i = 0; i < inst.minions.length; i++) {
      const m = inst.minions[i];
      const big = star && i === 0;
      ctx.beginPath();
      ctx.arc(m.x, m.y, r * 0.8 * (big ? star.size : 1), 0, TAU);
      if (big) ctx.fillStyle = STARFORGE.light;
      ctx.fill();
      ctx.strokeStyle = big ? STARFORGE.color : el ? el.main : '#7d7660';
      ctx.stroke();
      ctx.fillStyle = '#2b2a24';                           // two eye sockets
      ctx.fillRect(m.x - 3.5 * k, m.y - 2.5 * k, 2.4 * k, 3 * k);
      ctx.fillRect(m.x + 1.1 * k, m.y - 2.5 * k, 2.4 * k, 3 * k);
      ctx.fillStyle = '#e8e2cf';
    }
  },
};

function isAlive(o) { return o.alive; }

// Sanctum Titan: every `every` seconds each minion sends out a ring of light (the Radiant Pulse it
// carries) that hurts and blesses everything it passes and mends you a little per enemy.
function pulseTick(run, inst, m, pl, dt, dmg) {
  m.pulseT = (m.pulseT === undefined ? pl.every * 0.5 : m.pulseT) - dt;
  if (m.pulseT > 0) return;
  m.pulseT += pl.every;
  addRing(run, inst, m.x, m.y, pl.range * run.player.stats.getFor('area', inst.tags), pl.speed, dmg * pl.damageFrac, 0,
    { status: 'bless', heal: pl.heal, color: pl.color, thick: 6 });
}

// A minion's burning aura: every `tick` seconds everything within `radius` of it takes a share of the
// weapon's damage and catches fire.
function auraTick(run, inst, m, a, dt, dmg) {
  m.auraT -= dt;
  if (m.auraT > 0) return;
  m.auraT += a.tick;
  const w = run.world;
  const n = w.hash.queryRadius(m.x, m.y, a.radius + MAX_ENEMY_RADIUS, w.scratch);
  for (let k = 0; k < n; k++) {
    const e = w.scratch[k];
    if (!e.alive) continue;
    const dx = e.x - m.x;
    const dy = e.y - m.y;
    const rr = a.radius + e.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    queueDamage(run, e, dmg * a.damageFrac, false, 0, 0, 1, inst, KIND_PROC);
    if (a.burn) applyBurn(run, e, inst, dmg * a.damageFrac, 1);
  }
}
