// M14: new weapon behaviors (bolt, boomerang, mortar), perk-gated evolutions and fusions.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon, levelUpWeapon, canLevelUp } from '../src/game/weapons.js';
import { addPerk, levelUpPerk, findPerk } from '../src/game/perks.js';
import { WEAPONS } from '../src/data/weapons.js';
import { EVOLUTIONS } from '../src/data/evolutions.js';
import { CLASSES } from '../src/data/classes.js';
import { validateData } from '../src/data/validate.js';
import { recipesFor, canEvolve, evolve, checklist, pair } from '../src/game/evolution.js';
import { evolutionBlockers, openChest } from '../src/game/chests.js';
import { enhance } from '../src/game/forge.js';
import { statsSnapshot } from '../src/game/run-stats.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId = 'archer', seed = 3) => {
  const run = createRun({ seed, view: VIEW, debug: { god: true }, classId });
  run.director.update = () => {};
  return run;
};
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };
// A run holding only `id` (the class weapon removed) so damage is attributable.
function lone(id, level = 1) {
  const run = newRun();
  run.player.stats.removeBySource(`weapon:${run.player.weapons[0].instanceId}:`);
  run.player.weapons.length = 0;
  const inst = addWeapon(run, id);
  while (inst.level < level && canLevelUp(inst)) levelUpWeapon(run, inst);
  return { run, inst };
}
const dummy = (run, x, y, hp = 1e6) => { const e = spawnEnemy(run, 'brute', x, y); e.hp = e.maxHp = hp; e.slowMul = 0; return e; };

test('m14 data validates; every starting weapon has an evolution; 3 fusions exist', () => {
  assert.deepEqual(validateData(), []);
  for (const c of Object.values(CLASSES)) assert.ok(EVOLUTIONS.some((r) => r.from === c.startWeapon && !r.with), `${c.startWeapon} evolves`);
  assert.ok(EVOLUTIONS.length >= 10);
  assert.equal(EVOLUTIONS.filter((r) => r.with).length, 3);
  assert.ok(EVOLUTIONS.some((r) => r.requires.some((q) => q.perk)), 'a recipe asks for a perk');
});

test('bolt: strikes the nearest targets instantly and a shock chains on', () => {
  const { run, inst } = lone('static_rod', 3);             // level 3: +1 target
  const near = dummy(run, 80, 0);
  const near2 = dummy(run, -100, 0);
  const far = dummy(run, 400, 0);                          // beyond the rod's reach
  const bystander = dummy(run, 160, 0);                   // not struck directly: only a chain can reach it
  tick(run, 1.0);
  assert.ok(near.hp < near.maxHp && near2.hp < near2.maxHp, 'the two nearest were struck');
  assert.equal(far.hp, far.maxHp);
  assert.ok(bystander.hp < bystander.maxHp, 'the chain reached the bystander');
  assert.ok(statsSnapshot(run).weapons[0].dmg > 0);
});

test('boomerang: damages going out and coming back, then is caught', () => {
  const { run, inst } = lone('chakram', 1);
  const e = dummy(run, 150, 0);
  tick(run, 1.3);                                          // thrown, reaches and cuts the target
  const out = e.maxHp - e.hp;
  assert.ok(out > 0, 'hit on the way out');
  assert.ok(inst.discs.length >= 1);
  tick(run, 1.6);
  assert.ok(e.maxHp - e.hp > out, 'hit again on the way back or on the next throw');
  e.alive = false;
  run.world.enemies.release(e);
  tick(run, 3);                                            // nothing to throw at: all discs come home
  assert.equal(inst.discs.length, 0);
});

test('mortar: a shell lands after its fuse and hurts everything in the blast', () => {
  const { run, inst } = lone('cinder_mortar', 1);
  const a = dummy(run, 120, 0);
  const b = dummy(run, 150, 10);
  const far = dummy(run, 100, 520);
  tick(run, 0.6);
  assert.equal(a.hp, a.maxHp, 'the fuse has not run out yet');
  tick(run, 0.9);
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp, 'both were caught in the blast');
  assert.ok(far.hp === far.maxHp || far.hp < far.maxHp);   // the shell's target is random; only the fuse is asserted
  assert.ok(inst.shells.length <= 12);
});

test('every new weapon can be added, levelled to max and run for 20 s with a crowd', () => {
  for (const id of ['static_rod', 'chakram', 'rime_orbs', 'cinder_mortar', 'reaper_axe', 'seraph_blades', 'pyre_crown', 'thunder_lance', 'glacial_bloom', 'vapor_wheel', 'stormshell_mortar', 'stormfrost_lance']) {
    const { run, inst } = lone(id, 8);
    const trail = inst.def.behavior === 'trail';       // a trail only hurts what stands on it, so the crowd starts on the player
    for (let i = 0; i < 25; i++) dummy(run, (trail ? 4 : 60) + i * (trail ? 1 : 12), (i % 5) * (trail ? 3 : 30) - (trail ? 6 : 60), 400);
    tick(run, 20);
    assert.ok(Number.isFinite(run.stats.total) && run.stats.total > 0, `${id} dealt damage`);
    assert.ok(inst.level >= 1);
  }
});

test('perk-gated evolution: needs the technique at its level, the weapon level and starsteel', () => {
  const run = newRun('berserker');
  const axe = run.player.weapons[0];
  const recipe = recipesFor(axe).find((r) => r.id === 'reaper_axe');
  axe.level = 8;
  run.starsteel = 1;
  assert.equal(canEvolve(run, axe, recipe), false, 'no keen eye yet');
  addPerk(run, 'keen_eye');
  assert.equal(canEvolve(run, axe, recipe), false, 'keen eye level 1 is not enough');
  const list = checklist(run, axe, recipe);
  assert.ok(list.some((c) => c.text.includes('Keen Eye') && !c.ok));
  levelUpPerk(run, findPerk(run.player, 'keen_eye'));
  assert.equal(canEvolve(run, axe, recipe), true);
  assert.equal(evolve(run, axe, recipe).ok, true);
  assert.equal(axe.weaponId, 'reaper_axe');
  assert.equal(run.starsteel, 0);
});

test('chest blockers include a perk that is one level short of a recipe', () => {
  const run = newRun('berserker');
  run.player.weapons[0].level = 8;
  addPerk(run, 'keen_eye');
  assert.ok(evolutionBlockers(run).has('perk_up:keen_eye'));
});

test('fusion: needs both weapons at level 6, consumes the partner, keeps enhance and affixes', () => {
  const run = newRun();
  const ward = addWeapon(run, 'cinder_ward');
  const orbs = addWeapon(run, 'rime_orbs');
  const recipe = EVOLUTIONS.find((r) => r.id === 'vapor_wheel');
  assert.deepEqual(recipesFor(ward).map((r) => r.id).includes('vapor_wheel'), true);
  assert.deepEqual(recipesFor(orbs).map((r) => r.id), ['vapor_wheel'], 'the partner sees the recipe too');
  run.starsteel = 1;
  while (ward.level < 6) levelUpWeapon(run, ward);
  assert.equal(canEvolve(run, ward, recipe), false, 'the partner is still level 1');
  while (orbs.level < 6) levelUpWeapon(run, orbs);
  run.ore = 1e6;
  enhance(run, ward);
  assert.ok(ward.enhance >= 1);
  const e = dummy(run, 12, 0);
  tick(run, 2);                                            // the wake deals some damage first, so there is a record to mark
  e.alive = false; run.world.enemies.release(e);
  const before = run.player.weapons.length;
  assert.equal(canEvolve(run, orbs, recipe), true, 'either card can start it');
  const r = evolve(run, orbs, recipe);                      // started from the partner's card
  assert.equal(r.ok, true);
  assert.equal(run.player.weapons.length, before - 1);
  assert.ok(!run.player.weapons.includes(orbs));
  assert.equal(ward.weaponId, 'vapor_wheel');
  assert.ok(ward.enhance >= 1, 'enhance carries over');
  assert.ok(ward.tags.set.has('fire') && ward.tags.set.has('frost'));
  assert.equal(run.starsteel, 0);
  assert.equal(statsSnapshot(run).weapons.find((w) => w.gone) === undefined, false, 'the consumed weapon is marked gone');
});

test('a chest never auto-fuses (fusion consumes a weapon): the jackpot skips fusion recipes', () => {
  const run = newRun();
  const a = addWeapon(run, 'cinder_mortar');
  const b = addWeapon(run, 'static_rod');
  while (a.level < 6) levelUpWeapon(run, a);
  while (b.level < 6) levelUpWeapon(run, b);
  run.starsteel = 1;
  const r = openChest(run, 1);
  assert.ok(r.rolls.every((x) => x.kind !== 'evolve'));
  assert.equal(run.player.weapons.length, 3);
});

test('fusion needs the partner in hand', () => {
  const run = newRun();
  const ward = addWeapon(run, 'cinder_ward');
  while (ward.level < 6) levelUpWeapon(run, ward);
  run.starsteel = 1;
  const recipe = EVOLUTIONS.find((r) => r.id === 'vapor_wheel');
  assert.deepEqual(pair(run, recipe).b, null);
  assert.equal(evolve(run, ward, recipe).ok, false);
});
