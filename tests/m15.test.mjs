// M15: the Mage, Summoner and Saint, the summon behavior, and class unlock rules.

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { CLASSES } from '../src/data/classes.js';
import { WEAPONS } from '../src/data/weapons.js';
import { EVOLUTIONS } from '../src/data/evolutions.js';
import { validateData } from '../src/data/validate.js';
import { unlockMet } from '../src/game/unlocks.js';
import { createSave } from '../src/save/save.js';
import { levelUpWeapon } from '../src/game/weapons.js';
import { recipesFor, canEvolve, evolve } from '../src/game/evolution.js';
import { addPassive, levelUpPassive } from '../src/game/passives.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId, seed = 3) => {
  const run = createRun({ seed, view: VIEW, debug: { god: true }, classId });
  run.director.update = () => {};
  return run;
};
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };
const dummy = (run, x, y, hp = 1e6) => { const e = spawnEnemy(run, 'brute', x, y); e.hp = e.maxHp = hp; e.slowMul = 0; return e; };

test('m15 data validates; there are six classes and each start weapon evolves', () => {
  assert.deepEqual(validateData(), []);
  assert.equal(Object.keys(CLASSES).length, 6);
  for (const c of Object.values(CLASSES)) {
    assert.ok(WEAPONS[c.startWeapon].class !== null, 'start weapons are class weapons');
    assert.ok(EVOLUTIONS.some((r) => r.from === c.startWeapon && !r.with), `${c.startWeapon} evolves`);
  }
});

test('mage: every hit can burn, chill and shock; its bolt never misses', () => {
  const run = newRun('mage');
  const s = run.player.stats;
  for (const id of ['burnChance', 'chillChance', 'shockChance']) approx(s.getFor(id, run.player.weapons[0].tags), 0.08, 1e-9);
  const e = dummy(run, 150, 0);
  tick(run, 2);
  assert.ok(e.hp < e.maxHp);
});

test('summoner: hounds appear over time up to the count, hunt enemies and cannot be hurt', () => {
  const run = newRun('summoner');
  const inst = run.player.weapons[0];
  assert.equal(inst.minions.length, 0);
  const e = dummy(run, 120, 0);
  tick(run, 12);
  assert.equal(inst.minions.length, 3, 'base 2 hounds +1 from the class');
  assert.ok(e.hp < e.maxHp, 'the hounds reached and cut it');
  assert.equal(run.player.hp, run.player.maxHp);
  assert.ok(run.player.stats.get('maxHp') < 100, 'frail');
});

test('summoner: with nothing to hunt the hounds stay close to the player', () => {
  const run = newRun('summoner');
  tick(run, 10);
  for (const m of run.player.weapons[0].minions) assert.ok(Math.hypot(m.x - run.player.x, m.y - run.player.y) < 80);
});

test('summoner hounds drag their weapon stats: more hounds with +projectiles', () => {
  const run = newRun('summoner');
  const inst = run.player.weapons[0];
  levelUpWeapon(run, inst);
  levelUpWeapon(run, inst);                       // level 3: +1 hound
  dummy(run, 100, 0);
  tick(run, 20);
  assert.equal(inst.minions.length, 4);
});

test('saint: regenerates, and its halo heals through lifesteal', () => {
  const run = newRun('saint');
  run.debug.god = false;
  run.player.hp = 50;
  tick(run, 4);
  assert.ok(run.player.hp > 50, 'regen');
  const hp0 = run.player.hp;
  for (let i = 0; i < 8; i++) dummy(run, 30 + i * 6, 20 - i * 5);
  run.player.iframes = 99;
  tick(run, 3);
  assert.ok(run.player.hp > hp0 + 1.5, 'halo hits healed');
});

test('each new class evolves its start weapon with the required passive', () => {
  for (const [cls, passive] of [['mage', 'scholars_lens'], ['summoner', 'fleet_greaves'], ['saint', 'tempered_core']]) {
    const run = newRun(cls);
    const w = run.player.weapons[0];
    while (w.level < 8) levelUpWeapon(run, w);
    run.starsteel = 1;
    const r = recipesFor(w).find((x) => !x.with);
    assert.equal(canEvolve(run, w, r), false);
    const p = addPassive(run, passive);
    levelUpPassive(run, p || run.player.passives.find((x) => x.id === passive));
    assert.equal(canEvolve(run, w, r), true, cls);
    assert.equal(evolve(run, w, r).ok, true);
    tick(run, 3);                                   // the evolved weapon runs
    assert.ok(Number.isFinite(run.player.hp));
  }
});

test('unlock rules: boss, win, kills and level events', () => {
  assert.equal(unlockMet(CLASSES.berserker.unlock, { bossKilled: true }), true);
  assert.equal(unlockMet(CLASSES.berserker.unlock, { bossKilled: false }), false);
  assert.equal(unlockMet(CLASSES.mage.unlock, { won: true }), true);
  assert.equal(unlockMet(CLASSES.mage.unlock, { won: false }), false);
  assert.equal(unlockMet(CLASSES.summoner.unlock, { kills: 1999 }), false);
  assert.equal(unlockMet(CLASSES.summoner.unlock, { kills: 2000 }), true);
  assert.equal(unlockMet(CLASSES.saint.unlock, { level: 17 }), false);
  assert.equal(unlockMet(CLASSES.saint.unlock, { level: 18 }), true);
  assert.equal(unlockMet(undefined, {}), false);
  for (const id of ['mage', 'summoner', 'saint']) assert.ok(CLASSES[id].unlock.hint.length > 5);
});
