// One run: owns the player, the clock, the RNGs and (from M2) the world. The tick order
// here follows docs/architecture.md §3.3; add systems in that order, don't reorder.

import { createRng } from '../core/rng.js';
import { createPlayer, updatePlayer } from './player.js';

export function createRun({ seed, view, debug }) {
  const run = {
    seed,
    view,
    debug,
    rng: createRng(seed),
    fxRng: createRng((seed ^ 0x9e3779b9) >>> 0),   // visual-only randomness
    time: 0,
    over: false,
    won: false,
    kills: 0,
    player: createPlayer(),
    cam: { x: 0, y: 0 },

    update(dt, move) {
      if (run.over) return;
      run.time += dt;
      updatePlayer(run.player, dt, move);
      run.cam.x = run.player.x;
      run.cam.y = run.player.y;
    },

    summary() {
      return { time: run.time, kills: run.kills, seed: run.seed, won: run.won };
    },
  };
  return run;
}
