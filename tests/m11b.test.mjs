// M11b: payoffs (Wildfire, Shatter, Thunderclap), alloys (Quench, Overload, Superconduct),
// Headsman, and resonance set bonuses.

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { addPerk, levelUpPerk, findPerk } from '../src/game/perks.js';
import { queueDamage, KIND_HIT, KIND_PROC } from '../src/systems/damage-queue.js';
import { flushDamage } from '../src/systems/damage.js';
import { applyBurn, applyChill, applyShock, chainArc } from '../src/systems/status.js';
import { resolveHit } from '../src/game/hit.js';
import { ST } from '../src/data/statuses.js';
import { validateData } from '../src/data/validate.js';
import { evolve, recipesFor } from '../src/game/evolution.js';
import { addPassive } from '../src/game/passives.js';
import { buildCandidates } from '../src/game/upgrades.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const setup = (classId = 'archer') => {
  const run = createRun({ seed: 9, view: VIEW, debug: { god: true }, classId });
  run.director.update = () => {};
  const w = run.player.weapons[0];
  run.player.stats.removeBySource(`weapon:${w.instanceId}:base:`);   // start with no elemental chances
  w.cd = 1e9;
  return { run, w };
};
const dummy = (run, x, y, hp = 1e9, id = 'goblin') => {
  const e = spawnEnemy(run, id, x, y);
  e.speed = 0;
  e.hp = e.maxHp = hp;
  return e;
};
const rehash = (run) => run.world.hash.rebuild(run.world.enemies.active, run.world.enemies.count);
const own = (run, id, level = 1) => { addPerk(run, id); for (let i = 1; i < level; i++) levelUpPerk(run, findPerk(run.player, id)); };
const dealt = (e) => e.maxHp - e.hp;

test('m11b data validates', () => {
  assert.deepEqual(validateData(), []);
});

test('Wildfire: a burning enemy that dies passes its remaining burn on to the nearest enemies', () => {
  const { run, w } = setup();
  own(run, 'wildfire', 1);                              // 2 enemies, x1.5
  const dying = dummy(run, 300, 0, 5);
  const near1 = dummy(run, 330, 0);
  const near2 = dummy(run, 300, 40);
  const far = dummy(run, 300, 300);                     // out of range (90)
  rehash(run);
  applyBurn(run, dying, w, 200);                        // pool 100 over 3 s
  const left = dying.burnDps * dying.burnT;
  queueDamage(run, dying, 50, false, 0, 0, 0, w, KIND_PROC);
  flushDamage(run);
  assert.ok(!dying.alive);
  for (const e of [near1, near2]) {
    assert.ok(e.status & ST.BURN);
    approx(e.burnDps * e.burnT, left * 1.5 / 2, 1e-6);
  }
  assert.equal(far.status, 0);
});

test('Wildfire needs a burning carrier: a plain death spreads nothing', () => {
  const { run, w } = setup();
  own(run, 'wildfire', 3);
  const dying = dummy(run, 300, 0, 5);
  const near = dummy(run, 320, 0);
  rehash(run);
  queueDamage(run, dying, 50, false, 0, 0, 0, w, KIND_PROC);
  flushDamage(run);
  assert.equal(near.status, 0);
});

test('Shatter: a frozen enemy that dies bursts for a share of its max hp', () => {
  const { run, w } = setup();
  own(run, 'shatter', 2);                               // 35%
  const dying = dummy(run, 300, 0, 1000);
  const near = dummy(run, 340, 0);
  const far = dummy(run, 600, 0);
  rehash(run);
  for (let i = 0; i < 4; i++) applyChill(run, dying, w);
  assert.ok(dying.status & ST.FROZEN);
  queueDamage(run, dying, 5000, false, 0, 0, 0, w, KIND_PROC);
  flushDamage(run);
  assert.ok(!dying.alive);
  approx(dealt(near), 350, 1e-6);
  assert.equal(dealt(far), 0);
});

test('Shatter does nothing for a merely chilled enemy', () => {
  const { run, w } = setup();
  own(run, 'shatter', 3);
  const dying = dummy(run, 300, 0, 10);
  const near = dummy(run, 330, 0);
  rehash(run);
  applyChill(run, dying, w);
  queueDamage(run, dying, 50, false, 0, 0, 0, w, KIND_PROC);
  flushDamage(run);
  assert.equal(dealt(near), 0);
});

test('Thunderclap: a shocked enemy that dies fires N bolts at 60% of the killing blow', () => {
  const { run, w } = setup();
  own(run, 'thunderclap', 1);                           // 2 hops
  const dying = dummy(run, 300, 0, 5);
  const row = [1, 2, 3].map((i) => dummy(run, 300 + i * 50, 0));
  rehash(run);
  applyShock(run, dying, w);
  queueDamage(run, dying, 100, false, 0, 0, 0, w, KIND_PROC);
  flushDamage(run);
  assert.ok(!dying.alive);
  approx(dealt(row[0]), 60, 1e-6);
  approx(dealt(row[1]), 60, 1e-6);
  assert.equal(dealt(row[2]), 0, 'only two bolts');
});

test('Quench: burning + chilled consumes both and deals the remaining burn x mult around it', () => {
  const { run, w } = setup();
  own(run, 'quench', 1);                                // x2
  const a = dummy(run, 300, 0);
  const b = dummy(run, 330, 0);
  rehash(run);
  applyBurn(run, a, w, 200);                            // pool 100
  const pool = a.burnDps * a.burnT;
  applyChill(run, a, w);                                // now burning AND chilled
  assert.equal(a.burnT, 0, 'burn consumed');
  assert.equal(a.chill, 0, 'chill consumed');
  assert.equal(a.slowMul, 1);
  flushDamage(run);
  approx(dealt(a), pool * 2, 1e-6);
  approx(dealt(b), pool * 2, 1e-6);
});

test('Quench also triggers in the other order (chill first, then burn)', () => {
  const { run, w } = setup();
  own(run, 'quench', 2);                                // x3
  const a = dummy(run, 300, 0);
  rehash(run);
  applyChill(run, a, w);
  applyBurn(run, a, w, 200);
  assert.equal(a.burnT, 0);
  flushDamage(run);
  approx(dealt(a), 100 * 3, 1e-6);
});

test('Overload: a chain hop that lands on a burning enemy explodes and ignites its surroundings', () => {
  const { run, w } = setup();
  own(run, 'overload', 1);                              // 50% of the hop
  const origin = dummy(run, 300, 0);
  const hot = dummy(run, 360, 0);
  const bystander = dummy(run, 360, 40);
  rehash(run);
  applyBurn(run, hot, w, 10);
  chainArc(run, origin, w, 100, 0);                     // hop damage = 50 (chainDamage 0.5)
  flushDamage(run);
  approx(dealt(hot), 50 + 25, 0.5);                    // the hop, then the explosion (plus a sliver of accrued burn)
  assert.ok(dealt(bystander) >= 25 - 1e-6, 'hit by the explosion');
  assert.ok(bystander.status & ST.BURN, 'and set alight');
});

test('Overload does nothing when the hop lands on a non-burning enemy', () => {
  const { run, w } = setup();
  own(run, 'overload', 2);
  const origin = dummy(run, 300, 0);
  const cold = dummy(run, 360, 0);
  const by = dummy(run, 360, 40);
  rehash(run);
  chainArc(run, origin, w, 100, 0);
  flushDamage(run);
  approx(dealt(cold), 50, 1e-6);
  assert.equal(dealt(by), 0);
});

test('Superconduct: a chilled + shocked target is always crit; level 2 adds crit multiplier', () => {
  const { run, w } = setup();
  run.player.stats.add({ stat: 'critChance', op: 'set', value: 0, source: 't' });
  const e = dummy(run, 300, 0);
  own(run, 'superconduct', 1);
  const base = 100;
  resolveHit(run, w, e, base, 1, 0);
  assert.equal(run.world.dmg.crit[0], 0, 'plain target: no forced crit');
  run.world.dmg.n = 0;
  applyChill(run, e, w);
  applyShock(run, e, w);
  resolveHit(run, w, e, base, 1, 0);
  assert.equal(run.world.dmg.crit[0], 1);
  approx(run.world.dmg.amount[0], base * run.player.stats.getFor('critMult', w.tags));
  run.world.dmg.n = 0;
  levelUpPerk(run, findPerk(run.player, 'superconduct'));
  resolveHit(run, w, e, base, 1, 0);
  approx(run.world.dmg.amount[0], base * (run.player.stats.getFor('critMult', w.tags) + 0.5));
  run.world.dmg.n = 0;
});

test('Headsman: a crit that leaves a non-boss under the threshold kills it; bosses and plain hits are exempt', () => {
  const { run, w } = setup();
  own(run, 'keen_eye', 1);
  own(run, 'headsman', 1);                              // 12%
  const e = dummy(run, 300, 0, 1000);
  e.hp = 130;
  queueDamage(run, e, 20, true, 0, 0, 0, w, KIND_HIT);  // 130 - 20 = 110 -> 11% < 12% : executed
  flushDamage(run);
  assert.ok(!e.alive, 'executed');
  const f = dummy(run, 300, 0, 1000);
  f.hp = 130;
  queueDamage(run, f, 20, false, 0, 0, 0, w, KIND_HIT);
  flushDamage(run);
  assert.ok(f.alive, 'not a crit: no execute');
  const boss = spawnEnemy(run, 'warlord', 400, 0);
  boss.hp = 1000;
  boss.maxHp = 1800;
  queueDamage(run, boss, 20, true, 0, 0, 0, w, KIND_HIT);
  flushDamage(run);
  assert.ok(boss.alive, 'bosses are never executed');
});

test('Headsman is offered only after Keen Eye (or as the Berserker)', () => {
  const st = (over) => ({ classId: 'archer', luck: 0, weapons: [{ weaponId: 'ember_bow', level: 1, instanceId: 1 }], passives: [], perks: [], ownedTags: ['projectile', 'fire'], ...over });
  const ids = (s) => buildCandidates(s).map((c) => c.id);
  assert.ok(!ids(st({})).includes('headsman'));
  assert.ok(ids(st({ perks: [{ id: 'keen_eye', level: 1 }] })).includes('headsman'));
  assert.ok(ids(st({ classId: 'berserker' })).includes('headsman'));
});

test('alloys need BOTH elements: Quench is hidden with only fire, shown with fire + frost', () => {
  const st = (tags) => ({ classId: 'archer', luck: 0, weapons: [], passives: [], perks: [], ownedTags: tags });
  const ids = (s) => buildCandidates(s).map((c) => c.id);
  assert.ok(!ids(st(['fire'])).includes('quench'));
  assert.ok(!ids(st(['frost'])).includes('quench'));
  assert.ok(ids(st(['fire', 'frost'])).includes('quench'));
  assert.ok(ids(st(['fire'])).includes('wildfire'));
  assert.ok(!ids(st([])).includes('wildfire'));
});

// ---- resonance -------------------------------------------------------------------------------

test('resonance: 2 weapons of one element give tier I, 3 give tier II, scoped to those weapons', () => {
  const { run } = setup();                              // ember bow (fire, projectile)
  assert.equal(run.resonance.length, 0);
  const ward = addWeapon(run, 'cinder_ward');           // fire + close
  assert.deepEqual(run.resonance.map((r) => `${r.tag}${r.tier}`), ['fire1']);
  const st = run.player.stats;
  const bow = run.player.weapons[0];
  approx(st.getFor('burnPower', bow.tags), 0.5 + 0.25);
  approx(st.getFor('burnPower', ward.tags), 0.5 + 0.25);
  const rime = addWeapon(run, 'rime_shards');
  approx(st.getFor('burnPower', rime.tags), 0.5, 1e-9);   // not a fire weapon: untouched
  const jav = addWeapon(run, 'storm_javelin');             // projectile x3 with bow + rime + javelin
  assert.ok(run.resonance.some((r) => r.tag === 'projectile' && r.tier === 2));
  assert.equal(st.getFor('pierce', jav.tags) - 0 >= 1, true);
});

test('resonance recomputes cleanly when the weapon set changes (no stacking)', () => {
  const { run } = setup();
  addWeapon(run, 'cinder_ward');
  const before = run.player.stats.getFor('burnPower', run.player.weapons[0].tags);
  addWeapon(run, 'rime_shards');                        // refresh again
  approx(run.player.stats.getFor('burnPower', run.player.weapons[0].tags), before);
});

test('resonance follows evolution: the Storm Volley counts as fire and storm', () => {
  const { run } = setup();
  const jav = addWeapon(run, 'storm_javelin');
  void jav;
  assert.ok(!run.resonance.some((r) => r.tag === 'storm'), 'one storm weapon is not a set');
  const ward = addWeapon(run, 'cinder_ward');
  void ward;
  const bow = run.player.weapons[0];
  addPassive(run, 'wind_sigil');
  run.starsteel = 1;
  bow.level = 8;
  assert.equal(evolve(run, bow, recipesFor(bow)[0]).ok, true);
  assert.ok(run.resonance.some((r) => r.tag === 'storm' && r.tier === 1), 'volley + javelin = Storm I');
  assert.ok(run.resonance.some((r) => r.tag === 'fire' && r.tier === 1), 'volley + ward = Fire I');
});
