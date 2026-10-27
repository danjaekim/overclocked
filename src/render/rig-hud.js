// The sandbox HUD: health, timer and kills, then one strip per chain (rule card, its pieces, energy pips).
// A piece lights up when it runs, so you can see which piece caused what in the arena.

import { fmtTime } from '../ui/overlay.js';
import { xpToNext } from '../game/xp.js';
import { PIECES, RULES, CHAIN_COLORS, CHAIN_NAMES } from '../rig/pieces.js';
import { TEST_CHAINS } from '../rig/presets.js';
import { drawChestArrows } from './shrines.js';

const SLOT = 34;
const GAP = 4;
const TYPE_COLOR = { weapon: '#e8a33d', modifier: '#5ec8d8', trigger: '#b98cff' };
const FLASH = 0.35;

export function drawSandboxHud(ctx, view, run) {
  const p = run.player;
  const y0 = view.insetTop + 16;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';                             // XP bar: levels give a piece offer
  ctx.fillRect(0, view.insetTop, view.w, 7);
  ctx.fillStyle = '#6ec5ff';
  ctx.fillRect(0, view.insetTop, view.w * Math.min(1, p.xp / xpToNext(p.level)), 7);
  const bw = 140;
  const bh = 14;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(12, y0, bw, bh);
  ctx.fillStyle = '#d9534f';
  ctx.fillRect(12, y0, bw * Math.max(0, p.hp / p.maxHp), bh);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(12.5, y0 + 0.5, bw - 1, bh - 1);

  ctx.fillStyle = '#e8e6df';
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(fmtTime(run.time), view.w / 2 + 28, y0 - 2);
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#b9bbc6';
  ctx.fillText('Lv ' + p.level + '   Kills ' + run.kills, 12, y0 + bh + 6);

  if (run.rig) {
    const rows = run.rig.chains;
    for (let i = 0; i < rows.length; i++) drawStrip(ctx, run, rows[i], 12, y0 + bh + 32 + i * (SLOT + (run.rigRun ? 22 : 34)));
  }

  const boss = run.boss;                                         // the boss bar, along the bottom: the top is the rig strips
  if (boss) {
    const bwid = 220;
    const bx0 = view.w / 2 - bwid / 2;
    const by0 = view.h - 34;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx0, by0, bwid, 10);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(bx0, by0, bwid * Math.max(0, boss.hp / boss.maxHp), 10);
    ctx.fillStyle = '#e8e6df';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(boss.def.name, view.w / 2, by0 - 2);
  }
  if (run.rigRun) drawChestArrows(ctx, view, run);                // an elite's chest waits where it fell: an arrow points at it
  if (run.toast) {
    ctx.globalAlpha = Math.min(1, run.toast.ttl * 2);
    ctx.fillStyle = '#ffd34d';
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 4;
    ctx.strokeText(run.toast.text, view.w / 2, view.h * 0.62);
    ctx.fillText(run.toast.text, view.w / 2, view.h * 0.62);
    ctx.globalAlpha = 1;
  }

  const s = 30;                                                  // pause button (top-right), where input.js looks for it
  const bx = view.w - 12 - s;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(bx, y0 - 4, s, s);
  ctx.fillStyle = '#e8e6df';
  ctx.fillRect(bx + 9, y0 + 3, 4, 16);
  ctx.fillRect(bx + 17, y0 + 3, 4, 16);
}

function drawStrip(ctx, run, chain, x, y) {
  const rule = RULES[chain.def.rule];
  const color = CHAIN_COLORS[chain.index % CHAIN_COLORS.length];
  ctx.fillStyle = color;                                          // the chain's badge: the same colour rings its attacks in the arena
  ctx.fillRect(x, y, 22, SLOT);
  ctx.fillStyle = '#10121a';
  ctx.font = '800 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(CHAIN_NAMES[chain.index], x + 11, y + SLOT / 2 + 1);
  x += 24;
  const waiting = (rule.while === 'moving' && !run.player.moving) || (rule.while === 'still' && run.player.moving);
  ctx.fillStyle = waiting ? 'rgba(40,40,52,0.7)' : 'rgba(60,60,80,0.85)';        // Stride is dim while you stand still
  ctx.fillRect(x, y, 54, SLOT);
  ctx.fillStyle = '#e8e6df';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rule.name, x + 27, y + SLOT / 2 - 5);
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = '#b9bbc6';
  ctx.fillText(rule.short, x + 27, y + SLOT / 2 + 8);

  const slots = chain.def.slots;
  const dead = new Set(chain.problems.map((q) => q.idx));
  for (let i = 0; i < slots.length; i++) {
    const sx = x + 54 + GAP + i * (SLOT + GAP);
    const piece = PIECES[slots[i]];
    if (!piece) {                                                 // an empty slot
      ctx.fillStyle = 'rgba(20,22,30,0.5)';
      ctx.fillRect(sx, y, SLOT, SLOT);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, y + 0.5, SLOT - 1, SLOT - 1);
      continue;
    }
    const lit = Math.max(0, 1 - (run.time - chain.flash[i]) / FLASH);
    ctx.fillStyle = 'rgba(20,22,30,0.8)';
    ctx.fillRect(sx, y, SLOT, SLOT);
    ctx.globalAlpha = dead.has(i) ? 0.3 : 1;
    ctx.fillStyle = TYPE_COLOR[piece.type];
    ctx.globalAlpha *= 0.25 + 0.75 * lit;
    ctx.fillRect(sx, y, SLOT, SLOT);
    ctx.globalAlpha = dead.has(i) ? 0.3 : 1;
    ctx.strokeStyle = lit > 0 ? '#ffffff' : TYPE_COLOR[piece.type];
    ctx.lineWidth = lit > 0 ? 2 : 1;
    ctx.strokeRect(sx + 0.5, y + 0.5, SLOT - 1, SLOT - 1);
    drawIcon(ctx, piece, sx + (SLOT - 20) / 2, y + 2, 20);
    ctx.fillStyle = '#fff';
    ctx.font = '700 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(piece.short, sx + SLOT / 2, y + SLOT - 3);
    ctx.globalAlpha = 1;
  }

  const pool = chain.act ? chain.act.pool : chain.energy;        // energy pips: they empty as pieces and payloads run
  for (let k = 0; k < chain.energy; k++) {
    ctx.fillStyle = k < pool ? '#ffd34d' : 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + k * 9, y + SLOT + 5, 7, 7);
  }
  const label = chain.def.key ? TEST_CHAINS[chain.def.key].name : run.rigRun ? '' : 'Custom';
  if (label) {                                                   // the chain's name, under its strip
    ctx.fillStyle = color;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x, y + SLOT + 15);
  }
}

// A piece's icon (rig/pieces.js, SVG path data on a 24-unit square) at (x, y), size px, in white.
const paths = new Map();
function drawIcon(ctx, piece, x, y, px) {
  let p = paths.get(piece);
  if (!p) paths.set(piece, p = new Path2D(piece.icon));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(px / 24, px / 24);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (piece.filled) {
    ctx.globalAlpha *= 0.3;
    ctx.fillStyle = '#fff';
    ctx.fill(p);
    ctx.globalAlpha /= 0.3;
  }
  ctx.stroke(p);
  ctx.restore();
}
