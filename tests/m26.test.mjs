// M26: the shared effect vocabulary (hazards, attack triggers, sunder, bless, frenzy, low-hp damage)
// and the six branch evolutions (docs/design-m26-m28.md).

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon, levelUpWeapon } from '../src/game/weapons.js';
import { addPassive, levelUpPassive, findPassive } from '../src/game/passives.js';
import { addPerk, levelUpPerk, findPerk } from '../src/game/perks.js';
import { recipesFor, canEvolve, evolve } from '../src/game/evolution.js';
import { EVOLUTIONS } from '../src/data/evolutions.js';
import { WEAPONS } from '../src/data/weapons.js';
import { validateData } from '../src/data/validate.js';
import { flushDamage } from '../src/systems/damage.js';
import { queueDamage, KIND_PROC } from '../src/systems/damage-queue.js';
import { addPatch, addVortex, addPillar, addWave, HAZARD_CAP } from '../src/systems/hazards.js';
import { EFFECTS } from '../src/effects/index.js';
import { openChest } from '../src/game/chests.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId = 'archer', seed = 9) => {
  const run = createRun({ seed, view: VIEW, debug: { god: true }, classId });
  run.director.update = () => {};
  return run;
};
const tick = (run, s, move = { x: 0, y: 0 }) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, move); };

// Brings the run's weapon to level 6 and satisfies a recipe's requirements.
function ready(run, inst, recipe) {
  while (inst.level < 6) levelUpWeapon(run, inst);
  for (const q of recipe.requires) {
    if (q.passive) { addPassive(run, q.passive); const e = findPassive(run.player, q.passive); while (e.level < q.minLevel) levelUpPassive(run, e); }
    if (q.perk) { addPerk(run, q.perk); const e = findPerk(run.player, q.perk); while (e.level < q.minLevel) levelUpPerk(run, e); }
    if (q.starsteel) run.starsteel = Math.max(run.starsteel, q.starsteel);
  }
}

const BRANCHES = [
  ['archer', 'ember_bow', 'sunpiercer', 'storm_volley'],
  ['smith', 'forge_hammer', 'quakebreaker', 'colossus_maul'],
  ['berserker', 'rending_axe', 'whirlwind_cleaver', 'reaper_axe'],
  ['mage', 'arc_bolt', 'singularity', 'prismatic_bolt'],
  ['summoner', 'bone_call', 'bone_colossus', 'grave_legion'],
  ['saint', 'halo', 'judgement', 'radiant_halo'],
];

test('m26 data validates and every starter weapon has two branches', () => {
  assert.deepEqual(validateData(), []);
  for (const [, from, b, a] of BRANCHES) {
    const into = EVOLUTIONS.filter((r) => r.from === from && !r.with).map((r) => r.into).sort();
    assert.deepEqual(into, [a, b].sort(), from);
    assert.equal(WEAPONS[b].rarity, 'evolved');
    assert.equal(WEAPONS[b].levels.length, WEAPONS[b].maxLevel - 1);
  }
});

test('choosing a branch removes the other recipe', () => {
  for (const [cls, from, b, a] of BRANCHES) {
    const run = newRun(cls);
    const inst = run.player.weapons[0];
    assert.equal(inst.weaponId, from);
    const recipe = recipesFor(inst).find((r) => r.into === b);
    ready(run, inst, recipe);
    assert.ok(canEvolve(run, inst, recipe), b);
    assert.ok(evolve(run, inst, recipe).ok);
    assert.equal(inst.weaponId, b);
    assert.ok(!recipesFor(inst).some((r) => r.into === a), 'the other branch is gone');
  }
});

test('a chest does not pick for you when two branches are ready', () => {
  const run = newRun('archer');
  const inst = run.player.weapons[0];
  for (const r of recipesFor(inst)) ready(run, inst, r);
  run.starsteel = 2;
  const res = openChest(run, 0);
  assert.ok(!res.rolls.some((r) => r.kind === 'evolve'));
  assert.equal(inst.weaponId, 'ember_bow');
  // with only one branch ready it still evolves
  const run2 = newRun('archer');
  const i2 = run2.player.weapons[0];
  ready(run2, i2, recipesFor(i2).find((r) => r.into === 'sunpiercer'));
  const res2 = openChest(run2, 0);
  assert.ok(res2.rolls.some((r) => r.kind === 'evolve'));
});

test('every branch weapon fights a swarm for 12 seconds without throwing', () => {
  for (const [cls, , b] of BRANCHES) {
    const run = newRun(cls, 21);
    const inst = run.player.weapons[0];
    ready(run, inst, EVOLUTIONS.find((r) => r.into === b));
    evolve(run, inst, EVOLUTIONS.find((r) => r.into === b));
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      spawnEnemy(run, i % 12 === 0 ? 'brute' : 'goblin', Math.cos(a) * (90 + (i % 5) * 40), Math.sin(a) * (90 + (i % 5) * 40));
    }
    run.update(STEP, { x: 0, y: 0 });
    const before = run.world.enemies.count;
    tick(run, 12);
    assert.ok(run.kills > 0 || run.world.enemies.count < before, `${b} killed nothing`);
    assert.ok(run.hazards.length <= HAZARD_CAP);
  }
});

test('a fire patch burns what stands in it, and expires', () => {
  const run = newRun('smith');
  const src = run.player.weapons[0];
  const e = spawnEnemy(run, 'brute', 200, 0);
  e.speed = 0;
  addPatch(run, src, 200, 0, 40, 1.0, 0.25, 10, 0);
  const hp0 = e.hp;
  tick(run, 0.6);
  assert.ok(e.hp < hp0, 'patch damage');
  tick(run, 1.2);
  assert.equal(run.hazards.length, 0);
});

test('a vortex pulls enemies in and then bursts', () => {
  const run = newRun('smith');
  const src = run.player.weapons[0];
  run.player.weapons.length = 0;                               // no other damage
  const e = spawnEnemy(run, 'brute', 260, 0);
  e.speed = 0;
  addVortex(run, src, 200, 0, 90, 1.0, 120, 50, 0);
  tick(run, 0.5);
  assert.ok(e.x < 260 - 30, 'was pulled toward the vortex');
  const hp = e.hp;
  tick(run, 0.7);
  assert.ok(e.hp < hp, 'the collapse hurt');
});

test('a pillar waits out its telegraph, then hits once', () => {
  const run = newRun('smith');
  const src = run.player.weapons[0];
  run.player.weapons.length = 0;
  const e = spawnEnemy(run, 'brute', 150, 0);
  e.speed = 0;
  addPillar(run, src, 150, 0, 50, 0.4, 30, 0);
  tick(run, 0.3);
  assert.equal(e.hp, e.maxHp);
  tick(run, 0.3);
  assert.ok(e.hp < e.maxHp);
  const hp = e.hp;
  tick(run, 1);
  assert.equal(e.hp, hp, 'only one hit');
});

test('a shockwave hits each enemy once along its path', () => {
  const run = newRun('smith');
  const src = run.player.weapons[0];
  run.player.weapons.length = 0;
  const near = spawnEnemy(run, 'brute', 100, 0);
  const far = spawnEnemy(run, 'brute', 220, 0);
  const off = spawnEnemy(run, 'brute', 150, 160);
  for (const e of [near, far, off]) e.speed = 0;
  addWave(run, src, 0, 0, 1, 0, 400, 300, 30, 20, 0);
  tick(run, 1);
  assert.ok(near.hp < near.maxHp && far.hp < far.maxHp);
  assert.equal(off.hp, off.maxHp);
  assert.ok(near.maxHp - near.hp <= 20 + 1, 'hit once, not every frame');
});

test('hazards are capped, and a patch is dropped first', () => {
  const run = newRun('smith');
  const src = run.player.weapons[0];
  for (let i = 0; i < HAZARD_CAP + 20; i++) addPatch(run, src, 500, 500, 10, 5, 1, 1, 0);
  assert.equal(run.hazards.length, HAZARD_CAP);
  addVortex(run, src, 0, 0, 50, 1, 10, 1, 0);
  assert.equal(run.hazards.length, HAZARD_CAP);
  assert.ok(run.hazards.some((h) => h.pull));
});

test('attack triggers fire once per attack, and `every` skips attacks', () => {
  const run = newRun('smith');
  const inst = run.player.weapons[0];
  let n = 0;
  const orig = EFFECTS.heal;
  EFFECTS.heal = () => { n++; };
  try {
    inst.extraTriggers.push({ on: 'attack', every: 3, effect: 'heal', params: { amount: 1 } });
    // two enemies in the arc: a swing hits both, but the attack counts once
    spawnEnemy(run, 'brute', 50, 0).speed = 0;
    spawnEnemy(run, 'brute', 60, 20).speed = 0;
    tick(run, 6);
    assert.ok(n >= 1 && n <= 2, `fired ${n} times in ~6 attacks`);
  } finally { EFFECTS.heal = orig; }
});

test('Whirlwind Cleaver hits harder at low hp', () => {
  const dmgAt = (hpFrac) => {
    const run = newRun('berserker', 5);
    const inst = run.player.weapons[0];
    const r = EVOLUTIONS.find((x) => x.into === 'whirlwind_cleaver');
    ready(run, inst, r);
    evolve(run, inst, r);
    run.player.stats.removeBySource(`weapon:${inst.instanceId}:base:`);
    run.player.stats.add({ stat: 'lowHpDamage', op: 'flat', value: 1.5, tags: [inst.instanceTag], source: 'test' });
    run.player.hp = run.player.maxHp * hpFrac;
    const e = spawnEnemy(run, 'brute', 40, 0);
    e.speed = 0;
    e.maxHp = e.hp = 1e6;
    tick(run, 0.5);
    return e.maxHp - e.hp;
  };
  const full = dmgAt(1);
  const low = dmgAt(0.25);
  assert.ok(low > full * 2, `low ${low} vs full ${full}`);
});

test('sunder strips armour, bless adds 10%', () => {
  const run = newRun('smith');
  const src = run.player.weapons[0];
  run.player.weapons.length = 0;
  const hit = (e, amt) => { queueDamage(run, e, amt, false, 0, 0, 0, src, KIND_PROC); const h = e.hp; flushDamage(run); return h - e.hp; };
  const e = spawnEnemy(run, 'shieldbearer', 300, 0);
  e.speed = 0;
  e.maxHp = e.hp = 1e6;
  const armoured = hit(e, 20);
  assert.ok(armoured < 20);
  e.sunderT = 2;
  assert.equal(hit(e, 20), 20);
  e.sunderT = 0;
  e.armor = 0;
  e.blessT = 2;
  assert.ok(Math.abs(hit(e, 20) - 22) < 1e-6);
  // the effects set the marks
  run.world.hash.rebuild(run.world.enemies.active, run.world.enemies.count);
  EFFECTS.sunder(run, { params: { radius: 60, dur: 4 } }, src, 300, 0);
  assert.equal(e.sunderT, 4);
  e.blessT = 0;
  EFFECTS.bless(run, { params: { dur: 3 } }, src, 0, 0, 0, 0, e);
  assert.equal(e.blessT, 3);
});

test('Grave Legion frenzy speeds the hounds, Pyre Crown leaves embers', () => {
  const run = newRun('summoner');
  const inst = run.player.weapons[0];
  const r = EVOLUTIONS.find((x) => x.into === 'grave_legion');
  ready(run, inst, r);
  evolve(run, inst, r);
  EFFECTS.frenzy(run, { params: { dur: 2 } }, inst);
  assert.equal(inst.frenzyT, 2);
  tick(run, 0.5);
  assert.ok(inst.frenzyT < 1.6);

  const run2 = newRun('smith');
  const pyre = addWeapon(run2, 'pyre_crown');
  const t = pyre.def.triggers.find((x) => x.effect === 'fire_patch');
  assert.ok(t, 'pyre crown has an ember trigger');
  EFFECTS.fire_patch(run2, t, pyre, 100, 100, 0);
  assert.equal(run2.hazards.length, 1);
});

test('Judgement picks the boss and elites before common enemies', () => {
  const run = newRun('saint');
  const inst = run.player.weapons[0];
  const r = EVOLUTIONS.find((x) => x.into === 'judgement');
  ready(run, inst, r);
  evolve(run, inst, r);
  const small = spawnEnemy(run, 'goblin', 80, 0);
  const big = spawnEnemy(run, 'brute', -120, 40);
  small.speed = big.speed = 0;
  big.elite = 1;
  big.affix = 'warded';
  tick(run, 1.0);
  assert.ok(run.hazards.some((h) => Math.abs(h.x - big.x) < 5) || big.hp < big.maxHp, 'the elite was targeted');
});
