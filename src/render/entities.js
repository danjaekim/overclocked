// Entity drawing. Enemies are batched: one path per colour, a final white pass for
// hit-flashing ones. Everything is culled to the camera rect.

import { ENEMIES } from '../data/enemies.js';

const TAU = Math.PI * 2;
const DEF_IDS = Object.keys(ENEMIES);

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
}
