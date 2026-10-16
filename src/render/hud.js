// Canvas HUD, drawn in world-unit screen space (0..view.w by 0..view.h).
import { fmtTime } from '../ui/overlay.js';
import { xpToNext } from '../game/xp.js';
import { RARITIES } from '../data/rarities.js';
import { drawShrineArrows, drawChestArrows, drawCrateArrows } from './shrines.js';

export function drawHud(ctx, view, run) {
  const p = run.player;
  const y0 = view.insetTop + 16;

  // XP bar: thin, full width, at the very top
  const xb = view.insetTop;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, xb, view.w, 7);
  ctx.fillStyle = '#6ec5ff';
  ctx.fillRect(0, xb, view.w * Math.min(1, p.xp / xpToNext(p.level)), 7);

  // HP bar (top-left)
  const bw = 140;
  const bh = 14;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(12, y0, bw, bh);
  ctx.fillStyle = '#d9534f';
  ctx.fillRect(12, y0, bw * Math.max(0, p.hp / p.maxHp), bh);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(12.5, y0 + 0.5, bw - 1, bh - 1);

  // Level (right of the HP bar)
  ctx.fillStyle = '#e8e6df';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Lv ' + p.level, 12 + bw + 8, y0 - 1);
  if (run.cls && run.cls.frenzy > 0) {                           // Berserker: Frenzy stacks, fading with their timer
    ctx.globalAlpha = 0.45 + 0.55 * Math.min(1, run.cls.frenzyT / run.trait.frenzy.time);
    ctx.fillStyle = '#ff6b4a';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(`Frenzy ${run.cls.frenzy}`, 12 + bw + 8, y0 + 16);
    ctx.globalAlpha = 1;
  }

  // Timer (top-center)
  ctx.fillStyle = '#e8e6df';
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(fmtTime(run.time), view.w / 2 + 28, y0 - 2);

  // Kills (under the HP bar)
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#b9bbc6';
  ctx.fillText('Kills ' + run.kills, 12, y0 + bh + 6);

  // Ore (under the kills line)
  ctx.fillStyle = '#ffb45e';
  ctx.fillText('Ore ' + run.ore, 12 + 70, y0 + bh + 6);
  if (run.starsteel > 0) {
    ctx.fillStyle = '#7fe9ff';
    ctx.fillText('Starsteel ' + run.starsteel, 12 + 130, y0 + bh + 6);
  }

  drawShrineArrows(ctx, view, run);
  drawChestArrows(ctx, view, run);
  drawCrateArrows(ctx, view, run);

  // Owned items: one row of weapon chips, one of passive chips (placeholders until art)
  drawChips(ctx, run.player.weapons, 12, y0 + bh + 26);
  drawChips(ctx, run.player.passives, 12, y0 + bh + 52);
  drawChips(ctx, run.titles, 12, y0 + bh + 78);
  drawChips(ctx, run.player.perks, 12, y0 + bh + 104);
  if (run.resonance.length) {                                  // set bonuses: small labels, e.g. "Fire II"
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffd34d';
    let rx = 12;
    for (const r of run.resonance) {
      const label = `${r.name} ${r.tier === 2 ? 'II' : 'I'}`;
      ctx.fillText(label, rx, y0 + bh + 132);
      rx += ctx.measureText(label).width + 12;
    }
  }

  // Boss bar (top-center, under the timer)
  const boss = run.boss;
  if (boss) {
    const bwid = 190;
    const bx0 = view.w / 2 + 28 - bwid / 2;
    const by0 = y0 + 30;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx0, by0, bwid, 10);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(bx0, by0, bwid * Math.max(0, boss.hp / boss.maxHp), 10);
    ctx.fillStyle = '#e8e6df';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(boss.def.name, view.w / 2 + 28, by0 + 13);
  }

  // Toast banner
  if (run.toast) {
    ctx.globalAlpha = Math.min(1, run.toast.ttl * 2);
    ctx.fillStyle = '#ffd34d';
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 4;
    ctx.strokeText(run.toast.text, view.w / 2, view.insetTop + 76);
    ctx.fillText(run.toast.text, view.w / 2, view.insetTop + 76);
    ctx.globalAlpha = 1;
  }

  // Pause button (top-right)
  const s = 30;
  const bx = view.w - 12 - s;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(bx, y0 - 4, s, s);
  ctx.fillStyle = '#e8e6df';
  ctx.fillRect(bx + 9, y0 + 3, 4, 16);
  ctx.fillRect(bx + 17, y0 + 3, 4, 16);
}

export function drawStick(ctx, view, input) {
  const s = input.getStick();
  if (!s.active) return;
  const k = 1 / view.cssScale;               // CSS px -> world units
  const ox = s.ox * k;
  const oy = s.oy * k;
  const dx = s.x - s.ox;
  const dy = s.y - s.oy;
  const len = Math.hypot(dx, dy) || 1;
  const m = Math.min(len, s.maxRadius) / len;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ox, oy, s.maxRadius * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(ox + dx * m * k, oy + dy * m * k, 22 * k, 0, Math.PI * 2);
  ctx.fill();
}

function drawChips(ctx, chips, x, y) {
  const size = 22;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < chips.length; i++) {
    const c = chips[i];
    const cx = x + i * (size + 4);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(cx, y, size, size);
    ctx.strokeStyle = c.graft ? '#ffd34d' : RARITIES[c.def.rarity].color;     // a graft earns a gold rim
    ctx.lineWidth = c.graft ? 3 : 2;
    ctx.strokeRect(cx + 1, y + 1, size - 2, size - 2);
    ctx.fillStyle = '#e8e6df';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(c.def.glyph || c.def.name[0], cx + size / 2 - 2, y + size / 2 - 1);
    ctx.font = '600 8px system-ui, sans-serif';
    ctx.fillStyle = '#ffd34d';
    ctx.fillText(c.level, cx + size - 5, y + size - 5);
  }
}
