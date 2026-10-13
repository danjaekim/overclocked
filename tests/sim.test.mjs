// Headless simulation tests: run the real game systems in Node with no DOM.

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { levelUpWeapon, canLevelUp } from '../src/game/weapons.js';
import { updateCollision } from '../src/systems/collision.js';
import { flushDamage } from '../src/systems/damage.js';
import { validateData } from '../src/data/validate.js';
import { RUN } from '../src/data/waves.js';
import { CAPS } from '../src/game/world.js';

const VIEW = { w: 480, h: 1040 };
const STILL = { x: 0, y: 0 };
const newRun = (seed = 1, debug = {}) => createRun({ seed, view: VIEW, debug: { god: false, ...debug } });
const STEP = 1 / 60;

function tick(run, seconds, move = STILL) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) run.update(STEP, move);
}

test('all shipped data validates', () => {
  assert.deepEqual(validateData(), []);
});

test('a new run starts with the class weapon and full hp', () => {
  const run = newRun();
  assert.equal(run.player.weapons.length, 1);
  assert.equal(run.player.weapons[0].weaponId, 'ember_bow');
  assert.equal(run.player.hp, run.player.maxHp);
  approx(run.player.stats.get('critChance'), 0.10);          // base 0.05 + archer 0.05
});

test('the bow kills enemies and the whole pipeline stays sane for 60 seconds', () => {
  const run = newRun(11, { god: true });
  for (let s = 0; s < 60; s++) {
    tick(run, 1);
    const w = run.world;
    assert.ok(w.enemies.count <= CAPS.enemies && w.projectiles.count <= CAPS.projectiles && w.fx.count <= CAPS.fx);
    assert.ok(w.fxNumbers >= 0 && w.fxNumbers <= 60);
    for (const e of w.enemies.active) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y) && e.hp > 0);
    for (const p of w.projectiles.active) assert.ok(Number.isFinite(p.x) && p.ttl > 0);
  }
  assert.ok(run.kills > 10, `expected kills, got ${run.kills}`);
  assert.equal(run.world.dmg.dropped, 0);
});

test('runs are deterministic for a given seed and differ across seeds', () => {
  const snap = (seed) => {
    const run = newRun(seed, { god: true });
    tick(run, 40);
    return JSON.stringify([run.kills, run.world.enemies.count, run.world.projectiles.count,
      Math.round(run.world.enemies.active.reduce((a, e) => a + e.x + e.y, 0))]);
  };
  assert.equal(snap(5), snap(5));
  assert.notEqual(snap(5), snap(6));
});

test('a stationary player without god mode can die, ending the run as a loss', () => {
  const run = newRun(3);
  run.player.stats.add({ stat: 'damage', op: 'set', value: 0, source: 'test' });   // no offense
  tick(run, 300);
  assert.ok(run.over && !run.won, 'expected the run to end in a loss');
  assert.equal(run.player.hp, 0);
});

test('surviving to RUN.length wins', () => {
  const run = newRun(4, { god: true });
  run.time = RUN.length - 0.05;
  tick(run, 0.2);
  assert.ok(run.over && run.won);
});

test('weapon level-ups apply their modifiers through the stat block', () => {
  const run = newRun();
  const inst = run.player.weapons[0];
  const dmg = () => 12 * run.player.stats.getFor('damage', inst.tags);
  approx(dmg(), 12);
  while (canLevelUp(inst)) assert.ok(levelUpWeapon(run, inst));
  assert.equal(inst.level, inst.def.maxLevel);
  approx(dmg(), 22.5);
  assert.equal(run.player.stats.getFor('projectiles', inst.tags), 2);
  assert.equal(levelUpWeapon(run, inst), false);
});

test('weapon-local upgrades do not leak to other weapons', () => {
  const run = newRun();
  const inst = run.player.weapons[0];
  levelUpWeapon(run, inst);                                    // +20% damage, tagged to this instance
  approx(run.player.stats.getFor('damage', inst.tags), 1.2);
  approx(run.player.stats.get('damage'), 1);                   // global read is untouched
});

test('pierce: a projectile hits pierce+1 enemies, then is consumed', () => {
  for (const [pierce, expected] of [[0, 1], [1, 2], [2, 3]]) {
    const run = newRun(9);
    const inst = run.player.weapons[0];
    run.player.weapons.length = 0;
    // three enemies stacked on the projectile
    for (let i = 0; i < 3; i++) spawnEnemy(run, 'goblin', 200 + i, 0, 1);
    const w = run.world;
    w.hash.rebuild(w.enemies.active, w.enemies.count);
    const pr = w.projectiles.acquire();
    Object.assign(pr, { inst, x: 200, y: 0, dx: 1, dy: 0, vx: 500, vy: 0, r: 5, ttl: 1, dmg: 5, pierce, nh: 0 });
    updateCollision(run);
    assert.equal(w.dmg.n, expected, `pierce ${pierce}`);
    assert.equal(w.projectiles.count, 0, `projectile should be consumed (pierce ${pierce})`);
  }
});

test('one projectile never damages the same enemy twice', () => {
  const run = newRun(9);
  const inst = run.player.weapons[0];
  run.player.weapons.length = 0;
  spawnEnemy(run, 'brute', 300, 0, 1);
  const w = run.world;
  w.hash.rebuild(w.enemies.active, w.enemies.count);
  const pr = w.projectiles.acquire();
  Object.assign(pr, { inst, x: 300, y: 0, dx: 1, dy: 0, vx: 0, vy: 0, r: 5, ttl: 5, dmg: 1, pierce: 99, nh: 0 });
  for (let i = 0; i < 10; i++) updateCollision(run);
  assert.equal(w.dmg.n, 1);
});

test('damage flush: kills release the enemy, count the kill, and stale entries are ignored', () => {
  const run = newRun(2);
  run.player.weapons.length = 0;
  const e = spawnEnemy(run, 'goblin', 100, 100, 1);
  const w = run.world;
  const uid = e.uid;
  // two queued hits, the first one lethal
  w.dmg.enemy[0] = e; w.dmg.uid[0] = uid; w.dmg.amount[0] = 999; w.dmg.crit[0] = 0; w.dmg.n = 1;
  w.dmg.enemy[1] = e; w.dmg.uid[1] = uid; w.dmg.amount[1] = 999; w.dmg.crit[1] = 0; w.dmg.n = 2;
  flushDamage(run);
  assert.equal(run.kills, 1);
  assert.equal(w.enemies.count, 0);
  assert.equal(w.dmg.n, 0);
});

test('timeline scales with RUN.length (a shorter run reaches later waves sooner)', () => {
  const original = { ...RUN };
  try {
    RUN.length = 300;                                          // half-length run
    const short = newRun(1, { god: true });
    short.time = 30;                                           // = design time 60 -> second segment
    short.director.update(0);
    approx(short.director.hpScale, 1.2);
    RUN.length = 600;
    const full = newRun(1, { god: true });
    full.time = 30;
    full.director.update(0);
    approx(full.director.hpScale, 1.0);
  } finally {
    Object.assign(RUN, original);
  }
});

test('director never exceeds the soft cap and buffs hp instead', () => {
  const run = newRun(8, { god: true });
  run.player.weapons.length = 0;
  run.time = 400;                                              // late, heavy spawns
  for (let i = 0; i < 520; i++) spawnEnemy(run, 'goblin', 400 + (i % 50), (i * 7) % 300, 1);
  const before = run.director.capBuff;
  tick(run, 5);
  assert.ok(run.world.enemies.count <= CAPS.enemies);
  assert.ok(run.director.capBuff > before, 'hp buff should grow while at the cap');
});
