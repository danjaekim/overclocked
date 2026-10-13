// Projectile integration (step 5 of the tick). Enemies move in enemy-ai.js.

export function updateProjectiles(run, dt) {
  const store = run.world.projectiles;
  const list = store.active;
  for (let i = list.length - 1; i >= 0; i--) {
    const pr = list[i];
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.ttl -= dt;
    if (pr.ttl <= 0) store.release(pr);
  }
}
