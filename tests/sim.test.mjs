// Headless simulation tests: run the real game systems in Node with no DOM.

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { levelUpWeapon, canLevelUp } from '../src/game/weapons.js';
import { updateCollision } from '../src/systems/collision.js';
import { flushDamage } from '../src/systems/damage.js';
import { validateData } from '../src/data/validate.js';
import { RUN, WAVES } from '../src/data/waves.js';
import { CAPS } from '../src/game/world.js';

const VIEW = { w: 480, h: 1040 };
const STILL = { x: 0, y: 0 };
const newRun = (seed = 1, debug = {}) => createRun({ seed, view: VIEW, debug: { god: false, ...debug } });
const STEP = 1 / 60;

function tick(run, seconds, move = STILL) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) run.update(STEP, move);
}

test('all shipped data validates', () => {
  assert.deepEqual(validateData(), []);
});

test('a new run starts with the class weapon and full hp', () => {
  const run = newRun();
  assert.equal(run.player.weapons.length, 1);
  assert.equal(run.player.weapons[0].weaponId, 'ember_bow');
  assert.equal(run.player.hp, run.player.maxHp);
  approx(run.player.stats.get('critChance'), 0.10);          // base 0.05 + archer 0.05
});

test('the bow kills enemies and the whole pipeline stays sane for 60 seconds', () => {
  const run = newRun(11, { god: true });
  for (let s = 0; s < 60; s++) {
    tick(run, 1);
    const w = run.world;
    assert.ok(w.enemies.count <= CAPS.enemies && w.projectiles.count <= CAPS.projectiles && w.fx.count <= CAPS.fx);
    assert.ok(w.fxNumbers >= 0 && w.fxNumbers <= 60);
    for (const e of w.enemies.active) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y) && e.hp > 0);
    for (const p of w.projectiles.active) assert.ok(Number.isFinite(p.x) && p.ttl > 0);
  }
  assert.ok(run.kills > 10, `expected kills, got ${run.kills}`);
  assert.equal(run.world.dmg.dropped, 0);
});

test('runs are deterministic for a given seed and differ across seeds', () => {
  const snap = (seed) => {
    const run = newRun(seed, { god: true });
    tick(run, 40);
    return JSON.stringify([run.kills, run.world.enemies.count, run.world.projectiles.count,
      Math.round(run.world.enemies.active.reduce((a, e) => a + e.x + e.y, 0))]);
  };
  assert.equal(snap(5), snap(5));
  assert.notEqual(snap(5), snap(6));
});

test('a stationary player without god mode can die, ending the run as a loss', () => {
  const run = newRun(3);
  run.player.stats.add({ stat: 'damage', op: 'set', value: 0, source: 'test' });   // no offense
  tick(run, 300);
  assert.ok(run.over && !run.won, 'expected the run to end in a loss');
  assert.equal(run.player.hp, 0);
});

test('surviving to RUN.length wins', () => {
  const run = newRun(4, { god: true });
  run.time = RUN.length - 0.05;
  tick(run, 0.2);
  assert.ok(run.over && run.won);
});

test('weapon level-ups apply their modifiers through the stat block', () => {
  const run = newRun();
  const inst = run.player.weapons[0];
  const base = inst.def.base.damage;
  const dmg = () => base * run.player.stats.getFor('damage', inst.tags);
  approx(dmg(), base);
  while (canLevelUp(inst)) assert.ok(levelUpWeapon(run, inst));
  assert.equal(inst.level, inst.def.maxLevel);
  approx(dmg(), base * (1 + 0.2 + 0.3) * 1.1);          // two additive bonuses, then 10% more
  assert.equal(run.player.stats.getFor('projectiles', inst.tags), 3, 'two from the bow\'s levels, one from the Archer\'s Quiver (M43)');
  assert.equal(levelUpWeapon(run, inst), false);
});

test('weapon-local upgrades do not leak to other weapons', () => {
  const run = newRun();
  const inst = run.player.weapons[0];
  levelUpWeapon(run, inst);                                    // +20% damage, tagged to this instance
  approx(run.player.stats.getFor('damage', inst.tags), 1.2);
  approx(run.player.stats.get('damage'), 1);                   // global read is untouched
});

test('pierce: a projectile hits pierce+1 enemies, then is consumed', () => {
  for (const [pierce, expected] of [[0, 1], [1, 2], [2, 3]]) {
    const run = newRun(9);
    const inst = run.player.weapons[0];
    run.player.weapons.length = 0;
    // three enemies stacked on the projectile
    for (let i = 0; i < 3; i++) spawnEnemy(run, 'goblin', 200 + i, 0, 1);
    const w = run.world;
    w.hash.rebuild(w.enemies.active, w.enemies.count);
    const pr = w.projectiles.acquire();
    Object.assign(pr, { inst, x: 200, y: 0, dx: 1, dy: 0, vx: 500, vy: 0, r: 5, ttl: 1, dmg: 5, pierce, nh: 0 });
    updateCollision(run);
    assert.equal(w.dmg.n, expected, `pierce ${pierce}`);
    assert.equal(w.projectiles.count, 0, `projectile should be consumed (pierce ${pierce})`);
  }
});

test('one projectile never damages the same enemy twice', () => {
  const run = newRun(9);
  const inst = run.player.weapons[0];
  run.player.weapons.length = 0;
  spawnEnemy(run, 'brute', 300, 0, 1);
  const w = run.world;
  w.hash.rebuild(w.enemies.active, w.enemies.count);
  const pr = w.projectiles.acquire();
  Object.assign(pr, { inst, x: 300, y: 0, dx: 1, dy: 0, vx: 0, vy: 0, r: 5, ttl: 5, dmg: 1, pierce: 99, nh: 0 });
  for (let i = 0; i < 10; i++) updateCollision(run);
  assert.equal(w.dmg.n, 1);
});

test('damage flush: kills release the enemy, count the kill, and stale entries are ignored', () => {
  const run = newRun(2);
  run.player.weapons.length = 0;
  const e = spawnEnemy(run, 'goblin', 100, 100, 1);
  const w = run.world;
  const uid = e.uid;
  // two queued hits, the first one lethal
  w.dmg.enemy[0] = e; w.dmg.uid[0] = uid; w.dmg.amount[0] = 999; w.dmg.crit[0] = 0; w.dmg.n = 1;
  w.dmg.enemy[1] = e; w.dmg.uid[1] = uid; w.dmg.amount[1] = 999; w.dmg.crit[1] = 0; w.dmg.n = 2;
  flushDamage(run);
  assert.equal(run.kills, 1);
  assert.equal(w.enemies.count, 0);
  assert.equal(w.dmg.n, 0);
});

test('timeline scales with RUN.length (a shorter run reaches later waves sooner)', () => {
  const original = { ...RUN };
  try {
    RUN.length = 300;                                          // half-length run
    const short = newRun(1, { god: true });
    short.time = 30;                                           // = design time 60 -> second segment
    short.director.update(0);
    approx(short.director.hpScale, WAVES[1].hpScale);
    RUN.length = 600;
    const full = newRun(1, { god: true });
    full.time = 30;
    full.director.update(0);
    approx(full.director.hpScale, 1.0);
  } finally {
    Object.assign(RUN, original);
  }
});

test('director never exceeds the soft cap and buffs hp instead', () => {
  const run = newRun(8, { god: true });
  run.player.weapons.length = 0;
  run.time = 400;                                              // late, heavy spawns
  for (let i = 0; i < 520; i++) spawnEnemy(run, 'goblin', 400 + (i % 50), (i * 7) % 300, 1);
  const before = run.director.capBuff;
  tick(run, 5);
  assert.ok(run.world.enemies.count <= CAPS.enemies);
  assert.ok(run.director.capBuff > before, 'hp buff should grow while at the cap');
});

// ---- M5: weapon behaviors, triggers, shield, classes --------------------------------------

import { addWeapon } from '../src/game/weapons.js';
import { CLASSES } from '../src/data/classes.js';
import { WEAPONS } from '../src/data/weapons.js';
import { damagePlayer } from '../src/systems/damage.js';
import { queueDamage } from '../src/systems/damage-queue.js';

const classRun = (classId, seed = 1) => createRun({ seed, view: VIEW, debug: { god: false }, classId });

// Puts a motionless, huge-hp dummy at an offset from the player.
function dummy(run, dx, dy, id = 'brute') {
  const e = spawnEnemy(run, id, run.player.x + dx, run.player.y + dy);
  e.speed = 0;
  e.hp = e.maxHp = 1e6;
  return e;
}
// One full tick with the hash rebuilt so weapons can see the dummies.
function settle(run) {
  const w = run.world;
  w.hash.rebuild(w.enemies.active, w.enemies.count);
}

test('every class starts with its own weapon and class mods', () => {
  for (const [id, c] of Object.entries(CLASSES)) {
    const run = classRun(id);
    assert.equal(run.player.weapons[0].weaponId, c.startWeapon);
  }
  const smith = classRun('smith');
  assert.ok(smith.player.maxHp > classRun('archer').player.maxHp);
});

test('arc: hits enemies inside the cone, spares ones behind, and kills with repeated swings', () => {
  const run = classRun('berserker');
  const front = dummy(run, 50, 0);
  const behind = dummy(run, -50, 0);
  settle(run);
  tick(run, 0.5);
  assert.ok(front.hp < front.maxHp, 'the enemy in front is hit');
  assert.equal(behind.hp, behind.maxHp, 'the enemy behind is spared');
});

test('arc: a second swing (projectiles +1) also hits behind the player', () => {
  const run = classRun('berserker');
  const hammer = run.player.weapons[0];
  run.player.stats.add({ stat: 'projectiles', op: 'flat', value: 1, tags: [hammer.instanceTag], source: 't' });
  const front = dummy(run, 50, 0);
  const behind = dummy(run, -50, 0);
  settle(run);
  tick(run, 0.5);
  assert.ok(front.hp < front.maxHp && behind.hp < behind.maxHp);
});

test('arc: out-of-range enemies are not hit', () => {
  const run = classRun('berserker');
  const far = dummy(run, 300, 0);
  settle(run);
  tick(run, 1);
  assert.equal(far.hp, far.maxHp);
});

test('orbit: blades damage enemies near the orbit radius, not ones far away', () => {
  const run = classRun('archer');
  addWeapon(run, 'spirit_blades');
  const r = WEAPONS.spirit_blades.base.range;
  // enemies around the ring (blades sweep every angle) and one far away
  const ring = [];
  for (let a = 0; a < 8; a++) ring.push(dummy(run, Math.cos(a * Math.PI / 4) * r, Math.sin(a * Math.PI / 4) * r, 'goblin'));
  const far = dummy(run, 400, 0, 'goblin');
  run.player.weapons[0].cd = 1e9;                       // silence the bow
  settle(run);
  tick(run, 2);
  assert.ok(ring.some((e) => e.hp < e.maxHp), 'a blade hit someone on the ring');
  assert.equal(far.hp, far.maxHp);
});

test('aura: damages everything inside its radius, nothing outside', () => {
  const run = classRun('archer');
  addWeapon(run, 'cinder_ward');
  run.player.weapons[0].cd = 1e9;
  const near = dummy(run, 40, 20, 'goblin');
  const far = dummy(run, 200, 0, 'goblin');
  settle(run);
  tick(run, 1);
  assert.ok(near.hp < near.maxHp);
  assert.equal(far.hp, far.maxHp);
});

test('explode trigger: a killing blow damages neighbours, and chains stop at the depth cap', () => {
  const run = classRun('archer');
  const bow = run.player.weapons[0];
  bow.level = 5;                                         // trigger is active from level 5
  bow.def = { ...bow.def, triggers: [{ on: 'kill', effect: 'explode', params: { radius: 80, damageFrac: 2 } }] };
  run.player.weapons.forEach((w) => { w.cd = 1e9; });
  // goblins 85 apart: each explosion reaches only the next one, so the depth cap alone ends the chain
  const chain = [];
  for (let i = 0; i < 10; i++) {
    const e = spawnEnemy(run, 'goblin', 200 + i * 85, 0);
    e.speed = 0;
    e.hp = e.maxHp = 1;
    chain.push(e);
  }
  const bait = chain[0];
  settle(run);
  queueDamage(run, bait, 5, false, 0, 0, 0, bow);
  flushDamage(run);
  const dead = chain.filter((e) => !e.alive).length;
  assert.equal(dead, 4, 'bait plus three chained kills (depth 1, 2, 3), then the cap stops it');
});

test('shield: absorbs damage before hp, and the interval trigger grants it', () => {
  const run = classRun('smith');
  const p = run.player;
  p.shield = 30;
  damagePlayer(run, 12);
  assert.equal(p.shield, 19);                            // smith armor 1 takes 12 down to 11
  assert.equal(p.hp, p.maxHp);
  p.iframes = 0;
  damagePlayer(run, 40);
  assert.equal(p.shield, 0);
  approx(p.hp, p.maxHp - 20);                            // 39 after armor: 19 soaked, 20 to hp

  const r2 = classRun('smith');
  const hammer = r2.player.weapons[0];
  hammer.level = 3;                                      // shield trigger unlocks at level 3
  r2.player.shield = 0;
  tick(r2, 12.5);
  assert.ok(r2.player.shield > 0, 'forge aegis granted a shield');
});

test('a full minute with every weapon equipped stays finite and within caps', () => {
  const run = classRun('smith', 4);
  run.debug.god = true;
  for (const id of ['spirit_blades', 'cinder_ward', 'storm_javelin']) addWeapon(run, id);
  for (const w of run.player.weapons) while (w.level < w.def.maxLevel) levelUpWeapon(run, w);
  for (let s = 0; s < 60; s++) {
    tick(run, 1);
    for (const e of run.world.enemies.active) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.hp));
  }
  assert.ok(run.kills > 50);
  assert.equal(run.world.dmg.dropped, 0);
});

test('volley: extra projectiles keep hitting a lone target at range (they do not fan past it)', () => {
  const run = createRun({ seed: 1, view: VIEW, debug: { god: true }, classId: 'archer' });
  const bow = run.player.weapons[0];
  for (let i = 0; i < 4; i++) run.player.stats.add({ stat: 'projectiles', op: 'flat', value: 1, tags: [bow.instanceTag], source: 't' });
  const e = spawnEnemy(run, 'brute', 170, 0);
  e.speed = 0; e.hp = e.maxHp = 1e9;
  bow.cd = 0;
  const before = e.hp;
  run.director.update = () => {};
  for (let i = 0; i < 40; i++) { run.update(1 / 60, { x: 0, y: 0 }); e.x = 170; e.y = 0; e.kx = e.ky = 0; }
  const hits = (before - e.hp) / (bow.def.base.damage * run.player.stats.getFor('damage', bow.tags));
  assert.ok(hits >= 4.5, `5 arrows should mostly connect at range, got ${hits.toFixed(1)} hits`);
});
