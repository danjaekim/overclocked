// Entity drawing. Enemies are batched: one path per colour, a final white pass for
// hit-flashing ones. Everything is culled to the camera rect.

import { ENEMIES } from '../data/enemies.js';
import { GEM } from '../data/progression.js';
import { ORES } from '../data/ores.js';
import { BURN, CHILL, SHOCK, ST } from '../data/statuses.js';
import { gemTier, KIND_GEM, KIND_ORE, KIND_CHEST } from '../systems/pickups.js';
import { ELITE } from '../data/elites.js';

const TAU = Math.PI * 2;
const DEF_IDS = Object.keys(ENEMIES);

// XP gems: one batched fill per tier colour, drawn as small diamonds.
export function drawGems(ctx, view, run) {
  const list = run.world.pickups.active;
  if (list.length === 0) return;
  const cam = run.cam;
  const x0 = cam.x - view.w / 2 - 10;
  const x1 = cam.x + view.w / 2 + 10;
  const y0 = cam.y - view.h / 2 - 10;
  const y1 = cam.y + view.h / 2 + 10;
  for (let t = 0; t < GEM.tiers.length; t++) {
    ctx.fillStyle = GEM.tiers[t][2];
    ctx.beginPath();
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (g.x < x0 || g.x > x1 || g.y < y0 || g.y > y1) continue;
      if (g.kind !== KIND_GEM || gemTier(g.value) !== t) continue;
      const r = g.r;
      ctx.moveTo(g.x, g.y - r);
      ctx.lineTo(g.x + r, g.y);
      ctx.lineTo(g.x, g.y + r);
      ctx.lineTo(g.x - r, g.y);
      ctx.closePath();
    }
    ctx.fill();
  }
}

// Ore: small squares, one fill per ore type (starsteel is bigger and glows cyan).
const ORE_IDS = Object.keys(ORES);
export function drawOre(ctx, view, run) {
  const list = run.world.pickups.active;
  const cam = run.cam;
  const x0 = cam.x - view.w / 2 - 10;
  const x1 = cam.x + view.w / 2 + 10;
  const y0 = cam.y - view.h / 2 - 10;
  const y1 = cam.y + view.h / 2 + 10;
  for (let t = 0; t < ORE_IDS.length; t++) {
    ctx.fillStyle = ORES[ORE_IDS[t]].color;
    ctx.beginPath();
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (g.kind !== KIND_ORE || g.ore !== ORE_IDS[t]) continue;
      if (g.x < x0 || g.x > x1 || g.y < y0 || g.y > y1) continue;
      ctx.rect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
    }
    ctx.fill();
  }
}

// Chests: a gold box with a dark lid line (cyan and larger for the boss's), gently bobbing.
export function drawChests(ctx, view, run) {
  const list = run.world.pickups.active;
  const cam = run.cam;
  const x0 = cam.x - view.w / 2 - 20;
  const x1 = cam.x + view.w / 2 + 20;
  const y0 = cam.y - view.h / 2 - 20;
  const y1 = cam.y + view.h / 2 + 20;
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (g.kind !== KIND_CHEST) continue;
    if (g.x < x0 || g.x > x1 || g.y < y0 || g.y > y1) continue;
    const s = g.value === 1 ? 1.4 : 1;
    const y = g.y + Math.sin(run.time * 3 + g.x) * 2;
    ctx.fillStyle = g.value === 1 ? '#7fe9ff' : '#ffd34d';
    ctx.fillRect(g.x - 12 * s, y - 8 * s, 24 * s, 16 * s);
    ctx.fillStyle = 'rgba(40,24,6,0.85)';
    ctx.fillRect(g.x - 12 * s, y - 2 * s, 24 * s, 2.5 * s);
    ctx.fillRect(g.x - 2.5 * s, y - 4 * s, 5 * s, 6 * s);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4 + 0.3 * Math.sin(run.time * 4);
    ctx.strokeRect(g.x - 14 * s, y - 10 * s, 28 * s, 20 * s);
    ctx.globalAlpha = 1;
  }
}

// Arrows: one stroked path for the whole batch.
export function drawProjectiles(ctx, view, run) {
  const list = run.world.projectiles.active;
  if (list.length === 0) return;
  const cam = run.cam;
  const x0 = cam.x - view.w / 2 - 20;
  const x1 = cam.x + view.w / 2 + 20;
  const y0 = cam.y - view.h / 2 - 20;
  const y1 = cam.y + view.h / 2 + 20;
  ctx.strokeStyle = '#ffd27a';
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.dx * 12, p.y - p.dy * 12);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
}

export function drawEnemies(ctx, view, run) {
  const list = run.world.enemies.active;
  const cam = run.cam;
  const x0 = cam.x - view.w / 2 - 40;
  const x1 = cam.x + view.w / 2 + 40;
  const y0 = cam.y - view.h / 2 - 40;
  const y1 = cam.y + view.h / 2 + 40;

  for (let d = 0; d < DEF_IDS.length; d++) {
    const id = DEF_IDS[d];
    ctx.fillStyle = ENEMIES[id].color;
    ctx.beginPath();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.defId !== id || e.flash > 0) continue;
      if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
      ctx.moveTo(e.x + e.r, e.y);
      ctx.arc(e.x, e.y, e.r, 0, TAU);
    }
    ctx.fill();
  }

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.flash <= 0) continue;
    if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
    ctx.moveTo(e.x + e.r, e.y);
    ctx.arc(e.x, e.y, e.r, 0, TAU);
  }
  ctx.fill();

  drawStatusRings(ctx, list, x0, x1, y0, y1);
  drawEliteMarks(ctx, list, x0, x1, y0, y1, run.time);
}

// Elites get a pulsing gold ring and their affix name above them (there are only a few at a time).
function drawEliteMarks(ctx, list, x0, x1, y0, y1, t) {
  let started = false;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.elite !== 1) continue;
    if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
    if (!started) {
      started = true;
      ctx.lineWidth = 3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = '700 12px system-ui, sans-serif';
    }
    ctx.strokeStyle = ELITE.color;
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 6);
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 4, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ELITE.color;
    ctx.fillText(ELITE.affixes[e.affix].name, e.x, e.y - e.r - 8);
  }
}

// Status rings on every enemy that has one: one stroked path per colour, plus a pale fill for
// frozen ones. Enemies with no status cost a single integer test.
const RING = [
  [ST.BURN, BURN.color],
  [ST.CHILL, CHILL.color],
  [ST.SHOCK, SHOCK.color],
];
function drawStatusRings(ctx, list, x0, x1, y0, y1) {
  let any = false;
  for (let i = 0; i < list.length; i++) if (list[i].status & 15) { any = true; break; }
  if (!any) return;

  ctx.fillStyle = 'rgba(190, 235, 255, 0.55)';
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!(e.status & ST.FROZEN)) continue;
    if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
    ctx.moveTo(e.x + e.r, e.y);
    ctx.arc(e.x, e.y, e.r, 0, TAU);
  }
  ctx.fill();

  ctx.lineWidth = 2;
  for (let s = 0; s < RING.length; s++) {
    const bit = s === 1 ? ST.CHILL | ST.FROZEN : RING[s][0];
    ctx.strokeStyle = RING[s][1];
    ctx.beginPath();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!(e.status & bit)) continue;
      if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
      const r = e.r + 2 + s * 2;                  // stagger radii so overlapping statuses stay readable
      ctx.moveTo(e.x + r, e.y);
      ctx.arc(e.x, e.y, r, 0, TAU);
    }
    ctx.stroke();
  }
}

