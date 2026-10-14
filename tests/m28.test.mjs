// M28a: masterworks 7-12 (Black Sun, Bladestorm, Comet, Fault Line, Wrath, Familiars).

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { graft } from '../src/game/graft.js';
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
const grafted = (run, host, donor) => {
  const h = addWeapon(run, host);
  const d = addWeapon(run, donor);
  assert.ok(graft(run, h, d).ok, `${host}+${donor}`);
  return h;
};
const dummy = (run, x, y, hp = 1e6) => { const e = spawnEnemy(run, 'brute', x, y); e.speed = 0; e.maxHp = e.hp = hp; return e; };

test('Black Sun: a vortex burns what it pulls and collapses into burning ground', () => {
  const run = newRun();
  const h = grafted(run, 'singularity', 'pyre_crown');
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
  const h = grafted(run, 'whirlwind_cleaver', 'seraph_blades');
  dummy(run, 60, 0);
  let max = 0;
  for (let i = 0; i < 60 * 3; i++) { run.update(STEP, { x: 0, y: 0 }); max = Math.max(max, run.world.projectiles.count); }
  assert.ok(max >= 3, `blades in flight (${max})`);
  assert.ok(h.graft.id === 'bladestorm');
});

test('Comet: the arrow ends in a ring of shards', () => {
  const run = newRun();
  const h = grafted(run, 'sunpiercer', 'glacial_bloom');
  dummy(run, 150, 0);
  let max = 0;
  for (let i = 0; i < 60 * 4; i++) { run.update(STEP, { x: 0, y: 0 }); max = Math.max(max, run.world.projectiles.count); }
  assert.ok(max >= 8, `shards appeared (${max})`);
  assert.ok(h.tags.set.has('frost'));
});

test('Fault Line: a shockwave leaves cracks that burn and shock', () => {
  const run = newRun();
  const h = grafted(run, 'quakebreaker', 'stormshell_mortar');
  const e = dummy(run, 100, 0);
  run.player.weapons.length = 0;
  run.player.weapons.push(h);
  tick(run, 2.5);
  assert.ok(run.hazards.some((x) => x.shock), 'cracks on the ground');
  assert.ok(e.maxHp - e.hp > 0);
});

test('Wrath: pillars linger and lightning links them', () => {
  const run = newRun();
  const h = grafted(run, 'judgement', 'thunder_lance');
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
  const h = grafted(run, 'prismatic_bolt', 'grave_legion');
  const e = dummy(run, 120, 0);
  tick(run, 4);
  assert.equal(h.fam.length, 3);
  assert.ok(e.hp < e.maxHp);
});
