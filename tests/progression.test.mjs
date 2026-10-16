import { PERKS } from '../src/data/perks.js';
import { TITLES } from '../src/data/titles.js';
import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { createRng } from '../src/core/rng.js';
import { xpToNext, gainXp } from '../src/game/xp.js';
import { generateOffers, buildCandidates, offerWeight, HEAL_OFFER } from '../src/game/upgrades.js';
import { applyOffer, offerState } from '../src/game/apply-offer.js';
import { addPassive, levelUpPassive, findPassive } from '../src/game/passives.js';
import { spawnGem, updatePickups, gemTier } from '../src/systems/pickups.js';
import { WEAPONS } from '../src/data/weapons.js';
import { PASSIVES } from '../src/data/passives.js';
import { SLOTS } from '../src/data/progression.js';
import { CAPS } from '../src/game/world.js';
import { makeTags } from '../src/stats/stats.js';

const VIEW = { w: 480, h: 1040 };
const newRun = (seed = 1, debug = {}) => createRun({ seed, view: VIEW, debug: { god: false, ...debug } });
const STEP = 1 / 60;
const STILL = { x: 0, y: 0 };

// ---- XP ----

test('xp curve: starts at 5, strictly increasing, and a good run lands around level 20-28', () => {
  assert.equal(xpToNext(1), 5);
  for (let l = 1; l < 60; l++) assert.ok(xpToNext(l + 1) > xpToNext(l));
  let total = 0;
  for (let l = 1; l < 24; l++) total += xpToNext(l);
  assert.ok(total > 2500 && total < 4500, `cumulative xp to level 24 = ${total}`);
});

test('gainXp levels up, carries remainder, and can queue several levels at once', () => {
  const run = newRun();
  const p = run.player;
  gainXp(run, 3);
  assert.equal(p.level, 1);
  assert.equal(p.xp, 3);
  gainXp(run, 2);                                  // exactly 5: level 2, 0 left
  assert.equal(p.level, 2);
  assert.equal(p.xp, 0);
  assert.equal(run.pendingLevelUps, 1);
  gainXp(run, xpToNext(2) + xpToNext(3) + 1);      // two more levels and 1 spare
  assert.equal(p.level, 4);
  assert.equal(p.xp, 1);
  assert.equal(run.pendingLevelUps, 3);
});

// ---- gems ----

test('gem tiers follow value thresholds', () => {
  assert.equal(gemTier(1), 0);
  assert.equal(gemTier(5), 1);
  assert.equal(gemTier(24), 1);
  assert.equal(gemTier(25), 2);
  assert.equal(gemTier(500), 3);
});

test('a gem outside the pickup radius stays put; inside it flies to the player and is collected', () => {
  const run = newRun();
  run.player.weapons.length = 0;
  const far = spawnGem(run, 400, 0, 1);
  const near = spawnGem(run, 40, 0, 3);
  updatePickups(run, STEP);
  assert.equal(far.magnet, false);
  assert.ok(near.magnet);
  for (let i = 0; i < 120 && run.world.pickups.count > 1; i++) updatePickups(run, STEP);
  assert.equal(run.world.pickups.count, 1, 'near gem collected');
  assert.equal(run.player.xp, 3);
  assert.equal(far.x, 400);
});

test('the xpGain stat scales collected xp', () => {
  const run = newRun();
  run.player.stats.add({ stat: 'xpGain', op: 'inc', value: 0.5, source: 'test' });
  spawnGem(run, 5, 0, 2);
  for (let i = 0; i < 30; i++) updatePickups(run, STEP);
  approx(run.player.xp, 3);
});

test('a full gem pool merges new gems into the farthest one and loses no xp', () => {
  const run = newRun();
  for (let i = 0; i < CAPS.pickups; i++) spawnGem(run, 1000 + i, 1000, 1);
  assert.equal(run.world.pickups.count, CAPS.pickups);
  const before = run.world.pickups.active.reduce((a, g) => a + g.value, 0);
  const merged = spawnGem(run, 0, 0, 7);
  assert.ok(merged);
  assert.equal(run.world.pickups.count, CAPS.pickups);
  const after = run.world.pickups.active.reduce((a, g) => a + g.value, 0);
  assert.equal(after, before + 7);
});

test('kills drop gems worth the enemy xp, and collecting them levels the player up', () => {
  // a Smith: it stands still here, and the Archer's Rain of Arrows (M43) kills enemies before they come within magnet reach
  const run = createRun({ seed: 5, view: VIEW, debug: { god: true }, classId: 'smith' });
  for (let i = 0; i < 60 * 40; i++) run.update(STEP, STILL);
  assert.ok(run.kills > 5);
  assert.ok(run.player.level > 1, `expected a level-up, still level ${run.player.level}`);
  assert.ok(run.pendingLevelUps >= run.player.level - 1);
});

// ---- passives ----

test('every passive applies each level through the stat block and can reach max', () => {
  for (const id of Object.keys(PASSIVES)) {
    const run = newRun();
    const entry = addPassive(run, id);
    assert.ok(entry, id);
    while (levelUpPassive(run, entry));
    assert.equal(entry.level, PASSIVES[id].maxLevel, id);
    assert.equal(levelUpPassive(run, entry), false);
  }
});

test('passive modifiers change real stats (Tempered Core: hp and armor)', () => {
  const run = newRun();
  const base = run.player.stats.get('maxHp');
  const entry = addPassive(run, 'tempered_core');
  approx(run.player.stats.get('maxHp'), base * 1.1);
  assert.equal(run.player.stats.get('armor'), 1);
  levelUpPassive(run, entry);
  approx(run.player.stats.get('maxHp'), base * 1.2);
});

test('Wind Sigil is scoped to projectile weapons only', () => {
  const run = newRun();
  const entry = addPassive(run, 'wind_sigil');
  levelUpPassive(run, entry);                                  // level 2: +1 pierce on projectile weapons
  const bow = run.player.weapons[0];
  assert.equal(run.player.stats.getFor('pierce', bow.tags), 1, 'Wind Sigil\'s +1 pierce (the Archer\'s own +1 pierce became Quiver in M43)');
  const melee = makeTags(['melee', 'weapon:99']);
  assert.equal(run.player.stats.getFor('pierce', melee), 0);
  assert.equal(run.player.stats.get('pierce'), 0);
});

test('a passive can be removed cleanly by source prefix', () => {
  const run = newRun();
  addPassive(run, 'keen_whetstone');
  approx(run.player.stats.get('damage'), 1.1);
  run.player.stats.removeBySource('passive:keen_whetstone');
  approx(run.player.stats.get('damage'), 1);
});

test('passive slots are capped and a passive cannot be added twice', () => {
  const run = newRun();
  const ids = Object.keys(PASSIVES);
  for (const id of ids) addPassive(run, id);
  assert.equal(run.player.passives.length, Math.min(ids.length, SLOTS.passives));
  assert.equal(addPassive(run, ids[0]), null);
});

// ---- offers ----

test('first offers: the bow level-up plus passives, three distinct choices', () => {
  const run = newRun();
  const offers = generateOffers(offerState(run), createRng(1));
  assert.equal(offers.length, 3);
  assert.equal(new Set(offers.map((o) => `${o.kind}:${o.id}`)).size, 3);
});

test('offers are deterministic for the same state and rng, and vary with the seed', () => {
  const run = newRun();
  const st = offerState(run);
  const a = generateOffers(st, createRng(7)).map((o) => o.id);
  const b = generateOffers(st, createRng(7)).map((o) => o.id);
  assert.deepEqual(a, b);
  const seen = new Set();
  for (let s = 0; s < 40; s++) seen.add(generateOffers(st, createRng(s)).map((o) => o.id).join());
  assert.ok(seen.size > 5, 'offers should vary across seeds');
});

test('maxed items are never offered; weapons of another class are never offered', () => {
  const st = { classId: 'archer', luck: 0, weapons: [{ weaponId: 'ember_bow', level: 8, instanceId: 1 }], passives: [] };
  assert.ok(buildCandidates(st).every((c) => c.id !== 'ember_bow'));
  const other = { classId: 'mage', luck: 0, weapons: [], passives: [] };
  assert.ok(buildCandidates(other).every((c) => c.kind !== 'weapon_new' || WEAPONS[c.id].class == null || WEAPONS[c.id].class === 'mage'));
  assert.ok(buildCandidates(other).some((c) => c.id === 'arc_bolt'), 'its own class weapon is offered');
  assert.ok(buildCandidates(st).every((c) => c.id !== 'arc_bolt' && c.id !== 'halo' && c.id !== 'bone_call'));
});

test('slot caps: no new passives at the passive cap, no new weapons at the weapon cap', () => {
  const ids = Object.keys(PASSIVES).slice(0, SLOTS.passives);
  const full = {
    classId: 'archer', luck: 0,
    weapons: [{ weaponId: 'ember_bow', level: 1, instanceId: 1 }],
    passives: ids.map((id) => ({ id, level: 1 })),
  };
  const cands = buildCandidates(full);
  if (ids.length >= SLOTS.passives) assert.ok(cands.every((c) => c.kind !== 'passive_new'));
  assert.ok(cands.some((c) => c.kind === 'passive_up'));
});

test('when everything is maxed the offer falls back to Rest', () => {
  const st = {
    classId: 'archer', luck: 0,
    weapons: Object.entries(WEAPONS)
      .filter(([, d]) => d.class == null || d.class === 'archer')
      .map(([id, d], i) => ({ weaponId: id, level: d.maxLevel, instanceId: i + 1 })),
    titles: Object.keys(TITLES),
    passives: Object.entries(PASSIVES).map(([id, d]) => ({ id, level: d.maxLevel })),
    perks: Object.entries(PERKS).map(([id, d]) => ({ id, level: d.maxLevel })),
    ownedTags: ['fire', 'frost', 'storm', 'projectile', 'close', 'arc', 'orbit'],
  };
  const offers = generateOffers(st, createRng(1));
  assert.deepEqual(offers.map((o) => o.kind), ['heal']);
  assert.equal(offers[0], HEAL_OFFER);
});

test('owned items are weighted up and luck favours rarer items', () => {
  const owned = { rarity: 'common', owned: true };
  const fresh = { rarity: 'common', owned: false };
  approx(offerWeight(owned, 0), offerWeight(fresh, 0) * 1.5);
  const rare = { rarity: 'rare', owned: false };
  assert.ok(offerWeight(rare, 10) > offerWeight(rare, 0) * 2.5);
  assert.equal(offerWeight(fresh, 10), offerWeight(fresh, 0));        // common ignores luck
});

test('luck measurably shifts offers toward rare items', () => {
  const st = (luck) => ({ classId: 'archer', luck, weapons: [{ weaponId: 'ember_bow', level: 1, instanceId: 1 }], passives: [] });
  const share = (luck) => {
    let rare = 0;
    for (let s = 0; s < 800; s++) {
      for (const o of generateOffers(st(luck), createRng(s))) if (o.rarity === 'rare') rare++;
    }
    return rare;
  };
  assert.ok(share(10) > share(0) * 1.3);
});

// ---- applying offers ----

test('applyOffer: each kind changes the run as described, and grants i-frames', () => {
  const run = newRun();
  const p = run.player;
  const bow = p.weapons[0];
  const offers = generateOffers(offerState(run), createRng(3), 20);

  const up = offers.find((o) => o.kind === 'weapon_up');
  applyOffer(run, up);
  assert.equal(bow.level, 2);

  const np = offers.find((o) => o.kind === 'passive_new');
  applyOffer(run, np);
  assert.equal(findPassive(p, np.id).level, 1);

  const pu = generateOffers(offerState(run), createRng(3), 20).find((o) => o.kind === 'passive_up');
  applyOffer(run, pu);
  assert.equal(findPassive(p, pu.id).level, 2);

  p.hp = 10;
  p.iframes = 0;
  applyOffer(run, HEAL_OFFER);
  approx(p.hp, 10 + p.maxHp * 0.3);
  assert.ok(p.iframes >= 1);
});

test('applyOffer rejects an unknown offer kind', () => {
  const run = newRun();
  assert.throws(() => applyOffer(run, { kind: 'bogus' }), /Unknown offer kind/);
});

// ---- a whole run with automatic picks ----

test('a 5-minute run with random level-up picks stays consistent and the build grows', () => {
  const run = newRun(21, { god: true });
  const pick = createRng(99);
  let picks = 0;
  let heals = 0;   // picks that raise no item level (heals, titles)
  for (let i = 0; i < 60 * 300; i++) {
    run.update(STEP, STILL);
    while (run.pendingLevelUps > 0) {
      const offers = generateOffers(offerState(run), run.rng);
      assert.ok(offers.length >= 1 && offers.length <= 3);
      const chosen = pick.pick(offers);
      applyOffer(run, chosen);
      picks++;
      if (chosen.kind === 'heal' || chosen.kind === 'title_new') heals++;
      run.pendingLevelUps--;
    }
    if (i % 600 === 0) {
      const w = run.world;
      assert.ok(w.pickups.count <= CAPS.pickups && w.enemies.count <= CAPS.enemies);
      assert.ok(run.player.passives.length <= SLOTS.passives && run.player.weapons.length <= SLOTS.weapons);
      assert.ok(Number.isFinite(run.player.hp) && run.player.hp > 0);
    }
  }
  const weaponLevels = run.player.weapons.reduce((a, w) => a + w.level, 0);
  const passiveLevels = run.player.passives.reduce((a, x) => a + x.level, 0) + run.player.perks.reduce((a, x) => a + x.level, 0);
  assert.ok(run.player.level >= 8, `level ${run.player.level}`);
  assert.equal(picks, run.player.level - 1, 'one pick per level gained');
  assert.equal(weaponLevels + passiveLevels - 1, picks - heals, 'every item pick (weapon, passive or perk) raised exactly one item level');
});
