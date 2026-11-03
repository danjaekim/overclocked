// The sandbox HUD: health, timer and kills, then one strip per chain (rule card, its pieces, energy pips).
// A piece lights up when it runs, so you can see which piece caused what in the arena.

import { fmtTime } from '../ui/overlay.js';
import { xpToNext } from '../game/xp.js';
import { PIECES, RULES, CHAIN_NAMES } from '../rig/pieces.js';
import { PALETTE, CHAIN_COLORS, TYPE_COLOR } from '../data/palette.js';
import { chainCost } from '../rig/chain.js';
import { TEST_CHAINS } from '../rig/presets.js';
import { drawChestArrows, drawShrineArrows } from './shrines.js';
import { drawText, textWidth } from './textcache.js';

const SLOT = 34;
const GAP = 4;
const DISPLAY = '"Chakra Petch", "Arial Narrow", system-ui, sans-serif';   // self-hosted (fonts/), loaded by index.html
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const CHAMFER = 6;
const SEGMENTS = 20;                   // the battery bar is this many cells

// A rectangle with its top-right and bottom-left corners cut: the HUD's panel shape.
function chamfer(ctx, x, y, w, h, c = CHAMFER) {
  ctx.beginPath();
  ctx.moveTo(x + c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + c);
  ctx.closePath();
}
const FLASH = 0.35;

export function drawSandboxHud(ctx, view, run) {
  const p = run.player;
  const y0 = view.insetTop + 16;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';                             // XP bar: levels give a piece offer
  ctx.fillRect(0, view.insetTop, view.w, 5);
  ctx.fillStyle = PALETTE.xp;
  ctx.fillRect(0, view.insetTop, view.w * Math.min(1, p.xp / xpToNext(p.level)), 5);
  const bw = 140;
  const bh = 14;
  ctx.fillStyle = PALETTE.panel;                                  // hp: a chamfered tank
  chamfer(ctx, 12, y0, bw, bh, 5);
  ctx.fill();
  ctx.save();
  chamfer(ctx, 12, y0, bw, bh, 5);
  ctx.clip();
  ctx.fillStyle = PALETTE.danger;
  ctx.fillRect(12, y0, bw * Math.max(0, p.hp / p.maxHp), bh);
  ctx.restore();
  ctx.strokeStyle = 'rgba(94,231,255,0.55)';
  ctx.lineWidth = 1;
  chamfer(ctx, 12.5, y0 + 0.5, bw - 1, bh - 1, 5);
  ctx.stroke();

  const F_STAT = `500 12px ${MONO}`;                             // HUD text comes from cached images (textcache.js)
  drawText(ctx, fmtTime(run.time), view.w / 2 + 28, y0 - 3, `700 20px ${DISPLAY}`, PALETTE.rig, 'center', 'top');
  const stat = 'LV ' + p.level + '  KILLS ' + run.kills;
  drawText(ctx, stat, 12, y0 + bh + 6, F_STAT, PALETTE.dim, 'left', 'top');
  if (run.rigRun) drawText(ctx, 'GOLD ' + run.ore, 12 + textWidth(F_STAT, stat + '  '), y0 + bh + 6, F_STAT, PALETTE.gold, 'left', 'top');

  if (run.rig) {
    const rows = run.rig.chains;
    for (let i = 0; i < rows.length; i++) drawStrip(ctx, run, rows[i], 12, y0 + bh + 32 + i * (SLOT + (run.rigRun ? 22 : 34)));
  }

  const boss = run.boss;                                         // the boss bar, along the bottom: the top is the rig strips
  if (boss) {
    const bwid = 220;
    const bx0 = view.w / 2 - bwid / 2;
    const by0 = view.h - 34;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(bx0, by0, bwid, 10);
    ctx.fillStyle = PALETTE.danger;
    ctx.fillRect(bx0, by0, bwid * Math.max(0, boss.hp / boss.maxHp), 10);
    ctx.strokeStyle = 'rgba(255,46,151,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx0 + 0.5, by0 + 0.5, bwid - 1, 9);
    drawText(ctx, boss.def.name, view.w / 2, by0 - 2, `700 12px ${DISPLAY}`, PALETTE.ink, 'center', 'bottom');
  }
  if (run.rigRun) { drawChestArrows(ctx, view, run); drawShrineArrows(ctx, view, run); }                // an elite's chest waits where it fell: an arrow points at it
  if (run.toast) {
    ctx.globalAlpha = Math.min(1, run.toast.ttl * 2);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 18px ${DISPLAY}`;
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
  ctx.fillStyle = PALETTE.panel;
  chamfer(ctx, bx, y0 - 4, s, s, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(94,231,255,0.55)';
  ctx.lineWidth = 1;
  chamfer(ctx, bx + 0.5, y0 - 3.5, s - 1, s - 1, 6);
  ctx.stroke();
  ctx.fillStyle = PALETTE.rig;
  ctx.fillRect(bx + 9, y0 + 3, 4, 16);
  ctx.fillRect(bx + 17, y0 + 3, 4, 16);
}

function drawStrip(ctx, run, chain, x, y) {
  const rule = RULES[chain.def.rule];
  const color = CHAIN_COLORS[chain.index % CHAIN_COLORS.length];
  ctx.fillStyle = color;                                          // the chain's badge: the same colour rings its attacks in the arena
  chamfer(ctx, x, y, 22, SLOT, 5);
  ctx.fill();
  drawText(ctx, CHAIN_NAMES[chain.index], x + 11, y + SLOT / 2 + 1, `700 17px ${DISPLAY}`, PALETTE.bg, 'center', 'middle');
  x += 24;
  const waiting = (rule.while === 'moving' && !run.player.moving) || (rule.while === 'still' && run.player.moving);
  ctx.fillStyle = PALETTE.panel;
  chamfer(ctx, x, y, 54, SLOT, 5);
  ctx.fill();
  ctx.strokeStyle = waiting ? 'rgba(143,142,166,0.35)' : 'rgba(94,231,255,0.6)';        // Stride and Anchor go dim while their condition is off
  ctx.lineWidth = 1;
  chamfer(ctx, x + 0.5, y + 0.5, 53, SLOT - 1, 5);
  ctx.stroke();
  drawText(ctx, rule.name, x + 27, y + SLOT / 2 - 5, `700 12px ${DISPLAY}`, waiting ? PALETTE.dim : PALETTE.ink, 'center', 'middle');
  drawText(ctx, rule.short, x + 27, y + SLOT / 2 + 8, `500 10px ${MONO}`, PALETTE.dim, 'center', 'middle');

  const slots = chain.def.slots;
  const dead = new Set(chain.problems.map((q) => q.idx));
  for (let i = 0; i < slots.length; i++) {
    const sx = x + 54 + GAP + i * (SLOT + GAP);
    const piece = PIECES[slots[i]];
    if (!piece) {                                                 // an empty slot
      ctx.fillStyle = 'rgba(10,8,20,0.5)';
      ctx.fillRect(sx, y, SLOT, SLOT);
      ctx.strokeStyle = 'rgba(143,142,166,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, y + 0.5, SLOT - 1, SLOT - 1);
      continue;
    }
    const lit = Math.max(0, 1 - (run.time - chain.flash[i]) / FLASH);
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(sx, y, SLOT, SLOT);
    ctx.globalAlpha = dead.has(i) ? 0.3 : 1;
    ctx.fillStyle = TYPE_COLOR[piece.type];
    ctx.globalAlpha *= 0.2 + 0.7 * lit;
    ctx.fillRect(sx, y, SLOT, SLOT);
    ctx.globalAlpha = dead.has(i) ? 0.3 : 1;
    ctx.strokeStyle = lit > 0 ? PALETTE.rigHot : TYPE_COLOR[piece.type];
    ctx.lineWidth = lit > 0 ? 2 : 1;
    ctx.strokeRect(sx + 0.5, y + 0.5, SLOT - 1, SLOT - 1);
    drawIcon(ctx, piece, sx + (SLOT - 20) / 2, y + 2, 20);
    drawText(ctx, piece.short, sx + SLOT / 2, y + SLOT - 3, `700 8px ${DISPLAY}`, lit > 0 ? PALETTE.rigHot : PALETTE.ink, 'center', 'alphabetic');
    ctx.globalAlpha = 1;
  }

  const bat = chain.bat;                                          // the battery: it drains as pieces run and refills at the chain's rate
  const w = 54 + slots.length * (SLOT + GAP);
  if (chain.cost === undefined) chain.cost = chainCost(chain.nodes);
  const frac = Math.max(0, Math.min(1, bat.pool / bat.size));
  const segW = (w - (SEGMENTS - 1)) / SEGMENTS;
  const low = frac < 0.25;
  ctx.fillStyle = 'rgba(94,231,255,0.14)';                         // 20 cells; the lit ones are the charge
  for (let k = 0; k < SEGMENTS; k++) ctx.fillRect(x + k * (segW + 1), y + SLOT + 5, segW, 6);
  ctx.fillStyle = low ? PALETTE.danger : bat.pool >= chain.cost ? PALETTE.rig : 'rgba(94,231,255,0.55)';   // dimmer while it cannot pay for the whole chain
  const lit = Math.ceil(frac * SEGMENTS - 1e-6);
  for (let k = 0; k < lit; k++) ctx.fillRect(x + k * (segW + 1), y + SLOT + 5, segW, 6);
  if (chain.cost > 0 && chain.cost < bat.size) {                  // a tick at what one full run of the chain costs
    ctx.fillStyle = PALETTE.rigHot;
    ctx.fillRect(x + Math.round(w * chain.cost / bat.size) - 1, y + SLOT + 3, 2, 10);
  }
  const label = chain.def.key ? TEST_CHAINS[chain.def.key].name : run.rigRun ? '' : 'Custom';
  if (label) {                                                   // the chain's name, under its strip
    drawText(ctx, label, x, y + SLOT + 15, `700 12px ${DISPLAY}`, color, 'left', 'top');
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
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (piece.filled) {
    ctx.globalAlpha *= 0.3;
    ctx.fillStyle = PALETTE.ink;
    ctx.fill(p);
    ctx.globalAlpha /= 0.3;
  }
  ctx.stroke(p);
  ctx.restore();
}
