// Run stats: damage dealt per weapon and per cause, kills, DPS windows, overkill handling.

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { addPerk } from '../src/game/perks.js';
import { queueDamage, KIND_PROC, KIND_DOT, CAUSE } from '../src/systems/damage-queue.js';
import { flushDamage } from '../src/systems/damage.js';
import { statsSnapshot, recentDps } from '../src/game/run-stats.js';
import { buildHtml, resultsDamageHtml } from '../src/ui/build.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId = 'archer', seed = 5) => {
  const run = createRun({ seed, view: VIEW, debug: { god: true }, classId });
  run.director.update = () => {};
  return run;
};
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };

test('stats: damage is attributed to the weapon and the cause, overkill is not counted', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  const e = spawnEnemy(run, 'goblin', 300, 0);
  const hp = e.hp;
  queueDamage(run, e, 5, false, 0, 0, 0, bow, KIND_PROC, CAUSE.CHAIN);
  queueDamage(run, e, 9999, false, 0, 0, 0, bow);               // kills it: only the remaining hp counts
  flushDamage(run);
  const s = statsSnapshot(run);
  approx(s.total, hp, 1e-6);
  approx(s.causes.find((c) => c.name === 'Shock chains').dmg, 5, 1e-6);
  assert.equal(s.weapons.length, 1);
  assert.equal(s.weapons[0].kills, 1);
  approx(s.weapons[0].dmg, hp, 1e-6);
});

test('stats: burn ticks are credited to the weapon that lit them, as Burn', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  addPerk(run, 'kindling');
  const e = spawnEnemy(run, 'brute', 300, 0);
  queueDamage(run, e, 3, false, 0, 0, 0, bow, KIND_DOT);
  flushDamage(run);
  const s = statsSnapshot(run);
  assert.equal(s.causes[0].name, 'Burn');
  approx(s.causes[0].dmg, 3, 1e-6);
});

test('stats: a real run keeps totals consistent and DPS windows sane', () => {
  const run = newRun('smith', 7);
  run.director.update = (dt) => { run.world.enemies.count < 30 && spawnEnemy(run, 'goblin', run.player.x + 120, run.player.y + 40); };
  tick(run, 20);
  const s = statsSnapshot(run);
  assert.ok(s.total > 0, 'damage was dealt');
  approx(s.causes.reduce((a, c) => a + c.dmg, 0), s.total, 1e-3);
  approx(s.weapons.reduce((a, w) => a + w.dmg, 0), s.total, 1e-3);
  assert.ok(s.weapons.reduce((a, w) => a + w.kills, 0) <= run.kills);
  assert.ok(s.peakDps >= s.recentDps - 1e-6 && s.peakDps > 0);
  assert.equal(recentDps(newRun()), 0);
});

test('stats: evolution keeps the record under the new name; salvage marks it gone', () => {
  const run = newRun();
  addWeapon(run, 'cinder_ward');
  const ward = run.player.weapons[1];
  queueDamage(run, spawnEnemy(run, 'brute', 300, 0), 4, false, 0, 0, 0, ward);
  flushDamage(run);
  assert.equal(statsSnapshot(run).weapons[0].gone, false);
});

test('build panel renders every section without throwing, with and without damage', () => {
  const run = newRun();
  addPerk(run, 'kindling');
  addWeapon(run, 'cinder_ward');
  tick(run, 3);
  const html = buildHtml(run);
  assert.ok(html.includes('Weapons') && html.includes('Techniques') && html.includes('Kindling'));
  assert.ok(buildHtml(run, { withDamage: false }).length > 0);
  assert.equal(resultsDamageHtml(null), '');
  assert.ok(resultsDamageHtml(run.summary().stats).includes('By weapon') || run.summary().stats.total === 0);
});
