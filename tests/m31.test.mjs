// M31: Frost Wake (trail) and Halo Pulse (pulse) replace two orbit/aura recolours
// (docs/design-m30-m33.md §4).

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { WEAPONS } from '../src/data/weapons.js';
import { validateData } from '../src/data/validate.js';
import { SHAPE_PAYLOAD } from '../src/data/fusions.js';
import { BEHAVIORS } from '../src/behaviors/index.js';
import { VERSION } from '../src/version.js';

const STEP = 1 / 60;
const newRun = () => {
  const run = createRun({ seed: 11, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};
const tick = (run, s, mv = { x: 0, y: 0 }) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, mv); };
const dummy = (run, x, y) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = 1e9; return e; };

test('m31 data: ids kept, new shapes registered with payloads', () => {
  assert.deepEqual(validateData(), []);
  for (const id of ['rime_orbs', 'vapor_wheel']) assert.equal(WEAPONS[id].behavior, 'trail', id);
  for (const id of ['halo', 'radiant_halo']) assert.equal(WEAPONS[id].behavior, 'pulse', id);
  assert.equal(WEAPONS.rime_orbs.name, 'Frost Wake');
  assert.equal(WEAPONS.vapor_wheel.name, 'Steam Wake');
  assert.equal(WEAPONS.halo.name, 'Halo Pulse');
  assert.equal(WEAPONS.radiant_halo.name, 'Radiant Pulse');
  for (const b of ['trail', 'pulse']) { assert.ok(BEHAVIORS[b], b); assert.ok(SHAPE_PAYLOAD[b], b); }
  assert.ok(/^0\.(3[1-9]|[4-9]\d)\./.test(VERSION), VERSION);
});

test('trail: standing still drops a patch on a timer; moving drops them by distance', () => {
  const still = newRun();
  addWeapon(still, 'rime_orbs');
  tick(still, 2.5);
  const nStill = still.hazards.length;
  assert.ok(nStill >= 2 && nStill <= 5, `still: ${nStill}`);
  const moving = newRun();
  addWeapon(moving, 'rime_orbs');
  tick(moving, 2.5, { x: 1, y: 0 });
  assert.ok(moving.hazards.length > nStill * 2, `moving ${moving.hazards.length} vs still ${nStill}`);
});

test('trail: an enemy standing in the frost is hurt and chilled; one far away is not', () => {
  const run = newRun();
  addWeapon(run, 'rime_orbs');
  const near = dummy(run, 6, 0);
  const far = dummy(run, 200, 0);
  tick(run, 4);
  assert.ok(near.maxHp - near.hp > 0, 'damaged');
  assert.ok(near.chill > 0 || near.freezeT > 0 || near.freezeImm > 0, 'chilled');
  assert.ok(!(near.burnT > 0), 'frost alone does not burn');
  assert.equal(far.maxHp - far.hp, 0);
});

test('steam wake burns and chills the same enemy', () => {
  const run = newRun();
  addWeapon(run, 'vapor_wheel');
  const e = dummy(run, 6, 0);
  tick(run, 3);
  assert.ok(e.maxHp - e.hp > 0);
  assert.ok(e.chill > 0 || e.freezeT > 0 || e.freezeImm > 0, 'chilled');
  assert.ok(e.burnT > 0 || e.burnDps > 0, 'burning');
});

test('pulse: each ring hits an enemy once, heals the player, and rings leave on the cooldown', () => {
  const run = newRun();
  const w = addWeapon(run, 'halo');
  run.player.hp = run.player.maxHp - 50;
  const e = dummy(run, 50, 0);
  tick(run, 0.9);                                           // first ring leaves at 0.4 s, passes at ~0.6 s
  const one = e.maxHp - e.hp;
  assert.ok(one > 0, 'hit');
  tick(run, 0.2);
  assert.equal(e.maxHp - e.hp, one, 'one ring never hits twice');
  assert.ok(run.player.hp > run.player.maxHp - 50, 'healed');
  tick(run, 2);
  assert.ok(e.maxHp - e.hp > one * 1.5, 'later rings hit again');
  assert.equal(w.def.behavior, 'pulse');
});

test('radiant pulse blesses what it passes', () => {
  const run = newRun();
  addWeapon(run, 'radiant_halo');
  const e = dummy(run, 90, 0);
  tick(run, 1.4);
  assert.ok(e.blessT > 0, 'blessed');
});

test('both new weapons level to max and survive a crowd', () => {
  for (const id of ['rime_orbs', 'vapor_wheel', 'halo', 'radiant_halo']) {
    const run = newRun();
    const w = addWeapon(run, id);
    w.level = WEAPONS[id].maxLevel;
    for (let i = 0; i < 25; i++) dummy(run, 5 + i * 3, (i % 5) * 4 - 8);
    tick(run, 8, { x: 1, y: 0 });
    assert.ok(Number.isFinite(run.stats.total) && run.stats.total > 0, id);
    assert.ok(run.hazards.length <= 90);
  }
});
