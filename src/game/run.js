// One run: owns the player, the clock, the RNGs and the world. The tick order here follows
// docs/architecture.md §3.3; add systems in that order, don't reorder.

import { createRng } from '../core/rng.js';
import { createPlayer, updatePlayer } from './player.js';
import { createWorld } from './world.js';
import { createDirector, spawnEnemy } from './director.js';
import { updateEnemies } from '../systems/enemy-ai.js';
import { updateCollision } from '../systems/collision.js';
import { drawEnemies } from '../render/entities.js';
import { RUN } from '../data/waves.js';

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
    world: createWorld(),
    director: null,

    update(dt, move) {
      if (run.over) return;
      const w = run.world;
      run.time += dt;
      w.tick++;

      run.director.update(dt);                                  // 1 spawns
      updatePlayer(run.player, dt, move);                       // 2 player
      // 3 weapons (M3)
      updateEnemies(run, dt);                                   // 4 enemy AI
      // 5 projectile movement (M3)
      w.hash.rebuild(w.enemies.active, w.enemies.count);        // 6 spatial hash
      updateCollision(run);                                     // 7 collisions
      // 8 damage flush (M3), 9 status effects (later)

      run.cam.x = run.player.x;
      run.cam.y = run.player.y;

      if (!run.over && run.time >= RUN.length) {                // 10 run events
        run.over = true;
        run.won = true;
      }
    },

    drawWorld(ctx, view) {
      drawEnemies(ctx, view, run);
    },

    // Debug: fill the screen with enemies to check the performance budget.
    stress() {
      run.debug.god = true;
      const w = run.world;
      const want = 500 - w.enemies.count;
      for (let i = 0; i < want; i++) {
        const a = run.rng.next() * Math.PI * 2;
        const d = 120 + run.rng.next() * 380;
        spawnEnemy(run, i % 10 === 0 ? 'brute' : 'goblin',
          run.player.x + Math.cos(a) * d, run.player.y + Math.sin(a) * d);
      }
    },

    debugLines() {
      const w = run.world;
      return [
        `enemies ${w.enemies.count}  hash max bucket ${w.hash.stats.maxBucket}`,
        `hpScale ${run.director.hpScale.toFixed(2)}  seed ${run.seed}`,
      ];
    },

    summary() {
      return { time: run.time, kills: run.kills, seed: run.seed, won: run.won };
    },
  };
  run.director = createDirector(run);
  return run;
}
