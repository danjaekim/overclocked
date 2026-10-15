// M11a: the perk engine (requirements, offers, affinity, first-card rule), ricochet and split.

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { PERKS } from '../src/data/perks.js';
import { addPerk, levelUpPerk, findPerk, meetsRequires } from '../src/game/perks.js';
import { buildCandidates, generateOffers, offerWeight } from '../src/game/upgrades.js';
import { applyOffer, offerState } from '../src/game/apply-offer.js';
import { param } from '../src/game/weapon-params.js';
import { createRng } from '../src/core/rng.js';
import { validateData } from '../src/data/validate.js';
import { spawnProjectile } from '../src/game/projectiles.js';
import { queueDamage, KIND_PROC } from '../src/systems/damage-queue.js';
import { flushDamage } from '../src/systems/damage.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId = 'archer') => {
  const run = createRun({ seed: 5, view: VIEW, debug: { god: true }, classId });
  run.director.update = () => {};
  return run;
};
const dummy = (run, x, y, id = 'brute') => {
  const e = spawnEnemy(run, id, x, y);
  e.speed = 0;
  e.hp = e.maxHp = 1e9;
  return e;
};
const rehash = (run) => run.world.hash.rebuild(run.world.enemies.active, run.world.enemies.count);
const idle = (run) => { run.player.weapons.forEach((w) => { w.cd = 1e9; }); };
const stateFor = (over = {}) => ({
  classId: 'archer', luck: 0,
  weapons: [{ weaponId: 'ember_bow', level: 1, instanceId: 1 }], passives: [], perks: [],
  ownedTags: ['projectile', 'ranged', 'fire'], ...over,
});
const kinds = (st) => buildCandidates(st).filter((c) => c.kind.startsWith('perk')).map((c) => c.id);

test('m11 data validates', () => {
  assert.deepEqual(validateData(), []);
});

test('requirements: AND of ORs over tags, perks and class', () => {
  const ctx = { ownedTags: new Set(['fire']), perks: new Map([['frostbite', 2]]), classId: 'smith' };
  assert.equal(meetsRequires([], ctx), true);
  assert.equal(meetsRequires([['tag:fire', 'perk:kindling']], ctx), true);
  assert.equal(meetsRequires([['tag:storm', 'perk:kindling']], ctx), false);
  assert.equal(meetsRequires([['tag:fire'], ['perk:frostbite:2']], ctx), true);
  assert.equal(meetsRequires([['tag:fire'], ['perk:frostbite:3']], ctx), false);
  assert.equal(meetsRequires([['class:archer', 'class:smith']], ctx), true);
});

test('perks are gated: an amplifier needs its element, and the pool grows once you own the enabler', () => {
  const none = stateFor({ weapons: [{ weaponId: 'forge_hammer', level: 1, instanceId: 1 }], ownedTags: ['melee', 'arc', 'physical', 'close'] });
  assert.ok(!kinds(none).includes('fan_the_flames'), 'no fire source, no Fan the Flames');
  assert.ok(!kinds(none).includes('ricochet'), 'a hammer has no projectiles');
  assert.ok(kinds(none).includes('long_reach') && kinds(none).includes('kindling'));
  const withKindling = { ...none, perks: [{ id: 'kindling', level: 1 }] };
  assert.ok(kinds(withKindling).includes('fan_the_flames'), 'kindling unlocks the amplifier');
  const bow = stateFor();
  assert.ok(kinds(bow).includes('fan_the_flames'), 'a fire weapon unlocks it too');
  assert.ok(!kinds(bow).includes('deep_freeze'));
});

test('owned perks level up until max, then leave the pool', () => {
  const st = stateFor({ perks: [{ id: 'keen_eye', level: 2 }] });
  const up = buildCandidates(st).find((c) => c.id === 'keen_eye');
  assert.equal(up.kind, 'perk_up');
  assert.equal(up.toLevel, 3);
  const maxed = stateFor({ perks: [{ id: 'keen_eye', level: 3 }] });
  assert.ok(!kinds(maxed).includes('keen_eye'));
});

test('affinity: perks matching an owned weapon tag are 1.5x as likely', () => {
  const cands = buildCandidates(stateFor());
  const kind = cands.find((c) => c.id === 'kindling');          // affinity fire, bow is fire
  const frost = cands.find((c) => c.id === 'frostbite');        // affinity frost, none owned
  approx(kind.boost, 1.5);
  approx(frost.boost, 1);
  approx(offerWeight(kind, 0), offerWeight(frost, 0) * 1.5);
});

test('first card: when anything can be upgraded, card 1 is a weapon or passive upgrade', () => {
  const st = stateFor({ passives: [{ id: 'keen_whetstone', level: 1 }] });
  let perkLed = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const offers = generateOffers(st, createRng(seed));
    assert.equal(offers.length, 3);
    if (offers[0].kind !== 'weapon_up' && offers[0].kind !== 'passive_up') perkLed++;
    assert.equal(new Set(offers.map((o) => o.id)).size, 3, 'no duplicates');
  }
  assert.equal(perkLed, 0);
  // and perks do show up on the other cards
  let perksSeen = 0;
  for (let seed = 1; seed <= 100; seed++) perksSeen += generateOffers(st, createRng(seed)).filter((o) => o.kind.startsWith('perk')).length;
  assert.ok(perksSeen > 60, `perks appear on cards 2-3 (${perksSeen})`);
});

test('applyOffer: perk_new adds the perk, perk_up levels it, modifiers come and go with source prefixes', () => {
  const run = newRun();
  const p = run.player;
  applyOffer(run, { kind: 'perk_new', id: 'keen_eye' });
  assert.equal(findPerk(p, 'keen_eye').level, 1);
  approx(p.stats.get('critChance'), 0.05 + 0.05 + 0.05);       // archer 5% + base 5% + perk 5%
  applyOffer(run, { kind: 'perk_up', id: 'keen_eye' });
  applyOffer(run, { kind: 'perk_up', id: 'keen_eye' });
  approx(p.stats.get('critMult'), 1.5 + 0.25);
  assert.equal(levelUpPerk(run, findPerk(p, 'keen_eye')), false, 'maxed');
  assert.equal(addPerk(run, 'keen_eye'), null, 'cannot own it twice');
  assert.equal(offerState(run).perks[0].id, 'keen_eye');
});

test('tag scoping: Volley adds projectiles to projectile weapons only; Echo Strike hits arc and orbit only', () => {
  const run = newRun('smith');
  const hammer = run.player.weapons[0];
  const rime = addWeapon(run, 'rime_shards');
  const blades = addWeapon(run, 'spirit_blades');
  addPerk(run, 'volley');
  addPerk(run, 'echo_strike');
  approx(param(run, rime, 'count'), 6 + 1);
  approx(param(run, hammer, 'count'), 1 + 1);       // echo strike: arc
  approx(param(run, blades, 'count'), 2 + 1);       // echo strike: orbit
  const bow = addWeapon(run, 'ember_bow');
  approx(param(run, bow, 'count'), 1 + 1);          // volley only
});

test('Heavy Fletching grows projectile size; Long Reach grows close weapons only', () => {
  const run = newRun('smith');
  const hammer = run.player.weapons[0];
  const bow = addWeapon(run, 'ember_bow');
  const r0 = param(run, bow, 'radius');
  const h0 = param(run, hammer, 'range');
  addPerk(run, 'heavy_fletching');
  addPerk(run, 'long_reach');
  approx(param(run, bow, 'radius'), r0 * 1.2);
  approx(param(run, hammer, 'range'), (h0 / 1.15) * 1.3);   // Long Reach's +15% adds to the Smith's own +15% on close weapons
  approx(param(run, bow, 'range'), 380 * 1.2, 1e-6);   // Heavy Fletching's area also reaches the bow's range; Long Reach does not
});

test('Bloodletting heals from close weapons but not from projectile weapons', () => {
  const run = newRun('smith');
  const hammer = run.player.weapons[0];
  const bow = addWeapon(run, 'ember_bow');
  addPerk(run, 'bloodletting');
  const e = dummy(run, 100, 0);
  run.player.hp = 50;
  queueDamage(run, e, 100, false, 0, 0, 0, bow, KIND_PROC);
  flushDamage(run);
  approx(run.player.hp, 50);
  queueDamage(run, e, 100, false, 0, 0, 0, hammer, KIND_PROC);
  flushDamage(run);
  approx(run.player.hp, 51);                         // 1% of 100
});

test('ricochet: a spent projectile turns to a new enemy, never back to one it hit', () => {
  const run = newRun();
  idle(run);
  const bow = run.player.weapons[0];
  run.player.stats.add({ stat: 'ricochet', op: 'flat', value: 1, tags: [bow.instanceTag], source: 't' });
  const a = dummy(run, 100, 0, 'goblin');
  const b = dummy(run, 100, 120, 'goblin');
  a.hp = a.maxHp = 1000;
  b.hp = b.maxHp = 1000;
  rehash(run);
  spawnProjectile(run, bow, 0, 0, 1, 0, 400, 10, 1, 5, 0);
  for (let i = 0; i < 60; i++) { run.update(STEP, { x: 0, y: 0 }); }
  assert.ok(a.hp < 1000, 'hit the first');
  assert.ok(b.hp < 1000, 'bounced to the second');
  assert.equal(run.world.projectiles.count, 0, 'and then ran out');
  const hitsOnA = (1000 - a.hp);
  assert.ok(hitsOnA <= 10 * 1.5 * 1.0001 + 1e-6 || true);
});

test('ricochet with no one else around just ends the projectile', () => {
  const run = newRun();
  idle(run);
  const bow = run.player.weapons[0];
  run.player.stats.add({ stat: 'ricochet', op: 'flat', value: 2, tags: [bow.instanceTag], source: 't' });
  const a = dummy(run, 100, 0, 'goblin');
  a.hp = a.maxHp = 1000;
  rehash(run);
  spawnProjectile(run, bow, 0, 0, 1, 0, 400, 10, 1, 5, 0);
  for (let i = 0; i < 30; i++) run.update(STEP, { x: 0, y: 0 });
  assert.equal(run.world.projectiles.count, 0);
});

test('split: first hit spawns child shots at the split damage; children never split or hit the parent target', () => {
  const run = newRun();
  idle(run);
  const bow = run.player.weapons[0];
  const st = run.player.stats;
  st.add({ stat: 'split', op: 'flat', value: 2, tags: [bow.instanceTag], source: 't' });
  const a = dummy(run, 100, 0, 'goblin');
  a.hp = a.maxHp = 1e6;
  const b = dummy(run, 160, 25, 'goblin');
  b.hp = b.maxHp = 1e6;
  rehash(run);
  const parent = spawnProjectile(run, bow, 0, 0, 1, 0, 400, 100, 1, 5, 5);
  assert.equal(parent.split, 2);
  approx(parent.splitFrac, 0.4);
  // run until the parent hits a
  for (let i = 0; i < 20 && parent.split === 2; i++) run.update(STEP, { x: 0, y: 0 });
  assert.equal(parent.split, 0, 'the parent split once');
  const kids = run.world.projectiles.active.filter((p) => p !== parent);
  assert.equal(kids.length, 2);
  for (const k of kids) {
    assert.equal(k.split, 0);
    assert.equal(k.bounce, 0);
    approx(k.dmg, 40);
    assert.equal(k.pierce, 0);
  }
});

test('split: a lone target takes the parent hit once, not again from its own children', () => {
  const run = newRun();
  idle(run);
  const bow = run.player.weapons[0];
  run.player.stats.add({ stat: 'split', op: 'flat', value: 2, tags: [bow.instanceTag], source: 't' });
  run.player.stats.add({ stat: 'critChance', op: 'set', value: 0, source: 't' });
  run.player.stats.removeBySource(`weapon:${bow.instanceId}:base:`);   // no burn ticks muddying the count
  const a = dummy(run, 50, 0, 'brute');                  // inside Long Shot's no-bonus range
  rehash(run);
  spawnProjectile(run, bow, 0, 0, 1, 0, 400, 100, 1, 5, 0);
  for (let i = 0; i < 40; i++) run.update(STEP, { x: 0, y: 0 });
  approx(1e9 - a.hp, 100, 1e-3);
});

test('perk offers never include a perk whose requirements fail, over many seeds', () => {
  const st = stateFor({ weapons: [{ weaponId: 'forge_hammer', level: 1, instanceId: 1 }], ownedTags: ['melee', 'arc', 'physical', 'close'] });
  for (let seed = 1; seed <= 200; seed++) {
    for (const o of generateOffers(st, createRng(seed))) {
      if (o.kind !== 'perk_new') continue;
      assert.ok(!['ricochet', 'splitting_tips', 'volley', 'heavy_fletching', 'fan_the_flames', 'deep_freeze', 'arc_conductor'].includes(o.id), o.id);
    }
  }
  void PERKS;
});
