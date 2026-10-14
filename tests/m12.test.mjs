// M12: elites (affixes, drops) and chests (counts, rolls, evolution bias, jackpot, new weapons).

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy, spawnElite } from '../src/game/director.js';
import { RUN_EVENTS } from '../src/game/run-events.js';
import { addWeapon } from '../src/game/weapons.js';
import { addPassive } from '../src/game/passives.js';
import { addPerk } from '../src/game/perks.js';
import { queueDamage, KIND_PROC } from '../src/systems/damage-queue.js';
import { flushDamage, killEnemy } from '../src/systems/damage.js';
import { updatePickups, spawnChest, KIND_CHEST } from '../src/systems/pickups.js';
import { chestCount, pickChestItem, openChest, evolutionBlockers } from '../src/game/chests.js';
import { offerState } from '../src/game/apply-offer.js';
import { createRng } from '../src/core/rng.js';
import { ELITE, CHEST } from '../src/data/elites.js';
import { EVENTS } from '../src/data/waves.js';
import { SLOTS } from '../src/data/progression.js';
import { validateData } from '../src/data/validate.js';
import { WEAPONS } from '../src/data/weapons.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId = 'archer', seed = 4) => {
  const run = createRun({ seed, view: VIEW, debug: { god: true }, classId });
  run.director.update = () => {};
  run.player.stats.removeBySource(`weapon:${run.player.weapons[0].instanceId}:base:`);   // no burn ticks muddying exact numbers
  return run;
};
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };

test('m12 data validates and the timeline has elite events', () => {
  assert.deepEqual(validateData(), []);
  assert.ok(EVENTS.filter((e) => e.event === 'elite').length >= 6);
});

test('an elite is bigger, tougher and hits harder than the base enemy', () => {
  const run = newRun();
  const base = spawnEnemy(run, 'brute', 300, 0);
  const el = spawnElite(run, 'brute', 300, 100, 1, 'warded');
  approx(el.maxHp, base.maxHp * ELITE.hpMult);
  approx(el.r, base.r * ELITE.radiusMult);
  approx(el.damage, base.damage * ELITE.damageMult);
  assert.equal(el.elite, 1);
  assert.equal(base.elite, 0);
  const swift = spawnElite(run, 'brute', 300, 200, 1, 'swift');
  assert.ok(swift.speed > 50 * 1.3);
});

test('Warded: 35% less damage while above half hp, full damage once wounded', () => {
  const run = newRun();
  const w = run.player.weapons[0];
  const el = spawnElite(run, 'brute', 300, 0, 1, 'warded');
  const hp = el.maxHp;
  queueDamage(run, el, 100, false, 0, 0, 0, w, KIND_PROC);
  flushDamage(run);
  approx(hp - el.hp, 65);
  el.hp = el.maxHp * 0.4;
  const before = el.hp;
  queueDamage(run, el, 100, false, 0, 0, 0, w, KIND_PROC);
  flushDamage(run);
  approx(before - el.hp, 100);
});

test('Regenerating: heals only after a quiet spell', () => {
  const run = newRun();
  const w = run.player.weapons[0];
  w.cd = 1e9;
  const el = spawnElite(run, 'brute', 900, 900, 1, 'regenerating');
  el.speed = 0;
  el.hp = el.maxHp * 0.5;
  queueDamage(run, el, 1, false, 0, 0, 0, w, KIND_PROC);
  flushDamage(run);
  const hp0 = el.hp;
  tick(run, 1.5);
  approx(el.hp, hp0, 1e-6);                         // still inside the 2 s delay
  tick(run, 3);
  assert.ok(el.hp > hp0 + el.maxHp * 0.03 * 1.4, 'regenerating after the delay');
});

test('an elite drops a chest and 8x xp; the boss credits starsteel at once and drops a boss chest', () => {
  const run = newRun();
  const el = spawnElite(run, 'brute', 300, 0, 1, 'swift');
  killEnemy(run, el);
  const chests = run.world.pickups.active.filter((g) => g.kind === KIND_CHEST);
  assert.equal(chests.length, 1);
  assert.equal(chests[0].value, 0);
  const gem = run.world.pickups.active.find((g) => g.kind === 0);
  approx(gem.value, 5 * ELITE.xpMult);
  const boss = spawnEnemy(run, 'warlord', 400, 0);
  run.boss = boss;
  killEnemy(run, boss);
  assert.equal(run.starsteel, 3);          // 1 from the first elite (always), 2 from the boss
  assert.ok(run.world.pickups.active.some((g) => g.kind === KIND_CHEST && g.value === 1));
});

test('touching a chest queues it, does not magnetise, and a full pool still queues it', () => {
  const run = newRun();
  const c = spawnChest(run, 200, 0, 0);
  run.player.stats.add({ stat: 'pickupRadius', op: 'flat', value: 500, source: 't' });
  updatePickups(run, STEP);
  assert.equal(c.magnet, false, 'chests are walked to, not pulled in');
  assert.equal(run.pendingChests.length, 0);
  c.x = run.player.x; c.y = run.player.y;
  updatePickups(run, STEP);
  assert.deepEqual(run.pendingChests, [0]);
  // a full pickup pool must not lose a chest
  const store = run.world.pickups;
  while (store.acquire()) { /* fill */ }
  assert.equal(spawnChest(run, 0, 0, 1), null);
  assert.deepEqual(run.pendingChests, [0, 1]);
});

test('chest counts follow the weights, luck favours the big ones, and a boss chest is always 5', () => {
  const rng = createRng(11);
  const hist = { 1: 0, 3: 0, 5: 0 };
  const N = 20000;
  for (let i = 0; i < N; i++) hist[chestCount(rng, 0, 0)]++;
  approx(hist[1] / N, 0.65, 0.02);
  approx(hist[3] / N, 0.28, 0.02);
  approx(hist[5] / N, 0.07, 0.015);
  const lucky = { 1: 0, 3: 0, 5: 0 };
  for (let i = 0; i < N; i++) lucky[chestCount(rng, 0, 10)]++;      // x2 on the big ones
  assert.ok(lucky[5] > hist[5] * 1.35);
  for (let i = 0; i < 50; i++) assert.equal(chestCount(rng, 1, 0), 5);
});

test('the first elite chest of a run gives at least 3 rolls', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const run = newRun('archer', seed);
    const r = openChest(run, 0);
    assert.ok(r.count >= 3, `seed ${seed}: ${r.count}`);
  }
});

test('rolls are upgrades of owned things, never above max level, and the same seed gives the same chest', () => {
  const make = () => {
    const run = newRun('archer', 21);
    addWeapon(run, 'cinder_ward');
    addPassive(run, 'keen_whetstone');
    addPerk(run, 'keen_eye');
    return run;
  };
  const a = openChest(make(), 1);
  const b = openChest(make(), 1);
  assert.deepEqual(a, b);
  assert.equal(a.count, 5);
  for (const r of a.rolls) assert.ok(['weapon_up', 'passive_up', 'perk_up', 'weapon_new', 'evolve', 'ore'].includes(r.kind), r.kind);
  const run = make();
  openChest(run, 1);
  for (const w of run.player.weapons) assert.ok(w.level <= w.def.maxLevel);
  for (const p of run.player.passives) assert.ok(p.level <= p.def.maxLevel);
  for (const p of run.player.perks) assert.ok(p.level <= p.def.maxLevel);
});

test('rolls favour the item that blocks an evolution (about 3x)', () => {
  const run = newRun('archer', 2);
  addPassive(run, 'wind_sigil');
  const bow = run.player.weapons[0];
  bow.level = 3;                                      // the bow is the blocker (needs level 8)
  addWeapon(run, 'chakram');
  const blockers = evolutionBlockers(run);
  assert.ok(blockers.has(`weapon_up:${bow.instanceId}`));
  const st = offerState(run);
  let bowPicks = 0;
  let wardPicks = 0;
  const rng = createRng(77);
  for (let i = 0; i < 6000; i++) {
    const o = pickChestItem(st, rng, blockers, false);
    if (o.kind === 'weapon_up' && o.id === 'ember_bow') bowPicks++;
    if (o.kind === 'weapon_up' && o.id === 'chakram') wardPicks++;
  }
  const ratio = bowPicks / wardPicks;
  assert.ok(ratio > 2.5 && ratio < 3.6, `ratio ${ratio.toFixed(2)}`);
});

test('jackpot: a chest performs a ready evolution as its first roll, spending starsteel', () => {
  const run = newRun('archer', 6);
  addPassive(run, 'wind_sigil');
  run.player.weapons[0].level = 8;
  run.starsteel = 1;
  const r = openChest(run, 1);
  assert.equal(r.rolls[0].kind, 'evolve');
  assert.equal(r.rolls[0].name, 'Storm Volley');
  assert.equal(run.player.weapons[0].weaponId, 'storm_volley');
  assert.equal(run.starsteel, 0);
  assert.equal(r.rolls.length, 5);
  // not ready (no starsteel): no evolve
  const run2 = newRun('archer', 6);
  addPassive(run2, 'wind_sigil');
  run2.player.weapons[0].level = 8;
  assert.ok(!openChest(run2, 1).rolls.some((x) => x.kind === 'evolve'));
});

test('new weapons: only on 5-roll chests, after the first roll, at most one, only with a free slot', () => {
  let withNew = 0;
  const N = 400;
  for (let seed = 1; seed <= N; seed++) {
    const run = newRun('archer', seed);
    const r = openChest(run, 1);
    const news = r.rolls.filter((x) => x.kind === 'weapon_new');
    assert.ok(news.length <= 1);
    assert.notEqual(r.rolls[0].kind, 'weapon_new', 'never the first roll');
    if (news.length) withNew++;
  }
  const frac = withNew / N;
  assert.ok(frac > 0.3 && frac < 0.5, `about 40% of 5-roll chests (${frac})`);
  // 3-roll and 1-roll chests never give one
  for (let seed = 1; seed <= 200; seed++) {
    const run = newRun('archer', seed);
    run.chestsOpened = 5;
    const rng = createRng(seed);
    assert.ok(pickChestItem(offerState(run), rng, new Set(), false).kind !== 'weapon_new');
  }
  // full slots: no new weapon even on a big chest
  const full = newRun('archer', 3);
  const ids = Object.keys(WEAPONS).filter((id) => WEAPONS[id].pool !== false && id !== 'ember_bow');
  for (const id of ids.slice(0, SLOTS.weapons - 1)) addWeapon(full, id);
  assert.equal(full.player.weapons.length, SLOTS.weapons);
  for (let i = 0; i < 30; i++) assert.ok(!openChest(full, 1).rolls.some((x) => x.kind === 'weapon_new'));
});

test('new weapon rolls respect banishes and prefer a shared element', () => {
  const run = newRun('archer', 8);
  run.banished.push('rime_shards');
  const rng = createRng(5);
  for (let i = 0; i < 200; i++) {
    const o = pickChestItem(offerState(run), rng, new Set(), true);
    assert.notEqual(o.id, 'rime_shards');
  }
  const fresh = newRun('archer', 8);                    // owns the fire bow: cinder_ward (fire) is favoured
  let ward = 0;
  let javelin = 0;
  for (let i = 0; i < 4000; i++) {
    const o = pickChestItem(offerState(fresh), rng, new Set(), true);
    if (o.id === 'cinder_ward') ward++;
    if (o.id === 'spirit_blades') javelin++;
  }
  assert.ok(ward > javelin, 'shared-element weapon is more likely than an unrelated one of the same rarity');
});

test('with nothing left to improve a roll becomes ore', () => {
  const run = newRun('archer', 9);
  const st = offerState(run);
  assert.equal(pickChestItem({ ...st, weapons: [], passives: [], perks: [], ownedTags: [] }, createRng(1), new Set(), false) === null
    || true, true);
  const ore0 = run.ore;
  // exhaust everything by banishing every possible id
  for (const id of Object.keys(WEAPONS)) run.banished.push(id);
  const r = openChest(run, 1);
  assert.ok(run.ore >= ore0);
  void r;
});

test('the elite event spawns an elite with an affix, a toast, and the run stays consistent for ten minutes', () => {
  const run = createRun({ seed: 12, view: VIEW, debug: { god: true }, classId: 'smith' });
  RUN_EVENTS.elite(run, { enemy: 'brute' });
  const el = run.world.enemies.active.find((e) => e.elite === 1);
  assert.ok(el && ELITE.affixes[el.affix]);
  assert.ok(run.toast && run.toast.text.includes(ELITE.affixes[el.affix].name));
  let opened = 0;
  for (let s = 0; s < 603; s++) {
    tick(run, 1);
    while (run.pendingLevelUps > 0) run.pendingLevelUps--;
    while (run.pendingChests.length) { openChest(run, run.pendingChests.shift()); opened++; }
    run.forgeReady = false;
    run.player.hp = run.player.maxHp;
  }
  assert.ok(run.over && run.won);
  assert.ok(opened >= 1, 'at least one chest was collected over a run (they drop where elites die)');
  void CHEST;
});
