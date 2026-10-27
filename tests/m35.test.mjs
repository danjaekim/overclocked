// M35: run resume. A paused run is snapshotted to JSON and restored exactly: after restoring, the run
// plays on identically to the one that never stopped (game/run-snapshot.js, save/run-save.js).

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { addWeapon } from '../src/game/weapons.js';
import { fuse } from '../src/game/fusion.js';
import { RUN_EVENTS } from '../src/game/run-events.js';
import { createRunSave } from '../src/save/run-save.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (seed, classId = 'archer') => createRun({ seed, view: VIEW, debug: { god: true }, classId });

// A walking route that changes direction, so the player really moves.
function play(run, ticks, from = 0) {
  for (let i = from; i < from + ticks; i++) {
    const a = Math.floor(i / 90) * 0.7;
    run.update(STEP, { x: Math.cos(a), y: Math.sin(a) });
    run.pendingLevelUps = 0;
  }
}

const digest = (r) => JSON.stringify([
  r.time.toFixed(4), r.kills, r.rng.getState(), r.fxRng.getState(),
  r.world.enemies.count, r.world.projectiles.count, r.world.pickups.count, r.hazards.length, r.enemyShots.length,
  r.player.x, r.player.y, r.player.hp, r.player.xp, r.player.level, r.stats.total, r.ore, r.starsteel,
  r.world.enemies.active.reduce((a, e) => a + e.x * 1.3 + e.y + e.hp * 0.01, 0),
  r.player.weapons.map((w) => [w.weaponId, w.level, w.cd]),
]);

function freeze(run) {
  return JSON.parse(JSON.stringify(snapshotRun(run)));       // through real JSON, like storage does
}
const thaw = (snap) => restoreRun(snap, { view: VIEW, debug: { god: true }, sfx: () => {} });

// Snapshot `a` now, restore it as `b`, and play both on: they must never differ.
function assertContinues(a, ticks, from) {
  const b = thaw(freeze(a));
  a.world.hash.rebuild(a.world.enemies.active, a.world.enemies.count);       // the restore rebuilds the hash too
  assert.equal(digest(b), digest(a), 'identical right after the restore');
  for (let i = 0; i < ticks; i++) {
    const t = from + i;
    const ang = Math.floor(t / 90) * 0.7;
    const mv = { x: Math.cos(ang), y: Math.sin(ang) };
    a.update(STEP, mv); b.update(STEP, mv);
    a.pendingLevelUps = b.pendingLevelUps = 0;
    if (i % 20 === 0 || i === ticks - 1) assert.equal(digest(b), digest(a), `diverged ${i} ticks after the restore`);
  }
  return b;
}







