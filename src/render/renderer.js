// Renderer: camera, layers, culling. Draw order: ground, entities, player, fx, HUD, debug.
// World pass uses a camera transform; the HUD pass uses plain view coordinates.

import { drawHud, drawStick } from './hud.js';
import { getSprite } from './sprites.js';
import { drawGround } from './ground.js';
// Floor: the forest by default; ?ground=forge|frost|cinder|ruins|crystal|catacomb tries the others, ?ground=grid is the old grid.
const GROUND = new URLSearchParams(location.search).get('ground') || 'forest';

const GRID = 64;
const SPRITE_W = 68;                     // world units; the hitbox stays the player's r
const SPRITE_LIFT = 8;                   // the feet sit near the hit circle's bottom

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

  // Evolved weapons show on the hero: a soft halo in the weapon's element colour under the sprite,
// and one orbiting mote per evolved weapon. Prototype (docs/architecture.md M22).
const ELEMENT_GLOW = [['fire', '#ff7a2e'], ['storm', '#ffd34d'], ['frost', '#8fd8ff'], ['light', '#fff3b0'], ['arcane', '#c58bff']];
function glowColor(def) {
  for (const [tag, col] of ELEMENT_GLOW) if (def.tags.includes(tag)) return col;
  return '#ffb45e';
}
function drawEvolvedGlow(p, t, front) {
  const ws = p.weapons;
  let n = 0;
  for (let i = 0; i < ws.length; i++) if (ws[i].def.rarity === 'evolved') n++;
  if (n === 0) return;
  let k = 0;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  for (let i = 0; i < ws.length; i++) {
    if (ws[i].def.rarity !== 'evolved') continue;
    const col = glowColor(ws[i].def);
    if (!front) {
      if (k > 0) { k++; continue; }              // one halo (the first evolved weapon's colour); motes show the rest
      const r = 34 + 4 * pulse;
      const g = ctx.createRadialGradient(p.x, p.y - SPRITE_LIFT, 6, p.x, p.y - SPRITE_LIFT, r);
      g.addColorStop(0, col + '77');
      g.addColorStop(1, col + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y - SPRITE_LIFT, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const a = t * 2.2 + (k * Math.PI * 2) / n;
      const mx = p.x + Math.cos(a) * 30;
      const my = p.y - SPRITE_LIFT + Math.sin(a) * 12 - 6;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(mx - 0.8, my - 0.8, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    k++;
  }
}

  // Magnet range: a faint dashed ring once something (Magnet perks, passives) pushes it past the base 70,
  // so the extra pickup range is something you can see.
  const BASE_PICKUP = 70;
  function drawPickupRing(p) {
    const r = p.stats.get('pickupRadius');
    if (r < BASE_PICKUP * 1.05) return;
    ctx.strokeStyle = '#9fe8ff';
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function drawPlayer(p, t) {
    drawPickupRing(p);
    drawEvolvedGlow(p, t, false);
    const spr = getSprite(p.classId, p.hurtFlash > 0);
    if (spr) {
      const h = SPRITE_W * 76 / 76;
      if (p.facingX < -0.2) p.flip = true; else if (p.facingX > 0.2) p.flip = false;
      ctx.save();
      ctx.translate(p.x, p.y - SPRITE_LIFT);
      if (p.flip) ctx.scale(-1, 1);
      ctx.drawImage(spr, -SPRITE_W / 2, -h / 2 - 2, SPRITE_W, h);
      ctx.restore();
    } else {
      ctx.fillStyle = p.hurtFlash > 0 ? '#ffffff' : '#e8a33d';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.shield > 0) {
      ctx.strokeStyle = '#6ec5ff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.5 + 0.5 * Math.min(1, p.shield / 20);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (!spr) {                                  // facing tick (the sprites show it themselves)
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.facingX * p.r, p.y + p.facingY * p.r);
      ctx.stroke();
    }
    drawEvolvedGlow(p, t, true);
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
    if (!(GROUND && drawGround(ctx, cam, view, GROUND, run ? run.time : 0))) drawGrid(cam);
    if (run) {
      if (run.drawWorld) run.drawWorld(ctx, view);
      drawPlayer(run.player, run.time);
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
