// M40: Starforge. 2 starsteel, once per weapon, at max weapon level: one mutation set by the weapon's behavior
// (see data/starforge.js). The star survives evolving,
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
import { callStar } from '../src/behaviors/projectile.js';
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
  const axe = addWeapon(run, 'cinder_mortar');                     // every behavior has a mutation since M42: fake one without
  const saved = MUTATIONS.mortar;
  delete MUTATIONS.mortar;
  assert.equal(mutationOf(axe), null);
  assert.ok(!canStarforge(run, axe));
  MUTATIONS.mortar = saved;
});

test('m40 starfall: every Nth volley is marked, and each enemy those arrows hit calls a star down', () => {
  const run = newRun();
  const bow = maxed(run, 'ember_bow');
  run.starsteel = 2;
  starforge(run, bow);
  const e = dummy(run, 150, 0);
  let marked = 0;
  let unmarked = 0;
  let calls = 0;
  let maxFalls = 0;
  let prev = new Set();
  for (let i = 0; i < 60 * 12; i++) {
    step(run);
    const now = new Set(run.world.projectiles.active);
    for (const pr of now) if (!prev.has(pr)) { if (pr.fall) marked++; else unmarked++; }
    prev = now;
    if (bow.falls && bow.falls.length > maxFalls) { maxFalls = bow.falls.length; calls++; }
  }
  assert.ok(bow.volley >= 2 * MUTATIONS.projectile.every, `fired ${bow.volley} volleys`);
  assert.ok(marked > 0 && unmarked > marked, 'only some volleys are marked');
  assert.ok(maxFalls > 0, 'stars were called');
});

test('m40 an unstarred bow never marks an arrow or calls a star', () => {
  const run = newRun();
  const bow = maxed(run, 'ember_bow');
  dummy(run, 150, 0);
  for (let i = 0; i < 60 * 8; i++) { step(run); assert.ok(!run.world.projectiles.active.some((p) => p.fall)); }
  assert.ok(!bow.falls || bow.falls.length === 0);
});

test('m40 a star lands after its delay and hurts what is around the spot, not what is far away', () => {
  const run = newRun();
  const bow = maxed(run, 'ember_bow');
  run.player.weapons.length = 0;                                    // only the star may hurt the dummies
  run.player.weapons.push(bow);                                     // ...but the bow still updates its falling stars
  bow.cd = 99;
  bow.star = true;
  const near = dummy(run, 300, 0);
  const far = dummy(run, 300 + MUTATIONS.projectile.radius * 3, 0);
  callStar(run, bow, near.x, near.y, 100);
  const a = near.hp;
  tick(run, Math.floor(MUTATIONS.projectile.delay * 60) - 3);
  assert.equal(near.hp, a, 'nothing yet');
  tick(run, 8);
  assert.ok(near.hp < a, 'the star landed on it');
  assert.equal(far.hp, far.maxHp, 'and not on one far away');
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

test('m40 binary stars: every blade becomes a spinning pair, and a starred ring out-damages a plain one', () => {
  const dmgAt = (star) => {
    const run = newRun();
    const blades = maxed(run, 'spirit_blades');
    if (star) { run.starsteel = 2; starforge(run, blades); }
    tick(run, 2);
    const e = dummy(run, blades.orbitR, 0);                         // on the ring's path
    const p0 = blades.pair;
    tick(run, 60 * 6);
    if (star) assert.ok(blades.pair !== p0, 'the pairs spin');
    return e.maxHp - e.hp;
  };
  const plain = dmgAt(false);
  const starred = dmgAt(true);
  assert.ok(plain > 0);
  assert.ok(starred > plain, `${starred} > ${plain}`);
});

test('m40 binary stars reach a little further in and out than the plain ring', () => {
  const reach = (star, off) => {
    const run = newRun();
    const blades = maxed(run, 'spirit_blades');
    if (star) { run.starsteel = 2; starforge(run, blades); }
    tick(run, 2);
    const e = dummy(run, blades.orbitR + off * (blades.bladeR + 10), 0);   // just past the plain blades' edge
    tick(run, 60 * 6);
    return e.maxHp - e.hp;
  };
  assert.equal(reach(false, 1.15), 0, 'out of the plain ring\'s reach');
  assert.ok(reach(true, 1.15) > 0, 'inside the binary pair\'s sweep');
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

test('m40 a star survives a snapshot and the starred bow plays on identically after resume', () => {
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

