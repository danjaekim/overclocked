// Player entity. Every combat/survival number is read from its StatBlock.

import { StatBlock } from '../stats/stats.js';
import { STATS } from '../stats/stat-defs.js';
import { CONDITIONS } from '../stats/conditions.js';
import { CLASSES } from '../data/classes.js';

export function createPlayer(run, classId) {
  const stats = new StatBlock(STATS, { conditions: CONDITIONS, getContext: () => run });
  stats.addMany(CLASSES[classId].mods.map((m) => ({ ...m, source: `class:${classId}` })));
  const maxHp = stats.get('maxHp');
  return {
    classId,
    stats,
    weapons: [],
    passives: [],
    perks: [],          // owned techniques { id, def, level } (game/perks.js); no slot cap
    level: 1,
    xp: 0,
    x: 0,
    y: 0,
    r: 14,
    hp: maxHp,
    maxHp,
    speed: stats.get('moveSpeed'),
    moving: false,
    shield: 0,          // absorbs damage before hp (effects/shield)
    iframes: 0,         // seconds of invulnerability left after a hit
    hurtFlash: 0,       // seconds of hit flash left
    facingX: 0,
    facingY: -1,
  };
}

export function updatePlayer(player, dt, move) {
  const st = player.stats;
  player.speed = st.get('moveSpeed');
  player.maxHp = st.get('maxHp');
  const regen = st.get('regen');
  if (regen > 0) player.hp += regen * dt;
  if (player.hp > player.maxHp) player.hp = player.maxHp;

  player.moving = move.x !== 0 || move.y !== 0;
  player.x += move.x * player.speed * dt;
  player.y += move.y * player.speed * dt;
  if (player.moving) {
    const len = Math.hypot(move.x, move.y);
    player.facingX = move.x / len;
    player.facingY = move.y / len;
  }
  if (player.iframes > 0) player.iframes -= dt;
  if (player.hurtFlash > 0) player.hurtFlash -= dt;
}
