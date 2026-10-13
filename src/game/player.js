// Player entity. Movement and timers only; combat stats arrive with the StatBlock (M3).

export function createPlayer() {
  return {
    x: 0,
    y: 0,
    r: 14,
    hp: 100,
    maxHp: 100,
    speed: 200,         // world units / second (becomes a stat in M3)
    iframes: 0,         // seconds of invulnerability left after a hit
    hurtFlash: 0,       // seconds of hit flash left
    facingX: 0,
    facingY: -1,
  };
}

export function updatePlayer(player, dt, move) {
  player.x += move.x * player.speed * dt;
  player.y += move.y * player.speed * dt;
  if (move.x !== 0 || move.y !== 0) {
    const len = Math.hypot(move.x, move.y);
    player.facingX = move.x / len;
    player.facingY = move.y / len;
  }
  if (player.iframes > 0) player.iframes -= dt;
  if (player.hurtFlash > 0) player.hurtFlash -= dt;
}
