// M12: elites (affixes, drops) and chests (counts, rolls, evolution bias, jackpot, new weapons).

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy, spawnElite } from '../src/game/director.js';
import { RUN_EVENTS } from '../src/game/run-events.js';
import { addWeapon } from '../src/game/weapons.js';
import { addPassive } from '../src/game/passives.js';
import { addPerk } from '../src/game/perks.js';
import { queueDamage, KIND_PROC } from '../src/systems/damage-queue.js';
import { flushDamage, killEnemy } from '../src/systems/damage.js';
import { updatePickups, spawnChest, KIND_CHEST } from '../src/systems/pickups.js';
import { createRng } from '../src/core/rng.js';
import { ELITE, CHEST } from '../src/data/elites.js';
import { EVENTS } from '../src/data/waves.js';
import { SLOTS } from '../src/data/progression.js';
import { validateData } from '../src/data/validate.js';
import { WEAPONS } from '../src/data/weapons.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId = 'archer', seed = 4) => {
  const run = createRun({ seed, view: VIEW, debug: { god: true }, classId });
  run.director.update = () => {};
  run.player.stats.removeBySource(`weapon:${run.player.weapons[0].instanceId}:base:`);   // no burn ticks muddying exact numbers
  return run;
};
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };

test('m12 data validates and the timeline has elite events', () => {
  assert.deepEqual(validateData(), []);
  assert.ok(EVENTS.filter((e) => e.event === 'elite').length >= 6);
});

test('an elite is bigger, tougher and hits harder than the base enemy', () => {
  const run = newRun();
  const base = spawnEnemy(run, 'brute', 300, 0);
  const el = spawnElite(run, 'brute', 300, 100, 1, 'warded');
  approx(el.maxHp, base.maxHp * ELITE.hpMult);
  approx(el.r, base.r * ELITE.radiusMult);
  approx(el.damage, base.damage * ELITE.damageMult);
  assert.equal(el.elite, 1);
  assert.equal(base.elite, 0);
  const swift = spawnElite(run, 'brute', 300, 200, 1, 'swift');
  assert.ok(swift.speed > 50 * 1.3);
});

test('Warded: 35% less damage while above half hp, full damage once wounded', () => {
  const run = newRun();
  const w = run.player.weapons[0];
  const el = spawnElite(run, 'brute', 300, 0, 1, 'warded');
  const hp = el.maxHp;
  queueDamage(run, el, 100, false, 0, 0, 0, w, KIND_PROC);
  flushDamage(run);
  approx(hp - el.hp, 65);
  el.hp = el.maxHp * 0.4;
  const before = el.hp;
  queueDamage(run, el, 100, false, 0, 0, 0, w, KIND_PROC);
  flushDamage(run);
  approx(before - el.hp, 100);
});

test('Regenerating: heals only after a quiet spell', () => {
  const run = newRun();
  const w = run.player.weapons[0];
  w.cd = 1e9;
  const el = spawnElite(run, 'brute', 900, 900, 1, 'regenerating');
  el.speed = 0;
  el.hp = el.maxHp * 0.5;
  queueDamage(run, el, 1, false, 0, 0, 0, w, KIND_PROC);
  flushDamage(run);
  const hp0 = el.hp;
  tick(run, 1.5);
  approx(el.hp, hp0, 1e-6);                         // still inside the 2 s delay
  tick(run, 3);
  assert.ok(el.hp > hp0 + el.maxHp * 0.03 * 1.4, 'regenerating after the delay');
});

test('an elite drops a chest and 8x xp; the boss credits starsteel at once and drops a boss chest', () => {
  const run = newRun();
  const el = spawnElite(run, 'brute', 300, 0, 1, 'swift');
  killEnemy(run, el);
  const chests = run.world.pickups.active.filter((g) => g.kind === KIND_CHEST);
  assert.equal(chests.length, 1);
  assert.equal(chests[0].value, 0);
  const gem = run.world.pickups.active.find((g) => g.kind === 0);
  approx(gem.value, 5 * ELITE.xpMult);
  const boss = spawnEnemy(run, 'warlord', 400, 0);
  run.boss = boss;
  killEnemy(run, boss);
  assert.equal(run.starsteel, 3);          // 1 from the first elite (always), 2 from the boss
  assert.ok(run.world.pickups.active.some((g) => g.kind === KIND_CHEST && g.value === 1));
});

test('touching a chest queues it, does not magnetise, and a full pool still queues it', () => {
  const run = newRun();
  const c = spawnChest(run, 200, 0, 0);
  run.player.stats.add({ stat: 'pickupRadius', op: 'flat', value: 500, source: 't' });
  updatePickups(run, STEP);
  assert.equal(c.magnet, false, 'chests are walked to, not pulled in');
  assert.equal(run.pendingChests.length, 0);
  c.x = run.player.x; c.y = run.player.y;
  updatePickups(run, STEP);
  assert.deepEqual(run.pendingChests, [0]);
  // a full pickup pool must not lose a chest
  const store = run.world.pickups;
  while (store.acquire()) { /* fill */ }
  assert.equal(spawnChest(run, 0, 0, 1), null);
  assert.deepEqual(run.pendingChests, [0, 1]);
});









