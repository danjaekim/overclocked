// One run: owns the player, the clock, the RNGs and the world. The tick order here follows
// docs/architecture.md §3.3; add systems in that order, don't reorder.

import { createRng } from '../core/rng.js';
import { createPlayer, updatePlayer } from './player.js';
import { createWorld } from './world.js';
import { createDirector, spawnEnemy } from './director.js';
import { BEHAVIORS } from '../behaviors/index.js';
import { addWeapon, updateWeapons, levelUpWeapon, canLevelUp } from './weapons.js';
import { WEAPONS } from '../data/weapons.js';
import { updateEnemies } from '../systems/enemy-ai.js';
import { updateProjectiles } from '../systems/movement.js';
import { updateCollision } from '../systems/collision.js';
import { updatePickups } from '../systems/pickups.js';
import { flushDamage } from '../systems/damage.js';
import { updateShrines } from '../systems/shrines.js';
import { updateFx, drawFx } from '../render/fx.js';
import { drawGems, drawOre, drawEnemies, drawProjectiles } from '../render/entities.js';
import { drawShrines } from '../render/shrines.js';
import { RUN } from '../data/waves.js';
import { CLASSES, DEFAULT_CLASS } from '../data/classes.js';

export function createRun({ seed, view, debug, classId = DEFAULT_CLASS }) {
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
    lastKillTime: -1e9,
    bossAlive: false,
    pendingLevelUps: 0,
    ore: 0,                 // iron-equivalents, spent at the forge
    starsteel: 0,           // rare ore from the boss, spent on evolutions
    titles: [],             // earned titles { id, def, level: '' }
    boss: null,
    toast: null,            // { text, ttl }: a short banner under the timer
    shrines: [],            // active anvil shrines { x, y, ttl, maxTtl, progress }
    forgeReady: false,      // a shrine was channelled: game.js opens the forge next
    player: null,
    cam: { x: 0, y: 0, ox: 0, oy: 0, shake: 0 },
    world: createWorld(),
    director: null,

    update(dt, move) {
      if (run.over) return;
      const w = run.world;
      run.time += dt;
      w.tick++;

      run.director.update(dt);                                  // 1 spawns
      updatePlayer(run.player, dt, move);                       // 2 player
      updateWeapons(run, dt);                                   // 3 weapons
      updateEnemies(run, dt);                                   // 4 enemy AI
      updateProjectiles(run, dt);                               // 5 projectile movement
      w.hash.rebuild(w.enemies.active, w.enemies.count);        // 6 spatial hash
      updateCollision(run);                                     // 7 collisions (queue damage)
      updatePickups(run, dt);                                   // 7b gems: magnet and collect
      flushDamage(run);                                         // 8 apply damage, deaths
      updateShrines(run, dt);                                   // 7c shrine channel / expiry
      // 9 status effects (later)
      updateFx(run, dt);
      if (run.toast && (run.toast.ttl -= dt) <= 0) run.toast = null;

      const cam = run.cam;
      cam.x = run.player.x;
      cam.y = run.player.y;
      if (cam.shake > 0.2) {
        cam.ox = (run.fxRng.next() - 0.5) * 2 * cam.shake;
        cam.oy = (run.fxRng.next() - 0.5) * 2 * cam.shake;
        cam.shake *= 0.88;
      } else {
        cam.shake = cam.ox = cam.oy = 0;
      }

      if (!run.over && run.time >= RUN.length) {                // 10 run events
        run.over = true;
        run.won = true;
      }
    },

    drawWorld(ctx, view) {
      drawShrines(ctx, view, run);
      drawGems(ctx, view, run);
      drawOre(ctx, view, run);
      drawEnemies(ctx, view, run);
      drawProjectiles(ctx, view, run);
    },

    // Weapon visuals (swings, blades, auras) draw above the player.
    drawWeapons(ctx) {
      const ws = run.player.weapons;
      for (let i = 0; i < ws.length; i++) {
        const b = BEHAVIORS[ws[i].def.behavior];
        if (b.draw) b.draw(ws[i], ctx, run);
      }
    },

    drawFx(ctx, view) {
      drawFx(ctx, view, run);
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

    // Debug: every weapon at max level, for performance and visual checks.
    debugLoadout() {
      for (const id of Object.keys(WEAPONS)) {
        if (WEAPONS[id].pool === false) continue;             // evolved weapons come from the forge
        if (WEAPONS[id].class != null && WEAPONS[id].class !== run.player.classId) continue;
        if (!run.player.weapons.some((w) => w.weaponId === id)) addWeapon(run, id);
      }
      for (const w of run.player.weapons) while (canLevelUp(w)) levelUpWeapon(run, w);
    },

    debugLines() {
      const w = run.world;
      const ws = run.player.weapons.map((i) => `${i.weaponId} L${i.level}`).join(', ');
      const ps = run.player.passives.map((i) => `${i.id} L${i.level}`).join(', ');
      return [
        `enemies ${w.enemies.count}  proj ${w.projectiles.count}  gems ${w.pickups.count}  fx ${w.fx.count}`,
        `hash max bucket ${w.hash.stats.maxBucket}  dmg dropped ${w.dmg.dropped}`,
        `hpScale ${run.director.hpScale.toFixed(2)}  seed ${run.seed}`,
        `ore ${run.ore}  starsteel ${run.starsteel}  titles ${run.titles.map((t) => t.id).join(',') || '-'}`,
        `weapons: ${ws}`,
        `passives: ${ps || '-'}`,
      ];
    },

    summary() {
      return {
        time: run.time, kills: run.kills, seed: run.seed, won: run.won,
        level: run.player.level, titles: run.titles.map((t) => t.def.name),
        weapons: run.player.weapons.map((w) => w.def.name),
      };
    },
  };

  run.player = createPlayer(run, classId);
  run.director = createDirector(run);
  addWeapon(run, CLASSES[classId].startWeapon);
  return run;
}
