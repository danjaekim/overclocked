// M33a: the Chakram's two branches, Ricochet Saw (bounces) and Gyre (parks and spins).
// docs/design-m30-m33.md §6.1.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon, levelUpWeapon } from '../src/game/weapons.js';
import { addPassive, findPassive, levelUpPassive } from '../src/game/passives.js';
import { addPerk, findPerk, levelUpPerk } from '../src/game/perks.js';
import { recipesFor, canEvolve, evolve } from '../src/game/evolution.js';
import { EVOLUTIONS } from '../src/data/evolutions.js';
import { WEAPONS } from '../src/data/weapons.js';
import { SHAPE_PAYLOAD } from '../src/data/grafts.js';
import { validateData } from '../src/data/validate.js';
import { VERSION } from '../src/version.js';

const STEP = 1 / 60;
const newRun = () => {
  // Smith: the Archer's Quiver (M43) would throw a second disc and its Rain of Arrows would hit the dummies
  const run = createRun({ seed: 9, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };
const dummy = (run, x, y) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = 1e9; return e; };
const dealt = (e) => e.maxHp - e.hp;

test('m33a data: two chakram branches with their own requirements, both evolved boomerangs', () => {
  assert.deepEqual(validateData(), []);
  const into = EVOLUTIONS.filter((r) => r.from === 'chakram').map((r) => r.into).sort();
  assert.deepEqual(into, ['gyre', 'ricochet_saw']);
  for (const id of into) {
    assert.equal(WEAPONS[id].rarity, 'evolved');
    assert.equal(WEAPONS[id].behavior, 'boomerang');
    assert.equal(WEAPONS[id].levels.length, WEAPONS[id].maxLevel - 1);
  }
  assert.ok(EVOLUTIONS.find((r) => r.into === 'ricochet_saw').requires.some((q) => q.perk === 'ricochet'));
  assert.ok(EVOLUTIONS.find((r) => r.into === 'gyre').requires.some((q) => q.passive === 'wind_sigil'));
  assert.equal(SHAPE_PAYLOAD.boomerang, 'saw');
  assert.ok(/^0\.(3[3-9]|[4-9]\d)\./.test(VERSION), VERSION);
});

function evolveTo(into) {
  const run = newRun();
  const inst = addWeapon(run, 'chakram');
  while (inst.level < 6) levelUpWeapon(run, inst);
  const recipe = recipesFor(inst).find((r) => r.into === into);
  for (const q of recipe.requires) {
    if (q.passive) { addPassive(run, q.passive); const e = findPassive(run.player, q.passive); while (e.level < q.minLevel) levelUpPassive(run, e); }
    if (q.perk) { addPerk(run, q.perk); const e = findPerk(run.player, q.perk); while (e.level < q.minLevel) levelUpPerk(run, e); }
  }
  run.starsteel = 1;
  assert.ok(canEvolve(run, inst, recipe), into);
  assert.ok(evolve(run, inst, recipe).ok);
  assert.equal(inst.weaponId, into);
  assert.ok(!recipesFor(inst).length, 'the other branch is gone');
  return { run, inst };
}

test('either branch can be reached, and choosing one removes the other', () => {
  evolveTo('ricochet_saw');
  evolveTo('gyre');
});

test('the Ricochet perk is offered to a thrown-weapon build (a chakram counts)', async () => {
  const { PERKS } = await import('../src/data/perks.js');
  assert.ok(PERKS.ricochet.requires[0].includes('tag:thrown'));
});

test('ricochet saw: hops between enemies out of its straight line, each once, harder with each bounce', () => {
  const run = newRun();
  const w = addWeapon(run, 'ricochet_saw');
  w.cd = 1e9;
  const a = dummy(run, 100, 0);
  const b = dummy(run, 100, 130);                         // off to the side: a plain boomerang would never touch it
  const c = dummy(run, -40, 170);
  const far = dummy(run, 700, 0);
  tick(run, 0.05);
  w.cd = 0;
  tick(run, 2.5);
  assert.ok(dealt(a) > 0 && dealt(b) > 0 && dealt(c) > 0, 'bounced from a to b to c');
  assert.equal(dealt(far), 0);
  assert.ok(dealt(c) > dealt(a) * 0.95, 'later bounces cut at least as hard');
});

test('ricochet saw returns and is caught when nothing is left to hop to', () => {
  const run = newRun();
  const w = addWeapon(run, 'ricochet_saw');
  dummy(run, 120, 0);
  let out = false;
  let caught = false;
  for (let i = 0; i < 60 * 4 && !caught; i++) {             // the next throw may already be in the air at 4 s: look for the catch itself
    run.update(STEP, { x: 0, y: 0 });
    if (w.discs.length) out = true;
    else if (out) caught = true;
  }
  assert.ok(caught, 'caught');
});

test('gyre: parks at the end of its throw, keeps cutting there, drags enemies in, then returns', () => {
  const run = newRun();
  const w = addWeapon(run, 'gyre');
  w.cd = 1e9;
  const near = dummy(run, 150, 0);                       // in the path
  const edge = dummy(run, 230, 60);                      // beside where it parks, inside the pull
  tick(run, 0.05);
  w.cd = 0;
  const y0 = edge.y;
  let parked = false;
  for (let i = 0; i < 240; i++) {
    run.update(STEP, { x: 0, y: 0 });
    if (w.discs.some((d) => d.parked > 0)) parked = true;
  }
  assert.ok(parked, 'it parked');
  assert.ok(dealt(edge) > 0, 'the parked saw cut the enemy beside it');
  assert.ok(Math.abs(edge.y) < y0 - 5, `dragged toward the saw (${y0} -> ${edge.y})`);
  w.cd = 1e9;
  tick(run, 3);
  assert.equal(w.discs.length, 0, 'it came home');
  assert.ok(dealt(near) > 0);
});

test('both branches level to max and survive a crowd; the new weapons run in the compendium preview setup', () => {
  for (const id of ['ricochet_saw', 'gyre']) {
    const run = newRun();
    const w = addWeapon(run, id);
    w.level = WEAPONS[id].maxLevel;
    for (let i = 0; i < 30; i++) dummy(run, 60 + (i % 8) * 25, ((i * 37) % 240) - 120);
    tick(run, 12);
    assert.ok(Number.isFinite(run.stats.total) && run.stats.total > 0, id);
  }
});
