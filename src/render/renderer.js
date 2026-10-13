// Renderer: camera, layers, culling. Draw order: ground, entities, player, fx, HUD, debug.
// World pass uses a camera transform; the HUD pass uses plain view coordinates.

import { drawHud, drawStick } from './hud.js';

const GRID = 64;

export function createRenderer(canvas, view) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const cam0 = { x: 0, y: 0 };

  function drawGrid(cam) {
    const x0 = Math.floor((cam.x - view.w / 2) / GRID) * GRID;
    const y0 = Math.floor((cam.y - view.h / 2) / GRID) * GRID;
    ctx.strokeStyle = '#1a1c26';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= cam.x + view.w / 2; x += GRID) {
      ctx.moveTo(x, cam.y - view.h / 2);
      ctx.lineTo(x, cam.y + view.h / 2);
    }
    for (let y = y0; y <= cam.y + view.h / 2; y += GRID) {
      ctx.moveTo(cam.x - view.w / 2, y);
      ctx.lineTo(cam.x + view.w / 2, y);
    }
    ctx.stroke();
  }

  function drawPlayer(p) {
    ctx.fillStyle = p.hurtFlash > 0 ? '#ffffff' : '#e8a33d';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    if (p.shield > 0) {
      ctx.strokeStyle = '#6ec5ff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.5 + 0.5 * Math.min(1, p.shield / 20);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // facing tick
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + p.facingX * p.r, p.y + p.facingY * p.r);
    ctx.stroke();
  }

  function draw(run, input, debug) {
    const s = view.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0e0f14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cam = run ? run.cam : cam0;
    // world pass
    const ox = run ? run.cam.ox : 0;     // screen shake offset
    const oy = run ? run.cam.oy : 0;
    ctx.setTransform(s, 0, 0, s, (view.w / 2 - cam.x + ox) * s, (view.h / 2 - cam.y + oy) * s);
    drawGrid(cam);
    if (run) {
      if (run.drawWorld) run.drawWorld(ctx, view);
      drawPlayer(run.player);
      if (run.drawWeapons) run.drawWeapons(ctx);
      if (run.drawFx) run.drawFx(ctx, view);
    }

    // screen pass
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (run) {
      drawHud(ctx, view, run);
      drawStick(ctx, view, input);
    }
    debug.draw(ctx, view, run);
  }

  return { draw, ctx };
}
