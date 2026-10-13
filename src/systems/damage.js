// Damage to the player. (The enemy damage queue and flush arrive with M3.)

const IFRAMES = 0.5;     // seconds of invulnerability after a hit
const HURT_FLASH = 0.15;

export function damagePlayer(run, amount) {
  const p = run.player;
  if (p.iframes > 0 || run.over) return;
  p.iframes = IFRAMES;
  p.hurtFlash = HURT_FLASH;
  if (run.debug.god) return;
  p.hp -= Math.max(1, amount);
  if (p.hp <= 0) {
    p.hp = 0;
    run.over = true;
    run.won = false;
  }
}
