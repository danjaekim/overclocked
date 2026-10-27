// Visual effects: floating damage numbers and death puffs. Pure visuals, pooled, and
// droppable: if the pool is full or too many numbers are on screen, new ones are skipped.

import { elemBits, F_FROST, F_FIRE, F_STORM } from './shots.js';

const TAU = Math.PI * 2;
const MAX_NUMBERS = 60;      // text is the expensive part, so cap how many are live
const MAX_PUFFS_POOL = 300;  // keep room for numbers
const KIND_NUMBER = 0;
const KIND_PUFF = 1;
const KIND_ARC = 2;
const KIND_BURST = 3;
const MAX_BURSTS = 36;        // flashes alive at once: a chain reaction through a packed crowd stays readable and cheap

const numStr = [];
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
function numberText(n) {
  if (n <= 999) return numStr[n] || (numStr[n] = String(n));
  if (n < 10000) return String(n);
  let k = 0;
  while (n >= 1000 && k < SUFFIX.length - 1) { n /= 1000; k++; }
  return (n < 100 ? n.toFixed(1).replace(/\.0$/, '') : String(Math.round(n))) + SUFFIX[k];
}

// Display experiment: do bigger numbers feel better? `scale` multiplies what is SHOWN (damage itself is untouched);
// `big` also makes crit text larger, lets numbers linger and allows more of them on screen. Set from ?numscale / ?numfx.
let numScale = 1;
let numBig = false;
let maxNumbers = MAX_NUMBERS;
export function setNumberStyle(scale = 1, big = false) {
  numScale = scale > 0 ? scale : 1;
  numBig = !!big;
  maxNumbers = big ? 100 : MAX_NUMBERS;
}

export function addDamageNumber(run, x, y, amount, crit, color = '') {
  const w = run.world;
  if (w.fxNumbers >= maxNumbers) return;
  const f = w.fx.acquire();
  if (!f) return;
  const r = run.fxRng;
  f.kind = KIND_NUMBER;
  f.x = x + (r.next() - 0.5) * 14;
  f.y = y;
  f.vx = (r.next() - 0.5) * 24;
  f.vy = -70;
  f.ttl = f.maxTtl = (crit ? 0.8 : 0.55) * (numBig ? 1.6 : 1);
  f.crit = crit;
  f.c2 = color;                                         // '' = the default white / crit gold
  f.text = numberText(Math.max(1, Math.round(amount * numScale)));
  w.fxNumbers++;
}

export function addPuff(run, x, y, radius, color) {
  const w = run.world;
  if (w.fx.count >= MAX_PUFFS_POOL) return;
  const f = w.fx.acquire();
  if (!f) return;
  f.kind = KIND_PUFF;
  f.x = x;
  f.y = y;
  f.vx = f.vy = 0;
  f.r = radius;
  f.ttl = f.maxTtl = 0.22;
  f.text = color;
}

// Area bursts (M45): what an area effect looks like where it lands. A filled flash and a ring that grow to the effect's
// REAL radius in 0.32 s, with a mark that says which effect it is:
//   BURST_PLAIN   short rays            explosions, Spellburst, rain landings
//   BURST_SPARKS  sparks flung outward   Chain Reaction
//   BURST_SHARDS  ice shards flying out  Shatter
//   BURST_CRACKS  lightning cracks       Overload, Thunderclap
//   BURST_STEAM   rising steam           Quench
// `color` is the flash and ring, `color2` the mark's accent. Skipped when too many are alive.
export const BURST_PLAIN = 0;
export const BURST_SPARKS = 1;
export const BURST_SHARDS = 2;
export const BURST_CRACKS = 3;
export const BURST_STEAM = 4;
export const BURST_SLAM = 5;          // a hammer's crater: dark pit, ground cracks, a fast shockwave and flying rubble (lives 0.55 s)
export function addBurst(run, x, y, radius, color, style = BURST_PLAIN, color2 = '#ffffff') {
  const w = run.world;
  if (w.fxBursts >= MAX_BURSTS || w.fx.count >= MAX_PUFFS_POOL) return;
  const f = w.fx.acquire();
  if (!f) return;
  f.kind = KIND_BURST;
  f.x = x;
  f.y = y;
  f.vx = f.vy = 0;
  f.r = radius;
  f.ttl = f.maxTtl = style === BURST_SLAM ? 0.55 : 0.32;
  f.text = color;
  f.c2 = color2;
  f.style = style;
  f.seed = run.fxRng.next();
  w.fxBursts++;
}

// A short jagged bolt between two points (chain lightning; coloured by the weapon's element).
const ARC_YELLOW = '#ffe066';
export const ARC_FORK = '#7dffa0';            // Forked Strikes: green, so a fork never reads as a shock chain
const ARC_COLORS = [ARC_YELLOW, '#9fdcff', '#ff9a3c', '#d9b0ff', ARC_FORK];   // = ELEMENTS[*].arc in render/elements.js
export function addArc(run, x1, y1, x2, y2, color = ARC_YELLOW) {
  const w = run.world;
  if (w.fx.count >= MAX_PUFFS_POOL) return;
  const f = w.fx.acquire();
  if (!f) return;
  f.kind = KIND_ARC;
  f.x = x1;
  f.y = y1;
  f.x2 = x2;
  f.y2 = y2;
  f.vx = f.vy = 0;
  f.r = run.fxRng.next();                  // seeds the zig-zag
  f.ttl = f.maxTtl = 0.14;
  f.text = color;                          // which of ARC_COLORS to draw it in
}


const GOLDEN = 2.399963;
function drawBurst(ctx, f) {
  const u = 1 - f.ttl / f.maxTtl;
  if (f.style === BURST_SLAM) { drawSlamBurst(ctx, f, u); return; }
  const e = 1 - (1 - u) * (1 - u);                      // fast out, slow settle
  const R = f.r * (0.3 + 0.7 * e);
  const a = 1 - u;
  ctx.fillStyle = f.text;                               // the flash
  ctx.globalAlpha = (f.style === BURST_STEAM ? 0.12 : 0.3) * a;
  ctx.beginPath();
  ctx.arc(f.x, f.y, R, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.55 * a * a;                       // a bright core in the first moments
  ctx.fillStyle = f.c2;
  ctx.beginPath();
  ctx.arc(f.x, f.y, R * 0.45, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = f.text;                             // the ring, thick to start with
  ctx.lineWidth = 1.5 + 3.5 * a;
  ctx.globalAlpha = 0.95 * a;
  ctx.beginPath();
  ctx.arc(f.x, f.y, R, 0, TAU);
  ctx.stroke();
  const ang = f.seed * TAU;
  if (f.style === BURST_PLAIN) {                        // short rays
    ctx.strokeStyle = f.c2;
    ctx.lineWidth = 2.6;
    ctx.globalAlpha = 0.95 * a;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const t = ang + (k * TAU) / 8;
      ctx.moveTo(f.x + Math.cos(t) * R * 0.55, f.y + Math.sin(t) * R * 0.55);
      ctx.lineTo(f.x + Math.cos(t) * R * 0.95, f.y + Math.sin(t) * R * 0.95);
    }
    ctx.stroke();
  } else if (f.style === BURST_SPARKS) {                // sparks flung outward, past the ring
    ctx.fillStyle = f.c2;
    ctx.globalAlpha = 0.95 * a;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const t = ang + k * GOLDEN;
      const d = R * (0.35 + 0.8 * e) * (0.7 + 0.3 * ((k * 7) % 5) / 4);
      const sr = 3.4 * (1 - u) + 0.8;
      const sx = f.x + Math.cos(t) * d;
      const sy = f.y + Math.sin(t) * d;
      ctx.moveTo(sx + sr, sy);
      ctx.arc(sx, sy, sr, 0, TAU);
    }
    ctx.fill();
  } else if (f.style === BURST_SHARDS) {                // ice shards flying out
    ctx.fillStyle = f.c2;
    ctx.strokeStyle = f.text;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.95 * a;
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const t = ang + (k * TAU) / 9;
      const d = R * (0.25 + 0.85 * e);
      const cx = Math.cos(t);
      const cy = Math.sin(t);
      const px = f.x + cx * d;
      const py = f.y + cy * d;
      const L = 9 * (1 - 0.4 * u);
      ctx.moveTo(px + cx * L, py + cy * L);
      ctx.lineTo(px - cy * 2.6, py + cx * 2.6);
      ctx.lineTo(px - cx * L * 0.6, py - cy * L * 0.6);
      ctx.lineTo(px + cy * 2.6, py - cx * 2.6);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  } else if (f.style === BURST_CRACKS) {                // lightning cracks from the centre to the ring
    ctx.strokeStyle = f.c2;
    ctx.lineWidth = 2.2;
    ctx.globalAlpha = 0.95 * a;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const t = ang + (k * TAU) / 5;
      const cx = Math.cos(t);
      const cy = Math.sin(t);
      const nx = -cy;
      const ny = cx;
      const j = R * 0.14 * (k % 2 ? 1 : -1);
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x + cx * R * 0.35 + nx * j, f.y + cy * R * 0.35 + ny * j);
      ctx.lineTo(f.x + cx * R * 0.65 - nx * j, f.y + cy * R * 0.65 - ny * j);
      ctx.lineTo(f.x + cx * R, f.y + cy * R);
    }
    ctx.stroke();
  } else if (f.style === BURST_STEAM) {                 // steam puffs rising
    ctx.fillStyle = f.c2;
    ctx.globalAlpha = 0.55 * a;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const t = ang + k * 1.7;
      const px = f.x + Math.cos(t) * R * 0.45;
      const py = f.y + Math.sin(t) * R * 0.3 - R * 0.5 * e;
      const pr = R * (0.22 + 0.2 * e);
      ctx.moveTo(px + pr, py);
      ctx.arc(px, py, pr, 0, TAU);
    }
    ctx.fill();
  }
}

// The crater a hammer leaves. The ring and cracks race out in the first third; the pit and cracks fade slowly after.
function drawSlamBurst(ctx, f, u) {
  const out = Math.min(1, u / 0.3);
  const e = 1 - (1 - out) * (1 - out) * (1 - out);
  const fade = u < 0.45 ? 1 : 1 - (u - 0.45) / 0.55;
  const R = f.r;
  ctx.fillStyle = '#120d08';                            // the pit
  ctx.globalAlpha = 0.38 * fade;
  ctx.beginPath();
  ctx.arc(f.x, f.y, R * 0.92 * (0.5 + 0.5 * e), 0, TAU);
  ctx.fill();
  if (u < 0.2) {                                        // the flash of the hit
    ctx.fillStyle = f.c2;
    ctx.globalAlpha = 0.7 * (1 - u / 0.2);
    ctx.beginPath();
    ctx.arc(f.x, f.y, R * (0.35 + 0.5 * e), 0, TAU);
    ctx.fill();
  }
  const ang = f.seed * TAU;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {                // ground cracks: dark, then a lit core on top
    ctx.strokeStyle = pass ? f.text : '#0a0704';
    ctx.lineWidth = pass ? 1.6 : 4;
    ctx.globalAlpha = (pass ? 0.9 : 0.8) * fade;
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const t = ang + k * 0.7 + ((k * 5) % 3) * 0.12;
      const len = R * (0.55 + 0.4 * (((k * 7) % 5) / 4)) * e;
      const cx = Math.cos(t), cy = Math.sin(t), nx = -cy, ny = cx;
      const j = R * 0.09 * (k % 2 ? 1 : -1);
      ctx.moveTo(f.x + cx * R * 0.12, f.y + cy * R * 0.12);
      ctx.lineTo(f.x + cx * len * 0.4 + nx * j, f.y + cy * len * 0.4 + ny * j);
      ctx.lineTo(f.x + cx * len * 0.7 - nx * j, f.y + cy * len * 0.7 - ny * j);
      ctx.lineTo(f.x + cx * len, f.y + cy * len);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = f.text;                             // the shockwave
  ctx.lineWidth = 1.5 + 5 * (1 - out);
  ctx.globalAlpha = 0.95 * Math.max(0, 1 - u / 0.6);
  ctx.beginPath();
  ctx.arc(f.x, f.y, R * (0.2 + 0.8 * e), 0, TAU);
  ctx.stroke();
  ctx.fillStyle = f.c2;                                 // rubble thrown up and out, falling back
  ctx.globalAlpha = 0.95 * fade;
  for (let k = 0; k < 11; k++) {
    const t = ang + k * GOLDEN;
    const sp = R * (0.45 + 0.5 * (((k * 3) % 5) / 4));
    const d = sp * Math.min(1, u * 2.2);
    const lift = Math.sin(Math.min(1, u * 1.6) * Math.PI) * R * (0.25 + 0.15 * (k % 3));
    const s = 2.2 + (k % 3);
    ctx.fillRect(f.x + Math.cos(t) * d - s / 2, f.y + Math.sin(t) * d * 0.8 - lift - s / 2, s, s);
  }
  ctx.lineCap = 'butt';
}

// The colour an element's effects are drawn in (none: warm white).
const EL_COLORS = { [F_FROST]: '#9fdcff', [F_FIRE]: '#ff9a3c', [F_STORM]: '#ffe066' };
export function elementColor(inst) {
  const m = elemBits(inst);
  return EL_COLORS[m & F_FROST ? F_FROST : m & F_FIRE ? F_FIRE : m & F_STORM ? F_STORM : 0] || '#f0dcb0';
}

export function updateFx(run, dt) {
  const w = run.world;
  const list = w.fx.active;
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    f.ttl -= dt;
    if (f.ttl <= 0) {
      if (f.kind === KIND_NUMBER) w.fxNumbers--;
      else if (f.kind === KIND_BURST) w.fxBursts--;
      w.fx.release(f);
      continue;
    }
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.kind === KIND_NUMBER) f.vy += 90 * dt;     // slow the rise
  }
}

export function drawFx(ctx, view, run) {
  const list = run.world.fx.active;
  const cam = run.cam;
  const x0 = cam.x - view.w / 2 - 30;
  const x1 = cam.x + view.w / 2 + 30;
  const y0 = cam.y - view.h / 2 - 30;
  const y1 = cam.y + view.h / 2 + 30;

  // puffs: expanding fading ring
  ctx.lineWidth = 2;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f.kind !== KIND_PUFF) continue;
    if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
    const u = 1 - f.ttl / f.maxTtl;
    ctx.globalAlpha = 0.8 * (1 - u);
    ctx.strokeStyle = f.text;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * (1 + 1.4 * u), 0, TAU);
    ctx.stroke();
  }

  // bursts: a flash and ring to the real radius, with the effect's own mark
  ctx.lineCap = 'round';
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f.kind !== KIND_BURST) continue;
    if (f.x < x0 - f.r || f.x > x1 + f.r || f.y < y0 - f.r || f.y > y1 + f.r) continue;
    drawBurst(ctx, f);
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;

  // chain bolts: one jagged path per colour
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.9;
  for (let c = 0; c < ARC_COLORS.length; c++) {
    ctx.strokeStyle = ARC_COLORS[c];
    ctx.beginPath();
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.kind !== KIND_ARC || f.text !== ARC_COLORS[c]) continue;
      if ((f.x < x0 && f.x2 < x0) || (f.x > x1 && f.x2 > x1) || (f.y < y0 && f.y2 < y0) || (f.y > y1 && f.y2 > y1)) continue;
      const dx = f.x2 - f.x;
      const dy = f.y2 - f.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const j = (f.r - 0.5) * 18;
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x + dx * 0.35 + nx * j, f.y + dy * 0.35 + ny * j);
      ctx.lineTo(f.x + dx * 0.65 - nx * j, f.y + dy * 0.65 - ny * j);
      ctx.lineTo(f.x2, f.y2);
    }
    ctx.stroke();
  }

  // numbers: normal first, then crits on top
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    const wantCrit = pass === 1;
    ctx.font = wantCrit ? (numBig ? '800 28px system-ui, sans-serif' : '700 20px system-ui, sans-serif') : (numBig ? '700 17px system-ui, sans-serif' : '600 14px system-ui, sans-serif');
    ctx.fillStyle = wantCrit ? '#ffd34d' : '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = wantCrit ? 4 : 3;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.kind !== KIND_NUMBER || f.crit !== wantCrit) continue;
      if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
      ctx.globalAlpha = Math.min(1, (f.ttl / f.maxTtl) * 2.2);
      ctx.strokeText(f.text, f.x, f.y);
      if (f.c2 !== '') {
        ctx.fillStyle = f.c2;
        ctx.fillText(f.text, f.x, f.y);
        ctx.fillStyle = wantCrit ? '#ffd34d' : '#ffffff';
      } else ctx.fillText(f.text, f.x, f.y);
    }
  }
  ctx.globalAlpha = 1;
}
