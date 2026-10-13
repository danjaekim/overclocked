// Applying damage: the queued enemy damage flush, enemy deaths, and damage to the player.

import { addDamageNumber, addPuff } from '../render/fx.js';
import { spawnGem } from './pickups.js';

const IFRAMES = 0.5;       // seconds of invulnerability after a hit
const HURT_FLASH = 0.15;
const HIT_FLASH = 0.08;

export function killEnemy(run, e) {
  run.kills++;
  run.lastKillTime = run.time;
  addPuff(run, e.x, e.y, e.r, e.def.color);
  spawnGem(run, e.x, e.y, e.def.xp);
  // ore drops (M6) and on-kill triggers hook in here
  run.world.enemies.release(e);
}

// Step 8 of the tick: apply every queued hit.
export function flushDamage(run) {
  const q = run.world.dmg;
  for (let i = 0; i < q.n; i++) {
    const e = q.enemy[i];
    q.enemy[i] = null;
    if (!e.alive || e.uid !== q.uid[i]) continue;     // already dead (or slot reused) this tick
    e.hp -= q.amount[i];
    e.flash = HIT_FLASH;
    e.kx += q.kx[i];
    e.ky += q.ky[i];
    addDamageNumber(run, e.x, e.y - e.r, q.amount[i], q.crit[i] === 1);
    if (e.hp <= 0) killEnemy(run, e);
  }
  q.n = 0;
}

export function damagePlayer(run, amount) {
  const p = run.player;
  if (p.iframes > 0 || run.over) return;
  p.iframes = IFRAMES;
  p.hurtFlash = HURT_FLASH;
  run.cam.shake = 7;
  if (run.debug.god) return;
  p.hp -= Math.max(1, amount - p.stats.get('armor'));
  if (p.hp <= 0) {
    p.hp = 0;
    run.over = true;
    run.won = false;
  }
}
