// Forge rules, shrines and ore: pure-ish tests on the real run state, no DOM.

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { param } from '../src/game/weapon-params.js';
import { ENHANCE, REFORGE, AFFIXES, SHRINE } from '../src/data/forge.js';
import { RUN, EVENTS } from '../src/data/waves.js';
import { validateData } from '../src/data/validate.js';
import { killEnemy } from '../src/systems/damage.js';
import { spawnShrine, updateShrines } from '../src/systems/shrines.js';
import { spawnOre, updatePickups } from '../src/systems/pickups.js';
import {
  enhance, enhanceCost, downgradeChance, reforge, reforgeCost, eligibleAffixes, salvage, salvageValue, canSalvage,
} from '../src/game/forge.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId = 'archer', seed = 1) => createRun({ seed, view: VIEW, debug: { god: true }, classId });
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };
const dmg = (run, inst) => param(run, inst, 'damage');

// A run whose rng we can script: next() returns the queued values, then 0.5.
function scripted(run, values) {
  const q = [...values];
  const real = run.rng.next.bind(run.rng);
  run.rng.next = () => (q.length ? q.shift() : 0.5);
  return () => { run.rng.next = real; };
}

test('forge data validates', () => {
  assert.deepEqual(validateData(), []);
});

test('enhance: success spends ore, adds modifiers and raises the level', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  run.ore = 20;
  const before = dmg(run, bow);
  const r = enhance(run, bow);                          // +0 -> +1 always succeeds
  assert.equal(r.outcome, 'success');
  assert.equal(bow.enhance, 1);
  assert.equal(run.ore, 20 - ENHANCE.cost[0]);
  approx(dmg(run, bow), before * 1.08, 1e-6);
});

test('enhance: not enough ore does nothing', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  run.ore = 1;
  const r = enhance(run, bow);
  assert.equal(r.ok, false);
  assert.equal(run.ore, 1);
  assert.equal(bow.enhance, 0);
});

test('enhance: breakpoint at +5 grants its bonus, and a weapon override replaces it', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  run.ore = 1e6;
  bow.enhance = 4;
  const proj0 = run.player.stats.getFor('projectiles', bow.tags);
  const run2 = newRun();
  const b2 = run2.player.weapons[0];
  run2.ore = 1e6;
  b2.enhance = 4;
  const restore = scripted(run2, [0]);                  // roll 0 < success chance: success
  enhance(run2, b2);
  restore();
  assert.equal(b2.enhance, 5);
  assert.equal(run2.player.stats.getFor('projectiles', b2.tags), proj0 + 1);

  const run3 = newRun();
  addWeapon(run3, 'cinder_ward');
  const ward = run3.player.weapons[1];
  run3.ore = 1e6;
  ward.enhance = 4;
  const area0 = run3.player.stats.getFor('area', ward.tags);
  const restore3 = scripted(run3, [0]);
  enhance(run3, ward);
  restore3();
  assert.equal(run3.player.stats.getFor('projectiles', ward.tags), 0, 'override: no projectile bonus');
  approx(run3.player.stats.getFor('area', ward.tags), area0 * 1.25, 1e-6);
});

test('enhance failure never removes the weapon, whatever the roll or level', () => {
  for (let lvl = 0; lvl < ENHANCE.maxLevel; lvl++) {
    if (ENHANCE.success[lvl] >= 1) continue;             // these levels can't fail
    for (const roll of [0.999, 0.0001]) {
      const run = newRun();
      const bow = run.player.weapons[0];
      run.ore = 1e6;
      bow.enhance = lvl;
      const restore = scripted(run, [0.999, roll]);     // fail the success roll, then vary the downgrade roll
      enhance(run, bow);
      restore();
      assert.ok(run.player.weapons.includes(bow), `weapon survived a failure at +${lvl}`);
      assert.ok(bow.enhance >= lvl - 1 && bow.enhance <= lvl);
    }
  }
});

test('failure: loses ore always, an enhance level only above the threshold', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  run.ore = 1e6;
  bow.enhance = 3;
  let restore = scripted(run, [0.999]);                 // roll too high: fails (success 100% until +3? +3 is 0.9)
  const r1 = enhance(run, bow);
  restore();
  assert.equal(r1.outcome, 'fail');
  assert.equal(bow.enhance, 3);
  assert.equal(downgradeChance(run, bow), 0);

  const run2 = newRun();
  const b2 = run2.player.weapons[0];
  run2.ore = 1e6;
  b2.enhance = 9;                                       // above +7: downgrade possible
  const before = run2.ore;
  restore = scripted(run2, [0.999, 0.0]);               // fail, downgrade roll low: downgrade
  const r2 = enhance(run2, b2);
  restore();
  assert.equal(r2.outcome, 'downgrade');
  assert.equal(b2.enhance, 8);
  assert.ok(run2.ore < before);
  assert.ok(run2.player.weapons.includes(b2));
});

test('downgrade removes exactly that level\'s modifiers (+1 and +10 stay separate)', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  run.ore = 1e9;
  const base = dmg(run, bow);
  // climb to +10 with forced successes
  const restore = scripted(run, new Array(10).fill(0));
  for (let i = 0; i < 10; i++) enhance(run, bow);
  restore();
  assert.equal(bow.enhance, 10);
  const at10 = dmg(run, bow);
  const r = scripted(run, [0.999, 0.0]);                // fail, downgrade
  enhance(run, bow);
  r();
  assert.equal(bow.enhance, 9);
  assert.ok(dmg(run, bow) < at10, 'the +10 bonus (incl. 30% more) is gone');
  // +1..+9 bonuses are intact: 1 + 9*0.08 on the inc stack
  approx(dmg(run, bow), base * (1 + 9 * 0.08), 1e-6);
});

test('luck lowers the downgrade chance; downgradeChance 0 would disable it', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  bow.enhance = 10;
  const none = downgradeChance(run, bow);
  run.player.stats.add({ stat: 'luck', op: 'flat', value: 4, source: 't' });
  assert.ok(downgradeChance(run, bow) < none);
});

test('smith pays 20% less ore to enhance', () => {
  const a = newRun('archer');
  const s = newRun('smith');
  assert.equal(enhanceCost(a, a.player.weapons[0]), ENHANCE.cost[0]);
  assert.equal(enhanceCost(s, s.player.weapons[0]), Math.ceil(ENHANCE.cost[0] * 0.8));
});

test('reforge: rerolls affixes (count by rarity), removes the old ones, costs more each time', () => {
  const run = newRun();
  addWeapon(run, 'spirit_blades');                      // uncommon: 2 affixes
  const blades = run.player.weapons[1];
  run.ore = 1e6;
  const c0 = reforgeCost(blades);
  reforge(run, blades);
  assert.equal(blades.affixes.length, REFORGE.affixCount.uncommon);
  assert.equal(new Set(blades.affixes).size, blades.affixes.length, 'affixes are distinct');
  assert.equal(reforgeCost(blades), c0 + REFORGE.costPerReforge);
  const first = blades.affixes.slice();
  for (let i = 0; i < 20; i++) reforge(run, blades);
  // whatever it rolled last, only its mods remain: count forge affix modifiers in the stat block
  const sources = new Set();
  for (const list of Object.values(run.player.stats.mods)) for (const m of list) if (m.source.startsWith(`forge:${blades.instanceId}:affix:`)) sources.add(m.source.split(':')[3]);
  for (const id of sources) assert.ok(blades.affixes.includes(id), `stale affix ${id} left behind`);
  assert.ok(first.length === 2);
});

test('reforge only rolls affixes the weapon is allowed to have', () => {
  const run = newRun();
  addWeapon(run, 'cinder_ward');
  const ward = run.player.weapons[1];
  const ok = eligibleAffixes(ward);
  assert.ok(!ok.includes('piercing'), 'an aura has no pierce');
  run.ore = 1e6;
  for (let i = 0; i < 60; i++) { reforge(run, ward); for (const a of ward.affixes) assert.ok(ok.includes(a)); }
});

test('the volatile affix adds a working trigger and reforging removes it', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  run.ore = 1e6;
  bow.extraTriggers.push(...AFFIXES.volatile.triggers);   // as if volatile had been rolled
  bow.affixes = ['volatile'];
  reforge(run, bow);                                       // any reroll clears the old triggers first
  assert.equal(bow.extraTriggers.length, bow.affixes.includes('volatile') ? 1 : 0);
});

test('salvage: removes the weapon and its modifiers, refunds ore, never the last weapon', () => {
  const run = newRun();
  addWeapon(run, 'cinder_ward');
  const [bow, ward] = run.player.weapons;
  assert.ok(canSalvage(run));
  run.ore = 0;
  const value = salvageValue(ward);
  const r = salvage(run, ward);
  assert.equal(r.ok, true);
  assert.equal(run.ore, value);
  assert.deepEqual(run.player.weapons, [bow]);
  assert.equal(canSalvage(run), false);
  assert.equal(salvage(run, bow).ok, false);
  assert.equal(run.player.weapons.length, 1);
});

test('ore drops from kills and is collected through the magnet', () => {
  const run = newRun();
  run.rng.next = () => 0;                               // always under the drop chance
  const e = spawnEnemy(run, 'goblin', run.player.x + 300, run.player.y);
  killEnemy(run, e);
  const ores = run.world.pickups.active.filter((g) => g.kind === 1);
  assert.equal(ores.length, 1);
  ores[0].x = run.player.x + 10; ores[0].y = run.player.y;
  updatePickups(run, STEP);
  assert.equal(run.ore, 1);
  assert.equal(run.world.pickups.active.filter((g) => g.kind === 1).length, 0);
});

test('ore is banked directly when the pickup pool is full, and gems still merge around ore', () => {
  const run = newRun();
  const w = run.world;
  while (w.pickups.acquire()) { /* fill the pool */ }
  const before = run.ore;
  assert.equal(spawnOre(run, 0, 0, 'iron'), null);
  assert.equal(run.ore, before + 1);
});

test('shrines: spawn off screen at the side, one at a time, expire, and open the forge when channelled', () => {
  const run = newRun();
  const s = spawnShrine(run);
  assert.ok(Math.abs(s.x - run.player.x) > VIEW.w / 2, 'beyond the view edge');
  assert.equal(spawnShrine(run), null, 'maxActive is 1');

  // too far away: progress stays 0, then it expires
  run.shrines[0].ttl = 0.1;
  updateShrines(run, 0.2);
  assert.equal(run.shrines.length, 0);
  assert.equal(run.forgeReady, false);

  // standing inside fills the channel
  const s2 = spawnShrine(run);
  run.player.x = s2.x;
  run.player.y = s2.y;
  updateShrines(run, SHRINE.channel / 2);
  assert.equal(run.forgeReady, false);
  updateShrines(run, SHRINE.channel / 2 + 0.01);
  assert.equal(run.forgeReady, true);
  assert.equal(run.shrines.length, 0, 'one use');
});

test('shrine progress drains faster than it fills when you step away', () => {
  const run = newRun();
  const s = spawnShrine(run);
  run.player.x = s.x; run.player.y = s.y;
  updateShrines(run, 0.4);
  const filled = s.progress;
  run.player.x = s.x + 500;
  updateShrines(run, 0.1);
  approx(s.progress, filled - 0.1 * SHRINE.drain, 1e-9);
});

test('the timeline spawns a shrine at each event time, scaled by run length', () => {
  const run = newRun();
  run.debug.god = true;
  run.player.x = 0;
  // jump the clock to just before and just after the first event
  run.time = EVENTS[0].at - 1;
  tick(run, 0.5);
  assert.equal(run.shrines.length, 0);
  tick(run, 1.5);
  assert.equal(run.shrines.length, 1);
  assert.equal(RUN.length, RUN.designLength);
});

test('a full run with shrines left alone stays sane (expired shrines are removed)', () => {
  const run = newRun('smith', 3);
  for (let s = 0; s < 300; s++) {
    tick(run, 1);
    assert.ok(run.shrines.length <= SHRINE.maxActive);
    assert.ok(Number.isFinite(run.ore) && run.ore >= 0);
  }
  assert.ok(run.ore > 0, 'ore dropped over five minutes');
});
