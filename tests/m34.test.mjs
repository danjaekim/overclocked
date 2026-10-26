// M34: four masterworks for the new shapes: Aurora Wake, Millstone, Storm Saw, Stormspire
// (docs/design-m30-m33.md §6.2b).

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { fuse, masterworkFor } from '../src/game/fusion.js';
import { MASTERWORKS } from '../src/data/fusions.js';
import { WEAPONS } from '../src/data/weapons.js';
import { validateData } from '../src/data/validate.js';

const STEP = 1 / 60;
const newRun = () => {
  const run = createRun({ seed: 5, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'archer' });
  run.player.weapons.length = 0;
  run.director.update = () => {};
  run.starsteel = 3;
  return run;
};
const dummy = (run, x, y) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = 1e9; return e; };
const make = (host, donor) => {
  const run = newRun();
  const h = addWeapon(run, host);
  const d = addWeapon(run, donor);
  const r = fuse(run, h, d);
  assert.ok(r.ok && r.masterwork, `${host} + ${donor}`);
  return { run, h };
};

test('m34 data: four new masterworks, valid pairs of fusionable (evolved) weapons, in either order', () => {
  assert.deepEqual(validateData(), []);
  for (const id of ['aurora_wake', 'millstone', 'storm_saw', 'stormspire']) {
    const m = MASTERWORKS.find((x) => x.id === id);
    assert.ok(m, id);
    assert.equal(WEAPONS[m.host].rarity, 'evolved');
    assert.equal(WEAPONS[m.donor].rarity, 'evolved');
    assert.equal(masterworkFor(m.donor, m.host), m);
  }
  const pairs = new Set(MASTERWORKS.map((m) => [m.host, m.donor].sort().join('+')));
  assert.equal(pairs.size, MASTERWORKS.length, 'no pair has two masterworks');
});

test('Aurora Wake: the wake blesses what stands in it, and beacons send out rings', () => {
  const { run } = make('vapor_wheel', 'radiant_halo');
  const e = dummy(run, 6, 0);
  let rings = 0;
  for (let i = 0; i < 300; i++) {
    run.update(STEP, { x: i < 150 ? 1 : -1, y: 0 });
    rings = Math.max(rings, run.hazards.filter((h) => h.kind === 6).length);
  }
  assert.ok(rings >= 1, 'a beacon ring');
  run.player.x = 0; run.player.y = 0;
  for (let i = 0; i < 90; i++) run.update(STEP, { x: 0, y: 0 });
  assert.ok(e.blessT > 0, 'blessed by the wake');
});

test('Millstone: when the parked saw stops, the maul craters that spot and staggers what it gathered', () => {
  const { run, h } = make('gyre', 'colossus_maul');
  const near = dummy(run, 150, 0);
  const at = [dummy(run, 230, 30), dummy(run, 235, -25)];   // where the saw parks
  let landed = false;
  for (let i = 0; i < 300 && !landed; i++) {
    const before = h.mill.length;
    run.update(STEP, { x: 0, y: 0 });
    if (before && !h.mill.length) landed = true;
  }
  assert.ok(landed, 'the maul came down');
  assert.ok(at.some((e) => e.stunT > 0), 'and staggered what was there');
  assert.ok(near.hp < near.maxHp);
});

test('Storm Saw: every bounce plants a rod, and close rods link', () => {
  const { run, h } = make('ricochet_saw', 'thunder_lance');
  h.cd = 1e9;
  for (let i = 0; i < 5; i++) dummy(run, 90 + i * 70, (i % 2) * 60);
  run.update(STEP, { x: 0, y: 0 });
  h.cd = 0;
  let rods = 0;
  for (let i = 0; i < 120; i++) { run.update(STEP, { x: 0, y: 0 }); rods = Math.max(rods, run.hazards.filter((x) => x.kind === 7).length); }
  assert.ok(rods >= 3, `rods planted: ${rods}`);
  assert.ok(run.hazards.every((x) => x.kind !== 7 || x.src === h));
});

test('Stormspire: a rod zap forks through the crowd around it', () => {
  const { run, h } = make('thunder_lance', 'tempest');
  const es = [];
  for (let i = 0; i < 12; i++) es.push(dummy(run, 160 + (i % 4) * 45, (Math.floor(i / 4) - 1) * 50));
  for (let i = 0; i < 240; i++) run.update(STEP, { x: 0, y: 0 });
  assert.ok(run.statsSnapshot().causes.some((c) => c.name === 'Shock chains'), 'fork damage is credited to chains');
  assert.ok(es.filter((e) => e.hp < e.maxHp).length >= 8);
});
