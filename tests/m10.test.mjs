// M10: statuses (burn, chill/freeze, shock chain), hit kinds, target multipliers, Rime Shards.

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { queueDamage, KIND_HIT, KIND_PROC, KIND_DOT } from '../src/systems/damage-queue.js';
import { flushDamage } from '../src/systems/damage.js';
import { applyBurn, applyChill, applyShock, updateStatuses, chainArc } from '../src/systems/status.js';
import { ST } from '../src/data/statuses.js';
import { validateData } from '../src/data/validate.js';
import { WEAPONS } from '../src/data/weapons.js';
import { recipesFor, evolve } from '../src/game/evolution.js';
import { addPassive } from '../src/game/passives.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId = 'archer') => {
  const run = createRun({ seed: 3, view: VIEW, debug: { god: true }, classId });
  run.director.update = () => {};
  return run;
};
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };
const dummy = (run, x = 300, y = 0, id = 'brute') => {
  const e = spawnEnemy(run, id, x, y);
  e.speed = 0;
  e.hp = e.maxHp = 1e9;
  return e;
};
// strip the start weapon's own elemental mods so tests control every chance explicitly
const bareRun = () => {
  const run = newRun();
  const w = run.player.weapons[0];
  run.player.stats.removeBySource(`weapon:${w.instanceId}:base:`);
  w.cd = 1e9;
  return { run, w };
};
const rehash = (run) => run.world.hash.rebuild(run.world.enemies.active, run.world.enemies.count);

test('m10 data validates', () => {
  assert.deepEqual(validateData(), []);
});

test('weapons carry their element: bow burns, javelin shocks, volley both; evolve swaps base mods', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  const st = run.player.stats;
  approx(st.getFor('burnChance', bow.tags), 0.35);
  approx(st.getFor('shockChance', bow.tags), 0);
  const jav = addWeapon(run, 'storm_javelin');
  approx(st.getFor('shockChance', jav.tags), 0.5);
  approx(st.getFor('burnChance', jav.tags), 0);
  addPassive(run, 'wind_sigil');
  run.starsteel = 1;
  bow.level = 8;
  assert.equal(evolve(run, bow, recipesFor(bow)[0]).ok, true);
  approx(st.getFor('burnChance', bow.tags), 0.3);
  approx(st.getFor('shockChance', bow.tags), 0.3);
  assert.ok(bow.tags.set.has('storm') && bow.tags.set.has('fire'));
});

test('burn: applications add to one pool, and the total damage dealt equals the pool', () => {
  const { run, w } = bareRun();
  const e = dummy(run);
  applyBurn(run, e, w, 100);                    // burnPower 0.5 -> 50 over 3 s
  tick(run, 1);
  applyBurn(run, e, w, 100);                    // +50 on top of what is left
  const dps = e.burnDps;
  assert.ok(e.status & ST.BURN);
  tick(run, 4);
  assert.equal(e.burnT <= 0, true);
  assert.equal(e.status, 0, 'burn over: the enemy is untouched again');
  approx(1e9 - e.hp, 100, 100 * 0.01);           // 50 + 50, within 1%
  assert.ok(dps > 0);
});

test('chill: stacks slow, 4 stacks freeze, then the enemy is freeze-immune', () => {
  const { run, w } = bareRun();
  const e = dummy(run);
  applyChill(run, e, w);
  approx(e.slowMul, 0.9);
  applyChill(run, e, w);
  applyChill(run, e, w);
  approx(e.slowMul, 0.7);
  assert.equal(e.freezeT, 0);
  applyChill(run, e, w);
  assert.ok(e.freezeT > 0 && e.slowMul === 0 && (e.status & ST.FROZEN), 'frozen');
  tick(run, 1.1);
  assert.equal(e.freezeT, 0, 'thawed');
  for (let i = 0; i < 8; i++) applyChill(run, e, w);
  assert.equal(e.freezeT, 0, 'immune right after a thaw');
  assert.ok(e.chill <= 3);
  tick(run, 4);
  for (let i = 0; i < 4; i++) applyChill(run, e, w);
  assert.ok(e.freezeT > 0, 'can freeze again once immunity ends');
});

test('chill: frozen enemies do not move, bosses never freeze and cap at 2 stacks', () => {
  const { run, w } = bareRun();
  const e = spawnEnemy(run, 'goblin', 200, 0);
  e.hp = e.maxHp = 1e9;
  for (let i = 0; i < 4; i++) applyChill(run, e, w);
  const x0 = e.x;
  tick(run, 0.5);
  approx(e.x, x0, 0.5);
  const boss = spawnEnemy(run, 'warlord', 400, 0);
  for (let i = 0; i < 10; i++) applyChill(run, boss, w);
  assert.equal(boss.freezeT, 0);
  assert.equal(boss.chill, 2);
  approx(boss.slowMul, 0.8);
});

test('shock chain: hops are limited by chains, never repeat, and shock their targets', () => {
  const { run, w } = bareRun();
  run.player.stats.add({ stat: 'chains', op: 'flat', value: 2, tags: [w.instanceTag], source: 't' });   // 1 + 2 = 3 hops
  const row = [0, 1, 2, 3, 4, 5].map((i) => dummy(run, 300 + i * 50, 0, 'goblin'));
  for (const e of row) e.hp = e.maxHp = 1000;
  rehash(run);
  chainArc(run, row[0], w, 100, 0);
  flushDamage(run);
  const hit = row.filter((e) => e.hp < 1000);
  assert.deepEqual(hit.map((e) => row.indexOf(e)), [1, 2, 3], 'three hops down the line, none back');
  for (const e of hit) { approx(e.hp, 1000 - 50); assert.ok(e.status & ST.SHOCK); }
  assert.equal(row[0].hp, 1000, 'the origin is not hit by its own chain');
});

test('shock chain stops when nothing is in range, and hops do not chain again', () => {
  const { run, w } = bareRun();
  const a = dummy(run, 300, 0, 'goblin');
  const b = dummy(run, 360, 0, 'goblin');
  const far = dummy(run, 900, 0, 'goblin');
  for (const e of [a, b, far]) e.hp = e.maxHp = 1000;
  run.player.stats.add({ stat: 'shockChance', op: 'flat', value: 1, tags: [w.instanceTag], source: 't' });
  rehash(run);
  queueDamage(run, a, 10, false, 0, 0, 0, w, KIND_HIT);
  flushDamage(run);
  assert.ok(b.hp < 1000, 'the neighbour was hit');
  assert.equal(far.hp, 1000, 'out of range');
  const nb = b.hp;
  queueDamage(run, a, 10, false, 0, 0, 0, w, KIND_PROC);     // triggered damage never chains
  flushDamage(run);
  assert.equal(b.hp, nb);
});

test('a shock that kills still chains (overkill does not waste the arc)', () => {
  const { run, w } = bareRun();
  const a = dummy(run, 300, 0, 'goblin');
  const b = dummy(run, 350, 0, 'goblin');
  a.hp = a.maxHp = 1;
  b.hp = b.maxHp = 1000;
  run.player.stats.add({ stat: 'shockChance', op: 'flat', value: 1, tags: [w.instanceTag], source: 't' });
  rehash(run);
  queueDamage(run, a, 50, false, 0, 0, 0, w, KIND_HIT);
  flushDamage(run);
  assert.ok(!a.alive);
  assert.ok(b.hp < 1000);
});

test('burn damage (DOT) gives no lifesteal and no hit triggers, but a burn kill still fires kill triggers', () => {
  const { run, w } = bareRun();
  run.player.stats.add({ stat: 'lifesteal', op: 'flat', value: 1, source: 't' });
  run.player.hp = 50;
  w.extraTriggers.push({ on: 'hit', effect: 'shield', params: { amount: 7 } });
  w.extraTriggers.push({ on: 'kill', effect: 'shield', params: { amount: 11 } });
  const e = dummy(run, 300, 0, 'goblin');
  e.hp = e.maxHp = 5;
  queueDamage(run, e, 2, false, 0, 0, 0, w, KIND_DOT);
  flushDamage(run);
  assert.equal(run.player.hp, 50, 'no lifesteal from DOT');
  assert.equal(run.player.shield, 0, 'no hit trigger from DOT');
  queueDamage(run, e, 10, false, 0, 0, 0, w, KIND_DOT);
  flushDamage(run);
  assert.equal(run.player.shield, 11, 'the kill trigger fired');
  assert.equal(run.kills, 1);
});

test('vsBurning / vsChilled / vsShocked multiply only against targets with that status', () => {
  const { run, w } = bareRun();
  const st = run.player.stats;
  st.add({ stat: 'vsBurning', op: 'inc', value: 1, tags: [w.instanceTag], source: 't' });   // x2
  st.add({ stat: 'vsChilled', op: 'inc', value: 0.5, tags: [w.instanceTag], source: 't' }); // x1.5
  const plain = dummy(run, 300, 0);
  const hot = dummy(run, 400, 0);
  const both = dummy(run, 500, 0);
  applyBurn(run, hot, w, 1);
  applyBurn(run, both, w, 1);
  applyChill(run, both, w);
  for (const e of [plain, hot, both]) queueDamage(run, e, 100, false, 0, 0, 0, w, KIND_PROC);
  flushDamage(run);
  approx(1e9 - plain.hp, 100);
  approx(1e9 - hot.hp, 200);
  approx(1e9 - both.hp, 300);
  assert.equal(st.conditional.vsBurning, 0, 'still cached: no `when` modifiers');
});

test('an untouched enemy has status 0 and a status-free run never ticks any', () => {
  const run = newRun();
  const e = dummy(run);
  assert.equal(e.status, 0);
  tick(run, 2);
  assert.equal(e.status, 0);
});

test('applying statuses through real hits: a bow with 100% burn chance ignites on hit', () => {
  const { run, w } = bareRun();
  run.player.stats.add({ stat: 'burnChance', op: 'flat', value: 1, tags: [w.instanceTag], source: 't' });
  const e = dummy(run, 160, 0);
  w.cd = 0;
  rehash(run);
  tick(run, 1);
  assert.ok(e.burnT > 0 || e.hp < 1e9, 'the arrow landed');
  assert.ok(e.status & ST.BURN || e.burnT > 0);
});

test('nova: fires count shards evenly around the circle only when an enemy is in range', () => {
  const run = newRun();
  run.player.weapons.length = 0;
  const rs = addWeapon(run, 'rime_shards');
  tick(run, 1);
  assert.equal(run.world.projectiles.count, 0, 'no enemy in range, no volley');
  dummy(run, 100, 0);
  rehash(run);
  rs.cd = 0;
  run.update(STEP, { x: 0, y: 0 });
  assert.equal(run.world.projectiles.count, 6);
  const angles = run.world.projectiles.active.map((p) => Math.atan2(p.dy, p.dx)).sort((a, b) => a - b);
  const gaps = angles.slice(1).map((a, i) => a - angles[i]);
  for (const g of gaps) approx(g, Math.PI / 3, 0.01);
});

test('Rime Shards freeze an enemy that two volleys hit', () => {
  const run = newRun();
  run.player.weapons.length = 0;
  const rs = addWeapon(run, 'rime_shards');
  const e = dummy(run, 30, 0);
  let froze = false;
  for (let i = 0; i < 60 * 6 && !froze; i++) {
    run.update(STEP, { x: 0, y: 0 });
    e.x = 30; e.y = 0;
    if (e.freezeT > 0) froze = true;
  }
  assert.ok(froze, 'frozen within six seconds');
  void rs;
});

test('timers: chill wears off, shock expires, the slow comes back to 1', () => {
  const { run, w } = bareRun();
  const e = dummy(run);
  applyChill(run, e, w);
  applyShock(run, e, w);
  tick(run, 3);
  assert.equal(e.chill, 0);
  assert.equal(e.slowMul, 1);
  assert.equal(e.status, 0);
  void updateStatuses;
});
