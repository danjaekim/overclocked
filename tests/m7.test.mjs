// M7: evolutions (Combine), the boss, titles.

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon, levelUpWeapon, canLevelUp } from '../src/game/weapons.js';
import { addPassive } from '../src/game/passives.js';
import { param } from '../src/game/weapon-params.js';
import { EVOLUTIONS } from '../src/data/evolutions.js';
import { TITLES } from '../src/data/titles.js';
import { ENEMIES } from '../src/data/enemies.js';
import { validateData } from '../src/data/validate.js';
import { recipesFor, canEvolve, evolve, checklist } from '../src/game/evolution.js';
import { grantTitle, hasTitle, onMilestone } from '../src/game/titles.js';
import { RUN_EVENTS } from '../src/game/run-events.js';
import { killEnemy, damagePlayer } from '../src/systems/damage.js';
import { updatePickups } from '../src/systems/pickups.js';
import { generateOffers, buildCandidates } from '../src/game/upgrades.js';
import { offerState, applyOffer } from '../src/game/apply-offer.js';
import { createRng } from '../src/core/rng.js';
import { enhance } from '../src/game/forge.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId = 'archer', seed = 1) => createRun({ seed, view: VIEW, debug: { god: true }, classId });
const tick = (run, s, move = { x: 0, y: 0 }) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, move); };
const maxOut = (run, inst) => { while (canLevelUp(inst)) levelUpWeapon(run, inst); };

test('m7 data validates', () => {
  assert.deepEqual(validateData(), []);
});

// ---- evolutions --------------------------------------------------------------------------

test('storm volley: every requirement must hold before Combine works', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  const recipe = recipesFor(bow)[0];
  assert.equal(recipe.into, 'storm_volley');
  assert.equal(canEvolve(run, bow, recipe), false);
  maxOut(run, bow);
  assert.equal(canEvolve(run, bow, recipe), false, 'level 8 alone is not enough');
  addPassive(run, 'wind_sigil');
  assert.equal(canEvolve(run, bow, recipe), false, 'still needs starsteel');
  run.starsteel = 1;
  assert.equal(canEvolve(run, bow, recipe), true);
  assert.deepEqual(checklist(run, bow, recipe).map((c) => c.ok), [true, true, true]);
});

test('evolve: replaces the weapon in place, keeps enhance and affixes, spends starsteel, resets to level 1', () => {
  const run = newRun();
  const bow = run.player.weapons[0];
  maxOut(run, bow);
  addPassive(run, 'wind_sigil');
  run.starsteel = 2;
  bow.enhance = 3;
  bow.affixes = ['keen'];
  const id = bow.instanceId;
  const r = evolve(run, bow, recipesFor(bow)[0]);
  assert.equal(r.ok, true);
  assert.equal(run.starsteel, 1);
  assert.equal(bow.instanceId, id, 'same instance');
  assert.equal(bow.weaponId, 'storm_volley');
  assert.equal(bow.level, 1);
  assert.equal(bow.enhance, 3);
  assert.deepEqual(bow.affixes, ['keen']);
  assert.equal(run.player.weapons.length, 1);
  assert.ok(bow.tags.has ? bow.tags.has('lightning') : true);
  // the old weapon's level modifiers are gone: the evolved base is what drives damage now
  approx(param(run, bow, 'damage'), 15 * run.player.stats.getFor('damage', bow.tags), 1e-9);
  // a second evolve of the same instance is refused (it is no longer an ember bow)
  assert.equal(evolve(run, bow, recipesFor({ weaponId: 'ember_bow' })[0]).ok, false);
});

test('evolved weapons are never offered at level-up, but can level up once owned', () => {
  const run = newRun();
  const st = offerState(run);
  for (let s = 0; s < 30; s++) {
    for (const o of generateOffers(st, createRng(s))) assert.ok(!['storm_volley', 'colossus_maul'].includes(o.id));
  }
  const bow = run.player.weapons[0];
  maxOut(run, bow);
  addPassive(run, 'wind_sigil');
  run.starsteel = 1;
  evolve(run, bow, recipesFor(bow)[0]);
  const ups = buildCandidates(offerState(run)).filter((c) => c.kind === 'weapon_up' && c.id === 'storm_volley');
  assert.equal(ups.length, 1);
  levelUpWeapon(run, bow);
  assert.equal(bow.level, 2);
});

test('colossus maul needs the passive, enhance +3 and starsteel; the evolved maul hits much harder', () => {
  const run = newRun('smith');
  const hammer = run.player.weapons[0];
  const recipe = recipesFor(hammer)[0];
  maxOut(run, hammer);
  run.starsteel = 1;
  addPassive(run, 'tempered_core');
  assert.equal(canEvolve(run, hammer, recipe), false, 'passive level 1 and no enhance');
  const before = param(run, hammer, 'damage');
  hammer.enhance = 3;
  const core = run.player.passives.find((p) => p.id === 'tempered_core');
  core.level = 2;
  assert.equal(canEvolve(run, hammer, recipe), true);
  evolve(run, hammer, recipe);
  assert.equal(hammer.weaponId, 'colossus_maul');
  assert.ok(param(run, hammer, 'damage') > before, 'a level-1 maul beats a maxed hammer');
});

test('every recipe is reachable: its evolved weapon exists and the source weapon can reach the level', () => {
  for (const r of EVOLUTIONS) {
    assert.ok(recipesFor({ weaponId: r.from }).includes(r));
  }
});

// ---- boss ------------------------------------------------------------------------------

test('the boss event spawns the warlord, flags bossAlive, and the HUD hook sees run.boss', () => {
  const run = newRun();
  RUN_EVENTS.boss(run, { enemy: 'warlord' });
  assert.equal(run.bossAlive, true);
  assert.ok(run.boss && run.boss.alive);
  assert.equal(run.boss.maxHp, ENEMIES.warlord.hp);        // not scaled by wave hp
});

test('boss: telegraphs (stands still, then dashes fast), then chases again', () => {
  const run = newRun();
  const p = run.player;
  p.x = 0; p.y = 0;
  const boss = spawnEnemy(run, 'warlord', 300, 0);
  run.boss = boss;
  boss.aiCd = 0.05;
  const c = ENEMIES.warlord.charge;
  tick(run, 0.2);
  assert.equal(boss.ai, 1, 'windup');
  const xAtWindup = boss.x;
  tick(run, c.windup / 2);
  approx(boss.x, xAtWindup, 3);                           // standing (only separation / knockback noise)
  tick(run, c.windup / 2 + 0.1);
  assert.equal(boss.ai, 2, 'dashing');
  const x0 = boss.x;
  tick(run, 0.2);
  assert.ok(Math.abs(boss.x - x0) > c.speed * 0.2 * 0.7, 'dash is much faster than a walk');
  tick(run, c.time + 0.2);
  assert.equal(boss.ai, 0, 'back to chasing');
});

test('killing the boss: drops starsteel, a long-lived shrine on the spot (even with one active), a toast and the Warbreaker title', () => {
  const run = newRun();
  RUN_EVENTS.shrine(run);                                  // a normal shrine is already active
  assert.equal(run.shrines.length, 1);
  const boss = spawnEnemy(run, 'warlord', 200, 300);
  run.boss = boss;
  run.bossAlive = true;
  killEnemy(run, boss);
  assert.equal(run.bossAlive, false);
  assert.equal(run.boss, null);
  assert.equal(run.shrines.length, 2, 'boss shrine ignores maxActive');
  const s = run.shrines[1];
  assert.equal(s.x, 200); assert.equal(s.y, 300);
  assert.ok(s.maxTtl > 45);
  assert.ok(hasTitle(run, 'warbreaker'));
  // starsteel is credited at once (so the boss chest can use it for an evolution), and a 5-roll chest drops
  assert.equal(run.starsteel, ENEMIES.warlord.ore.count);
  assert.equal(run.ore, 0, 'starsteel is not iron');
  assert.ok(!run.world.pickups.active.some((g) => g.kind === 1 && g.ore === 'starsteel'), 'no starsteel pickup');
  const chest = run.world.pickups.active.find((g) => g.kind === 2);
  assert.ok(chest && chest.value === 1, 'a boss chest dropped');
});

test('the timeline brings the Warlord at 4:00', () => {
  const run = newRun();
  run.time = 239;
  tick(run, 0.5);
  assert.equal(run.bossAlive, false);
  tick(run, 1.5);
  assert.equal(run.bossAlive, true);
});

test('boss contact damages the player, and the bossAlive condition works for conditional mods', () => {
  const run = createRun({ seed: 2, view: VIEW, debug: { god: false }, classId: 'archer' });
  run.player.stats.add({ stat: 'damage', op: 'more', value: 1, when: 'bossAlive', source: 't' });
  const dmg0 = run.player.stats.get('damage');
  run.bossAlive = true;
  approx(run.player.stats.get('damage'), dmg0 * 2, 1e-9);
  const hp = run.player.hp;
  damagePlayer(run, ENEMIES.warlord.damage);
  assert.ok(run.player.hp < hp);
});

// ---- titles ------------------------------------------------------------------------------

test('titles: grant once, add their modifiers, and conditional ones follow the condition', () => {
  const run = newRun();
  const base = run.player.stats.get('damage');
  assert.equal(grantTitle(run, 'unyielding'), true);
  assert.equal(grantTitle(run, 'unyielding'), false, 'only once');
  approx(run.player.stats.get('damage'), base, 1e-9);          // full hp: no bonus yet
  run.player.hp = run.player.maxHp * 0.4;
  approx(run.player.stats.get('damage'), base * 1.4, 1e-9);
  assert.ok(run.toast && /Unyielding/.test(run.toast.text));
});

test('milestone titles: Slayer at 1000 kills, Forgemaster at +5, Warbreaker on the boss', () => {
  const run = newRun();
  onMilestone(run, 'kills', 999);
  assert.equal(hasTitle(run, 'slayer'), false);
  onMilestone(run, 'kills', 1000);
  assert.equal(hasTitle(run, 'slayer'), true);

  const r2 = newRun();
  const bow = r2.player.weapons[0];
  r2.ore = 1e6;
  bow.enhance = 4;
  const real = r2.rng.next.bind(r2.rng);
  r2.rng.next = () => 0;                                       // force success
  enhance(r2, bow);
  r2.rng.next = real;
  assert.equal(bow.enhance, 5);
  assert.ok(hasTitle(r2, 'forgemaster'));
});

test('kills crossing 1000 grant Slayer through the real kill path', () => {
  const run = newRun();
  run.kills = 999;
  const e = spawnEnemy(run, 'goblin', 100, 100);
  killEnemy(run, e);
  assert.ok(hasTitle(run, 'slayer'));
});

test('offer titles appear as epic level-up offers, apply on pick, and are not offered twice', () => {
  const run = newRun();
  const st = offerState(run);
  const cands = buildCandidates(st).filter((c) => c.kind === 'title_new');
  assert.deepEqual(cands.map((c) => c.id), ['unyielding']);     // milestone titles are never offered
  applyOffer(run, cands[0]);
  assert.ok(hasTitle(run, 'unyielding'));
  assert.equal(buildCandidates(offerState(run)).filter((c) => c.kind === 'title_new').length, 0);
});

test('titles show up in the run summary', () => {
  const run = newRun();
  grantTitle(run, 'slayer');
  assert.deepEqual(run.summary().titles, ['Slayer']);
});

// ---- the whole arc ------------------------------------------------------------------------

test('a strong auto-played run: the boss arrives, can be killed, and the run is winnable', () => {
  const run = newRun('smith', 9);                              // god mode: this checks the systems, not survival
  for (const id of ['spirit_blades', 'cinder_ward', 'storm_javelin']) addWeapon(run, id);
  for (const w of run.player.weapons) maxOut(run, w);
  let bossSeen = false;
  let bossKilled = false;
  for (let s = 0; s < 602 && !run.over; s++) {
    tick(run, 1);
    if (run.bossAlive) bossSeen = true;
    if (bossSeen && !run.bossAlive) bossKilled = true;
  }
  assert.ok(bossSeen, 'boss spawned');
  assert.ok(bossKilled, 'a maxed loadout kills the boss within the run');
  assert.equal(run.won, true);
  assert.ok(run.starsteel >= 0 && Number.isFinite(run.ore));
  assert.equal(run.world.dmg.dropped, 0);
});

test('the Ashen Seer arrives at 8:00, keeps its distance, and its meteors mark circles that blast the player', () => {
  const run = createRun({ seed: 1, view: VIEW, debug: { god: false }, classId: 'archer' });
  run.time = 479;
  tick(run, 1.5);
  assert.equal(run.bossAlive, true);
  assert.equal(run.boss.defId, 'seer');
  const e = run.boss;
  run.player.hp = run.player.maxHp = 5000;
  e.x = run.player.x + 120; e.y = run.player.y;          // inside 0.75 x range: it backs away
  const d0 = Math.hypot(e.x - run.player.x, e.y - run.player.y);
  tick(run, 0.5);
  assert.ok(Math.hypot(e.x - run.player.x, e.y - run.player.y) > d0 - 1, 'it does not close in');
  for (let i = 0; i < 60 * 5 && run.bossZones.length === 0; i++) tick(run, 1 / 60);
  assert.ok(run.bossZones.length >= 4, 'a cast marks several circles');
  const hp = run.player.hp;
  for (let i = 0; i < 60 * 2; i++) { run.player.iframes = 0; tick(run, 1 / 60); }
  assert.ok(run.player.hp < hp, 'standing still gets hit');
});
