// M24: evolution hints on level-up offers, and the pacing changes.
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { createRng } from '../src/core/rng.js';
import { ENEMIES } from '../src/data/enemies.js';
import { WAVES } from '../src/data/waves.js';

const base = { classId: 'smith', luck: 0, passives: [], perks: [], ownedTags: [], titles: [], banished: [] };




test('pacing: goblins are slower than before and late spawn rates ramp up', () => {
  assert.ok(ENEMIES.goblin.speed <= 62);
  const last = WAVES[WAVES.length - 1].spawns.find((s) => s.enemy === 'goblin');
  assert.ok(last.perSecEnd >= 7);
});

test('per-weapon DPS counts from its first hit, and stops when it is salvaged', async () => {
  const { createStats, recordDamage, markGone, statsSnapshot } = await import('../src/game/run-stats.js');
  const run = { time: 100, stats: createStats() };
  const late = { instanceId: 1, def: { name: 'Late' } }, old = { instanceId: 2, def: { name: 'Old' } };
  run.time = 10; recordDamage(run, old, 0, 100, false);
  run.time = 60; recordDamage(run, late, 0, 100, false);
  run.time = 70; markGone(run, old);
  run.time = 110;
  const snap = statsSnapshot(run);
  const by = Object.fromEntries(snap.weapons.map((w) => [w.name, w.dps]));
  assert.equal(by.Late, 100 / 50);          // owned 50 s
  assert.equal(by.Old, 100 / 60);           // 10 s to 70 s
});

test('armour takes a flat amount off each hit (never more than 60%), but not off burns', async () => {
  const { spawnEnemy } = await import('../src/game/director.js');
  const { createRun } = await import('../src/game/run.js');
  const { flushDamage } = await import('../src/systems/damage.js');
  const { queueDamage, KIND_HIT, KIND_DOT } = await import('../src/systems/damage-queue.js');
  const run = createRun({ seed: 3, view: { w: 390, h: 844 }, debug: { god: true } });
  const e = spawnEnemy(run, 'shieldbearer', 100, 0);
  assert.equal(e.armor, 5);
  const hp0 = e.hp;
  queueDamage(run, e, 10, 0, 0, 0, 0, null, KIND_HIT);
  flushDamage(run);
  assert.equal(hp0 - e.hp, 5);                      // 10 - 5
  const hp1 = e.hp;
  queueDamage(run, e, 4, 0, 0, 0, 0, null, KIND_HIT);
  flushDamage(run);
  assert.ok(Math.abs(hp1 - e.hp - 1.6) < 1e-9);                    // floor: 40% of 4
  const hp2 = e.hp;
  queueDamage(run, e, 4, 0, 0, 0, 0, null, KIND_DOT);
  flushDamage(run);
  assert.equal(hp2 - e.hp, 4);                      // damage over time ignores armour
});

test('a slinger closes in, winds up, and throws a shot that hurts only once past invulnerability', async () => {
  const { spawnEnemy } = await import('../src/game/director.js');
  const { createRun } = await import('../src/game/run.js');
  const { updateEnemies } = await import('../src/systems/enemy-ai.js');
  const { updateEnemyShots } = await import('../src/systems/enemy-shots.js');
  const run = createRun({ seed: 3, view: { w: 390, h: 844 }, debug: {} });
  run.player.x = 0; run.player.y = 0;
  const e = spawnEnemy(run, 'slinger', 200, 0);
  e.aiCd = 0.1;
  let shots = 0;
  for (let t = 0; t < 120 && shots === 0; t++) { updateEnemies(run, 1 / 60); shots = run.enemyShots.length; }
  assert.equal(shots, 1);
  const hp = run.player.hp;
  run.player.iframes = 5;                           // invulnerable: the shot passes through
  const s = run.enemyShots[0];
  s.x = 0; s.y = 0;
  updateEnemyShots(run, 1 / 60);
  assert.equal(run.player.hp, hp);
  assert.equal(run.enemyShots.length, 1);
  run.player.iframes = 0;
  updateEnemyShots(run, 1 / 60);
  assert.ok(run.player.hp < hp);
  assert.equal(run.enemyShots.length, 0);
});
