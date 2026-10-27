// Anvil shrines (docs/architecture.md §6.3): spawn from timeline events or boss drops, are found
// by an edge arrow, and open the forge once the player has stood in them long enough.

import { SHRINE } from '../data/forge.js';

// Candidate spots just past the left or right view edge (the view is tall and narrow).
// The least crowded of several random candidates wins.
// `at` ({x, y}) places it exactly (the boss shrine); `force` ignores maxActive.
export function spawnShrine(run, ttl = SHRINE.ttl, at = null, force = false) {
  if (run.rigRun) return null;                              // the workbench shrines come in M5; until then a rig run has none
  if (!force && run.shrines.length >= SHRINE.maxActive) return null;
  if (at) {
    const s = { x: at.x, y: at.y, ttl, maxTtl: ttl, progress: 0 };
    run.shrines.push(s);
    return s;
  }
  const pl = SHRINE.placement;
  const w = run.world;
  const p = run.player;
  const half = run.view.w / 2;
  let best = null;
  let bestCrowd = Infinity;
  for (let i = 0; i < pl.candidates; i++) {
    const side = run.rng.next() < 0.5 ? -1 : 1;
    const x = p.x + side * (half + pl.edgeMin + run.rng.next() * (pl.edgeMax - pl.edgeMin));
    const y = p.y + (run.rng.next() * 2 - 1) * pl.maxDy;
    const crowd = w.hash.queryRadius(x, y, 100, w.scratch);
    if (crowd < bestCrowd) { bestCrowd = crowd; best = { x, y }; }
  }
  const s = { x: best.x, y: best.y, ttl, maxTtl: ttl, progress: 0 };
  run.shrines.push(s);
  run.sfx('shrine');
  return s;
}

// Counts down, fills while the player stands inside, drains (faster) outside.
// A full shrine is consumed and sets run.forgeReady; game.js then opens the forge.
export function updateShrines(run, dt) {
  const list = run.shrines;
  const p = run.player;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    s.ttl -= dt;
    if (s.ttl <= 0) {
      list.splice(i, 1);
      continue;
    }
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    const rr = SHRINE.radius + p.r;
    if (dx * dx + dy * dy <= rr * rr) s.progress += dt;
    else s.progress = Math.max(0, s.progress - dt * SHRINE.drain);
    if (s.progress >= SHRINE.channel) {
      list.splice(i, 1);
      run.forgeReady = true;
    }
  }
}
