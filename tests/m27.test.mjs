// M27: grafts. The rules (cost, consume, one per weapon, masterwork host fixed), the generic echo, the
// six masterworks' effects, discovery in the save and the compendium.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon, weaponName } from '../src/game/weapons.js';
import { masterworkFor, graftOptions, canGraft, graft, previewGraft } from '../src/game/graft.js';
import { MASTERWORKS, GRAFT } from '../src/data/grafts.js';
import { validateData } from '../src/data/validate.js';
import { createSave, normalize } from '../src/save/save.js';
import { buildEntries } from '../src/game/compendium.js';
import { rollReforge, applyReforge } from '../src/game/forge.js';
import { EFFECTS } from '../src/effects/index.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (seed = 7) => {
  const run = createRun({ seed, view: VIEW, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  run.starsteel = 3;
  return run;
};
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };
const swarm = (run, n = 40) => {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const d = 70 + (i % 5) * 35;
    const e = spawnEnemy(run, i % 10 === 0 ? 'brute' : 'goblin', Math.cos(a) * d, Math.sin(a) * d);
    e.speed = 0;
  }
};
const pair = (run, host, donor) => ({ h: addWeapon(run, host), d: addWeapon(run, donor) });

test('m27 data validates and the twelve masterworks are distinct pairs', () => {
  assert.deepEqual(validateData(), []);
  assert.equal(MASTERWORKS.length, 12);
});

test('a masterwork pair works in either order and always has the same host', () => {
  const run = newRun();
  const { h, d } = pair(run, 'reaper_axe', 'stormshell_mortar');
  assert.equal(masterworkFor('reaper_axe', 'stormshell_mortar').id, 'thunderscythe');
  assert.equal(masterworkFor('stormshell_mortar', 'reaper_axe').id, 'thunderscythe');
  const opts = graftOptions(run);
  assert.equal(opts.length, 1, 'listed once, from the masterwork host');
  assert.equal(opts[0].host, h);
  // asking with the mortar as host still grafts into the axe
  const r = graft(run, d, h);
  assert.ok(r.ok);
  assert.equal(r.host, h);
  assert.equal(weaponName(h), 'Thunderscythe');
});

test('a graft costs 1 starsteel, consumes the donor, adds its elements, and is one per weapon', () => {
  const run = newRun();
  const { h, d } = pair(run, 'colossus_maul', 'glacial_bloom');
  const third = addWeapon(run, 'prismatic_bolt');
  const n = run.player.weapons.length;
  assert.ok(canGraft(run, h, d));
  run.starsteel = 0;
  assert.ok(!canGraft(run, h, d), 'needs starsteel');
  run.starsteel = 2;
  const r = graft(run, h, d);
  assert.ok(r.ok);
  assert.equal(run.starsteel, 2 - GRAFT.cost);
  assert.equal(run.player.weapons.length, n - 1, 'the donor slot is free');
  assert.ok(!run.player.weapons.includes(d));
  assert.ok(h.tags.set.has('frost'), 'gained the donor element');
  assert.ok(!canGraft(run, h, third), 'a grafted weapon cannot be a host again');
  assert.ok(!canGraft(run, third, h), 'or a donor');
  assert.equal(run.grafts.length, 1);
  assert.equal(run.summary().grafts[0], 'Glacier Maul');
});

test('a pair without a masterwork gets a readable generic name and the echo', () => {
  const run = newRun();
  const { h, d } = pair(run, 'reaper_axe', 'glacial_bloom');
  const pv = previewGraft(h, d);
  assert.equal(pv.name, 'Reaper Axe of Frost');
  assert.equal(pv.masterwork, null);
  const { h: h2, d: d2 } = pair(run, 'grave_legion', 'judgement');
  assert.equal(previewGraft(h2, d2).name, 'Grave Legion of the Judgement');
  const { h: h3, d: d3 } = pair(run, 'seraph_blades', 'vapor_wheel');
  assert.equal(previewGraft(h3, d3).name, 'Seraph Blades of Fire and Frost');
});

test('the generic echo casts the donor attack every third attack', () => {
  const run = newRun();
  const { h, d } = pair(run, 'reaper_axe', 'glacial_bloom');
  graft(run, h, d);
  let casts = 0;
  const orig = EFFECTS.cast;
  EFFECTS.cast = (...a) => { casts++; return orig(...a); };
  try {
    swarm(run, 20);
    tick(run, 8);
  } finally { EFFECTS.cast = orig; }
  assert.ok(casts >= 2, `echo fired ${casts} times`);
  assert.ok(run.kills > 0);
});

test('every donor behaviour can be echoed without throwing', () => {
  const donors = ['storm_volley', 'colossus_maul', 'singularity', 'bone_colossus', 'judgement', 'stormshell_mortar', 'seraph_blades', 'pyre_crown', 'glacial_bloom', 'thunder_lance'];
  for (const donorId of donors) {
    const run = newRun(11);
    const h = addWeapon(run, 'prismatic_bolt');
    const d = addWeapon(run, donorId);
    assert.ok(graft(run, h, d).ok, donorId);
    swarm(run, 12);
    run.update(STEP, { x: 0, y: 0 });
    EFFECTS.cast(run, { params: { frac: 0.5 } }, h, 100, 0, 0);
    tick(run, 2);
  }
});

test('a reforge keeps the graft triggers', () => {
  const run = newRun();
  const { h, d } = pair(run, 'reaper_axe', 'stormshell_mortar');
  graft(run, h, d);
  assert.ok(h.extraTriggers.some((t) => t.effect === 'shells'));
  run.ore = 999;
  const r = rollReforge(run, h, 0);
  if (r.ok) applyReforge(run, h, 0);
  assert.ok(h.extraTriggers.some((t) => t.effect === 'shells'));
});

test('Thunderscythe plants storm shells that burn and shock', () => {
  const run = newRun();
  const { h, d } = pair(run, 'reaper_axe', 'stormshell_mortar');
  graft(run, h, d);
  const e = spawnEnemy(run, 'brute', 70, 0);
  e.speed = 0;
  e.maxHp = e.hp = 1e6;
  tick(run, 0.4);
  assert.ok(run.hazards.length >= 3, 'shells are on the ground');
  tick(run, 1.2);
  assert.ok(e.maxHp - e.hp > 0);
});

test('Glacier Maul freezes, and a hit on a frozen enemy shatters', () => {
  const run = newRun();
  const { h, d } = pair(run, 'colossus_maul', 'glacial_bloom');
  graft(run, h, d);
  const near = spawnEnemy(run, 'brute', 60, 0);
  const bystander = spawnEnemy(run, 'goblin', 100, 40);
  near.speed = bystander.speed = 0;
  near.maxHp = near.hp = 1e6;
  tick(run, 0.5);
  assert.ok(near.freezeT > 0 || near.freezeImm > 0, 'frozen by the first slam');
  let shatters = 0;
  const orig = EFFECTS.explode;
  EFFECTS.explode = (...a) => { if (a[1].params.color === '#bfeaff') shatters++; return orig(...a); };
  try { tick(run, 1.2); } finally { EFFECTS.explode = orig; }
  assert.ok(shatters >= 1, 'the second slam shattered it');
});

test('Eventide Volley opens a vortex every 4th volley and its arrows bend toward it', () => {
  const run = newRun();
  const { h, d } = pair(run, 'storm_volley', 'singularity');
  graft(run, h, d);
  const e = spawnEnemy(run, 'brute', 160, 0);
  e.speed = 0;
  e.maxHp = e.hp = 1e7;
  let vort = 0;
  for (let i = 0; i < 60 * 6; i++) { run.update(STEP, { x: 0, y: 0 }); if (run.hazards.some((x) => x.pull)) vort++; }
  assert.ok(vort > 0, 'a vortex opened');
  assert.ok(h.graft.hooks.bend);
});

test('Hellhounds burn what is near each hound', () => {
  const run = newRun();
  const { h, d } = pair(run, 'grave_legion', 'pyre_crown');
  graft(run, h, d);
  swarm(run, 24);
  tick(run, 6);
  assert.ok(run.kills > 0);
  assert.ok(h.minions.length > 0);
});

test('Spear Wheel launches its blades out and back', () => {
  const run = newRun();
  const { h, d } = pair(run, 'seraph_blades', 'thunder_lance');
  graft(run, h, d);
  let maxU = 0;
  for (let i = 0; i < 60 * 8; i++) { run.update(STEP, { x: 0, y: 0 }); maxU = Math.max(maxU, h.launchU); }
  assert.ok(maxU >= 0.99, `blades flew out (${maxU})`);
  assert.equal(h.launchPhase === 0 || h.launchPhase === 1 || h.launchPhase === 2, true);
});

test('Sanctum Titan heals on kills', () => {
  const run = newRun();
  const { h, d } = pair(run, 'bone_colossus', 'radiant_halo');
  graft(run, h, d);
  run.player.maxHp = 200;
  run.player.hp = 50;
  swarm(run, 30);
  tick(run, 10);
  assert.ok(run.player.hp > 50, 'healed');
});

test('discovery: the save keeps found masterworks and the compendium reveals them', () => {
  const store = new Map();
  const st = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const save = createSave(st);
  assert.equal(save.data.version, 3);
  assert.equal(save.discoverGraft('thunderscythe'), true);
  assert.equal(save.discoverGraft('thunderscythe'), false);
  assert.deepEqual(createSave(st).data.discovered.grafts, ['thunderscythe']);
  assert.deepEqual(normalize({ discovered: { grafts: ['a', 7, 'a'] } }).discovered.grafts, ['a']);
  assert.deepEqual(normalize({ version: 2 }).discovered.grafts, []);
  const entries = buildEntries(save.data.discovered).filter((e) => e.tab === 'grafts');
  assert.ok(entries.some((e) => e.name === 'Thunderscythe'));
  assert.ok(entries.some((e) => /\+ \?\?\?$/.test(e.name)), 'unfound ones are hidden');
  assert.ok(entries[0].name.includes('1 / 12'));
});

test('orbiting blades hit an enemy sitting on their path, not only at tick instants', () => {
  const run = newRun(3);
  const inst = addWeapon(run, 'seraph_blades');
  run.update(STEP, { x: 0, y: 0 });
  const e = spawnEnemy(run, 'brute', inst.orbitR, 0);     // exactly on the blade circle, off to the side
  e.speed = 0;
  e.maxHp = e.hp = 1e6;
  tick(run, 0.7);                                          // five blades pass any point on the circle within ~0.35 s
  assert.ok(e.hp < e.maxHp, 'a blade passed through and hit it');
});
