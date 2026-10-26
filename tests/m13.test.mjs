// M13: reforge as pick-one-of-three per slot, the bigger affix pool with infusions, and tempers.

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { addWeapon } from '../src/game/weapons.js';
import { addPerk } from '../src/game/perks.js';
import { addPassive } from '../src/game/passives.js';
import {
  enhance, rollReforge, applyReforge, keepCurrent, reforgeCost, reforgeSlots, slotCount, canReforge,
  eligibleAffixes, chooseTemper, temperOptions, salvage,
} from '../src/game/forge.js';
import { AFFIXES, ENHANCE, REFORGE } from '../src/data/forge.js';
import { RARITIES } from '../src/data/rarities.js';
import { WEAPONS } from '../src/data/weapons.js';
import { offerState } from '../src/game/apply-offer.js';
import { buildCandidates } from '../src/game/upgrades.js';
import { evolve, recipesFor } from '../src/game/evolution.js';
import { validateData } from '../src/data/validate.js';

const VIEW = { w: 480, h: 1040 };
const newRun = (classId = 'archer', seed = 3) => {
  const run = createRun({ seed, view: VIEW, debug: { god: true }, classId });
  run.director.update = () => {};
  run.ore = 1e6;
  return run;
};
// forces the next rng.next() calls (the enhance success roll is the first)
function scripted(run, values) {
  const real = run.rng.next.bind(run.rng);
  let i = 0;
  run.rng.next = () => (i < values.length ? values[i++] : real());
  return () => { run.rng.next = real; };
}
const climb = (run, inst, to) => {
  const restore = scripted(run, new Array(40).fill(0));
  while (inst.enhance < to) {
    enhance(run, inst);
    if (inst.pendingTemper) chooseTemper(run, inst, 0);
  }
  restore();
};

test('m13 data validates', () => {
  assert.deepEqual(validateData(), []);
});

// ---- reforge ---------------------------------------------------------------------------------

test('reforge: pays at once, shows three distinct options, nothing changes until one is picked', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  const ore0 = run.ore;
  const c = reforgeCost(bow);
  const r = rollReforge(run, bow, 0);
  assert.equal(r.ok, true);
  assert.equal(run.ore, ore0 - c);
  assert.equal(r.options.length, REFORGE.options);
  assert.equal(new Set(r.options).size, 3);
  assert.deepEqual(bow.affixes, []);
  assert.deepEqual(bow.pendingReforge, { slot: 0, options: r.options });
  assert.equal(canReforge(run, bow), false, 'one pending reforge at a time');
  assert.equal(rollReforge(run, bow, 0).ok, false);
  const res = applyReforge(run, bow, 1);
  assert.equal(res.ok, true);
  assert.deepEqual(bow.affixes, [r.options[1]]);
  assert.equal(bow.pendingReforge, null);
  assert.equal(reforgeCost(bow), c + REFORGE.costPerReforge);
});

test('reforge: keeping the current effect spends the ore but changes nothing', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  bow.affixes = ['keen'];
  run.player.stats.add({ stat: 'critChance', op: 'flat', value: 0.05, tags: [bow.instanceTag], source: `forge:${bow.instanceId}:affix:keen:` });
  const before = run.player.stats.getFor('critChance', bow.tags);
  const ore0 = run.ore;
  rollReforge(run, bow, 0);
  keepCurrent(bow);
  assert.deepEqual(bow.affixes, ['keen']);
  assert.equal(bow.pendingReforge, null);
  approx(run.player.stats.getFor('critChance', bow.tags), before);
  assert.ok(run.ore < ore0);
});

test('reforge: slots fill in order, and the count follows rarity', () => {
  const run = newRun();
  const blades = addWeapon(run, 'spirit_blades');        // uncommon: 2 slots
  assert.equal(slotCount(blades), REFORGE.affixCount.uncommon);
  assert.deepEqual(reforgeSlots(blades).map((s) => s.affixId), [null, null]);
  assert.equal(rollReforge(run, blades, 1).ok, false, 'cannot skip to slot 2 while slot 1 is empty');
  assert.equal(rollReforge(run, blades, 5).ok, false);
  rollReforge(run, blades, 0);
  applyReforge(run, blades, 0);
  const second = rollReforge(run, blades, 1);
  assert.equal(second.ok, true);
  assert.ok(!second.options.includes(blades.affixes[0]), 'never offers an affix the weapon already has');
  applyReforge(run, blades, 0);
  assert.equal(blades.affixes.length, 2);
  assert.notEqual(blades.affixes[0], blades.affixes[1]);
});

test('reforge replaces only the chosen slot and leaves no stale modifiers', () => {
  const run = newRun();
  const blades = addWeapon(run, 'spirit_blades');
  for (let slot = 0; slot < 2; slot++) { rollReforge(run, blades, slot); applyReforge(run, blades, 0); }
  const keep = blades.affixes[1];
  for (let i = 0; i < 25; i++) { rollReforge(run, blades, 0); applyReforge(run, blades, i % 3); assert.equal(blades.affixes[1], keep); }
  const sources = new Set();
  for (const list of Object.values(run.player.stats.mods)) for (const m of list) if (m.source.startsWith(`forge:${blades.instanceId}:affix:`)) sources.add(m.source.split(':')[3]);
  for (const id of sources) assert.ok(blades.affixes.includes(id), `stale affix ${id}`);
  assert.equal(blades.extraTriggers.length, blades.affixes.filter((id) => AFFIXES[id].triggers).length);
});

test('reforge only offers affixes the weapon may have; "requires" reads the current tags', () => {
  const run = newRun();
  const ward = addWeapon(run, 'cinder_ward');
  assert.ok(!eligibleAffixes(ward).includes('piercing'), 'an aura has no pierce');
  assert.ok(!eligibleAffixes(ward).includes('conductive'), 'no storm tag yet');
  assert.ok(eligibleAffixes(ward).includes('searing'), 'a fire weapon can be searing');
  for (let i = 0; i < 80; i++) {
    const r = rollReforge(run, ward, 0);
    for (const id of r.options) assert.ok(eligibleAffixes(ward).includes(id));
    keepCurrent(ward);
  }
});

test('every roll has at least one uncommon-or-better option when the pool has one', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  for (let i = 0; i < 150; i++) {
    const r = rollReforge(run, bow, 0);
    assert.ok(r.options.some((id) => AFFIXES[id].rarity !== 'common'), r.options.join());
    keepCurrent(bow);
  }
});

test('rarer affixes are rarer: epics show up far less than commons across many rolls', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  const seen = { common: 0, uncommon: 0, rare: 0, epic: 0 };
  for (let i = 0; i < 600; i++) {
    for (const id of rollReforge(run, bow, 0).options) seen[AFFIXES[id].rarity]++;
    keepCurrent(bow);
  }
  assert.ok(seen.epic > 0 && seen.epic < seen.rare && seen.rare < seen.common * 1.2, JSON.stringify(seen));
  void RARITIES;
});

// ---- infusion --------------------------------------------------------------------------------

test('infusion: an Ember-touched hammer becomes a fire weapon (tags, burn, perks, resonance)', () => {
  const run = newRun('smith');
  const hammer = run.player.weapons[0];
  assert.ok(!hammer.tags.set.has('fire'));
  const ward = addWeapon(run, 'cinder_ward');             // fire
  void ward;
  assert.equal(run.resonance.some((r) => r.tag === 'fire'), false);
  hammer.affixes = [];
  // roll until ember_touched is offered, then pick it
  let got = false;
  for (let i = 0; i < 300 && !got; i++) {
    const r = rollReforge(run, hammer, 0);
    const k = r.options.indexOf('ember_touched');
    if (k >= 0) { applyReforge(run, hammer, k); got = true; } else keepCurrent(hammer);
  }
  assert.ok(got, 'ember_touched is offered eventually');
  assert.ok(hammer.tags.set.has('fire') && hammer.addTags.includes('fire'));
  approx(run.player.stats.getFor('burnChance', hammer.tags), 0.25);
  assert.ok(run.resonance.some((r) => r.tag === 'fire' && r.tier === 1), 'hammer + ward = Fire I');
  assert.ok(offerState(run).ownedTags.includes('fire'));
  assert.ok(buildCandidates(offerState(run)).some((c) => c.id === 'fan_the_flames'), 'perk requirements see the infusion');
  // replace it: the tag goes away again
  rollReforge(run, hammer, 0);
  for (let i = 0; i < 300 && hammer.addTags.length; i++) {
    const r = hammer.pendingReforge;
    const k = r.options.findIndex((id) => !AFFIXES[id].addTags);
    if (k >= 0) applyReforge(run, hammer, k);
    else { keepCurrent(hammer); rollReforge(run, hammer, 0); }
  }
  assert.equal(hammer.addTags.length, 0);
  assert.ok(!hammer.tags.set.has('fire'));
  assert.equal(run.resonance.some((r) => r.tag === 'fire'), false);
});

test('a weapon can hold only one infusion; replacing the slot that holds it is fine', () => {
  const run = newRun();
  const blades = addWeapon(run, 'spirit_blades');
  blades.affixes = ['rime_touched'];
  for (let i = 0; i < 100; i++) {
    const r = rollReforge(run, blades, 1);
    for (const id of r.options) assert.ok(!AFFIXES[id].infusion, 'second infusion offered');
    keepCurrent(blades);
  }
  let sawInfusion = false;
  for (let i = 0; i < 200; i++) {
    const r = rollReforge(run, blades, 0);                // the slot that holds the infusion
    if (r.options.some((id) => AFFIXES[id].infusion)) sawInfusion = true;
    keepCurrent(blades);
  }
  assert.ok(sawInfusion);
});

test('infusion tags survive evolution', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  bow.affixes = ['rime_touched'];
  bow.addTags = ['frost'];
  addPassive(run, 'wind_sigil');
  bow.level = 8;
  run.starsteel = 1;
  assert.equal(evolve(run, bow, recipesFor(bow)[0]).ok, true);
  assert.ok(bow.tags.set.has('frost') && bow.tags.set.has('storm'));
});

test('new affixes do what they say', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  const st = run.player.stats;
  const give = (id) => {
    bow.affixes = [id];
    st.removeBySource(`forge:${bow.instanceId}:affix:`);
    for (const m of AFFIXES[id].mods || []) st.add({ ...m, tags: [bow.instanceTag], source: `forge:${bow.instanceId}:affix:${id}:` });
  };
  give('ricocheting'); assert.equal(st.getFor('ricochet', bow.tags), 2);
  give('splitting'); assert.equal(st.getFor('split', bow.tags), 2);
  give('executioner'); approx(st.getFor('executeBelow', bow.tags), 0.15);
  give('vampiric'); approx(st.getFor('lifesteal', bow.tags), 0.02);
  give('searing'); approx(st.getFor('vsBurning', bow.tags), 1.4);
  const a0 = st.getFor('area', bow.tags);
  give('colossal'); approx(st.getFor('area', bow.tags), a0 * 1.3);
  assert.ok(Object.keys(AFFIXES).length >= 19);
});

// ---- tempers ---------------------------------------------------------------------------------

test('reaching +5 offers a temper and blocks further enhancing until one is chosen', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  bow.enhance = 4;
  const restore = scripted(run, [0]);
  enhance(run, bow);
  restore();
  assert.equal(bow.enhance, 5);
  assert.equal(bow.pendingTemper, 5);
  assert.equal(temperOptions(bow, 5).length, 2);
  assert.equal(enhance(run, bow).ok, false, 'blocked until a temper is chosen');
  const proj0 = run.player.stats.getFor('projectiles', bow.tags);
  const r = chooseTemper(run, bow, 1);                    // Shortbow: +1 arrow, -25% cooldown
  assert.equal(r.ok, true);
  assert.equal(bow.pendingTemper, 0);
  assert.equal(bow.tempers[5].id, 'shortbow');
  assert.equal(run.player.stats.getFor('projectiles', bow.tags), proj0 + 1);
  assert.equal(chooseTemper(run, bow, 0).ok, false, 'nothing pending');
});

test('Longbow trades arrows for one heavy piercing shot', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  const st = run.player.stats;
  // level the bow so it has extra arrows to trade
  st.add({ stat: 'projectiles', op: 'flat', value: 2, tags: [bow.instanceTag], source: 't' });
  bow.enhance = 4;
  const restore = scripted(run, [0]);
  enhance(run, bow);
  restore();
  const dmg0 = st.getFor('damage', bow.tags);
  const pierce0 = st.getFor('pierce', bow.tags);
  chooseTemper(run, bow, 0);
  assert.equal(st.getFor('projectiles', bow.tags), 2, 'down to one arrow, plus the Archer\'s Quiver (M43)');
  assert.equal(st.getFor('pierce', bow.tags), pierce0 + 2);
  approx(st.getFor('damage', bow.tags), dmg0 * 1.6);
});

test('a temper that adds an element (Flamebow) tags the weapon; every weapon has two options at +5 and +10', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  climb(run, bow, 10);                                    // +5: Longbow (index 0), +10: Flamebow (index 0)
  assert.equal(bow.tempers[10].id, 'flamebow');
  assert.ok(bow.addTags.includes('fire'));
  approx(run.player.stats.getFor('burnChance', bow.tags), 0.35 + 0.5);
  for (const id of Object.keys(WEAPONS)) {
    const probe = { def: WEAPONS[id] };
    assert.equal(temperOptions(probe, 5).length, 2, id);
    assert.equal(temperOptions(probe, 10).length, 2, id);
  }
  assert.ok(ENHANCE.tempers[5] && ENHANCE.tempers[10]);
});

test('losing +5 or +10 to a downgrade removes its temper (and its tag); reaching it again re-offers the choice', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  climb(run, bow, 10);
  assert.ok(bow.addTags.includes('fire'));
  const r1 = scripted(run, [0.999, 0]);                   // fail, then downgrade
  enhance(run, bow);
  r1();
  assert.equal(bow.enhance, 9);
  assert.equal(bow.tempers[10], undefined);
  assert.ok(!bow.addTags.includes('fire'));
  assert.ok(bow.tempers[5], 'the +5 temper is untouched');
  const r2 = scripted(run, [0]);
  enhance(run, bow);
  r2();
  assert.equal(bow.enhance, 10);
  assert.equal(bow.pendingTemper, 10, 'the choice is offered again');
});

test('salvage drops the weapon\'s tags out of resonance', () => {
  const run = newRun('smith');
  const ward = addWeapon(run, 'cinder_ward');
  const hammer = run.player.weapons[0];
  void hammer;
  const bow = addWeapon(run, 'ember_bow');                 // fire x2 with the ward
  assert.ok(run.resonance.some((r) => r.tag === 'fire'));
  salvage(run, bow);
  assert.equal(run.resonance.some((r) => r.tag === 'fire'), false);
  void ward; void addPerk;
});
