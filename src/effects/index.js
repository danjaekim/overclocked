// Effect handlers used by triggers (docs/architecture.md §4.6).
// effect(run, trigger, src, x, y, depth, ang, target): src is the weapon instance that caused the
// trigger, (x, y) where it happened, ang the attack direction (attack triggers only) and target the
// enemy that was hit (hit / crit triggers only). Anything that deals damage enqueues it with depth + 1.

import { param } from '../game/weapon-params.js';
import { queueDamage, KIND_PROC } from '../systems/damage-queue.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { addPuff } from '../render/fx.js';
import { addPatch, addVortex, addPillar, addWave, addBlast } from '../systems/hazards.js';
import { spawnProjectile } from '../game/projectiles.js';

export const MAX_TRIGGER_DEPTH = 3;

export const EFFECTS = {
  // Burst of damage around (x, y): damageFrac of the weapon's own damage, radius scaled by area.
  explode(run, t, src, x, y, depth) {
    if (!src || depth + 1 > MAX_TRIGGER_DEPTH) return;
    const w = run.world;
    const area = run.player.stats.getFor('area', src.tags);
    const radius = t.params.radius * area;
    const dmg = t.params.dmg !== undefined ? t.params.dmg : param(run, src, 'damage') * t.params.damageFrac;   // dmg: absolute (the graft echo)
    const n = w.hash.queryRadius(x, y, radius + MAX_ENEMY_RADIUS, w.scratch);
    for (let i = 0; i < n; i++) {
      const e = w.scratch[i];
      if (!e.alive) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const rr = radius + e.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      const d = Math.hypot(dx, dy) || 1;
      const kb = t.params.kb || 60;
      queueDamage(run, e, dmg, false, (dx / d) * kb, (dy / d) * kb, depth + 1, src, KIND_PROC);
    }
    addPuff(run, x, y, radius / 2.4, t.params.color || '#ff9a3c');
  },

  // A flat damage-absorbing barrier on the player, capped at max hp.
  shield(run, t) {
    const p = run.player;
    p.shield = Math.min(p.maxHp, p.shield + t.params.amount);
  },
  // ---- M26 vocabulary (docs/design-m26-m28.md §2) ----

  // Burning ground at (x, y).
  fire_patch(run, t, src, x, y, depth) {
    if (!src || depth + 1 > MAX_TRIGGER_DEPTH) return;
    const p = t.params;
    addPatch(run, src, x, y, p.radius * area(run, src), p.ttl, p.tick, param(run, src, 'damage') * p.damageFrac, depth);
  },

  // Pulls the crowd toward (x, y), then collapses.
  vortex(run, t, src, x, y, depth) {
    if (!src || depth + 1 > MAX_TRIGGER_DEPTH) return;
    const p = t.params;
    addVortex(run, src, x, y, p.radius * area(run, src), p.ttl, p.pull, param(run, src, 'damage') * p.damageFrac, depth);
  },

  // A slow wave from the player along `ang`.
  shockwave(run, t, src, x, y, depth, ang) {
    if (!src || depth + 1 > MAX_TRIGGER_DEPTH) return;
    const p = t.params;
    const pl = run.player;
    if (p.cross) {                                            // Quakebreaker: four waves out of the crater
      for (let k = 0; k < 4; k++) {
        const a = ang + (k * Math.PI) / 2;
        addWave(run, src, x, y, Math.cos(a), Math.sin(a), p.speed, p.range * area(run, src), p.width * area(run, src),
          param(run, src, 'damage') * p.damageFrac, depth);
      }
      return;
    }
    addWave(run, src, pl.x, pl.y, Math.cos(ang), Math.sin(ang), p.speed, p.range * area(run, src), p.width * area(run, src),
      param(run, src, 'damage') * p.damageFrac, depth);
  },

  // A telegraphed column of light at (x, y).
  pillar(run, t, src, x, y, depth) {
    if (!src || depth + 1 > MAX_TRIGGER_DEPTH) return;
    const p = t.params;
    addPillar(run, src, x, y, p.radius * area(run, src), p.tele, param(run, src, 'damage') * p.damageFrac, depth);
  },

  // Strips the armour of everything within radius of (x, y) for dur seconds.
  sunder(run, t, src, x, y) {
    const w = run.world;
    const radius = t.params.radius * area(run, src);
    const n = w.hash.queryRadius(x, y, radius + MAX_ENEMY_RADIUS, w.scratch);
    for (let i = 0; i < n; i++) {
      const e = w.scratch[i];
      if (!e.alive) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const rr = radius + e.r;
      if (dx * dx + dy * dy <= rr * rr) e.sunderT = t.params.dur;
    }
  },

  // The enemy that was hit takes extra damage from every source for dur seconds.
  bless(run, t, src, x, y, depth, ang, target) {
    if (target && target.alive) target.blessT = t.params.dur;
  },

  // Heals the player.
  heal(run, t) {
    const p = run.player;
    p.hp = Math.min(p.maxHp, p.hp + t.params.amount);
  },

  // The weapon works faster for a moment (hounds run at +30% speed).
  frenzy(run, t, src) {
    if (src) src.frenzyT = t.params.dur;
  },

  // ---- M27: graft effects ----

  // Thunderscythe: `perSwing` storm shells along the edge of each swing's arc.
  shells(run, t, src, x, y, depth, ang) {
    if (!src || depth + 1 > MAX_TRIGGER_DEPTH) return;
    const p = t.params;
    const pl = run.player;
    const reach = param(run, src, 'range') * p.dist;
    const swings = Math.max(1, Math.round(param(run, src, 'count')));
    const dmg = param(run, src, 'damage') * p.damageFrac;
    const rad = p.radius * area(run, src);
    for (let s = 0; s < swings; s++) {
      const a0 = ang + (s * Math.PI * 2) / swings;
      for (let k = 0; k < p.perSwing; k++) {
        const a = a0 + (p.perSwing > 1 ? (k / (p.perSwing - 1) - 0.5) * p.spread * 2 : 0);
        addBlast(run, src, pl.x + Math.cos(a) * reach, pl.y + Math.sin(a) * reach, rad, p.tele, dmg, depth, { burn: true, shock: true });
      }
    }
  },

  // Glacier Maul: a hit on an enemy that was already frozen shatters into a ring of ice shards.
  // Only direct hits (depth 0) shatter, so a shatter never sets off more shatters.
  shatter(run, t, src, x, y, depth) {
    if (depth !== 0 || !run.hitFrozen) return;
    EFFECTS.explode(run, { params: { ...t.params, color: '#bfeaff', kb: 90 } }, src, x, y, depth);
  },

  // Bladestorm: blades thrown outward from the player, turning a little each time.
  fling(run, t, src, x, y, depth) {
    if (!src || depth + 1 > MAX_TRIGGER_DEPTH) return;
    const p = t.params;
    const pl = run.player;
    src.flingA = (src.flingA || 0) + p.twist;
    const dmg = param(run, src, 'damage') * p.damageFrac;
    for (let i = 0; i < p.count; i++) {
      const a = src.flingA + (i * Math.PI * 2) / p.count;
      const pr = spawnProjectile(run, src, pl.x, pl.y, Math.cos(a), Math.sin(a), p.speed, dmg, p.ttl, p.radius, p.pierce);
      if (pr) pr.sub = true;
    }
  },
};

function area(run, src) {
  return run.player.stats.getFor('area', src.tags);
}