// M38: magnet drop, longer shrines, fusion-aware offers. A fusion partner (the missing half of a fusion you
// hold the other half of) is a little likelier at level-ups and much likelier from a chest's new-weapon roll.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { addWeapon } from '../src/game/weapons.js';
import { generateOffers, fusionPartners } from '../src/game/upgrades.js';
import { pickChestItem, evolutionBlockers, openChest } from '../src/game/chests.js';
import { offerState } from '../src/game/apply-offer.js';
import { createRng } from '../src/core/rng.js';
import { LEVELUP } from '../src/data/progression.js';
import { SHRINE } from '../src/data/forge.js';
import { CRATES } from '../src/data/crates.js';
import { spawnGem, spawnOre, spawnChest, spawnHeal, spawnMagnet, KIND_GEM, KIND_ORE, KIND_HEAL, KIND_MAGNET } from '../src/systems/pickups.js';
import { lootWeights, rollLoot } from '../src/systems/crates.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId = 'archer', god = true, seed = 3) => {
  const run = createRun({ seed, view: VIEW, debug: { god }, classId });
  run.director.update = () => {};
  return run;
};
const give = (run, ...ids) => { for (const id of ids) if (!run.player.weapons.some((w) => w.weaponId === id)) addWeapon(run, id); };

test('m38 shrines last longer than they used to (45 s, boss 90 s)', () => {
  assert.ok(SHRINE.ttl >= 70 && SHRINE.bossShrineTtl >= 120);
});

test('m38 a magnet pulls every gem, ore and heart to you, but not chests', () => {
  const run = newRun('archer', false);
  run.player.weapons.length = 0;
  run.player.hp = run.player.maxHp * 0.5;
  for (let i = 0; i < 6; i++) spawnGem(run, 300 + i * 20, 200, 1);
  spawnOre(run, -300, 100, 'iron', 1);
  spawnHeal(run, 0, -400, 0.15);
  const chest = spawnChest(run, 250, 250, 0);
  spawnMagnet(run, 10, 0);
  for (let i = 0; i < 20; i++) run.update(STEP, { x: 0, y: 0 });
  const left = run.world.pickups.active;
  assert.ok(!left.some((g) => g.kind === KIND_MAGNET), 'the magnet was collected');
  for (const g of left) if (g !== chest) assert.ok(g.magnet, 'everything else is being pulled in');
  assert.equal(chest.magnet, false);
  for (let i = 0; i < 600; i++) run.update(STEP, { x: 0, y: 0 });
  assert.equal(run.world.pickups.active.filter((g) => g.kind === KIND_GEM || g.kind === KIND_ORE || g.kind === KIND_HEAL).length, 0, 'all collected');
});

test('m38 a magnet is only rolled when enough is lying on the ground', () => {
  const run = newRun();
  assert.equal(lootWeights(run).magnet, 0);
  for (let i = 0; i < 300; i++) assert.ok(rollLoot(run) !== 'magnet');
  for (let i = 0; i < CRATES.loot.magnet.minOnGround; i++) spawnGem(run, 500 + i, 500, 1);
  assert.equal(lootWeights(run).magnet, CRATES.loot.magnet.weight);
  let n = 0;
  for (let i = 0; i < 1000; i++) if (rollLoot(run) === 'magnet') n++;
  assert.ok(n > 100 && n < 400, `${n}`);
});

test('m38 fusionPartners names the missing half of a fusion, only when you hold the other half', () => {
  const run = newRun('archer');
  assert.equal(fusionPartners(offerState(run)).size, 0);
  give(run, 'storm_javelin');
  const m = fusionPartners(offerState(run));
  assert.deepEqual([...m.keys()], ['rime_shards']);
  assert.equal(m.get('rime_shards'), 'Stormfrost Lance');
  give(run, 'rime_shards');
  assert.equal(fusionPartners(offerState(run)).size, 0, 'both halves held: nothing missing');
});

test('m38 a level-up offers the missing half of a fusion more often, and marks what it leads to', () => {
  const run = newRun('archer');
  give(run, 'storm_javelin');
  const state = offerState(run);
  const count = (boost) => {
    LEVELUP.fusionPartnerBoost = boost;
    const rng = createRng(21);
    let n = 0;
    let marked = true;
    for (let i = 0; i < 4000; i++) {
      for (const o of generateOffers(state, rng)) if (o.id === 'rime_shards') { n++; if (!o.evo) marked = false; }
    }
    assert.ok(marked);
    return n;
  };
  const saved = LEVELUP.fusionPartnerBoost;
  const base = count(1);
  const boosted = count(saved);
  LEVELUP.fusionPartnerBoost = saved;
  assert.ok(boosted > base * 1.25 && boosted < base * 2.2, `${base} -> ${boosted}`);
});

test('m38 a chest new-weapon roll mostly picks the missing fusion half', () => {
  const run = newRun('smith');
  give(run, 'cinder_ward');
  const state = offerState(run);
  const bl = evolutionBlockers(run);
  const rng = createRng(5);
  let hit = 0;
  for (let i = 0; i < 3000; i++) if (pickChestItem(state, rng, bl, true).id === 'rime_orbs') hit++;
  assert.ok(hit / 3000 > 0.3, `${hit / 3000}`);
});

test('m38 with a fusion half missing, a 3-roll chest can unlock the other half', () => {
  let gave = 0;
  let chests = 0;
  for (let s = 1; s <= 80; s++) {
    const run = newRun('archer', true, s);
    give(run, 'storm_javelin');
    run.chestsOpened = 5;                       // not the first-chest minimum
    const r = openChest(run, 0);
    if (r.count !== 3) continue;
    chests++;
    if (r.rolls.some((x) => x.kind === 'weapon_new')) gave++;
  }
  assert.ok(chests > 5 && gave >= 1, `${gave}/${chests}`);
});
