// The sandbox HUD: health, timer and kills, then one strip per chain (rule card, its pieces, energy pips).
// A piece lights up when it runs, so you can see which piece caused what in the arena.

import { fmtTime } from '../ui/overlay.js';
import { xpToNext } from '../game/xp.js';
import { PIECES, RULES, CHAIN_COLORS, CHAIN_NAMES } from '../rig/pieces.js';
import { TEST_CHAINS } from '../rig/presets.js';

const SLOT = 30;
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
    for (let i = 0; i < rows.length; i++) drawStrip(ctx, run, rows[i], 12, y0 + bh + 32 + i * (SLOT + 34));
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
  const waiting = rule.while === 'moving' && !run.player.moving;
  ctx.fillStyle = waiting ? 'rgba(40,40,52,0.7)' : 'rgba(60,60,80,0.85)';        // Stride is dim while you stand still
  ctx.fillRect(x, y, 54, SLOT);
  ctx.fillStyle = '#e8e6df';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rule.name, x + 27, y + SLOT / 2 - 5);
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = '#b9bbc6';
  ctx.fillText(rule.every + 's', x + 27, y + SLOT / 2 + 8);

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
    ctx.fillStyle = '#fff';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(piece.glyph, sx + SLOT / 2, y + SLOT / 2 + 1);
    ctx.globalAlpha = 1;
  }

  const pool = chain.act ? chain.act.pool : chain.energy;        // energy pips: they empty as pieces and payloads run
  for (let k = 0; k < chain.energy; k++) {
    ctx.fillStyle = k < pool ? '#ffd34d' : 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + k * 9, y + SLOT + 5, 7, 7);
  }
  const label = chain.def.key ? TEST_CHAINS[chain.def.key].name : 'Custom';
  {                                                   // the chain's name, under its strip
    ctx.fillStyle = color;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x, y + SLOT + 15);
  }
}
