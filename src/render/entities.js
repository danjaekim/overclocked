// Entity drawing. Enemies are sprites (discs batched per colour until the art loads), with a
// white silhouette for hit-flashing ones. Everything is culled to the camera rect.

import { ENEMIES, PROPS } from '../data/enemies.js';
import { GEM } from '../data/progression.js';
import { ORES } from '../data/ores.js';
import { BURN, CHILL, SHOCK, ST } from '../data/statuses.js';
import { gemTier, KIND_GEM, KIND_ORE, KIND_CHEST, KIND_HEAL, KIND_MAGNET } from '../systems/pickups.js';
import { ELITE, affixDefs } from '../data/elites.js';
import { getSprite } from './sprites.js';

const TAU = Math.PI * 2;
const ALL_DEFS = { ...ENEMIES, ...PROPS };             // enemies and props share the pool and the drawing
const DEF_IDS = Object.keys(ALL_DEFS);
const SPRITE_K = 3.5;                  // sprite width = radius * this (the hit circle stays the radius)
const LOOT_K = 4.2;                    // gem and ore sprite width = radius * this
const LIFT_K = 0.3;                    // feet sit near the circle's bottom

// XP gems: one batched fill per tier colour, drawn as small diamonds.
export function drawGems(ctx, view, run) {
  const list = run.world.pickups.active;
  if (list.length === 0) return;
  const cam = run.cam;
  const x0 = cam.x - view.w / 2 - 10;
  const x1 = cam.x + view.w / 2 + 10;
  const y0 = cam.y - view.h / 2 - 10;
  const y1 = cam.y + view.h / 2 + 10;
  const ready = getSprite('gem0') !== null;
  if (ready) {
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (g.kind !== KIND_GEM) continue;
      if (g.x < x0 || g.x > x1 || g.y < y0 || g.y > y1) continue;
      const w = g.r * LOOT_K;
      ctx.drawImage(getSprite('gem' + gemTier(g.value)), g.x - w / 2, g.y - w * 0.62, w, w);
    }
    return;
  }
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
  if (getSprite('ore_iron')) {
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (g.kind !== KIND_ORE) continue;
      if (g.x < x0 || g.x > x1 || g.y < y0 || g.y > y1) continue;
      const w = g.r * LOOT_K;
      ctx.drawImage(getSprite('ore_' + g.ore), g.x - w / 2, g.y - w * 0.62, w, w);
    }
    return;
  }
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
    const spr = getSprite(g.value === 1 ? 'bosschest' : 'chest');
    if (spr) {
      const w = 46 * s;
      ctx.drawImage(spr, g.x - w / 2, y - w * 0.62, w, w);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(run.time * 4);
      ctx.strokeRect(g.x - 14 * s, y - 10 * s, 28 * s, 20 * s);
      ctx.globalAlpha = 1;
      continue;
    }
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

// Hearts (supply crate heals): a bobbing green orb with a white cross, bright while you are hurt
// (when it will come to you) and dim at full health (when it waits).
export function drawHearts(ctx, view, run) {
  const list = run.world.pickups.active;
  const cam = run.cam;
  const x0 = cam.x - view.w / 2 - 20;
  const x1 = cam.x + view.w / 2 + 20;
  const y0 = cam.y - view.h / 2 - 20;
  const y1 = cam.y + view.h / 2 + 20;
  const hurt = run.player.hp < run.player.maxHp;
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (g.kind !== KIND_HEAL || g.x < x0 || g.x > x1 || g.y < y0 || g.y > y1) continue;
    const y = g.y + Math.sin(run.time * 4 + g.x) * 2;
    ctx.globalAlpha = hurt ? 1 : 0.6;
    ctx.fillStyle = 'rgba(125,255,154,0.25)';
    ctx.beginPath();
    ctx.arc(g.x, y, g.r + 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3fcf6a';
    ctx.strokeStyle = '#e9ffe9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(g.x, y, g.r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(g.x - 1.8, y - 6, 3.6, 12);
    ctx.fillRect(g.x - 6, y - 1.8, 12, 3.6);
    ctx.globalAlpha = 1;
  }
}

// Magnets (supply crate drop): a red horseshoe with white tips in a soft blue glow.
export function drawMagnets(ctx, view, run) {
  const list = run.world.pickups.active;
  const cam = run.cam;
  const x0 = cam.x - view.w / 2 - 20;
  const x1 = cam.x + view.w / 2 + 20;
  const y0 = cam.y - view.h / 2 - 20;
  const y1 = cam.y + view.h / 2 + 20;
  ctx.lineCap = 'butt';
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (g.kind !== KIND_MAGNET || g.x < x0 || g.x > x1 || g.y < y0 || g.y > y1) continue;
    const y = g.y + Math.sin(run.time * 4 + g.x) * 2;
    ctx.fillStyle = 'rgba(143,184,255,0.28)';
    ctx.beginPath();
    ctx.arc(g.x, y, g.r + 6, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 5.5;
    ctx.strokeStyle = '#e8453c';
    ctx.beginPath();
    ctx.moveTo(g.x - 7, y - 7);
    ctx.lineTo(g.x - 7, y);
    ctx.arc(g.x, y, 7, Math.PI, 0, true);
    ctx.lineTo(g.x + 7, y - 7);
    ctx.stroke();
    ctx.strokeStyle = '#f4f4ff';
    ctx.beginPath();
    ctx.moveTo(g.x - 7, y - 7);
    ctx.lineTo(g.x - 7, y - 3.5);
    ctx.moveTo(g.x + 7, y - 7);
    ctx.lineTo(g.x + 7, y - 3.5);
    ctx.stroke();
  }
}

// Projectiles: a shape from the weapon with the element as a skin (render/shots.js).
export { drawProjectiles } from './shots.js';

export function drawEnemies(ctx, view, run) {
  const list = run.world.enemies.active;
  const cam = run.cam;
  const x0 = cam.x - view.w / 2 - 40;
  const x1 = cam.x + view.w / 2 + 40;
  const y0 = cam.y - view.h / 2 - 40;
  const y1 = cam.y + view.h / 2 + 40;

  // Sprites where the art has loaded; the old discs otherwise (tests, or while loading).
  const px = run.player.x;
  let discs = false;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
    const spr = getSprite(e.defId, e.flash > 0);
    if (!spr) { discs = true; continue; }
    const w = e.r * SPRITE_K;
    const cy = e.y - e.r * LIFT_K;
    if (px < e.x) {                               // they all walk at the player, so face that way
      ctx.save();
      ctx.translate(e.x, cy);
      ctx.scale(-1, 1);
      ctx.drawImage(spr, -w / 2, -w / 2, w, w);
      ctx.restore();
    } else {
      ctx.drawImage(spr, e.x - w / 2, cy - w / 2, w, w);
    }
  }
  if (discs) {
    for (let d = 0; d < DEF_IDS.length; d++) {
      const id = DEF_IDS[d];
      if (getSprite(id)) continue;
      ctx.fillStyle = ALL_DEFS[id].color;
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
      if (e.flash <= 0 || getSprite(e.defId)) continue;
      if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
      ctx.moveTo(e.x + e.r, e.y);
      ctx.arc(e.x, e.y, e.r, 0, TAU);
    }
    ctx.fill();
  }

  drawStatusRings(ctx, list, x0, x1, y0, y1);
  drawEliteMarks(ctx, list, x0, x1, y0, y1, run.time);
  drawWards(ctx, list, x0, x1, y0, y1);
}

// A Shaman's ward: a faint teal circle on the ground, so the thing making the crowd tough is findable.
function drawWards(ctx, list, x0, x1, y0, y1) {
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.def.ward || e.x < x0 - 140 || e.x > x1 + 140 || e.y < y0 - 140 || e.y > y1 + 140) continue;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#5aa8b0';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.def.ward.radius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#8fe0e8';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
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
    ctx.fillText(affixDefs(e).map((a) => a.name).join(' '), e.x, e.y - e.r - 8);
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


// Slinger shots: a small ember bolt with a bright core.
export function drawEnemyShots(ctx, run) {
  const list = run.enemyShots;
  if (list.length === 0) return;
  ctx.fillStyle = '#e8531e';
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    ctx.moveTo(s.x + s.r + 1.5, s.y);
    ctx.arc(s.x, s.y, s.r + 1.5, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = '#ffe3a3';
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    ctx.moveTo(s.x + s.r * 0.55, s.y);
    ctx.arc(s.x, s.y, s.r * 0.55, 0, TAU);
  }
  ctx.fill();
}
