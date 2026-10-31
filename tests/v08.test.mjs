// v0.8: enemy pressure and the gold economy (docs/plan-v08.md).

import { test, assert } from './harness.mjs';
import { createOverclockedRun } from '../src/game/ovrun.js';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { newRig } from '../src/rig/editor.js';
import { applyRig } from '../src/game/sandbox.js';
import { spawnShrine, updateShrines } from '../src/systems/shrines.js';
import { GOLD } from '../src/data/gold.js';

const VIEW = { w: 390, h: 844, insetTop: 0 };
const STEP = 1 / 60;
const rigRun = (slots = ['blaster'], chassis = 'standard') => {
  const run = createOverclockedRun({ seed: 7, view: VIEW, debug: { god: true }, sfx: () => {} });
  run.director.update = () => {};
  run.rigState = newRig([{ rule: 'pulse', slots }]);
  applyRig(run);
  return run;
};
const projectilesAfter = (run, secs) => {
  let max = 0;
  for (let i = 0; i < Math.ceil(secs / STEP); i++) { run.update(STEP, { x: 0, y: 0 }); max = Math.max(max, run.world.projectiles.count); }
  return max;
};

test('v08 a rig weapon only aims at enemies on screen', () => {
  const far = rigRun();
  spawnEnemy(far, 'brute', 300, 0).speed = 0;                            // 300 px to the side: past the 195 px edge plus the margin, inside Blaster's 380 range
  assert.equal(projectilesAfter(far, 3), 0);
  const near = rigRun();
  spawnEnemy(near, 'brute', 150, 0).speed = 0;
  assert.ok(projectilesAfter(near, 3) > 0);
});

test('v08 an Overforged class still shoots an enemy 300 px away', () => {
  const run = createRun({ seed: 5, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'archer' });
  run.director.update = () => {};
  spawnEnemy(run, 'brute', 300, 0);
  assert.ok(projectilesAfter(run, 3) > 0);
});

test('v08 a shrine pays gold in a rig run', () => {
  const run = rigRun();
  const before = run.ore;
  const s = spawnShrine(run, 60, { x: run.player.x, y: run.player.y });
  s.progress = 1e6;
  updateShrines(run, STEP);
  assert.ok(run.forgeReady);
  assert.equal(run.ore, before + GOLD.shrine);
});

test('v08 a Reaper chain with nothing to kill still fires every 3 s', () => {
  const run = createOverclockedRun({ seed: 7, view: VIEW, debug: { god: true }, sfx: () => {} });
  run.director.update = () => {};
  run.rigState = newRig([{ rule: 'reaper', slots: ['blaster'] }]);
  applyRig(run);
  const e = spawnEnemy(run, 'brute', 120, 0);
  e.hp = e.maxHp = 1e9;
  assert.ok(projectilesAfter(run, 3.2) > 0);
});
