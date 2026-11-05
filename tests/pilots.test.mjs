// Pilots (docs/plan-v12-pilots.md, M1): the run starts from a pilot, its rules reach the rig, and saves and resumes carry it.

import { test, assert, approx } from './harness.mjs';
import { createOverclockedRun } from '../src/game/ovrun.js';
import { snapshotRun, restoreRun } from '../src/game/run-snapshot.js';
import { PILOTS, PILOT_IDS, DEFAULT_PILOT, pilotRig } from '../src/data/pilots.js';
import { PASSIVES, passiveMax, passiveValues } from '../src/rig/passives.js';
import { passivePool, capacityOffers, makeOffers } from '../src/rig/offers.js';
import { addChassis, addSlot, takePassive, slotMax, replaceChassis, cloneRig } from '../src/rig/editor.js';
import { canTakeNew } from '../src/rig/workbench.js';
import { chassisStats } from '../src/rig/chassis.js';
import { createRng } from '../src/core/rng.js';
import { createSave, normalize, entryFromSummary } from '../src/save/save.js';

const VIEW = { w: 390, h: 844, insetTop: 0 };
const STEP = 1 / 30;
const start = (pilotId, debug = {}) => createOverclockedRun({ seed: 7, view: VIEW, debug, sfx: () => {}, pilotId });
const slotsOf = (run, i = 0) => run.rigState.chains[i].slots.filter(Boolean);

test('Rookie is the default and is the old plain start', () => {
  for (const run of [start(undefined), start('rookie'), start('nonsense')]) {
    assert.equal(run.pilot, 'rookie');
    assert.deepEqual(run.rigState.chains.map((c) => [c.chassis, c.mk, c.slots.length, slotsOf({ rigState: { chains: [c] } })]), [['standard', 1, 3, ['blaster']]]);
    assert.equal(run.player.stats.get('maxHp'), 130);
    assert.equal(run.player.stats.get('moveSpeed'), 150);
    assert.deepEqual(run.rigState.passives, {});
  }
});

test('Courier starts on Strider with Momentum Lv1, 20 less HP, 20% faster and a wider magnet', () => {
  const run = start('courier');
  assert.deepEqual([run.rigState.chains[0].chassis, run.rigState.chains[0].mk, slotsOf(run)], ['strider', 1, ['blaster']]);
  assert.equal(run.rigState.chains[0].slots.length, 4);
  assert.deepEqual(run.rigState.passives, { momentum: 1 });
  assert.equal(run.player.stats.get('maxHp'), 110);
  assert.equal(run.player.hp, 110);
  approx(run.player.stats.get('moveSpeed'), 180, 1e-6);
  approx(run.player.stats.get('pickupRadius') / start('rookie').player.stats.get('pickupRadius'), 1.4, 1e-6);
  approx(run.rig.chains[0].pv.momentum, PASSIVES.momentum.values[0], 1e-9);
});

test('Bulwark starts on Anchor with Turret Mode Lv1: more HP and armor, slower, and +4 armor while braced', () => {
  const run = start('bulwark');
  assert.deepEqual([run.rigState.chains[0].chassis, slotsOf(run), run.rigState.passives], ['anchor', ['blaster'], { turret: 1 }]);
  assert.equal(run.player.stats.get('maxHp'), 180);
  assert.equal(run.player.stats.get('armor'), 3);
  approx(run.player.stats.get('moveSpeed'), 127.5, 1e-6);
  for (let i = 0; i < 20; i++) run.update(STEP, { x: 0, y: 0 });         // not yet a second
  assert.equal(run.player.stats.get('armor'), 3);
  for (let i = 0; i < 20; i++) run.update(STEP, { x: 0, y: 0 });         // standing still for more than a second: braced
  assert.equal(run.player.stats.get('armor'), 7);
  run.update(STEP, { x: 1, y: 0 });
  assert.equal(run.player.stats.get('armor'), 3, 'moving ends it');
  for (let i = 0; i < 40; i++) run.update(STEP, { x: 0, y: 0 });
  assert.equal(run.player.stats.get('armor'), 7);
  assert.equal(run.player.stats.mods.armor.filter((m) => m.source === 'pilot:brace').length, 1, 'one brace modifier, never stacked');
});

test('Bulwark: kills heal 0.5% max HP each while braced, at most 2% a second, and nothing while moving', () => {
  const run = start('bulwark', { god: true });
  run.director.update = () => {};
  run.world.enemies.releaseAll();                                           // no real kills: the test feeds them
  for (let i = 0; i < 70; i++) run.update(STEP, { x: 0, y: 0 });         // braced for over a second, and the heal bank full (2% of 180 = 3.6)
  approx(run.rig.healBank, 3.6, 1e-6);
  run.player.hp = 100;
  run.rig.kills = 3;
  run.update(STEP, { x: 0, y: 0 });
  approx(run.player.hp - 100, 3 * 0.9 + 0.5 * STEP, 0.05);
  run.player.hp = 100;
  run.rig.kills = 10;
  run.update(STEP, { x: 0, y: 0 });
  assert.ok(run.player.hp - 100 < 3.6 - 2.7 + 0.5, `capped: ${run.player.hp - 100}`);
  run.update(STEP, { x: 1, y: 0 });
  run.player.hp = 100;
  run.rig.kills = 5;
  run.update(STEP, { x: 1, y: 0 });
  approx(run.player.hp, 100 + 0.5 * STEP, 0.05);
});

test('Splicer: a 4-slot Standard with Echo and Blaster, chains grow to 8 slots, two chains at most', () => {
  const run = start('splicer');
  const c = run.rigState.chains[0];
  assert.deepEqual([c.chassis, c.slots.length, c.slots.filter(Boolean)], ['standard', 4, ['echo', 'blaster']]);
  assert.equal(run.rigState.cap, 8);
  assert.deepEqual(run.rigState.passives, { hair_trigger: 1 });
  assert.equal(slotMax(run.rigState, 0), 8);
  let r = run.rigState;
  for (let i = 0; i < 6; i++) r = addSlot(r, 0) || r;
  assert.equal(r.chains[0].slots.length, 8);
  assert.equal(addSlot(r, 0), null, 'past 8 there is no room');
  assert.equal(chassisStats({ chassis: 'kiln', mk: 1 }, r.pilot).start, 5);
  assert.equal(chassisStats({ chassis: 'kiln', mk: 1 }).start, 4, 'a rig with no pilot is unchanged');
  assert.equal(canTakeNew(r), true);
  const two = addChassis(r, 'kiln');
  assert.equal(two.chains.length, 2);
  assert.equal(two.chains[1].slots.length, 5, 'a new chain gets the pilot starting bonus');
  assert.equal(canTakeNew(two), false);
  assert.equal(addChassis(two, 'relay'), null, 'no third chain');
  assert.equal(capacityOffers(createRng(3), two).some((o) => o.kind === 'chassis'), false, 'no chassis cards at the chain limit');
  assert.equal(capacityOffers(createRng(3), r).filter((o) => o.kind === 'chassis').length, 2);
  assert.ok(replaceChassis(two, 1, 'relay'), 'replacing is still allowed');
  assert.equal(cloneRig(two).pilot.maxChains, 2, 'a clone keeps the pilot');
  assert.equal(run.rig.chains.length, 1);
});

test('the signature passive reaches Lv4 for its pilot only, and offers stop at the cap', () => {
  const courier = start('courier').rigState;
  assert.equal(passiveMax(courier, 'momentum'), 4);
  assert.equal(passiveMax(courier, 'turret'), 3);
  assert.equal(passiveMax(start('rookie').rigState, 'momentum'), 3);
  let r = courier;
  r = takePassive(r, 'momentum');
  r = takePassive(r, 'momentum');
  assert.equal(r.passives.momentum, 3);
  assert.ok(passivePool(r).includes('momentum'), 'still offered at 3');
  r = takePassive(r, 'momentum');
  assert.equal(r.passives.momentum, 4);
  assert.equal(passivePool(r).includes('momentum'), false);
  assert.equal(takePassive(r, 'momentum'), null);
  approx(passiveValues(r.passives).momentum, 0.6, 1e-9);
  const rk = takePassive(takePassive(takePassive(start('rookie').rigState, 'momentum'), 'momentum'), 'momentum');
  assert.equal(takePassive(rk, 'momentum'), null, 'anyone else stops at 3');
  assert.equal(PASSIVES.turret.desc(4).includes('75%'), true);
  assert.equal(PASSIVES.hair_trigger.desc(4).includes('2.4'), true);
  const deal = makeOffers(createRng(5), r, {});
  assert.ok(deal.length === 3 && deal.every((o) => !(o.kind === 'passive' && o.id === 'momentum')));
});

test('a paused pilot run is still that pilot when it is resumed; an old snapshot is a Rookie run', () => {
  for (const id of ['courier', 'bulwark', 'splicer']) {
    const a = start(id, { god: true });
    for (let i = 0; i < 60; i++) a.update(STEP, { x: 0, y: 0 });
    const snap = JSON.parse(JSON.stringify(snapshotRun(a)));
    const b = restoreRun(snap, { view: VIEW, debug: { god: true }, sfx: () => {} });
    assert.equal(b.pilot, id);
    assert.deepEqual(b.rigState, a.rigState);
    assert.deepEqual(b.rigState.pilot, pilotRig(id));
    for (const k of ['maxHp', 'armor', 'moveSpeed']) approx(b.player.stats.get(k), a.player.stats.get(k), 1e-9);
    assert.equal(b.rig.chains.length, a.rig.chains.length);
  }
  const rk = start('rookie', { god: true });
  const old = JSON.parse(JSON.stringify(snapshotRun(rk)));
  delete old.pilot;
  delete old.top.pilot;
  assert.equal(restoreRun(old, { view: VIEW, debug: { god: true }, sfx: () => {} }).pilot, 'rookie');
});

test('the pilot is saved with a finished run, and old or odd saves read as Rookie', () => {
  const run = start('courier');
  const summary = run.summary();
  assert.equal(summary.pilot, 'courier');
  assert.equal(entryFromSummary(summary).pilot, 'courier');
  assert.equal(entryFromSummary({ ...summary, pilot: undefined }).pilot, 'rookie');
  assert.equal(entryFromSummary({ ...summary, pilot: 'wizard' }).pilot, 'rookie');
  const st = new Map();
  const storage = { getItem: (k) => (st.has(k) ? st.get(k) : null), setItem: (k, v) => st.set(k, String(v)), removeItem: (k) => st.delete(k) };
  const save = createSave(storage);
  assert.equal(save.data.lastPilot, 'rookie');
  save.setLastPilot('bulwark');
  save.setLastPilot('wizard');
  save.recordRun(summary, 5);
  const again = createSave(storage);
  assert.equal(again.data.lastPilot, 'bulwark');
  assert.equal(again.data.history[0].pilot, 'courier');
  const old = normalize({ history: [{ t: 1, cls: 'smith', time: 10, kills: 1, level: 1 }], lastPilot: 'nope' });
  assert.equal(old.lastPilot, 'rookie');
  assert.equal(old.history[0].pilot, 'rookie');
  const lv4 = normalize({ history: [{ ...entryFromSummary(summary), rig: { chains: [{ rule: 'pulse', slots: ['blaster'] }], levels: {}, passives: { momentum: 4 } } }] });
  assert.equal(lv4.history[0].rig.passives.momentum, 4, 'a Lv4 signature passive survives the save');
});

test('a Splicer chain of 8 pieces is recorded and read back whole (the history kept only 6)', () => {
  const eight = ['echo', 'scatter', 'blaster', 'on_hit', 'nova', 'flame', 'heavy', 'slam'];
  const summary = { ...start('splicer').summary(), rig: { chains: [{ chassis: 'relay', mk: 2, rule: 'pulse', slots: eight }], levels: {}, passives: {}, stats: {}, bench: [] } };
  const entry = entryFromSummary(summary);
  assert.deepEqual(entry.rig.chains[0].slots, eight);
  const back = normalize({ history: [entry] });
  assert.deepEqual(back.history[0].rig.chains[0].slots, eight);
  assert.equal(entryFromSummary({ ...summary, rig: { ...summary.rig, chains: [{ ...summary.rig.chains[0], slots: [...eight, 'nova', 'nova'] }] } }).rig.chains[0].slots.length, 8, 'never more than 8');
});

test('every pilot has what the picker needs', () => {
  assert.equal(DEFAULT_PILOT, 'rookie');
  for (const id of PILOT_IDS) {
    const p = PILOTS[id];
    assert.ok(p.name && p.desc && p.cost && p.start.chassis && p.start.slots.length, id);
    if (p.sig) assert.ok(PASSIVES[p.sig.id] && PASSIVES[p.sig.id].values.length >= p.sig.max, `${id} has a value for every level`);
  }
});
