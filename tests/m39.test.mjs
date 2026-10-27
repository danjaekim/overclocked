// M39: Star Quench. Starsteel buys charges; a charge makes the next enhance attempt certain (no roll, no
// downgrade) while the ore is still paid. Charges carry through evolving and fusing and are lost on salvage.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { addWeapon } from '../src/game/weapons.js';
import { ENHANCE, QUENCH } from '../src/data/forge.js';
import { validateData } from '../src/data/validate.js';
import { enhance, quench, canQuench, quenchCharges, enhanceOdds, salvage } from '../src/game/forge.js';
import { fuse } from '../src/game/fusion.js';
import { EVOLUTIONS } from '../src/data/evolutions.js';
import { evolve, canEvolve } from '../src/game/evolution.js';
import { levelUpWeapon } from '../src/game/weapons.js';
import { addPassive, findPassive, levelUpPassive } from '../src/game/passives.js';

const VIEW = { w: 480, h: 1040 };
const newRun = (classId = 'archer') => {
  const run = createRun({ seed: 5, view: VIEW, debug: { god: true }, classId });
  run.director.update = () => {};
  return run;
};
// Sets a weapon's enhance level directly (the modifiers are not needed for the rules under test).
const at = (inst, level) => { inst.enhance = level; return inst; };
// An rng that always fails every roll.
const alwaysFail = (run) => { run.rng.next = () => 0.999999; };

test('m39 data validates and the bands give 3, 2, 1 charges', () => {
  assert.deepEqual(validateData(), []);
  const inst = newRun().player.weapons[0];
  const expect = { 0: 0, 3: 0, 4: 3, 9: 3, 10: 2, 12: 2, 13: 1, 14: 1, 15: 0 };
  for (const [lvl, n] of Object.entries(expect)) assert.equal(quenchCharges(at(inst, Number(lvl))), n, `+${lvl}`);
});

test('m39 buying spends 1 starsteel and gives the band\'s charges', () => {
  const run = newRun();
  const inst = at(run.player.weapons[0], 8);
  run.starsteel = 0;
  assert.ok(!canQuench(run, inst), 'needs starsteel');
  run.starsteel = 2;
  const r = quench(run, inst);
  assert.ok(r.ok);
  assert.equal(r.charges, 3);
  assert.equal(inst.quench, 3);
  assert.equal(run.starsteel, 2 - QUENCH.cost);
  at(inst, 2);
  assert.ok(!quench(run, inst).ok, 'too low to buy');
  assert.equal(run.starsteel, 1, 'nothing spent on a refused buy');
});

test('m39 charges stack up to the cap and never past it', () => {
  const run = newRun();
  const inst = at(run.player.weapons[0], 6);
  run.starsteel = 20;
  while (canQuench(run, inst)) assert.ok(quench(run, inst).ok);
  assert.equal(inst.quench, QUENCH.maxCharges);
  assert.equal(run.starsteel, 20 - QUENCH.maxCharges / 3);
});

test('m39 a charged attempt always succeeds, never downgrades, and still costs ore', () => {
  for (const level of [4, 9, 10, 12, 13, 14]) {
    const run = newRun();
    const inst = at(run.player.weapons[0], level);
    run.starsteel = 1;
    run.ore = 500;
    assert.ok(quench(run, inst).ok);
    const charges = inst.quench;
    alwaysFail(run);
    const ore = run.ore;
    assert.equal(enhanceOdds(inst), 1);
    const r = enhance(run, inst);
    assert.ok(r.ok && r.outcome === 'success' && r.quenched, `+${level}`);
    assert.equal(inst.enhance, level + 1);
    assert.equal(inst.quench, charges - 1, 'one charge used');
    assert.ok(run.ore < ore, 'the ore is still paid');
  }
});

test('m39 once the charges run out the odds are the normal ones again', () => {
  const run = newRun();
  const inst = at(run.player.weapons[0], 13);
  run.starsteel = 1;
  run.ore = 500;
  quench(run, inst);
  assert.equal(inst.quench, 1);
  enhance(run, inst);
  assert.equal(inst.quench, 0);
  assert.equal(enhanceOdds(inst), ENHANCE.success[inst.enhance]);
  alwaysFail(run);
  const r = enhance(run, inst);
  assert.ok(r.ok && r.outcome !== 'success' && !r.quenched);
});

test('m39 quenching all the way from +10 to +15 takes 3 starsteel', () => {
  const run = newRun();
  const inst = at(run.player.weapons[0], 10);
  run.starsteel = 3;
  run.ore = 5000;
  alwaysFail(run);
  let bought = 0;
  while (inst.enhance < ENHANCE.maxLevel) {
    if (!inst.quench) { assert.ok(quench(run, inst).ok); bought++; }
    assert.equal(enhance(run, inst).outcome, 'success');
  }
  assert.equal(inst.enhance, 15);
  assert.equal(bought, 3, '+10 (2), +12 (2), +14 (1)');
  assert.equal(run.starsteel, 0);
  assert.ok(!canQuench(run, inst), 'nothing to buy at max level');
});

test('m39 salvage drops the charges with the weapon; a fusion passes the donor\'s charges to the host', () => {
  const run = newRun();
  run.starsteel = 5;
  const h = addWeapon(run, 'colossus_maul');
  const d = addWeapon(run, 'glacial_bloom');
  at(h, 8).quench = 1;
  at(d, 8).quench = 2;
  const r = fuse(run, h, d);
  assert.ok(r.ok);
  assert.equal(h.quench, 3);
  const other = addWeapon(run, 'prismatic_bolt');
  other.quench = 2;
  salvage(run, other);
  assert.ok(!run.player.weapons.includes(other));
});


test('m39 charges survive evolving, and a combo partner\'s charges join the survivor', () => {
  const run = newRun('smith');
  run.player.weapons.length = 0;
  const a = addWeapon(run, 'cinder_ward');
  const b = addWeapon(run, 'rime_orbs');
  a.quench = 2;
  b.quench = 1;
  const recipe = EVOLUTIONS.find((r) => r.with && ((r.from === 'cinder_ward' && r.with === 'rime_orbs') || (r.from === 'rime_orbs' && r.with === 'cinder_ward')));
  for (const w of [a, b]) while (w.level < 6) levelUpWeapon(run, w);
  for (const q of recipe.requires) {
    if (q.passive) { addPassive(run, q.passive); const e = findPassive(run.player, q.passive); while (e.level < q.minLevel) levelUpPassive(run, e); }
    if (q.starsteel) run.starsteel = Math.max(run.starsteel, q.starsteel);
  }
  assert.ok(canEvolve(run, a, recipe));
  assert.ok(evolve(run, a, recipe).ok);
  const survivor = run.player.weapons.find((w) => w.weaponId === recipe.into);
  assert.ok(survivor);
  assert.equal(survivor.quench, 3);
});
