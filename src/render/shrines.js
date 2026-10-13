// Shrine drawing: a glowing anvil in the world, plus an arrow on the screen edge when the
// shrine is off screen (drawn in the HUD pass with `drawShrineArrows`).

import { SHRINE } from '../data/forge.js';

const TAU = Math.PI * 2;

export function drawShrines(ctx, view, run) {
  const list = run.shrines;
  const cam = run.cam;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (Math.abs(s.x - cam.x) > view.w / 2 + 60 || Math.abs(s.y - cam.y) > view.h / 2 + 60) continue;
    const pulse = 0.5 + 0.5 * Math.sin(run.time * 4);
    const fade = s.ttl < 6 ? (Math.sin(run.time * 14) > 0 ? 1 : 0.35) : 1;     // blink when expiring
    ctx.globalAlpha = fade;
    // activation area
    ctx.strokeStyle = '#ffb45e';
    ctx.lineWidth = 2;
    ctx.globalAlpha = fade * (0.25 + 0.25 * pulse);
    ctx.beginPath();
    ctx.arc(s.x, s.y, SHRINE.radius, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = fade;
    // anvil: base, waist, face
    ctx.fillStyle = '#3a3d4d';
    ctx.fillRect(s.x - 14, s.y + 6, 28, 7);
    ctx.fillRect(s.x - 7, s.y - 2, 14, 9);
    ctx.fillStyle = '#9aa0b8';
    ctx.beginPath();
    ctx.moveTo(s.x - 20, s.y - 2);
    ctx.lineTo(s.x + 20, s.y - 2);
    ctx.lineTo(s.x + 12, s.y - 11);
    ctx.lineTo(s.x - 14, s.y - 11);
    ctx.closePath();
    ctx.fill();
    // channel progress
    if (s.progress > 0) {
      ctx.strokeStyle = '#ffe3a3';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, SHRINE.radius + 6, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, s.progress / SHRINE.channel));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// HUD pass: an arrow on the screen edge toward each off-screen shrine, ringed by its time left.
export function drawShrineArrows(ctx, view, run) {
  const list = run.shrines;
  if (list.length === 0) return;
  const cam = run.cam;
  const top = view.insetTop + 56;
  const bottom = view.h - 40;
  const m = 26;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const sx = view.w / 2 + (s.x - cam.x);
    const sy = view.h / 2 + (s.y - cam.y);
    if (sx > m && sx < view.w - m && sy > top && sy < bottom) continue;     // visible: no arrow needed
    const cx = view.w / 2;
    const cy = view.h / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const k = Math.min((view.w / 2 - m) / (Math.abs(dx) || 1e-6), (cy - top) / (Math.abs(dy) || 1e-6), (bottom - cy) / (Math.abs(dy) || 1e-6));
    const ax = cx + dx * Math.min(1, k);
    const ay = cy + dy * Math.min(1, k);
    const a = Math.atan2(dy, dx);
    ctx.fillStyle = '#ffb45e';
    ctx.beginPath();
    ctx.moveTo(ax + Math.cos(a) * 14, ay + Math.sin(a) * 14);
    ctx.lineTo(ax + Math.cos(a + 2.5) * 12, ay + Math.sin(a + 2.5) * 12);
    ctx.lineTo(ax + Math.cos(a - 2.5) * 12, ay + Math.sin(a - 2.5) * 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,180,94,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ax - Math.cos(a) * 6, ay - Math.sin(a) * 6, 20, -Math.PI / 2, -Math.PI / 2 + TAU * (s.ttl / s.maxTtl));
    ctx.stroke();
  }
}

// HUD pass: an arrow toward each off-screen chest (gold; cyan for the boss's).
export function drawChestArrows(ctx, view, run) {
  const list = run.world.pickups.active;
  const cam = run.cam;
  const top = view.insetTop + 56;
  const bottom = view.h - 40;
  const m = 26;
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (g.kind !== 2) continue;
    const sx = view.w / 2 + (g.x - cam.x);
    const sy = view.h / 2 + (g.y - cam.y);
    if (sx > m && sx < view.w - m && sy > top && sy < bottom) continue;
    const cx = view.w / 2;
    const cy = view.h / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const k = Math.min((view.w / 2 - m) / (Math.abs(dx) || 1e-6), (cy - top) / (Math.abs(dy) || 1e-6), (bottom - cy) / (Math.abs(dy) || 1e-6));
    const ax = cx + dx * Math.min(1, k);
    const ay = cy + dy * Math.min(1, k);
    const a = Math.atan2(dy, dx);
    ctx.fillStyle = g.value === 1 ? '#7fe9ff' : '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(ax + Math.cos(a) * 14, ay + Math.sin(a) * 14);
    ctx.lineTo(ax + Math.cos(a + 2.5) * 12, ay + Math.sin(a + 2.5) * 12);
    ctx.lineTo(ax + Math.cos(a - 2.5) * 12, ay + Math.sin(a - 2.5) * 12);
    ctx.closePath();
    ctx.fill();
  }
}
