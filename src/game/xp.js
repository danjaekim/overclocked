// XP and levels. Reaching a level queues a level-up (run.pendingLevelUps); the game state
// machine opens the choice screen once the tick is done.

import { XP } from '../data/progression.js';

export function xpToNext(level) {
  const n = level - 1;
  return Math.round(XP.base + XP.linear * n + XP.quad * n * n);
}

// Adds XP (already multiplied by the xpGain stat by the caller) and processes level-ups.
export function gainXp(run, amount) {
  if (run.sandbox) return;                      // the sandbox has no levels
  const p = run.player;
  p.xp += amount;
  let need = xpToNext(p.level);
  while (p.xp >= need) {
    p.xp -= need;
    p.level++;
    run.pendingLevelUps++;
    need = xpToNext(p.level);
  }
}
