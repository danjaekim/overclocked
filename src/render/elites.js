// Elite looks (docs: M45). An elite is no longer a bigger enemy in a gold ring: each AFFIX has its own signature, drawn on and
// around the body, so you can read what it does from across the screen:
//   Swift         ghost afterimages and speed streaks trailing behind it
//   Warded        a faceted shield bubble that holds while it is above half hp, and is simply gone below it
//   Regenerating  green motes rising off it; brighter and denser while it is actually mending
//   Armoured      riveted steel plates over the body; sparks fly when it is hit
//   Volatile      a hot pulsing glow and glowing cracks that quicken as it weakens; a faint blast ring shows when it is close to death
// Two-affix elites (late in the run) wear both. Drawing only. `drawEliteBack` runs before the enemy sprites, `drawEliteFront` after.

import { ELITE, affixDefs } from '../data/elites.js';
import { ELITE_ART } from './elite-art.js';

const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
export const AFFIX_COLOR = { swift: '#6cf0c8', warded: '#9cc4ff', regenerating: '#7dff8a', armoured: '#c3cbd8', volatile: '#ff7a3a' };
const HEX = 6;

const has = (e, id) => e.affix === id || e.affix2 === id;
const ownBody = (e, id) => e.affix === id && !!ELITE_ART['elite_' + id];     // the sprite already shows it (plates, cracks)

// Behind the body: swift afterimages, the volatile glow, the regenerating halo.
export function drawEliteBack(ctx, list, x0, x1, y0, y1, px, py, t, blit) {
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.elite !== 1 || e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
    if (has(e, 'volatile')) {
      const low = 1 - e.hp / e.maxHp;
      const pulse = 0.5 + 0.5 * Math.sin(t * (5 + 11 * low) + e.uid);
      const R = e.r * (1.5 + 0.25 * pulse);
      const g = ctx.createRadialGradient(e.x, e.y, e.r * 0.3, e.x, e.y, R);
      g.addColorStop(0, 'rgba(255,120,40,0.55)');
      g.addColorStop(1, 'rgba(255,70,20,0)');
      ctx.globalAlpha = 0.45 + 0.35 * low + 0.2 * pulse;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, R, 0, TAU);
      ctx.fill();
    }
    if (has(e, 'regenerating') && e.hp < e.maxHp && t - e.lastHitT > 2) {   // mending: a soft green halo
      const R = e.r * 1.45;
      const g = ctx.createRadialGradient(e.x, e.y, e.r * 0.4, e.x, e.y, R);
      g.addColorStop(0, 'rgba(120,255,140,0.35)');
      g.addColorStop(1, 'rgba(120,255,140,0)');
      ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 4 + e.uid);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, R, 0, TAU);
      ctx.fill();
    }
    if (has(e, 'swift')) {                               // afterimages along the line it came in on
      let dx = e.x - px, dy = e.y - py;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      for (let k = 3; k >= 1; k--) {
        ctx.globalAlpha = 0.34 - k * 0.08;
        blit(e, dx * e.r * 0.75 * k, dy * e.r * 0.75 * k);
      }
    }
  }
  ctx.globalAlpha = 1;
}

// In front of the body: shield, plates, cracks, streaks, motes, the name.
export function drawEliteFront(ctx, list, x0, x1, y0, y1, px, py, t) {
  let started = false;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.elite !== 1 || e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
    if (!started) {
      started = true;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = '700 11px system-ui, sans-serif';
    }
    const cy = e.y - e.r * 0.3;
    if (has(e, 'armoured') && !ownBody(e, 'armoured')) drawPlates(ctx, e, cy, t);
    if (has(e, 'volatile')) drawCracks(ctx, e, cy, t, ownBody(e, 'volatile'));
    if (has(e, 'swift')) drawStreaks(ctx, e, cy, px, py, t);
    if (has(e, 'warded')) drawShield(ctx, e, cy, t);
    if (has(e, 'regenerating')) drawMotes(ctx, e, cy, t);
    const defs = affixDefs(e);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = AFFIX_COLOR[e.affix] || ELITE.color;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    const label = defs.map((a) => a.name).join(' ');
    ctx.strokeText(label, e.x, e.y - e.r - 8);
    ctx.fillText(label, e.x, e.y - e.r - 8);
  }
  ctx.globalAlpha = 1;
}

function drawShield(ctx, e, cy, t) {
  const frac2 = e.hp / e.maxHp;
  const w = ELITE.affixes.warded;
  if (frac2 <= w.untilHpFrac) return;                    // below half it no longer shields: the bubble is gone
  const near = frac2 - w.untilHpFrac < 0.12;             // about to drop: it flickers
  const R = e.r * 1.25;
  const flick = near ? (Math.sin(t * 40) > 0 ? 1 : 0.35) : 1;
  const g = ctx.createRadialGradient(e.x, cy, R * 0.55, e.x, cy, R);
  g.addColorStop(0, 'rgba(160,200,255,0)');
  g.addColorStop(1, 'rgba(160,200,255,0.4)');
  ctx.globalAlpha = flick;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(e.x, cy, R, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = AFFIX_COLOR.warded;                  // the rim and a few facets, turning slowly
  ctx.lineWidth = 1.8;
  ctx.globalAlpha = 0.85 * flick;
  ctx.beginPath();
  ctx.arc(e.x, cy, R, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.4 * flick;
  const rot = t * 0.4 + e.uid;
  ctx.beginPath();
  for (let k = 0; k < HEX; k++) {
    const a = rot + (k * TAU) / HEX;
    const b = rot + ((k + 1) * TAU) / HEX;
    ctx.moveTo(e.x + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5);
    ctx.lineTo(e.x + Math.cos(b) * R * 0.5, cy + Math.sin(b) * R * 0.5);
    ctx.lineTo(e.x + Math.cos(b) * R, cy + Math.sin(b) * R);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';                             // a glint sliding round the rim
  ctx.globalAlpha = 0.9 * flick;
  const ga = t * 1.7 + e.uid;
  ctx.beginPath();
  ctx.arc(e.x + Math.cos(ga) * R, cy + Math.sin(ga) * R, 2, 0, TAU);
  ctx.fill();
}

function drawPlates(ctx, e, cy, t) {
  const R = e.r * 1.05;
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {                 // four plates: dark edge, then bright face
    ctx.strokeStyle = pass ? '#c3cbd8' : '#2a3140';
    ctx.lineWidth = pass ? 3.4 : 6;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = (k * TAU) / 4 + 0.35;
      ctx.moveTo(e.x + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.arc(e.x, cy, R, a, a + 0.95);
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#eef2f8';                             // rivets
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const a = (k * TAU) / 4 + 0.35 + 0.47;
    ctx.moveTo(e.x + Math.cos(a) * R + 1.4, cy + Math.sin(a) * R);
    ctx.arc(e.x + Math.cos(a) * R, cy + Math.sin(a) * R, 1.4, 0, TAU);
  }
  ctx.fill();
  if (e.flash > 0) {                                     // struck: sparks off the steel
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = e.uid * 1.7 + k * 1.3 + Math.floor(t * 30) * 0.9;
      ctx.moveTo(e.x + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.lineTo(e.x + Math.cos(a) * (R + 7), cy + Math.sin(a) * (R + 7));
    }
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function drawCracks(ctx, e, cy, t, bodyHasCracks) {
  const low = 1 - e.hp / e.maxHp;
  const flare = 0.55 + 0.45 * Math.sin(t * (6 + 10 * low) + e.uid);
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = 1.6 + low;
  ctx.globalAlpha = 0.55 + 0.4 * flare;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const n = bodyHasCracks ? 0 : 4 + Math.floor(low * 3);
  for (let k = 0; k < n; k++) {
    const a = e.uid * 0.9 + (k * TAU) / n;
    const c = Math.cos(a), s = Math.sin(a);
    const j = e.r * 0.16 * (k % 2 ? 1 : -1);
    ctx.moveTo(e.x + c * e.r * 0.15, cy + s * e.r * 0.15);
    ctx.lineTo(e.x + c * e.r * 0.45 - s * j, cy + s * e.r * 0.45 + c * j);
    ctx.lineTo(e.x + c * e.r * 0.7 + s * j, cy + s * e.r * 0.7 - c * j);
    ctx.lineTo(e.x + c * e.r * 0.95, cy + s * e.r * 0.95);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffd9a0';                             // embers lifting off it
  for (let k = 0; k < 5; k++) {
    const sd = frac(Math.sin((e.uid + k * 13.7) * 12.9898) * 43758.5);
    const life = frac(t * (0.7 + 0.5 * sd) + sd * 6);
    ctx.globalAlpha = Math.sin(life * Math.PI) * 0.9;
    ctx.fillRect(e.x + (sd - 0.5) * e.r * 1.6 - 1, cy - e.r * 0.3 - life * e.r * 1.3 - 1, 2.2, 2.2);
  }
  if (low > 0.7) {                                       // nearly dead: the blast it will leave
    ctx.strokeStyle = '#ff5a2a';
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.25 + 0.2 * flare;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, ELITE.affixes.volatile.blastRadius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.lineCap = 'butt';
}

function drawStreaks(ctx, e, cy, px, py, t) {
  let dx = e.x - px, dy = e.y - py;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  const nx = -dy, ny = dx;
  ctx.strokeStyle = AFFIX_COLOR.swift;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  for (let k = 0; k < 5; k++) {
    const side = ((k + 0.5) / 5 - 0.5) * 2 * e.r * 0.9;
    const life = frac(t * 2.2 + k * 0.37);
    const start = e.r * (0.5 + life * 1.3);
    const len = e.r * (0.5 + 0.5 * frac(k * 0.61));
    ctx.globalAlpha = (1 - life) * 0.8;
    ctx.beginPath();
    ctx.moveTo(e.x + dx * start + nx * side, cy + dy * start + ny * side);
    ctx.lineTo(e.x + dx * (start + len) + nx * side, cy + dy * (start + len) + ny * side);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function drawMotes(ctx, e, cy, t) {
  const mending = e.hp < e.maxHp && t - e.lastHitT > 2;
  const n = mending ? 8 : 4;
  ctx.strokeStyle = AFFIX_COLOR.regenerating;
  ctx.lineWidth = mending ? 2 : 1.5;
  ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) {                          // little plus signs rising
    const sd = frac(Math.sin((e.uid + k * 7.3) * 12.9898) * 43758.5);
    const life = frac(t * (mending ? 0.9 : 0.5) + sd * 5);
    const x = e.x + (sd - 0.5) * e.r * 1.7;
    const y = cy + e.r * 0.5 - life * e.r * 1.8;
    const s = mending ? 3.2 : 2.4;
    ctx.globalAlpha = Math.sin(life * Math.PI) * (mending ? 0.95 : 0.55);
    ctx.beginPath();
    ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
    ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}
