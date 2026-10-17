// M28a: masterworks 7-12 (Black Sun, Bladestorm, Comet, Fault Line, Wrath, Familiars).

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { fuse } from '../src/game/fusion.js';
import { addVortex, addPillar, addWave } from '../src/systems/hazards.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (seed = 5) => {
  const run = createRun({ seed, view: VIEW, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  run.starsteel = 5;
  return run;
};
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };
const fused = (run, host, donor) => {
  const h = addWeapon(run, host);
  const d = addWeapon(run, donor);
  assert.ok(fuse(run, h, d).ok, `${host}+${donor}`);
  return h;
};
const dummy = (run, x, y, hp = 1e6) => { const e = spawnEnemy(run, 'brute', x, y); e.speed = 0; e.maxHp = e.hp = hp; return e; };

test('Black Sun: a vortex burns what it pulls and collapses into burning ground', () => {
  const run = newRun();
  const h = fused(run, 'singularity', 'pyre_crown');
  const e = dummy(run, 200, 0);
  run.player.weapons.length = 0;                          // only the hazard acts
  addVortex(run, h, 160, 0, 90, 0.8, 120, 60, 0);
  tick(run, 0.5);
  assert.ok(e.burnT > 0, 'burning');
  tick(run, 0.6);
  assert.ok(run.hazards.some((x) => x.dmg !== undefined && x.tick), 'left a fire patch');
});

test('Bladestorm flings blades outward from the spin', () => {
  const run = newRun();
  const h = fused(run, 'whirlwind_cleaver', 'seraph_blades');
  dummy(run, 60, 0);
  let max = 0;
  for (let i = 0; i < 60 * 3; i++) { run.update(STEP, { x: 0, y: 0 }); max = Math.max(max, run.world.projectiles.count); }
  assert.ok(max >= 3, `blades in flight (${max})`);
  assert.ok(h.fusion.id === 'bladestorm');
});

test('Comet: the arrow ends in a ring of shards', () => {
  const run = newRun();
  const h = fused(run, 'sunpiercer', 'glacial_bloom');
  dummy(run, 150, 0);
  let max = 0;
  for (let i = 0; i < 60 * 4; i++) { run.update(STEP, { x: 0, y: 0 }); max = Math.max(max, run.world.projectiles.count); }
  assert.ok(max >= 8, `shards appeared (${max})`);
  assert.ok(h.tags.set.has('frost'));
});

test('Fault Line: a shockwave leaves cracks that burn and shock', () => {
  const run = newRun();
  const h = fused(run, 'quakebreaker', 'stormshell_mortar');
  const e = dummy(run, 100, 0);
  run.player.weapons.length = 0;
  run.player.weapons.push(h);
  tick(run, 2.5);
  assert.ok(run.hazards.some((x) => x.shock), 'cracks on the ground');
  assert.ok(e.maxHp - e.hp > 0);
});

test('Wrath: pillars linger and lightning links them', () => {
  const run = newRun();
  const h = fused(run, 'judgement', 'thunder_lance');
  const a = dummy(run, 120, 0);
  const b = dummy(run, -120, 0);
  const mid = dummy(run, 0, 12);                           // stands between the two on the link
  run.player.weapons.length = 0;
  addPillar(run, h, a.x, a.y, 40, 0.1, 10, 0);
  addPillar(run, h, b.x, b.y, 40, 0.1, 10, 0);
  tick(run, 0.9);
  assert.equal(run.hazards.filter((x) => x.net).length, 2, 'still there after the strike');
  assert.ok(run.netLinks && run.netLinks.length === 2);
  tick(run, 1.0);
  assert.ok(mid.shockT > 0 || mid.hp < mid.maxHp, 'the link hurt what stood on it');
});

test('Familiars: three hounds each cast a bolt', () => {
  const run = newRun();
  const h = fused(run, 'prismatic_bolt', 'grave_legion');
  const e = dummy(run, 120, 0);
  tick(run, 4);
  assert.equal(h.fam.length, 3);
  assert.ok(e.hp < e.maxHp);
});

// ---- M28b: difficulty ----
import { spawnElite } from '../src/game/director.js';
import { ELITE } from '../src/data/elites.js';
import { RUN_EVENTS } from '../src/game/run-events.js';
import { WAVES, EVENTS } from '../src/data/waves.js';
import { flushDamage, killEnemy } from '../src/systems/damage.js';
import { queueDamage, KIND_PROC } from '../src/systems/damage-queue.js';
import { validateData } from '../src/data/validate.js';

test('M28b data validates; the last wave is tougher and a war party is scheduled', () => {
  assert.deepEqual(validateData(), []);
  assert.equal(WAVES[WAVES.length - 1].hpScale, 2.6);
  assert.ok(EVENTS.some((e) => e.event === 'warparty' && e.at === 405));
});

test('an armoured elite has armour on top of its body; a second affix stacks', () => {
  const run = newRun();
  const e = spawnElite(run, 'brute', 300, 0, 1, 'armoured', 'swift');
  assert.ok(e.armor >= 7);
  assert.equal(e.affix2, 'swift');
  const plain = spawnEnemy(run, 'brute', 300, 40);
  assert.ok(e.speed > plain.speed * 1.2, 'swift applied as the second affix');
});

test('late elites roll two different affixes, early ones one', () => {
  const run = newRun();
  run.time = 100;
  RUN_EVENTS.elite(run, { enemy: 'brute' });
  const early = run.world.enemies.active[run.world.enemies.active.length - 1];
  assert.equal(early.affix2, '');
  run.time = ELITE.secondAffixAfter + 1;
  RUN_EVENTS.elite(run, { enemy: 'brute' });
  const late = run.world.enemies.active[run.world.enemies.active.length - 1];
  assert.ok(late.affix2 && late.affix2 !== late.affix);
});

test('a volatile elite hurts a player standing next to it when it dies', () => {
  const run = newRun();
  run.debug.god = false;
  run.player.hp = run.player.maxHp = 100;
  const e = spawnElite(run, 'brute', 30, 0, 1, 'volatile');
  e.hp = 0;
  killEnemy(run, e);
  assert.ok(run.player.hp < 100);
  run.player.iframes = 0;
  run.player.hp = 100;
  const far = spawnElite(run, 'brute', 400, 0, 1, 'volatile');
  killEnemy(run, far);
  assert.equal(run.player.hp, 100);
});

test('a splitter bursts into goblins when it dies', () => {
  const run = newRun();
  const e = spawnEnemy(run, 'splitter', 200, 0);
  const before = run.world.enemies.count;
  killEnemy(run, e);
  assert.equal(run.world.enemies.count, before - 1 + 3);
});

test('a shaman wards the enemies near it: they take half damage', () => {
  const run = newRun();
  run.player.weapons.length = 0;
  const sh = spawnEnemy(run, 'shaman', 400, 0);
  const near = dummy(run, 440, 0);
  const far = dummy(run, 400, 600);
  sh.speed = 0;
  tick(run, 0.5);
  assert.ok(near.wardT > 0 && !(far.wardT > 0));
  const dealt = (e) => { const h = e.hp; queueDamage(run, e, 100, false, 0, 0, 0, null, KIND_PROC); flushDamage(run); return h - e.hp; };
  assert.equal(dealt(near), 50);
  assert.equal(dealt(far), 100);
  sh.hp = 0; killEnemy(run, sh);
  tick(run, 1);
  assert.ok(!(near.wardT > 0), 'the ward ends with its Shaman');
});

test('the war party brings two shieldbearer elites and slingers', () => {
  const run = newRun();
  RUN_EVENTS.warparty(run);
  const l = run.world.enemies.active;
  assert.equal(l.filter((e) => e.defId === 'shieldbearer' && e.elite).length, 2);
  assert.equal(l.filter((e) => e.defId === 'slinger').length, 6);
});
