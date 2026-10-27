import { PERKS } from '../src/data/perks.js';
import { TITLES } from '../src/data/titles.js';
import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { createRng } from '../src/core/rng.js';
import { xpToNext, gainXp } from '../src/game/xp.js';
import { addPassive, levelUpPassive, findPassive } from '../src/game/passives.js';
import { spawnGem, updatePickups, gemTier } from '../src/systems/pickups.js';
import { WEAPONS } from '../src/data/weapons.js';
import { PASSIVES } from '../src/data/passives.js';
import { SLOTS } from '../src/data/progression.js';
import { CAPS } from '../src/game/world.js';
import { makeTags } from '../src/stats/stats.js';

const VIEW = { w: 480, h: 1040 };
const newRun = (seed = 1, debug = {}) => createRun({ seed, view: VIEW, debug: { god: false, ...debug } });
const STEP = 1 / 60;
const STILL = { x: 0, y: 0 };

// ---- XP ----

test('xp curve: starts at 5, strictly increasing, and a good run lands around level 20-28', () => {
  assert.equal(xpToNext(1), 5);
  for (let l = 1; l < 60; l++) assert.ok(xpToNext(l + 1) > xpToNext(l));
  let total = 0;
  for (let l = 1; l < 24; l++) total += xpToNext(l);
  assert.ok(total > 2500 && total < 4500, `cumulative xp to level 24 = ${total}`);
});

test('gainXp levels up, carries remainder, and can queue several levels at once', () => {
  const run = newRun();
  const p = run.player;
  gainXp(run, 3);
  assert.equal(p.level, 1);
  assert.equal(p.xp, 3);
  gainXp(run, 2);                                  // exactly 5: level 2, 0 left
  assert.equal(p.level, 2);
  assert.equal(p.xp, 0);
  assert.equal(run.pendingLevelUps, 1);
  gainXp(run, xpToNext(2) + xpToNext(3) + 1);      // two more levels and 1 spare
  assert.equal(p.level, 4);
  assert.equal(p.xp, 1);
  assert.equal(run.pendingLevelUps, 3);
});

// ---- gems ----

test('gem tiers follow value thresholds', () => {
  assert.equal(gemTier(1), 0);
  assert.equal(gemTier(5), 1);
  assert.equal(gemTier(24), 1);
  assert.equal(gemTier(25), 2);
  assert.equal(gemTier(500), 3);
});

test('a gem outside the pickup radius stays put; inside it flies to the player and is collected', () => {
  const run = newRun();
  run.player.weapons.length = 0;
  const far = spawnGem(run, 400, 0, 1);
  const near = spawnGem(run, 40, 0, 3);
  updatePickups(run, STEP);
  assert.equal(far.magnet, false);
  assert.ok(near.magnet);
  for (let i = 0; i < 120 && run.world.pickups.count > 1; i++) updatePickups(run, STEP);
  assert.equal(run.world.pickups.count, 1, 'near gem collected');
  assert.equal(run.player.xp, 3);
  assert.equal(far.x, 400);
});

test('the xpGain stat scales collected xp', () => {
  const run = newRun();
  run.player.stats.add({ stat: 'xpGain', op: 'inc', value: 0.5, source: 'test' });
  spawnGem(run, 5, 0, 2);
  for (let i = 0; i < 30; i++) updatePickups(run, STEP);
  approx(run.player.xp, 3);
});

test('a full gem pool loses no xp: new gems join a near pile, or are paid out at once (M45n)', () => {
  const run = newRun();
  for (let i = 0; i < CAPS.pickups; i++) spawnGem(run, 1000 + i * 100, 1000, 1);      // spread out: nothing merges
  assert.equal(run.world.pickups.count, CAPS.pickups);
  const xp0 = run.player.xp, lvl0 = run.player.level;
  spawnGem(run, -9000, 0, 7);                                                           // full, nothing near: banked now
  assert.equal(run.world.pickups.count, CAPS.pickups);
  assert.ok(run.player.level > lvl0 || run.player.xp > xp0);
  const before = run.world.pickups.active.reduce((a, g) => a + g.value, 0);
  const merged = spawnGem(run, 1000, 1010, 5);                                          // near a pile: joins it
  assert.ok(merged);
  assert.equal(run.world.pickups.active.reduce((a, g) => a + g.value, 0), before + 5);
});

test('kills drop gems worth the enemy xp, and collecting them levels the player up', () => {
  // a Smith: it stands still here, and the Archer's Rain of Arrows (M43) kills enemies before they come within magnet reach
  const run = createRun({ seed: 5, view: VIEW, debug: { god: true }, classId: 'smith' });
  for (let i = 0; i < 60 * 40; i++) run.update(STEP, STILL);
  assert.ok(run.kills > 5);
  assert.ok(run.player.level > 1, `expected a level-up, still level ${run.player.level}`);
  assert.ok(run.pendingLevelUps >= run.player.level - 1);
});

// ---- passives ----

test('every passive applies each level through the stat block and can reach max', () => {
  for (const id of Object.keys(PASSIVES)) {
    const run = newRun();
    const entry = addPassive(run, id);
    assert.ok(entry, id);
    while (levelUpPassive(run, entry));
    assert.equal(entry.level, PASSIVES[id].maxLevel, id);
    assert.equal(levelUpPassive(run, entry), false);
  }
});

test('passive modifiers change real stats (Tempered Core: hp and armor)', () => {
  const run = newRun();
  const base = run.player.stats.get('maxHp');
  const entry = addPassive(run, 'tempered_core');
  approx(run.player.stats.get('maxHp'), base * 1.1);
  assert.equal(run.player.stats.get('armor'), 1);
  levelUpPassive(run, entry);
  approx(run.player.stats.get('maxHp'), base * 1.2);
});

test('Wind Sigil is scoped to projectile weapons only', () => {
  const run = newRun();
  const entry = addPassive(run, 'wind_sigil');
  levelUpPassive(run, entry);                                  // level 2: +1 pierce on projectile weapons
  const bow = run.player.weapons[0];
  assert.equal(run.player.stats.getFor('pierce', bow.tags), 1, 'Wind Sigil\'s +1 pierce (the Archer\'s own +1 pierce became Quiver in M43)');
  const melee = makeTags(['melee', 'weapon:99']);
  assert.equal(run.player.stats.getFor('pierce', melee), 0);
  assert.equal(run.player.stats.get('pierce'), 0);
});

test('a passive can be removed cleanly by source prefix', () => {
  const run = newRun();
  addPassive(run, 'keen_whetstone');
  approx(run.player.stats.get('damage'), 1.1);
  run.player.stats.removeBySource('passive:keen_whetstone');
  approx(run.player.stats.get('damage'), 1);
});

test('passive slots are capped and a passive cannot be added twice', () => {
  const run = newRun();
  const ids = Object.keys(PASSIVES);
  for (const id of ids) addPassive(run, id);
  assert.equal(run.player.passives.length, Math.min(ids.length, SLOTS.passives));
  assert.equal(addPassive(run, ids[0]), null);
});

// ---- offers ----








// ---- applying offers ----



// ---- a whole run with automatic picks ----

