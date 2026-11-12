// Boss rewards (docs/plan-v13-boss-rewards.md, M2): Overcharge on the compile, in play, and on the rig.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { compileChain, chainCost } from '../src/rig/chain.js';
import { installRig } from '../src/rig/rig.js';
import { OVERCHARGE, PIECES } from '../src/rig/pieces.js';
import { createOverclockedRun } from '../src/game/ovrun.js';
import { snapshotRun, restoreRun } from '../src/game/run-snapshot.js';
import { rewardChoices, takeReward, overchargedOf } from '../src/rig/rewards.js';
import { rewardOfPilot, REWARDS } from '../src/data/boss-rewards.js';
import { PILOTS, PILOT_IDS, pilotRig } from '../src/data/pilots.js';
import { cloneRig, chainDefOf, replaceChassis } from '../src/rig/editor.js';
import { normalize, entryFromSummary } from '../src/save/save.js';

const STEP = 1 / 60;
const newRun = () => {
  const run = createRun({ seed: 11, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};
const dummy = (run, x, y, hp = 1e9) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = hp; return e; };
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };
const comp = (slots, overcharged = []) => compileChain({ rule: 'pulse', slots, overcharged });
const start = () => createOverclockedRun({ seed: 7, view: { w: 390, h: 844, insetTop: 0 }, debug: {}, sfx: () => {}, pilotId: 'overclocker' });

test('only the Overclocker has a reward so far, and it is Overcharge', () => {
  for (const id of PILOT_IDS) assert.equal(rewardOfPilot(pilotRig(id)), id === 'overclocker' ? 'overcharge' : null, id);
  assert.ok(REWARDS.overcharge.name);
  for (const id of Object.keys(PIECES)) assert.ok(OVERCHARGE[id], `${id} has an overcharge`);
});

test('Overcharge compiles: tripled numbers, double energy, payloads that run 3 times', () => {
  const base = comp(['blaster']).nodes[0];
  const oc = comp(['blaster'], ['blaster']).nodes[0];
  assert.equal(oc.cost, base.cost * 2);
  assert.deepEqual(oc.ocMods, [{ stat: 'projectiles', op: 'flat', value: 6 }]);
  assert.equal(comp(['scatter', 'blaster'], ['scatter']).nodes[0].copies, 15);
  assert.equal(comp(['echo', 'blaster'], ['echo']).nodes[0].echoShots, 3);
  { const n = comp(['sunder', 'blaster'], ['sunder']).nodes[0]; assert.equal(n.sunder, 15); assert.equal(n.sunderAdd, 3); }
  const heavy = comp(['heavy', 'mortar'], ['heavy']).nodes[0];
  assert.deepEqual(heavy.ocMods, [{ stat: 'area', op: 'inc', value: 2 }]);
  const hit = comp(['blaster', 'on_hit', 'nova'], ['on_hit']).nodes[0];
  assert.equal(hit.trigger.reps, 3);
  assert.equal(hit.trigger.cost, PIECES.on_hit.cost * 2);
  assert.equal(comp(['blaster', 'on_hit', 'nova']).nodes[0].trigger.reps, 1);
  assert.equal(comp(['blaster', 'every_3rd', 'nova'], ['every_3rd']).nodes[0].trigger.every, 1);
  assert.ok(chainCost(comp(['scatter', 'blaster'], ['scatter']).nodes) > chainCost(comp(['scatter', 'blaster']).nodes));
});

test('an overcharged Blaster fires 9 shots, a plain one 3', () => {
  const shots = (overcharged) => {
    const run = newRun();
    installRig(run, [{ rule: 'pulse', slots: ['blaster'], energy: 40, overcharged }], { log: true });
    dummy(run, 100, 0);
    tick(run, 0.32);
    return run.world.projectiles.count;
  };
  assert.equal(shots([]), 3);
  assert.equal(shots(['blaster']), 9);
});

test('an overcharged On Hit runs the payload 3 times per trigger', () => {
  const run = newRun();
  const rig = installRig(run, [{ rule: 'pulse', slots: ['blaster', 'on_hit', 'nova'], energy: 80, overcharged: ['on_hit'] }], { log: true });
  dummy(run, 100, 0, 5000);
  tick(run, 0.7);
  const n = rig.log.filter((l) => l.ev === 'payload').length;
  assert.ok(n >= 9, `3 hits x 3 runs, got ${n}`);
});

test('takeReward: owned pieces only, once each, kept by clones, chassis swaps and chain defs', () => {
  const rig = start().rigState;
  assert.deepEqual(rewardChoices(rig, 'overcharge'), ['blaster']);
  assert.equal(takeReward(rig, { id: 'overcharge', piece: 'nova', n: 1 }), null, 'not owned');
  const a = takeReward(rig, { id: 'overcharge', piece: 'blaster', n: 1 });
  assert.deepEqual(overchargedOf(a), ['blaster']);
  assert.equal(rig.rewards, undefined, 'the old rig is untouched');
  assert.deepEqual(rewardChoices(a, 'overcharge'), []);
  assert.equal(takeReward(a, { id: 'overcharge', piece: 'blaster', n: 2 }), null, 'once only');
  assert.deepEqual(overchargedOf(cloneRig(a)), ['blaster']);
  assert.deepEqual(chainDefOf(a, 0).overcharged, ['blaster']);
  assert.deepEqual(overchargedOf(replaceChassis(a, 0, 'relay', 1).rig), ['blaster']);
});

test('rewards survive a snapshot and resume, and an old run has none', () => {
  const run = start();
  run.rigState = takeReward(run.rigState, { id: 'overcharge', piece: 'blaster', n: 1 });
  run.bossRewards = 1;
  const back = restoreRun(JSON.parse(JSON.stringify(snapshotRun(run))), { view: { w: 390, h: 844, insetTop: 0 }, debug: {}, sfx: () => {} });
  assert.deepEqual(overchargedOf(back.rigState), ['blaster']);
  assert.equal(back.bossRewards, 1);
  assert.deepEqual(overchargedOf(start().rigState), []);
});

test('past runs keep what was overcharged', () => {
  const run = start();
  run.rigState = takeReward(run.rigState, { id: 'overcharge', piece: 'blaster', n: 1 });
  const e = normalize({ history: [entryFromSummary({ ...run.summary(), rig: { chains: [{ rule: 'pulse', slots: ['blaster'] }], levels: {}, passives: {}, rewards: run.rigState.rewards } })] });
  assert.deepEqual(e.history[0].rig.rewards, [{ id: 'overcharge', piece: 'blaster', n: 1 }]);
});
