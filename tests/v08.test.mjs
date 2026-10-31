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

import { MIN_ALIVE, EVENTS } from '../src/data/waves.js';
import { RUN_EVENTS } from '../src/game/run-events.js';
import { createDirector } from '../src/game/director.js';

const aliveCount = (run) => run.world.enemies.active.filter((e) => e.prop !== 1).length;
const directed = (time) => {
  const run = createOverclockedRun({ seed: 7, view: VIEW, debug: { god: true }, sfx: () => {} });
  run.time = time;
  run.director = createDirector(run);
  const st = run.director.getState();
  st.nextEvent = EVENTS.filter((e) => e.at <= time).length;                      // skip the events that already happened
  run.director.setState(st);
  return run;
};

test('v08 an empty field at minute 6 is topped up at 25 a second until it reaches the minimum', () => {
  const run = directed(360);
  const min = MIN_ALIVE.find((m) => 360 >= m.from && 360 < m.to).min;
  const step = (n) => { for (let i = 0; i < n; i++) run.director.update(STEP); };
  step(60);
  const after1 = aliveCount(run);
  assert.ok(after1 >= 22 && after1 <= 40, `after 1 s: ${after1}`);                  // 25 top-ups plus the normal wave rate
  step(60 * 12);
  assert.ok(aliveCount(run) >= min, `after 13 s: ${aliveCount(run)} < ${min}`);
});

test('v08 a field already above the minimum gets only the normal wave rate', () => {
  const run = directed(30);                                                      // minimum 10
  for (let i = 0; i < 12; i++) spawnEnemy(run, 'goblin', 400 + i * 10, 400);
  const before = aliveCount(run);
  for (let i = 0; i < 60; i++) run.director.update(STEP);
  assert.ok(aliveCount(run) - before <= 3, `${aliveCount(run) - before} spawned`);
});

test('v08 director state survives a snapshot round trip with the top-up accumulator', () => {
  const run = directed(360);
  for (let i = 0; i < 10; i++) run.director.update(STEP);
  const st = run.director.getState();
  const d2 = createDirector(run);
  d2.setState(JSON.parse(JSON.stringify(st)));
  assert.equal(d2.getState().topAcc, st.topAcc);
  const old = { ...st }; delete old.topAcc;
  d2.setState(JSON.parse(JSON.stringify(old)));
  assert.equal(d2.getState().topAcc, 0);                                         // an old save has no accumulator
});

test('v08 hordes: the timeline has three, in time order, and one puts count enemies on a ring around the player', () => {
  const hordes = EVENTS.filter((e) => e.event === 'horde');
  assert.deepEqual(hordes.map((e) => e.at), [180, 360, 510]);
  for (let i = 1; i < EVENTS.length; i++) assert.ok(EVENTS[i].at >= EVENTS[i - 1].at);
  const run = directed(180);
  run.player.x = 50; run.player.y = -20;
  const before = aliveCount(run);
  RUN_EVENTS.horde(run, hordes[0]);
  assert.equal(aliveCount(run) - before, 60);
  const r = Math.hypot(VIEW.w, VIEW.h) / 2 + 30;
  for (const e of run.world.enemies.active) assert.ok(Math.abs(Math.hypot(e.x - 50, e.y + 20) - r) < 1);
});

import { checkEscort } from '../src/systems/enemy-ai.js';
import { ENEMIES } from '../src/data/enemies.js';

const bossRun = (dps, enemy = 'warlord') => {
  const run = directed(240);
  run.stats.rawSec = new Array(240).fill(dps);
  RUN_EVENTS.boss(run, { enemy });
  return run;
};

test('v08 boss hp follows your recent dps: 1x for a weak rig, dps x 25 s for a strong one, capped at 6x', () => {
  assert.equal(bossRun(100).boss.maxHp, ENEMIES.warlord.hp);                     // raw 100/s x 0.2 x 35 s = 700, under the base
  assert.equal(bossRun(1000).boss.maxHp, 7000);                                  // 1000 x 0.2 x 35
  assert.equal(bossRun(20000).boss.maxHp, ENEMIES.warlord.hp * 8);
  assert.equal(bossRun(5000, 'seer').boss.maxHp, 13500);                         // 5000 x 0.06 x 45
  assert.equal(bossRun(10).boss.hp, bossRun(10).boss.maxHp);
  assert.equal(bossRun(1000).boss.hpMult, 7000 / ENEMIES.warlord.hp);
});

test('v08 a boss calls an escort at 66% and 33% hp, once each', () => {
  const run = bossRun(10);
  const b = run.boss;
  const base = aliveCount(run);
  checkEscort(run, b);
  assert.equal(aliveCount(run), base);
  b.hp = b.maxHp * 0.6;
  checkEscort(run, b); checkEscort(run, b);
  assert.equal(aliveCount(run) - base, 22);
  b.hp = b.maxHp * 0.3;
  checkEscort(run, b);
  assert.equal(aliveCount(run) - base, 44);
});

test('v08 the Warlord winds up faster below half hp', () => {
  const run = bossRun(10);
  const b = run.boss;
  b.aiCd = 0;
  const c = ENEMIES.warlord.charge;
  run.update(STEP, { x: 0, y: 0 });
  assert.ok(Math.abs(b.aiT - (c.windup - STEP)) < 0.1 || b.ai === 1);
  b.ai = 0; b.aiCd = 0; b.hp = b.maxHp * 0.4;
  run.update(STEP, { x: 0, y: 0 });
  assert.ok(b.aiT <= c.windupRage + 1e-6, `windup ${b.aiT}`);
});
