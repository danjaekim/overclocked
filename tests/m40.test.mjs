// M40: Starforge. 2 starsteel, once per weapon, at max weapon level: one mutation set by the weapon's behavior
// (projectile comet, slam aftershock, orbit counter ring, boomerang double return). The star survives evolving,
// passes from a graft donor to the host, and is lost on salvage.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon, levelUpWeapon, canLevelUp } from '../src/game/weapons.js';
import { STARFORGE, MUTATIONS } from '../src/data/starforge.js';
import { validateData } from '../src/data/validate.js';
import { mutationOf, canStarforge, starforge, starforgeBlocker, activeMutation } from '../src/game/starforge.js';
import { graft } from '../src/game/graft.js';
import { EVOLUTIONS } from '../src/data/evolutions.js';
import { evolve, canEvolve } from '../src/game/evolution.js';
import { addPassive, findPassive, levelUpPassive } from '../src/game/passives.js';
import { addPerk, findPerk, levelUpPerk } from '../src/game/perks.js';
import { updateProjectiles } from '../src/systems/movement.js';
import { spawnProjectile } from '../src/game/projectiles.js';
import { snapshotRun, restoreRun } from '../src/game/run-snapshot.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId = 'archer') => {
  const run = createRun({ seed: 9, view: VIEW, debug: { god: true }, classId });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};
const maxed = (run, id) => { const w = addWeapon(run, id); while (canLevelUp(w)) levelUpWeapon(run, w); return w; };
// An enemy that cannot be moved: knockback would push it out of range, so it is put back every tick.
const dummy = (run, x, y) => {
  const e = spawnEnemy(run, 'goblin', run.player.x + x, run.player.y + y);
  e.hp = e.maxHp = 1e9;
  e.speed = 0;
  e.home = { x: e.x, y: e.y };
  return e;
};
const hold = (run) => { for (const e of run.world.enemies.active) if (e.home) { e.x = e.home.x; e.y = e.home.y; e.kx = e.ky = 0; } };
const step = (run) => { hold(run); run.update(STEP, { x: 0, y: 0 }); };
const tick = (run, n) => { for (let i = 0; i < n; i++) step(run); };

test('m40 data validates; mutations are keyed by behavior and the gate is level, starsteel and once', () => {
  assert.deepEqual(validateData(), []);
  const run = newRun();
  const bow = addWeapon(run, 'ember_bow');
  assert.equal(mutationOf(bow), MUTATIONS.projectile);
  assert.ok(starforgeBlocker(run, bow).includes('level'), 'not at max level yet');
  while (canLevelUp(bow)) levelUpWeapon(run, bow);
  run.starsteel = 1;
  assert.ok(!canStarforge(run, bow), 'needs 2 starsteel');
  run.starsteel = 3;
  assert.ok(canStarforge(run, bow));
  assert.ok(starforge(run, bow).ok);
  assert.equal(run.starsteel, 3 - STARFORGE.cost);
  assert.ok(bow.star);
  assert.ok(!starforge(run, bow).ok, 'once per weapon');
  assert.equal(run.starsteel, 1);
  assert.equal(activeMutation(bow), MUTATIONS.projectile);
  const axe = addWeapon(run, 'rending_axe');                       // arc: no mutation yet
  assert.equal(mutationOf(axe), null);
  assert.ok(!canStarforge(run, axe));
});

test('m40 comet volley: every Nth volley is one big piercing comet; the rest are normal', () => {
  const run = newRun();
  const bow = maxed(run, 'ember_bow');
  run.starsteel = 2;
  starforge(run, bow);
  dummy(run, 150, 0);
  const comets = [];
  let prev = new Set();
  let volleys = 0;
  for (let i = 0; i < 60 * 14; i++) {
    step(run);
    const now = new Set(run.world.projectiles.active.filter((pr) => pr.look === 4));      // pooled objects are reused, so count arrivals
    for (const pr of now) if (!prev.has(pr)) comets.push({ r: pr.r });
    prev = now;
    volleys = bow.volley;
  }
  assert.ok(volleys >= 2 * MUTATIONS.projectile.every, `fired ${volleys} volleys`);
  assert.equal(comets.length, Math.floor(volleys / MUTATIONS.projectile.every), 'one comet per N volleys');
  assert.equal(comets[0].r, bow.def.base.radius * run.player.stats.getFor('area', bow.tags) * MUTATIONS.projectile.size);
});

test('m40 an unstarred bow never fires a comet', () => {
  const run = newRun();
  const bow = maxed(run, 'ember_bow');
  dummy(run, 150, 0);
  let comet = false;
  for (let i = 0; i < 60 * 8; i++) { step(run); if (run.world.projectiles.active.some((p) => p.look === 4)) comet = true; }
  assert.ok(!comet);
  assert.equal(bow.star, false);
});

test('m40 a comet bursts where it ends and hurts what is around that spot', () => {
  const run = newRun();
  const bow = maxed(run, 'ember_bow');
  run.player.weapons.length = 0;                                    // nothing else may hurt the dummies
  const near = dummy(run, 400, 0);
  const far = dummy(run, 400 + MUTATIONS.projectile.burstRadius * 3, 0);
  const pr = spawnProjectile(run, bow, run.player.x + 400, run.player.y, 1, 0, 0, 100, 0.03, 12, 999);
  pr.look = 4;
  const a = near.hp;
  const b = far.hp;
  tick(run, 4);
  assert.ok(near.hp < a, 'the burst reached the enemy at the end');
  assert.equal(far.hp, b, 'and not one far from it');
});

test('m40 aftershock: each slam is followed by a cyan echo on the same spot that lands later', () => {
  const run = newRun('smith');
  const hammer = maxed(run, 'forge_hammer');
  run.starsteel = 2;
  starforge(run, hammer);
  const e = dummy(run, 90, 0);
  let sawEcho = false;
  const drops = [];
  let last = e.hp;
  for (let i = 0; i < 60 * 3; i++) {
    step(run);
    if (hammer.pend.some((s) => s.echo)) sawEcho = true;
    if (e.hp < last) { drops.push({ t: i, d: last - e.hp }); last = e.hp; }
  }
  assert.ok(sawEcho, 'an echo was queued');
  assert.ok(drops.length >= 2, 'the enemy took the slam and the aftershock');
});

test('m40 an unstarred hammer queues no echo', () => {
  const run = newRun('smith');
  const hammer = maxed(run, 'forge_hammer');
  dummy(run, 90, 0);
  for (let i = 0; i < 60 * 3; i++) { step(run); assert.ok(!hammer.pend.some((s) => s.echo)); }
});

test('m40 counter ring: a second ring of half the blades spins the other way, further out', () => {
  const run = newRun();
  const blades = maxed(run, 'spirit_blades');
  run.starsteel = 2;
  starforge(run, blades);
  tick(run, 2);
  const count = Math.max(1, Math.round(blades.blades));
  assert.equal(blades.blades2, Math.max(1, Math.round(count * MUTATIONS.orbit.count)));
  assert.ok(Math.abs(blades.orbitR2 - blades.orbitR * MUTATIONS.orbit.radius) < 1e-6);
  const a0 = blades.angle2;
  const m0 = blades.angle;
  tick(run, 10);
  const da = ((blades.angle - m0 + Math.PI * 4) % (Math.PI * 2));
  const db = ((blades.angle2 - a0 + Math.PI * 4) % (Math.PI * 2));
  assert.ok(da < Math.PI && db > Math.PI, 'opposite directions');
});

test('m40 the counter ring hits what only it can reach', () => {
  const dmgAt = (star) => {
    const run = newRun();
    const blades = maxed(run, 'spirit_blades');
    if (star) { run.starsteel = 2; starforge(run, blades); }
    tick(run, 2);
    const r = blades.orbitR * MUTATIONS.orbit.radius;
    const e = dummy(run, r, 0);
    tick(run, 60 * 6);
    return e.maxHp - e.hp;
  };
  assert.equal(dmgAt(false), 0, 'the main ring cannot reach out there');
  assert.ok(dmgAt(true) > 0, 'the counter ring can');
});

test('m40 double return: a starred disc flies out a second time at 80% and an unstarred one does not', () => {
  const trips = (star) => {
    const run = newRun();
    const disc = maxed(run, 'chakram');
    if (star) { run.starsteel = 2; starforge(run, disc); }
    dummy(run, 120, 0);
    let max = 0;
    let mult = 1;
    for (let i = 0; i < 60 * 12; i++) {
      step(run);
      for (const d of disc.discs) { if (d.trips > max) max = d.trips; if (d.trips) mult = d.mult; }
    }
    return { max, mult };
  };
  assert.equal(trips(false).max, 0);
  const s = trips(true);
  assert.equal(s.max, 1);
  assert.equal(s.mult, MUTATIONS.boomerang.frac);
});

test('m40 a star survives evolving and is lost on salvage; a graft passes it to the host', () => {
  const run = newRun('archer');
  run.starsteel = 6;
  const bow = maxed(run, 'ember_bow');
  starforge(run, bow);
  const recipe = EVOLUTIONS.find((r) => r.from === 'ember_bow' && !r.with);
  for (const q of recipe.requires) {
    if (q.passive) { addPassive(run, q.passive); const e = findPassive(run.player, q.passive); while (e.level < q.minLevel) levelUpPassive(run, e); }
    if (q.perk) { addPerk(run, q.perk); const e = findPerk(run.player, q.perk); while (e.level < q.minLevel) levelUpPerk(run, e); }
    if (q.starsteel) run.starsteel = Math.max(run.starsteel, q.starsteel);
  }
  assert.ok(canEvolve(run, bow, recipe));
  assert.ok(evolve(run, bow, recipe).ok);
  assert.ok(bow.star, 'the star came through the evolution');
  assert.equal(activeMutation(bow), MUTATIONS[bow.def.behavior] || null);

  const host = addWeapon(run, 'colossus_maul');
  const donor = addWeapon(run, 'glacial_bloom');
  donor.star = true;
  run.starsteel = 2;
  assert.ok(graft(run, host, donor).ok);
  assert.ok(host.star, 'the donor\'s star passed to the host');
});

test('m40 a star survives a snapshot and the comet still fires after resume', () => {
  const a = newRun();
  const bow = maxed(a, 'ember_bow');
  a.starsteel = 2;
  starforge(a, bow);
  dummy(a, 150, 0);
  tick(a, 90);
  const snap = JSON.parse(JSON.stringify(snapshotRun(a)));
  const b = restoreRun(snap, { view: VIEW, debug: { god: true }, sfx: () => {} });
  b.director.update = () => {};
  const wb = b.player.weapons[0];
  assert.ok(wb.star);
  assert.equal(wb.volley, bow.volley);
  for (let i = 0; i < 600; i++) { a.update(STEP, { x: 0, y: 0 }); b.update(STEP, { x: 0, y: 0 }); }
  assert.equal(wb.volley, bow.volley, 'the resumed run fires the same volleys');
});

test('m40 a comet hits each enemy of a dense pile once, however many it passes, and weakens as it goes', () => {
  const run = newRun();
  const bow = maxed(run, 'ember_bow');
  run.player.weapons.length = 0;                                    // only the comet may hurt the pile
  const pile = [];
  for (let i = 0; i < 40; i++) pile.push(dummy(run, 60 + (i % 8) * 14, ((i / 8) | 0) * 9 - 18));    // far more than a projectile's 16-hit memory
  const pr = spawnProjectile(run, bow, run.player.x, run.player.y, 1, 0, 300, 100, 2, 12, 999);
  pr.look = 4;
  pr.big = new Set();
  pr.aux = 100;
  const hp = pile.map((e) => e.hp);
  tick(run, 90);
  const hits = pile.map((e, i) => hp[i] - e.hp).filter((d) => d > 0);
  assert.ok(hits.length >= 30, `${hits.length} of 40 were hit`);
  assert.ok(Math.max(...hits) < 100 * 1.5 * 2 + 100 * MUTATIONS.projectile.burstFrac * 3, 'no enemy was re-hit over and over');
  assert.ok(pr.dmg < 100 * 0.5 || !run.world.projectiles.active.includes(pr), 'the comet weakened as it pierced');
});
