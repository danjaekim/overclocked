// Enemy movement: chase the player, push apart from close neighbours (every other tick,
// at most 4 neighbours), decay knockback, teleport stragglers back to the spawn perimeter.

import { randomPerimeterPoint } from '../game/director.js';
import { affixDefs } from '../data/elites.js';
import { spawnEnemyShot } from './enemy-shots.js';
import { castMeteors, castSlam } from './boss-zones.js';

const SEP_RADIUS = 2.2;       // x enemy radius
const SEP_MAX_NEIGHBOURS = 4;
const SEP_SPEED = 55;         // world units / second of push at full overlap
const KNOCK_DECAY = 8;        // per second
const tmp = { x: 0, y: 0 };

const AI_CHASE = 0;
const AI_WINDUP = 1;
const AI_DASH = 2;

// Boss charge: chase for `every` seconds, stand and flash for `windup` (aiming at where the
// player is when it ends), then dash in a straight line. Returns the speed multiplier mode.
function bossStep(e, p, dt) {
  const c = e.def.charge;
  if (e.ai === AI_CHASE) {
    e.aiCd -= dt;
    if (e.aiCd <= 0) { e.ai = AI_WINDUP; e.aiT = c.windup; }
  } else if (e.ai === AI_WINDUP) {
    e.aiT -= dt;
    e.flash = 0.05;                                   // flicker white as the telegraph
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.ax = dx / d;
    e.ay = dy / d;
    if (e.aiT <= 0) { e.ai = AI_DASH; e.aiT = c.time; }
  } else {
    e.aiT -= dt;
    if (e.aiT <= 0) { e.ai = AI_CHASE; e.aiCd = c.every; }
  }
}

// Caster boss: keeps its distance (backs off inside 0.75 x range, closes beyond range), and every `every`
// seconds stands still and flashes for `windup` before calling down the meteors. Returns the
// speed multiplier along the line to the player: negative backs away, 0 stands.
function casterStep(run, e, d, dt) {
  const c = e.def.caster;
  const rage = e.hp <= e.maxHp * c.rageAt;
  if (e.ai === AI_CHASE) {
    e.aiCd -= dt * (rage ? c.rageSpeed : 1);
    if (e.aiCd <= 0) { e.ai = AI_WINDUP; e.aiT = c.windup; }
  } else {
    e.aiT -= dt;
    e.flash = 0.05;
    if (e.aiT <= 0) { castMeteors(run, e); e.ai = AI_CHASE; e.aiCd = c.every; }
  }
  if (e.ai === AI_WINDUP) return 0;
  return d < c.range * 0.75 ? -1 : d > c.range ? 1 : 0;
}

// Slammer (Crusher): walks at the player; once within reach and off cooldown it stops, flashes, and the
// circle it marked around itself blasts at the end of `windup`. Returns true while it stands still.
function slamStep(run, e, d, dt) {
  const s = e.def.slam;
  if (e.ai === AI_CHASE) {
    e.aiCd -= dt;
    if (e.aiCd <= 0 && d < s.radius * 1.6) { e.ai = AI_WINDUP; e.aiT = s.windup; castSlam(run, e); }
    return false;
  }
  e.aiT -= dt;
  e.flash = 0.05;
  if (e.aiT <= 0) { e.ai = AI_CHASE; e.aiCd = s.every; }
  return true;
}

// Ranged: once inside `range` it stops, counts down, flashes through the windup and throws.
// Returns true while it should stand still. A frozen enemy (slowMul 0) neither counts down nor shoots.
function rangedStep(run, e, d, dt) {
  const r = e.def.ranged;
  if (e.slowMul > 0 && d < r.range * 1.15) {
    if (e.ai === AI_CHASE) {
      e.aiCd -= dt;
      if (e.aiCd <= 0) { e.ai = AI_WINDUP; e.aiT = r.windup; }
    } else {
      e.aiT -= dt;
      e.flash = 0.04;
      if (e.aiT <= 0) { spawnEnemyShot(run, e); e.ai = AI_CHASE; e.aiCd = r.cooldown; }
    }
  }
  return e.ai === AI_WINDUP || d < r.range;
}

export function updateEnemies(run, dt) {
  const w = run.world;
  const p = run.player;
  const list = w.enemies.active;
  const hash = w.hash;
  const scratch = w.scratch;
  const parity = w.tick & 1;
  const farSq = (run.view.h * 1.5) * (run.view.h * 1.5);
  const decay = Math.max(0, 1 - KNOCK_DECAY * dt);

  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;

    if (e.prop === 1) {                     // a supply crate: stands still, fades, never chases or hurts
      e.aiCd -= dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.aiCd <= 0 || d2 > farSq * 2) w.enemies.release(e);
      continue;
    }

    if (d2 > farSq) {                       // too far to matter: re-enter from the edge
      randomPerimeterPoint(run, tmp);
      e.x = tmp.x;
      e.y = tmp.y;
      continue;
    }

    if ((i & 1) === parity) {               // separation, half the enemies each tick
      const rad = e.r * SEP_RADIUS;
      const n = hash.queryRadius(e.x, e.y, rad, scratch);
      let px = 0;
      let py = 0;
      let used = 0;
      for (let k = 0; k < n && used < SEP_MAX_NEIGHBOURS; k++) {
        const o = scratch[k];
        if (o === e || !o.alive) continue;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const od = Math.hypot(ox, oy);
        if (od < 1e-3) { px += 1; used++; continue; }
        const f = 1 - od / rad;
        px += (ox / od) * f;
        py += (oy / od) * f;
        used++;
      }
      e.sx = px;
      e.sy = py;
    }

    const stunned = e.stunT > 0;                        // staggered by a slam: no moving, shooting or charging
    if (stunned) e.stunT -= dt;
    if (e.def.charge && !stunned) bossStep(e, p, dt);
    let casterMode = 1;
    if (e.def.caster && !stunned && e.slowMul > 0) casterMode = casterStep(run, e, Math.sqrt(d2), dt);
    const d = Math.sqrt(d2);
    const inv = d > 1e-3 ? 1 / d : 0;
    const sp = e.speed * e.slowMul;                     // chill slows; frozen sets slowMul to 0
    let vx = dx * inv * sp;
    let vy = dy * inv * sp;
    if (stunned) { vx = 0; vy = 0; }
    else if (e.def.slam) { if (e.slowMul > 0 && slamStep(run, e, Math.sqrt(d2), dt)) { vx = 0; vy = 0; } }
    else if (e.def.caster) { vx *= casterMode; vy *= casterMode; }
    else if (e.def.ranged && rangedStep(run, e, d, dt)) { vx = 0; vy = 0; }
    if (e.def.charge && !stunned) {
      if (e.ai === AI_WINDUP) { vx = 0; vy = 0; }
      else if (e.ai === AI_DASH) { vx = e.ax * e.def.charge.speed; vy = e.ay * e.def.charge.speed; }
    }
    e.x += (vx + e.sx * SEP_SPEED + e.kx) * dt;
    e.y += (vy + e.sy * SEP_SPEED + e.ky) * dt;
    e.kx *= decay;
    e.ky *= decay;
    if (e.flash > 0) e.flash -= dt;
    if (e.sunderT > 0) e.sunderT -= dt;
    if (e.blessT > 0) e.blessT -= dt;
    if (e.wardT > 0) e.wardT -= dt;
    if (e.def.ward) {                                     // Shaman: everything near it takes half damage while it lives
      e.aiCd -= dt;
      if (e.aiCd <= 0) {
        e.aiCd = 0.25;
        const wr = e.def.ward.radius;
        const n = hash.queryRadius(e.x, e.y, wr, scratch);
        for (let k = 0; k < n; k++) if (scratch[k] !== e && scratch[k].alive) scratch[k].wardT = 0.5;
      }
    }
    if (e.elite === 1) {                                  // Regenerating: heals once it has gone unhit for a while
      for (const a of affixDefs(e)) {
        if (a.regenFrac && run.time - e.lastHitT > a.delay && e.hp < e.maxHp) {
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * a.regenFrac * dt);
        }
      }
    }
  }
}
