// Hazards (docs/design-m26-m28.md §2): things the weapons leave in the world for a while.
//   patch   burning ground: ticks damage and burn on anything standing in it
//   vortex  pulls enemies toward a point, then bursts
//   pillar  a telegraphed column of light that hits everything in its radius once
//   wave    a slow ground shockwave that travels along a line and hits each enemy once
// One flat array on the run, capped. Damage is queued as PROC damage attributed to the weapon
// instance that made the hazard, so every perk, status and trigger applies as usual.

import { queueDamage, KIND_PROC } from './damage-queue.js';
import { applyBurn } from './status.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { addPuff } from '../render/fx.js';

export const HAZARD_CAP = 90;
const PATCH = 0, VORTEX = 1, PILLAR = 2, WAVE = 3;
const TAU = Math.PI * 2;

function add(run, h) {
  const list = run.hazards;
  if (list.length >= HAZARD_CAP) {
    if (h.kind !== PATCH) {                 // a patch is the cheapest thing to lose: drop the oldest one
      const i = list.findIndex((o) => o.kind === PATCH);
      if (i < 0) return null;
      list.splice(i, 1);
    } else return null;
  }
  list.push(h);
  return h;
}

export function addPatch(run, src, x, y, radius, ttl, tick, dmg, depth) {
  return add(run, { kind: PATCH, src, x, y, r: radius, ttl, life: ttl, tick, t: tick * 0.5, dmg, depth });
}
export function addVortex(run, src, x, y, radius, ttl, pull, dmg, depth) {
  return add(run, { kind: VORTEX, src, x, y, r: radius, ttl, life: ttl, pull, dmg, depth });
}
export function addPillar(run, src, x, y, radius, tele, dmg, depth) {
  return add(run, { kind: PILLAR, src, x, y, r: radius, ttl: tele + 0.3, tele, life: tele + 0.3, dmg, depth, done: false });
}
export function addWave(run, src, x, y, dx, dy, speed, range, width, dmg, depth) {
  return add(run, { kind: WAVE, src, x, y, dx, dy, speed, left: range, r: width, ttl: range / speed + 0.2, life: range / speed + 0.2, dmg, depth, hit: new Set() });
}

function hitCircle(run, h, x, y, r, dmg, kb) {
  const w = run.world;
  const n = w.hash.queryRadius(x, y, r + MAX_ENEMY_RADIUS, w.scratch);
  for (let i = 0; i < n; i++) {
    const e = w.scratch[i];
    if (!e.alive) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const rr = r + e.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    const d = Math.hypot(dx, dy) || 1;
    queueDamage(run, e, dmg, false, (dx / d) * kb, (dy / d) * kb, h.depth + 1, h.src, KIND_PROC);
  }
}

export function updateHazards(run, dt) {
  const list = run.hazards;
  if (list.length === 0) return;
  const w = run.world;
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i];
    h.ttl -= dt;
    if (h.kind === PATCH) {
      h.t -= dt;
      if (h.t <= 0) {
        h.t += h.tick;
        const n = w.hash.queryRadius(h.x, h.y, h.r + MAX_ENEMY_RADIUS, w.scratch);
        for (let k = 0; k < n; k++) {
          const e = w.scratch[k];
          if (!e.alive) continue;
          const dx = e.x - h.x;
          const dy = e.y - h.y;
          const rr = h.r + e.r;
          if (dx * dx + dy * dy > rr * rr) continue;
          queueDamage(run, e, h.dmg, false, 0, 0, h.depth + 1, h.src, KIND_PROC);
          applyBurn(run, e, h.src, h.dmg, h.depth + 1);
        }
      }
    } else if (h.kind === VORTEX) {
      const reach = h.r * 1.4;
      const n = w.hash.queryRadius(h.x, h.y, reach + MAX_ENEMY_RADIUS, w.scratch);
      for (let k = 0; k < n; k++) {
        const e = w.scratch[k];
        if (!e.alive) continue;
        const dx = h.x - e.x;
        const dy = h.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d > reach || d < 6) continue;
        const step = Math.min(d, h.pull * (e.def.boss ? 0.15 : 1) * dt);
        e.x += (dx / d) * step;
        e.y += (dy / d) * step;
      }
      if (h.ttl <= 0) {                                      // the collapse
        hitCircle(run, h, h.x, h.y, h.r, h.dmg, 120);
        addPuff(run, h.x, h.y, h.r / 2.2, '#c58bff');
      }
    } else if (h.kind === PILLAR) {
      if (!h.done && h.life - h.ttl >= h.tele) {
        h.done = true;
        hitCircle(run, h, h.x, h.y, h.r, h.dmg, 40);
        addPuff(run, h.x, h.y, h.r / 1.6, '#fff3b0');
      }
    } else {                                                 // WAVE
      const step = Math.min(h.left, h.speed * dt);
      h.x += h.dx * step;
      h.y += h.dy * step;
      h.left -= step;
      const n = w.hash.queryRadius(h.x, h.y, h.r + MAX_ENEMY_RADIUS, w.scratch);
      for (let k = 0; k < n; k++) {
        const e = w.scratch[k];
        if (!e.alive || h.hit.has(e.uid)) continue;
        const dx = e.x - h.x;
        const dy = e.y - h.y;
        const rr = h.r + e.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        h.hit.add(e.uid);
        queueDamage(run, e, h.dmg, false, h.dx * 90, h.dy * 90, h.depth + 1, h.src, KIND_PROC);
      }
      if (h.left <= 0) h.ttl = Math.min(h.ttl, 0.15);
    }
    if (h.ttl <= 0) {
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}

// Drawn under the enemies. Everything here is cheap strokes and fills.
export function drawHazards(ctx, run) {
  const list = run.hazards;
  if (list.length === 0) return;
  const t = run.time;
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    const k = h.ttl / h.life;                                // 1 -> 0
    if (h.kind === PATCH) {
      ctx.globalAlpha = Math.min(1, k * 2) * 0.28;
      ctx.fillStyle = '#ff6a2e';
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r * (0.9 + 0.1 * Math.sin(t * 9 + h.x)), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = Math.min(1, k * 2) * 0.5;
      ctx.strokeStyle = '#ffb45e';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (h.kind === VORTEX) {
      const spin = t * 5;
      ctx.strokeStyle = '#c58bff';
      ctx.lineWidth = 2.5;
      for (let r = 0; r < 3; r++) {
        const rad = h.r * (0.35 + r * 0.3) * (1.05 - 0.25 * (1 - k));
        ctx.globalAlpha = 0.35 + 0.15 * r;
        ctx.beginPath();
        ctx.arc(h.x, h.y, rad, spin + r, spin + r + 4.2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#2a1646';
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r * 0.28, 0, TAU);
      ctx.fill();
    } else if (h.kind === PILLAR) {
      const age = h.life - h.ttl;
      if (age < h.tele) {                                    // telegraph: a ring closing in
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#fff3b0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r * (1.4 - 0.4 * (age / h.tele)), 0, TAU);
        ctx.stroke();
      } else {
        const f = 1 - (age - h.tele) / 0.3;
        ctx.globalAlpha = 0.75 * f;
        ctx.fillStyle = '#fff3b0';
        ctx.fillRect(h.x - h.r * 0.5, h.y - 260, h.r, 260);
        ctx.globalAlpha = 0.45 * f;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.globalAlpha = Math.min(1, k * 3) * 0.55;
      ctx.strokeStyle = '#ffe3a3';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const nx = -h.dy * h.r * 0.9;
      const ny = h.dx * h.r * 0.9;
      ctx.moveTo(h.x + nx - h.dx * 14, h.y + ny - h.dy * 14);
      ctx.lineTo(h.x - nx - h.dx * 14, h.y - ny - h.dy * 14);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }
  ctx.globalAlpha = 1;
}
