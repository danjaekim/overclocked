// M36: class identity. Every class has a trait (data/classes.js `trait`, game/class-traits.js): a
// mechanic that works with whatever weapons you hold, so the same build plays differently per class.

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { resolveHit } from '../src/game/hit.js';
import { param } from '../src/game/weapon-params.js';
import { damagePlayer, flushDamage } from '../src/systems/damage.js';
import { enhance } from '../src/game/forge.js';
import { CLASSES } from '../src/data/classes.js';
import { snapshotRun, restoreRun } from '../src/game/run-snapshot.js';

const STEP = 1 / 60;
const VIEW = { w: 480, h: 1040 };
const newRun = (classId, god = true) => {
  const run = createRun({ seed: 3, view: VIEW, debug: { god }, classId });
  run.director.update = () => {};
  return run;
};
const dummy = (run, x, y, hp = 1e9) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = hp; return e; };
const rehash = (run) => run.world.hash.rebuild(run.world.enemies.active, run.world.enemies.count);
const noCrit = (run) => run.player.stats.add({ stat: 'critChance', op: 'set', value: 0, source: 't' });
const lastAmount = (run) => run.world.dmg.amount[run.world.dmg.n - 1];

test('m36 data: every class has a named trait with text lines', () => {
  for (const [id, c] of Object.entries(CLASSES)) {
    assert.ok(c.trait && c.trait.name && Array.isArray(c.trait.text) && c.trait.text.length >= 2, id);
  }
});

test('Archer Long Shot: a far hit deals up to 50% more than a near one; other classes see no difference', () => {
  for (const [cls, want] of [['archer', 1.5], ['smith', 1]]) {
    const run = newRun(cls);
    noCrit(run);
    if (cls === 'smith') run.trait = { ...run.trait, heavyBlows: { chance: 0, stun: 0, vsStunned: 0 } };
    const w = run.player.weapons[0];
    const near = dummy(run, 40, 0);
    const far = dummy(run, 400, 0);
    resolveHit(run, w, near, 100, 1, 0);
    const a = lastAmount(run);
    resolveHit(run, w, far, 100, 1, 0);
    approx(lastAmount(run) / a, want, 1e-9);
    run.world.dmg.n = 0;
  }
});

test('Archer Fleet: weapons attack faster while moving; Evasion: about a quarter of hits miss', () => {
  const run = newRun('archer', false);
  const w = run.player.weapons[0];
  run.player.moving = false;
  const still = param(run, w, 'cooldown');
  run.player.moving = true;
  approx(param(run, w, 'cooldown') / still, 0.85, 1e-9);
  let dodged = 0;
  for (let i = 0; i < 2000; i++) {
    run.player.iframes = 0; run.player.hp = 1e6;
    const before = run.player.hp;
    damagePlayer(run, 5);
    if (run.player.hp === before) dodged++;
  }
  assert.ok(dodged > 400 && dodged < 600, `dodged ${dodged} of 2000`);
});

test('Smith Heavy Blows: staggered enemies take 40% more; hits stagger about 10% of the time', () => {
  const run = newRun('smith');
  noCrit(run);
  const w = run.player.weapons[0];
  const e = dummy(run, 40, 0);
  run.trait = { ...run.trait, heavyBlows: { ...run.trait.heavyBlows, chance: 0 } };
  resolveHit(run, w, e, 100, 1, 0);
  const plain = lastAmount(run);
  e.stunT = 1;
  resolveHit(run, w, e, 100, 1, 0);
  approx(lastAmount(run) / plain, 1.4, 1e-9);
  run.world.dmg.n = 0;
  run.trait = CLASSES.smith.trait;
  let staggered = 0;
  for (let i = 0; i < 2000; i++) { e.stunT = 0; resolveHit(run, w, e, 1, 1, 0); run.world.dmg.n = 0; if (e.stunT > 0) staggered++; }
  assert.ok(staggered > 140 && staggered < 260, `${staggered} of 2000`);
});

test('Smith Tempered Steel: each enhance level is worth 14% damage on the Smith, 8% on others', () => {
  for (const [cls, per] of [['smith', 0.14], ['archer', 0.08]]) {
    const run = newRun(cls);
    const w = run.player.weapons[0];
    const d0 = param(run, w, 'damage');
    run.ore = 1e6;
    while (w.enhance < 2) enhance(run, w);
    const inc0 = d0 / w.def.base.damage;                          // the inc sum before (1 + class bonuses)
    approx(param(run, w, 'damage') / w.def.base.damage, inc0 + 2 * per, 1e-9);
  }
});

test('Berserker Frenzy: kills stack up to 15 (30% faster attacks) and fall off after 3 s', () => {
  const run = newRun('berserker');
  const w = run.player.weapons[0];
  const cd0 = param(run, w, 'cooldown');
  for (let i = 0; i < 20; i++) { const e = dummy(run, 30 + i, 0, 1); resolveHit(run, w, e, 50, 1, 0); }
  rehash(run);
  flushDamage(run);
  assert.equal(run.cls.frenzy, 15);
  approx(param(run, w, 'cooldown') / cd0, 0.7, 1e-9);
  for (let i = 0; i < 3.1 / STEP; i++) run.update(STEP, { x: 0, y: 0 });
  assert.equal(run.cls.frenzy, 0);
  approx(param(run, w, 'cooldown'), cd0, 1e-9);
});

test('Mage: statuses are stronger, and Arcane Ward refills after 5 s without being hit', () => {
  const m = newRun('mage', false);
  const a = newRun('archer', false);
  const st = (r, s) => r.player.stats.get(s);
  assert.ok(st(m, 'burnPower') > st(a, 'burnPower') * 1.5);
  assert.equal(st(m, 'chains'), st(a, 'chains') + 1);
  assert.equal(st(m, 'chillStacks'), st(a, 'chillStacks') + 1);
  m.player.weapons.length = 0;
  m.update(STEP, { x: 0, y: 0 });
  assert.equal(m.player.shield, 15, 'the run starts warded');
  damagePlayer(m, 10);
  assert.equal(m.player.shield, 5, 'the ward soaks the hit');
  for (let i = 0; i < 4 / STEP; i++) m.update(STEP, { x: 0, y: 0 });
  assert.equal(m.player.shield, 5, 'no refill within 5 s of a hit');
  for (let i = 0; i < 1.2 / STEP; i++) m.update(STEP, { x: 0, y: 0 });
  assert.equal(m.player.shield, 15);
});

test('Summoner Soul Harvest: a kill releases a soul at an enemy near you; souls never make souls', () => {
  const run = newRun('summoner');
  run.player.weapons.length = 0;
  const w = addWeapon(run, 'chakram');
  const victim = dummy(run, 150, 0, 1);
  const target = dummy(run, 40, 30);
  rehash(run);
  resolveHit(run, w, victim, 50, 1, 0);
  flushDamage(run);
  const souls = run.world.projectiles.active.filter((p) => p.look === 3);
  assert.equal(souls.length, 1);
  assert.equal(souls[0].inst, run.cls.inst);
  assert.ok(souls[0].dx < 0, 'it flies back toward the enemy beside you');
  let hit = false;
  for (let i = 0; i < 60; i++) { run.update(STEP, { x: 0, y: 0 }); if (target.hp < target.maxHp) hit = true; }
  assert.ok(hit);
  const snap = run.statsSnapshot();
  assert.ok(snap.weapons.some((x) => x.name === 'Soul Harvest' && x.dmg > 0), 'credited under its own name');
  // a soul's own kill releases nothing
  const weak = dummy(run, 60, 0, 1);
  rehash(run);
  resolveHit(run, run.cls.inst, weak, 50, 1, 0);
  const before = run.world.projectiles.active.filter((p) => p.look === 3).length;
  flushDamage(run);
  assert.equal(run.world.projectiles.active.filter((p) => p.look === 3).length, before);
});

test('Saint Holy Nova: a blessing ring every 6 s, credited as Holy Nova, healing you', () => {
  const run = newRun('saint', false);
  run.player.weapons.length = 0;
  const es = [dummy(run, 60, 0), dummy(run, -90, 20), dummy(run, 10, 120)];
  run.player.hp = 50;
  let rings = 0;
  let prev = 0;
  for (let i = 0; i < 13 / STEP; i++) {
    run.update(STEP, { x: 0, y: 0 });
    const n = run.hazards.filter((h) => h.src === run.cls.inst).length;
    if (n > prev) rings++;
    prev = n;
  }
  assert.equal(rings, 2, '3.6 s in, then every 6 s');
  assert.ok(es.every((e) => e.hp < e.maxHp));
  assert.ok(run.player.hp > 50 + 13 * 0.4, 'healed by the ring on top of regen');
  assert.ok(run.statsSnapshot().weapons.some((x) => x.name === 'Holy Nova' && x.dmg > 0));
});

test('class traits survive a run snapshot: a restored run plays on identically', () => {
  for (const cls of ['saint', 'summoner', 'berserker', 'mage']) {
    const a = createRun({ seed: 9, view: VIEW, debug: { god: true }, classId: cls });
    for (let i = 0; i < 90 / STEP; i++) { a.update(STEP, { x: Math.cos(i / 90), y: Math.sin(i / 90) }); a.pendingLevelUps = 0; }
    const b = restoreRun(JSON.parse(JSON.stringify(snapshotRun(a))), { view: VIEW, debug: { god: true }, sfx: () => {} });
    a.world.hash.rebuild(a.world.enemies.active, a.world.enemies.count);
    assert.deepEqual({ ...b.cls, inst: null }, { ...a.cls, inst: null }, cls);
    assert.equal(b.trait, CLASSES[cls].trait, 'the trait is the shipped data');
    for (let i = 0; i < 600; i++) {
      const mv = { x: Math.cos((5400 + i) / 90), y: Math.sin((5400 + i) / 90) };
      a.update(STEP, mv); b.update(STEP, mv); a.pendingLevelUps = b.pendingLevelUps = 0;
    }
    assert.equal(b.stats.total, a.stats.total, cls);
    assert.equal(b.kills, a.kills, cls);
  }
});
