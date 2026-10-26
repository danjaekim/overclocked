// M45n: a screen clear never makes gems vanish. A full pickup pool merges new gems into a near pile, or pays out at once.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { xpToNext } from '../src/game/xp.js';
import { spawnGem, KIND_GEM } from '../src/systems/pickups.js';

const mk = () => createRun({ seed: 1, view: { w: 390, h: 844, scale: 1 }, debug: {} });
const gemXp = (run) => run.world.pickups.active.filter((g) => g.kind === KIND_GEM).reduce((s, g) => s + g.value, 0);

test('with the pool full and kills far apart, the XP is banked at once, none piles on a far-off gem', () => {
  const run = mk();
  const store = run.world.pickups, cap = store.capacity;
  for (let i = 0; i < cap; i++) spawnGem(run, (i % 40) * 120, Math.floor(i / 40) * 120, 1);   // 120 apart: no merging
  assert.equal(store.active.length, cap);
  const xp0 = run.player.xp, lvl0 = run.player.level;
  for (let i = 0; i < 20; i++) spawnGem(run, -5000 - i * 200, -5000, 1);
  assert.equal(store.active.length, cap);
  assert.equal(Math.max(...store.active.map((g) => g.value)), 1);
  assert.ok(run.player.level > lvl0 || run.player.xp > xp0);
});

test('near the cap a new gem joins the pile where it fell', () => {
  const run = mk();
  const store = run.world.pickups, cap = store.capacity;
  for (let i = 0; i < Math.ceil(cap * 0.9); i++) spawnGem(run, (i % 40) * 120, Math.floor(i / 40) * 120, 1);
  const n = store.active.length;
  spawnGem(run, 5, 5, 3);
  assert.equal(store.active.length, n);
  assert.equal(store.active[0].value, 4);
});

test('no XP is lost across a big clear: pooled gems plus paid-out XP add up to every kill', () => {
  const run = mk();
  const total = 3000;
  for (let i = 0; i < total; i++) spawnGem(run, (i % 55) * 90, Math.floor(i / 55) * 90, 1);
  let paid = run.player.xp;
  for (let l = 1; l < run.player.level; l++) paid += xpToNext(l);
  assert.ok(Math.abs(gemXp(run) + paid / run.player.stats.get('xpGain') - total) < 1e-6);
});
