// M33c: Chain Lightning's evolution, Tempest (a branching chain), so the chain shape can be grafted.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon, levelUpWeapon } from '../src/game/weapons.js';
import { addPerk, findPerk, levelUpPerk } from '../src/game/perks.js';
import { recipesFor, canEvolve, evolve } from '../src/game/evolution.js';
import { graft, previewGraft } from '../src/game/graft.js';
import { WEAPONS } from '../src/data/weapons.js';
import { EVOLUTIONS } from '../src/data/evolutions.js';
import { validateData } from '../src/data/validate.js';
import { VERSION } from '../src/version.js';

const STEP = 1 / 60;
const newRun = () => {
  const run = createRun({ seed: 4, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'mage' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};
const dummy = (run, x, y) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = 1e9; return e; };

test('m33c data: Tempest is Chain Lightning\'s evolution (Static Charge 2); the Stormshell fusion stays', () => {
  assert.deepEqual(validateData(), []);
  assert.equal(WEAPONS.static_rod.evolvesInto, 'tempest');
  const r = EVOLUTIONS.find((x) => x.into === 'tempest');
  assert.equal(r.from, 'static_rod');
  assert.ok(r.requires.some((q) => q.perk === 'static_charge' && q.minLevel === 2));
  assert.ok(EVOLUTIONS.some((x) => x.into === 'stormshell_mortar' && x.with === 'static_rod'));
  assert.equal(WEAPONS.tempest.behavior, 'chain');
  assert.ok(/^0\.33\.([2-9]|\d\d)/.test(VERSION) || /^0\.(3[4-9]|[4-9]\d)\./.test(VERSION), VERSION);
});

test('Chain Lightning evolves into Tempest', () => {
  const run = newRun();
  const w = addWeapon(run, 'static_rod');
  while (w.level < 6) levelUpWeapon(run, w);
  addPerk(run, 'static_charge');
  levelUpPerk(run, findPerk(run.player, 'static_charge'));
  run.starsteel = 1;
  const r = recipesFor(w).find((x) => x.into === 'tempest');
  assert.ok(canEvolve(run, w, r));
  assert.ok(evolve(run, w, r).ok);
  assert.equal(w.weaponId, 'tempest');
});

test('Tempest branches: one cast strikes many enemies spread on both sides, each once, weaker each generation', () => {
  const run = newRun();
  const w = addWeapon(run, 'tempest');
  w.cd = 1e9;
  const es = [];
  for (let i = 0; i < 20; i++) es.push(dummy(run, 60 + (i % 5) * 70, (Math.floor(i / 5) - 1.5) * 80));
  run.update(STEP, { x: 0, y: 0 });
  w.cd = 0;
  run.update(STEP, { x: 0, y: 0 });
  const hit = es.filter((e) => e.hp < e.maxHp);
  assert.ok(hit.length >= 10, `struck ${hit.length}`);
  assert.ok(hit.length <= 15, 'three generations: at most 1 + 2 + 4 + 8');
  const dmg = hit.map((e) => e.maxHp - e.hp).sort((a, b) => b - a);
  assert.ok(dmg[0] > dmg[dmg.length - 1], 'later generations are weaker');
});

test('a Chain Lightning line (the starter) still never forks', () => {
  const run = newRun();
  const w = addWeapon(run, 'static_rod');
  w.cd = 1e9;
  const es = [];
  for (let i = 0; i < 20; i++) es.push(dummy(run, 60 + (i % 5) * 70, (Math.floor(i / 5) - 1.5) * 80));
  run.update(STEP, { x: 0, y: 0 });
  w.cd = 0;
  run.update(STEP, { x: 0, y: 0 });
  assert.equal(es.filter((e) => e.hp < e.maxHp).length, 1 + WEAPONS.static_rod.base.chains + 1, 'first + 4 jumps + the Static Charge-free chains stat (1)');
});

test('Tempest can be grafted both ways: as a donor it gives Arcing x2, as a host it carries a payload', () => {
  const run = newRun();
  run.starsteel = 3;
  const t = addWeapon(run, 'tempest');
  const v = addWeapon(run, 'storm_volley');
  const pv = previewGraft(v, t);
  assert.equal(pv.payload, 'arc2');
  const run2 = newRun();
  run2.starsteel = 3;
  const t2 = addWeapon(run2, 'tempest');
  const m = addWeapon(run2, 'stormshell_mortar');
  assert.ok(graft(run2, t2, m).ok);
  assert.equal(t2.graft.payload, 'blast');
});
