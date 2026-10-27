// M45b: tempers by weapon shape. Every weapon is offered a valid pair at +5 and +10, the lookup order is
// own pair, then the behavior's pair, then the generic one; Crushing's stagger works.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { WEAPONS } from '../src/data/weapons.js';
import { BEHAVIORS } from '../src/behaviors/index.js';
import { TEMPERS_BY_BEHAVIOR, ENHANCE } from '../src/data/forge.js';
import { temperOptions, chooseTemper } from '../src/game/forge.js';
import { validateData } from '../src/data/validate.js';
import { queueDamage, KIND_HIT } from '../src/systems/damage-queue.js';
import { flushDamage } from '../src/systems/damage.js';

const newRun = () => {
  const run = createRun({ seed: 4, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};

test('every behavior has a shape pair; every weapon is offered two valid tempers at +5 and +10', () => {
  assert.deepEqual(validateData(), []);
  for (const b of Object.keys(BEHAVIORS)) assert.ok(TEMPERS_BY_BEHAVIOR[b], b);
  for (const [id, w] of Object.entries(WEAPONS)) {
    const inst = addWeapon(newRun(), id);
    for (const lvl of [5, 10]) {
      const opts = temperOptions(inst, lvl);
      assert.equal(opts.length, 2, `${id} +${lvl}`);
      if (w.forge && w.forge.tempers) assert.equal(opts, w.forge.tempers[lvl], `${id} keeps its own pair`);
      else assert.equal(opts, TEMPERS_BY_BEHAVIOR[w.behavior][lvl], `${id} gets its shape pair`);
    }
  }
  assert.ok(ENHANCE.tempers[5] && ENHANCE.tempers[10], 'the generic pair stays as the last fallback');
});

test('temper text names no projectile on a slam, arc, aura or summon, and no minion off a summon', () => {
  const shapeText = (b) => [5, 10].flatMap((l) => TEMPERS_BY_BEHAVIOR[b][l].map((t) => t.desc)).join(' ');
  for (const b of ['slam', 'arc', 'aura', 'pulse', 'orbit', 'trail']) assert.ok(!/projectile|arrow|bolt/i.test(shapeText(b)), b);
  for (const b of ['projectile', 'slam', 'aura', 'bolt']) assert.ok(!/minion/i.test(shapeText(b)), b);
});

test('Crushing: every direct hit staggers the target (half on a boss); Flurry does not', () => {
  const run = newRun();
  const h = addWeapon(run, 'colossus_maul');
  h.cd = 1e9;
  h.pendingTemper = 5;
  const i = temperOptions(h, 5).findIndex((t) => t.id === 'crushing');
  assert.ok(chooseTemper(run, h, i).ok);
  const e = spawnEnemy(run, 'goblin', 300, 0); e.speed = 0; e.hp = e.maxHp = 1e9;
  const boss = spawnEnemy(run, 'warlord', 400, 0); boss.speed = 0; boss.hp = boss.maxHp = 1e9;
  for (const x of [e, boss]) { queueDamage(run, x, 10, false, 0, 0, 0, h, KIND_HIT); }
  flushDamage(run);
  assert.ok(Math.abs(e.stunT - 0.4) < 1e-6, `stun ${e.stunT}`);
  assert.ok(Math.abs(boss.stunT - 0.2) < 1e-6, `boss stun ${boss.stunT}`);
  const other = newRun();
  const h2 = addWeapon(other, 'colossus_maul');
  h2.pendingTemper = 5;
  chooseTemper(other, h2, 1);
  const e2 = spawnEnemy(other, 'goblin', 300, 0); e2.hp = e2.maxHp = 1e9;
  queueDamage(other, e2, 10, false, 0, 0, 0, h2, KIND_HIT);
  flushDamage(other);
  assert.equal(e2.stunT, 0);
});

