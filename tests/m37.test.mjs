// M37: supply crates. Sparse breakable props in the enemy pool (data/enemies.js PROPS, data/crates.js,
// systems/crates.js): every weapon hits them, nothing aims at them, and they drop a heart, xp or ore.

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { resolveHit } from '../src/game/hit.js';
import { flushDamage } from '../src/systems/damage.js';
import { spawnCrate, liveCrates, lootWeights, rollLoot } from '../src/systems/crates.js';
import { spawnHeal, KIND_HEAL, KIND_GEM, KIND_ORE } from '../src/systems/pickups.js';
import { CRATES } from '../src/data/crates.js';
import { EVENTS } from '../src/data/waves.js';
import { snapshotRun, restoreRun } from '../src/game/run-snapshot.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId = 'archer', god = true, seed = 5) => {
  const run = createRun({ seed, view: VIEW, debug: { god }, classId });
  run.director.update = () => {};
  return run;
};
const rehash = (run) => run.world.hash.rebuild(run.world.enemies.active, run.world.enemies.count);
const kinds = (run, k) => run.world.pickups.active.filter((g) => g.kind === k);

test('m37 a crate is a prop: found by area queries, skipped by the aiming query', () => {
  const run = newRun();
  const c = spawnCrate(run, { x: 60, y: 0 });
  assert.equal(c.prop, 1);
  rehash(run);
  const w = run.world;
  assert.ok(w.hash.queryRadius(0, 0, 100, w.scratch) >= 1, 'area queries see it');
  assert.equal(w.hash.queryNearest(0, 0, 100, (o) => o.alive), null, 'aiming does not');
  const g = spawnEnemy(run, 'goblin', 80, 0);
  rehash(run);
  assert.equal(w.hash.queryNearest(0, 0, 200, (o) => o.alive), g);
});

test('m37 a weapon with only a crate in range does not fire; a crate never hurts or moves', () => {
  const run = newRun('archer', false);
  const c = spawnCrate(run, { x: 30, y: 0 });
  for (let i = 0; i < 120; i++) run.update(STEP, { x: 0, y: 0 });
  assert.equal(run.world.projectiles.count, 0);
  assert.equal(run.player.hp, run.player.maxHp);
  assert.equal(c.x, 30);
});

test('m37 any hit wears a crate down and breaking it is not a kill', () => {
  const run = newRun('berserker');
  const c = spawnCrate(run, { x: 40, y: 0 });
  const w = run.player.weapons[0];
  const kills = run.kills;
  const xp = run.player.xp;
  resolveHit(run, w, c, 5, 1, 0);
  flushDamage(run);
  assert.ok(c.alive && c.hp < c.maxHp);
  resolveHit(run, w, c, 100, 1, 0);
  flushDamage(run);
  assert.equal(c.alive, false);
  assert.equal(run.kills, kills);
  assert.equal(run.player.xp, xp);
  assert.equal(run.cls.frenzy, 0, 'no Frenzy stack for a crate');
  assert.ok(run.world.pickups.count > 0, 'it dropped something');
});

test('m37 area damage breaks a crate: an aura with no enemies around', () => {
  const run = newRun('smith');
  run.player.weapons.length = 0;
  addWeapon(run, 'cinder_ward');
  const c = spawnCrate(run, { x: 30, y: 0 });
  for (let i = 0; i < 360 && c.alive; i++) run.update(STEP, { x: 0, y: 0 });
  assert.equal(c.alive, false);
});

test('m37 loot: a heal is never rolled at full health and is weighted up as you get hurt', () => {
  const run = newRun();
  run.player.hp = run.player.maxHp;
  assert.equal(lootWeights(run).heal, 0);
  for (let i = 0; i < 300; i++) assert.ok(rollLoot(run) !== 'heal');
  run.player.hp = run.player.maxHp * 0.5;
  const mid = lootWeights(run).heal;
  run.player.hp = run.player.maxHp * 0.2;
  const low = lootWeights(run).heal;
  approx(mid, CRATES.loot.heal.weight * 2.5, 1e-9);
  approx(low, CRATES.loot.heal.weight * 4, 1e-9);
  let heals = 0;
  for (let i = 0; i < 2000; i++) if (rollLoot(run) === 'heal') heals++;
  const share = heals / 2000;
  assert.ok(share > 0.45 && share < 0.65, `share ${share}`);
});

test('m37 a crate drops xp gems or ore when you are healthy', () => {
  const seen = new Set();
  for (let s = 0; s < 40; s++) {
    const run = newRun('archer', true, s + 1);
    const c = spawnCrate(run, { x: 40, y: 0 });
    resolveHit(run, run.player.weapons[0], c, 100, 1, 0);
    flushDamage(run);
    const gems = kinds(run, KIND_GEM).length;
    const ore = kinds(run, KIND_ORE).length;
    assert.equal(kinds(run, KIND_HEAL).length, 0);
    if (gems) { assert.equal(gems, CRATES.loot.xp.gems); seen.add('xp'); }
    if (ore) seen.add('ore');
  }
  assert.ok(seen.has('xp') && seen.has('ore'));
});

test('m37 a heart waits for you at full health, then flies in and heals 15% of max hp', () => {
  const run = newRun('archer', false);
  const p = run.player;
  spawnHeal(run, 20, 0, CRATES.loot.heal.frac);
  for (let i = 0; i < 90; i++) run.update(STEP, { x: 0, y: 0 });
  assert.equal(kinds(run, KIND_HEAL).length, 1, 'still there at full hp');
  p.hp = p.maxHp * 0.5;
  const before = p.hp;
  for (let i = 0; i < 60; i++) run.update(STEP, { x: 0, y: 0 });
  assert.equal(kinds(run, KIND_HEAL).length, 0);
  approx(p.hp - before, p.maxHp * 0.15, 1e-6);
});

test('m37 a crate fades after its time, and at most two exist at once', () => {
  const run = newRun();
  assert.ok(spawnCrate(run) && spawnCrate(run));
  assert.equal(spawnCrate(run), null);
  assert.equal(liveCrates(run), 2);
  for (let i = 0; i < Math.ceil((CRATES.ttl + 1) / STEP); i++) run.update(STEP, { x: 0, y: 0 });
  assert.equal(liveCrates(run), 0);
});

test('m37 the timeline has about one crate every 75 s, in time order, and the director spawns the first', () => {
  const times = EVENTS.filter((e) => e.event === 'crate').map((e) => e.at);
  assert.ok(times.length >= 6 && times.length <= 8, `${times.length}`);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 60);
  for (let i = 1; i < EVENTS.length; i++) assert.ok(EVENTS[i].at >= EVENTS[i - 1].at);
  const run = createRun({ seed: 5, view: VIEW, debug: { god: true }, classId: 'archer' });
  for (let i = 0; i < Math.ceil(60 / STEP); i++) { run.update(STEP, { x: 0, y: 0 }); run.pendingLevelUps = 0; }
  assert.ok(liveCrates(run) >= 1, 'the first crate arrived by 60 s');
});

test('m37 a run with a crate and a heart survives snapshot and resume and plays on identically', () => {
  const a = newRun('mage');
  a.player.weapons.length = 0;                       // nothing to break it during the test
  const c = spawnCrate(a, { x: 150, y: 20 });
  spawnHeal(a, 90, 90, 0.15);
  for (let i = 0; i < 90; i++) a.update(STEP, { x: 0.3, y: -0.2 });
  const snap = JSON.parse(JSON.stringify(snapshotRun(a)));
  const b = restoreRun(snap, { view: VIEW, debug: { god: true }, sfx: () => {} });
  b.director.update = () => {};
  assert.equal(liveCrates(b), liveCrates(a));
  const cb = b.world.enemies.active.find((e) => e.prop === 1);
  assert.ok(cb && cb.def === c.def && Math.abs(cb.aiCd - c.aiCd) < 1e-9);
  for (let i = 0; i < 300; i++) {
    a.update(STEP, { x: 0.3, y: -0.2 });
    b.update(STEP, { x: 0.3, y: -0.2 });
  }
  assert.equal(JSON.stringify([a.player.x, a.player.hp, a.world.pickups.count, liveCrates(a)]), JSON.stringify([b.player.x, b.player.hp, b.world.pickups.count, liveCrates(b)]));
});
