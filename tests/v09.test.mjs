// v0.9: chassis that play differently (docs/plan-v09.md).
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { CHASSIS, migrateChassis, chassisForRule } from '../src/rig/chassis.js';
import { migrateRig, newRig } from '../src/rig/editor.js';
import { chassisCards } from '../src/rig/offers.js';
import { createRng } from '../src/core/rng.js';

test('v0.9.0: Long and Spite are gone and old chains become Standard, keeping their pieces and upgrades', () => {
  assert.equal(CHASSIS.long, undefined);
  assert.equal(CHASSIS.spite, undefined);
  assert.equal(chassisForRule('spite'), 'standard');
  const rig = { chains: [
    { chassis: 'spite', rule: 'spite', mk: 2, charge: 3, cell: 1, slots: ['blaster', 'nova'] },
    { chassis: 'long', rule: 'pulse', mk: 1, charge: 0, cell: 2, slots: ['mortar'] },
    { chassis: 'kiln', rule: 'pulse', mk: 1, charge: 0, cell: 0, slots: ['flame'] },
  ] };
  migrateRig(rig);
  assert.deepEqual(rig.chains.map((c) => [c.chassis, c.rule]), [['standard', 'pulse'], ['standard', 'pulse'], ['kiln', 'pulse']]);
  assert.deepEqual([rig.chains[0].mk, rig.chains[0].charge, rig.chains[0].cell, rig.chains[0].slots], [2, 3, 1, ['blaster', 'nova']]);
  assert.deepEqual(migrateChassis({ rule: 'spite' }), { chassis: 'standard', rule: 'pulse' }, 'a bare rule card');
});

test('v0.9.0: chassis cards never offer a cut chassis, and Standard grows to 6 slots', () => {
  const rng = createRng(3);
  for (let i = 0; i < 40; i++) for (const c of chassisCards(rng, 3)) assert.ok(c.chassis !== 'long' && c.chassis !== 'spite');
  assert.equal(CHASSIS.standard.max, 6);
  assert.equal(Object.keys(CHASSIS).length, 8);
  assert.ok(newRig([{ chassis: 'standard', mk: 3, slots: [], size: 6 }]).chains[0]);
});

test('v0.9.0: Overdrive no longer has a power bonus, and Reaper is slower', () => {
  assert.equal(CHASSIS.overdrive.quirk.power, undefined);
  assert.equal(CHASSIS.overdrive.quirk.costAdd, 1);
  assert.equal(CHASSIS.reaper.quirk.killCharge, 0.3);
});
