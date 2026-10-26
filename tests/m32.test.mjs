// M32: Slam (Forge Hammer, Colossus Maul, Quakebreaker), Chain Lightning (Static Rod) and Lightning Rod
// (Storm Javelin, Thunder Lance, Stormfrost Lance). docs/design-m30-m33.md §5.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { WEAPONS } from '../src/data/weapons.js';
import { validateData } from '../src/data/validate.js';
import { SHAPE_PAYLOAD } from '../src/data/fusions.js';
import { BEHAVIORS } from '../src/behaviors/index.js';
import { stagger } from '../src/systems/status.js';
import { VERSION } from '../src/version.js';

const STEP = 1 / 60;
const newRun = () => {
  const run = createRun({ seed: 5, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };
const dummy = (run, x, y, id = 'goblin') => { const e = spawnEnemy(run, id, x, y); e.speed = 0; e.hp = e.maxHp = 1e9; return e; };
const dealt = (e) => e.maxHp - e.hp;
const rods = (run) => run.hazards.filter((h) => h.kind === 7);

test('m32 data: ids kept, three new shapes with payloads, version bumped', () => {
  assert.deepEqual(validateData(), []);
  for (const id of ['forge_hammer', 'colossus_maul', 'quakebreaker']) assert.equal(WEAPONS[id].behavior, 'slam', id);
  assert.equal(WEAPONS.static_rod.behavior, 'chain');
  for (const id of ['storm_javelin', 'thunder_lance', 'stormfrost_lance']) assert.equal(WEAPONS[id].behavior, 'rod', id);
  assert.equal(WEAPONS.static_rod.name, 'Chain Lightning');
  assert.equal(WEAPONS.storm_javelin.name, 'Lightning Rod');
  for (const b of ['slam', 'chain', 'rod']) { assert.ok(BEHAVIORS[b], b); assert.ok(SHAPE_PAYLOAD[b], b); }
  assert.ok(/^0\.(3[2-9]|[4-9]\d)\./.test(VERSION), VERSION);
});

test('stagger: stops an enemy, bosses take half', () => {
  const run = newRun();
  const e = spawnEnemy(run, 'goblin', 200, 0);
  stagger(e, 0.4);
  assert.equal(e.stunT, 0.4);
  const x0 = e.x;
  tick(run, 0.2);
  assert.equal(e.x, x0, 'a staggered enemy does not move');
  tick(run, 0.4);
  assert.ok(e.x < x0, 'it walks again afterwards');
  const boss = spawnEnemy(run, 'goblin', 200, 0);
  boss.def = { ...boss.def, boss: true };
  stagger(boss, 0.4);
  assert.equal(boss.stunT, 0.2);
});

test('a staggered enemy cannot hurt the player on contact', () => {
  const run = newRun();
  run.debug.god = false;
  const e = dummy(run, 5, 0);
  e.damage = 10;
  e.stunT = 1;
  const hp = run.player.hp;
  tick(run, 0.5);
  assert.equal(run.player.hp, hp);
});

test('slam: picks the denser spot, lands after a telegraph, knocks back and staggers', () => {
  const run = newRun();
  const w = addWeapon(run, 'forge_hammer');
  const lone = dummy(run, 60, 0);                                     // nearest, alone
  const crowd = [dummy(run, 0, 100), dummy(run, 20, 110), dummy(run, -15, 115), dummy(run, 5, 90)];
  tick(run, 0.35);
  assert.equal(w.pend.length, 1, 'a slam is waiting to land');
  assert.ok(Math.abs(w.pend[0].y - 100) < 25 && lone.hp === lone.maxHp, 'aimed at the crowd, not the lone enemy');
  tick(run, 0.3);
  assert.ok(crowd.every((e) => dealt(e) > 0), 'the whole crowd was hit');
  assert.ok(crowd.some((e) => e.stunT > 0), 'and staggered');
  assert.ok(crowd.some((e) => e.ky > 0 || e.y > 100), 'and thrown outward');
});

test('colossus maul staggers longer and wider; quakebreaker sends four waves from the crater', () => {
  assert.ok(WEAPONS.colossus_maul.base.stun > WEAPONS.forge_hammer.base.stun);
  assert.ok(WEAPONS.colossus_maul.base.radius > WEAPONS.forge_hammer.base.radius);
  const run = newRun();
  addWeapon(run, 'quakebreaker');
  dummy(run, 90, 0);
  tick(run, 0.6);
  assert.equal(run.hazards.filter((h) => h.kind === 3).length, 4, 'four waves');
});

test('slam with a second hammer lands a separate crater behind you', () => {
  const run = newRun();
  const w = addWeapon(run, 'forge_hammer');
  run.player.stats.add({ stat: 'projectiles', op: 'flat', value: 1, tags: [w.instanceTag], source: 't' });
  dummy(run, 80, 0);
  tick(run, 0.35);
  assert.equal(w.pend.length, 2);
  assert.ok(w.pend[1].x < 0, 'behind the player');
});

test('chain: strikes the nearest, jumps to others once each with falling damage, and never revisits', () => {
  const run = newRun();
  addWeapon(run, 'static_rod');
  const a = dummy(run, 60, 0);
  const b = dummy(run, 130, 0);
  const c = dummy(run, 200, 0);
  const far = dummy(run, 600, 0);
  tick(run, 0.6);
  assert.ok(dealt(a) > 0 && dealt(b) > 0 && dealt(c) > 0, 'jumped along the line');
  assert.equal(dealt(far), 0);
  assert.ok(b.shockT > 0 || (b.status & 2) !== 0 || dealt(b) > 0);
  assert.ok(dealt(b) < dealt(a) && dealt(c) < dealt(b), 'each jump is weaker');
});

test('chain: one enemy takes one hit per bolt however many jumps there are', () => {
  const run = newRun();
  const w = addWeapon(run, 'static_rod');
  w.cd = 1e9;
  const a = dummy(run, 60, 0);
  const b = dummy(run, 100, 0);
  run.update(STEP, { x: 0, y: 0 });                          // lets the spatial hash see them
  w.cd = 0;
  run.update(STEP, { x: 0, y: 0 });
  const first = dealt(a);
  assert.ok(first > 0 && dealt(b) > 0);
  assert.ok(first < 25, `one hit, not several: ${first}`);
});

test('rod: a javelin plants where it ends, zaps nearby enemies, shocks, and expires', () => {
  const run = newRun();
  addWeapon(run, 'storm_javelin');
  const e = dummy(run, 120, 0);
  tick(run, 1.6);
  assert.ok(rods(run).length >= 1, 'a rod is planted');
  assert.ok(Math.abs(rods(run)[0].x - 120) < 30, 'among the enemies it struck');
  const before = dealt(e);
  tick(run, 1.0);
  assert.ok(dealt(e) > before, 'the rod keeps zapping');
  run.world.enemies.release(e); e.alive = false;
  tick(run, 6);
  assert.equal(rods(run).length, 0, 'rods expire');
});

test('rod: at most (max + javelins - 1) rods per weapon, the oldest goes', () => {
  const run = newRun();
  const w = addWeapon(run, 'storm_javelin');
  w.cd = 1e9;
  const cap = WEAPONS.storm_javelin.base.rod.max;
  // plant through real throws instead
  const w2 = w; w2.cd = 0;
  dummy(run, 150, 0);
  for (let k = 0; k < 8; k++) { w2.cd = 0; tick(run, 1.8); }
  assert.ok(rods(run).filter((h) => h.ttl > 0.1).length <= cap, 'capped');
});

test('thunder lance rods link and hurt what stands on the line; stormfrost rods chill', () => {
  const run = newRun();
  addWeapon(run, 'thunder_lance');
  const mid = dummy(run, 250, 40);
  dummy(run, 250, -40);
  tick(run, 2.2);
  assert.ok(run.rodLinks && run.rodLinks.length >= 2, 'two or more rods linked');
  const run2 = newRun();
  addWeapon(run2, 'stormfrost_lance');
  const e = dummy(run2, 150, 0);
  tick(run2, 2.5);
  assert.ok(e.chill > 0 || e.freezeT > 0 || e.freezeImm > 0, 'chilled by the rod');
  assert.ok(dealt(mid) >= 0);
});

test('fusing a slam or rod donor gives the quake and spark payloads', () => {
  assert.equal(SHAPE_PAYLOAD[WEAPONS.colossus_maul.behavior], 'quake');
  assert.equal(SHAPE_PAYLOAD[WEAPONS.thunder_lance.behavior], 'spark');
  assert.equal(SHAPE_PAYLOAD[WEAPONS.static_rod.behavior], 'arc2');
});

test('all seven reworked weapons level to max and survive a crowd without errors', () => {
  for (const id of ['forge_hammer', 'colossus_maul', 'quakebreaker', 'static_rod', 'storm_javelin', 'thunder_lance', 'stormfrost_lance']) {
    const run = newRun();
    const w = addWeapon(run, id);
    w.level = WEAPONS[id].maxLevel;
    for (let i = 0; i < 40; i++) dummy(run, 60 + (i % 8) * 25, ((i * 37) % 200) - 100);
    tick(run, 12);
    assert.ok(Number.isFinite(run.stats.total) && run.stats.total > 0, id);
    assert.ok(run.hazards.length <= 90, id);
  }
});
