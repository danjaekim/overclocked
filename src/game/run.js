// One run: owns the player, the clock, the RNGs and the world. The tick order here follows
// docs/architecture.md §3.3; add systems in that order, don't reorder.

import { createRng } from '../core/rng.js';
import { createPlayer, updatePlayer } from './player.js';
import { createWorld } from './world.js';
import { createDirector, spawnEnemy } from './director.js';
import { BEHAVIORS } from '../behaviors/index.js';
import { addWeapon, updateWeapons, levelUpWeapon, canLevelUp, weaponName } from './weapons.js';
import { WEAPONS } from '../data/weapons.js';
import { updateEnemies } from '../systems/enemy-ai.js';
import { updateProjectiles } from '../systems/movement.js';
import { updateCollision } from '../systems/collision.js';
import { updatePickups } from '../systems/pickups.js';
import { flushDamage } from '../systems/damage.js';
import { updateStatuses } from '../systems/status.js';
import { updateShrines } from '../systems/shrines.js';
import { updateHazards, drawHazards } from '../systems/hazards.js';
import { updateEnemyShots } from '../systems/enemy-shots.js';
import { updateBossZones, drawBossZones } from '../systems/boss-zones.js';
import { updateFx, drawFx } from '../render/fx.js';
import { drawGems, drawOre, drawChests, drawHearts, drawMagnets, drawEnemies, drawProjectiles, drawEnemyShots } from '../render/entities.js';
import { drawShrines } from '../render/shrines.js';
import { RUN } from '../data/waves.js';
import { CLASSES, DEFAULT_CLASS } from '../data/classes.js';
import { LEVELUP } from '../data/progression.js';
import { createStats, statsSnapshot } from './run-stats.js';
import { initClassTrait, updateClassTrait, drawClassTrait } from './class-traits.js';

export function createRun({ seed, view, debug, classId = DEFAULT_CLASS, sfx = () => {} }) {
  const run = {
    seed,
    view,
    debug,
    sfx,                    // sound hook: sfx(name); a no-op in tests so the sim stays silent
    bossKilled: false,
    rng: createRng(seed),
    fxRng: createRng((seed ^ 0x9e3779b9) >>> 0),   // visual-only randomness
    time: 0,
    over: false,
    won: false,
    kills: 0,
    lastKillTime: -1e9,
    bossAlive: false,
    pendingLevelUps: 0,
    rerolls: LEVELUP.rerolls,
    banishes: LEVELUP.banishes,
    banished: [],           // item ids removed from the offer pool for this run
    resonance: [],          // active set bonuses [{ tag, tier, name }] (game/resonance.js)
    rules: {},              // perk rule values by rule id (null/undefined = not owned)
    ore: 0,                 // iron-equivalents, spent at the forge
    starsteel: 0,           // rare ore from the boss, spent on evolutions
    titles: [],             // earned titles { id, def, level: '' }
    boss: null,
    toast: null,            // { text, ttl }: a short banner under the timer
    overkill: 0,            // damage beyond the last kill (Overflow)
    killBlow: 0,            // the last hit's full damage
    shrines: [],            // active anvil shrines { x, y, ttl, maxTtl, progress }
    pendingChests: [],      // tiers of chests collected but not yet opened (0 elite, 1 boss)
    chestsOpened: 0,
    eliteKills: 0,          // elites killed so far (the first always drops starsteel)
    fusions: [],             // fusions made this run { id, name, masterwork } (game/fusion.js)
    hitFrozen: false,       // set by flushDamage: the enemy being hit was already frozen
    hazards: [],            // fire patches, vortices, pillars, shockwaves (systems/hazards.js)
    bossZones: [],          // Ashen Seer's marked circles (systems/boss-zones.js)
    enemyShots: [],         // slinger shots in flight (systems/enemy-shots.js)
    stats: createStats(),   // damage by weapon and cause, per-second timeline (game/run-stats.js)
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
      updateClassTrait(run, dt);                                // 3b class trait timers (Frenzy, Holy Nova)
      updateEnemies(run, dt);                                   // 4 enemy AI
      updateProjectiles(run, dt);                               // 5 projectile movement
      updateBossZones(run, dt);                                 // 5a boss meteor circles
      updateEnemyShots(run, dt);                                // 5b slinger shots
      w.hash.rebuild(w.enemies.active, w.enemies.count);        // 6 spatial hash
      updateCollision(run);                                     // 7 collisions (queue damage)
      updatePickups(run, dt);                                   // 7b gems: magnet and collect
      updateStatuses(run, dt);                                  // 7d status timers, burn ticks (queue damage)
      updateHazards(run, dt);                                   // 7e hazards tick (queue damage)
      flushDamage(run);                                         // 8 apply damage, deaths
      updateShrines(run, dt);                                   // 7c shrine channel / expiry
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
      drawChests(ctx, view, run);
      drawHearts(ctx, view, run);
      drawMagnets(ctx, view, run);
      drawHazards(ctx, run);
      drawBossZones(ctx, run);
      drawClassTrait(ctx, run);                                 // Rain of Arrows
      drawEnemies(ctx, view, run);
      drawEnemyShots(ctx, run);
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
      // a fused weapon shows its fusion name and both parents, e.g. "Quakebreaker of Saws (quakebreaker+ricochet_saw) L6"
      const ws = run.player.weapons.map((i) => (i.fusion ? `${i.fusion.name} (${i.weaponId}+${i.fusion.donorId})` : i.weaponId) + ` L${i.level}`).join(', ');
      const ps = run.player.passives.map((i) => `${i.id} L${i.level}`).join(', ');
      return [
        `enemies ${w.enemies.count}  proj ${w.projectiles.count}  gems ${w.pickups.count}  fx ${w.fx.count}`,
        `hash max bucket ${w.hash.stats.maxBucket}  dmg dropped ${w.dmg.dropped}`,
        `hpScale ${run.director.hpScale.toFixed(2)}  seed ${run.seed}`,
        `ore ${run.ore}  starsteel ${run.starsteel}  titles ${run.titles.map((t) => t.id).join(',') || '-'}`,
        `weapons: ${ws}`,
        `passives: ${ps || '-'}`,
        `perks: ${run.player.perks.map((i) => `${i.id} L${i.level}`).join(', ') || '-'}`,
      ];
    },

    statsSnapshot() {
      return statsSnapshot(run);
    },

    summary() {
      return {
        time: run.time, kills: run.kills, seed: run.seed, won: run.won, bossKilled: run.bossKilled, classId: run.player.classId,
        level: run.player.level, titles: run.titles.map((t) => t.def.name),
        weapons: run.player.weapons.map((w) => weaponName(w)),
        fusions: run.fusions.map((g) => g.name),
        fusionList: run.fusions.map((g) => ({ ...g })),          // with host and donor weapon ids, for results and history
        titleIds: run.titles.map((t) => t.id),
        build: {                                     // ids and levels, for the run history
          weapons: run.player.weapons.map((w) => [w.weaponId, w.level]),
          passives: run.player.passives.map((i) => [i.id, i.level]),
          perks: run.player.perks.map((i) => [i.id, i.level]),
          fusions: run.fusions.map((g) => [g.host, g.donor, g.id, g.name]),
        },
        stats: statsSnapshot(run),
      };
    },
  };

  run.player = createPlayer(run, classId);
  initClassTrait(run, classId);
  run.director = createDirector(run);
  addWeapon(run, CLASSES[classId].startWeapon);
  return run;
}
