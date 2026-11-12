// Boss rewards (docs/plan-v13-boss-rewards.md, M2): Overcharge on the compile, in play, and on the rig.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { compileChain, chainCost } from '../src/rig/chain.js';
import { installRig, rigEvent } from '../src/rig/rig.js';
import { OVERCHARGE, PIECES } from '../src/rig/pieces.js';
import { createOverclockedRun } from '../src/game/ovrun.js';
import { snapshotRun, restoreRun } from '../src/game/run-snapshot.js';
import { rewardChoices, takeReward, overchargedOf, retrofitRules } from '../src/rig/rewards.js';
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

test('rewards by pilot: Rookie Retrofit, Splicer Feedback loop, Overclocker Overcharge, the rest none yet', () => {
  const want = { rookie: 'retrofit', splicer: 'loop', overclocker: 'overcharge' };
  for (const id of PILOT_IDS) assert.equal(rewardOfPilot(pilotRig(id)), want[id] || null, id);
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

const act = (rig, ev) => rig.log.filter((l) => l.ev === ev);

test('Retrofit: a second rule card starts the chain on its own timer, from the one battery', () => {
  const fires = (extra) => {
    const run = newRun();
    const rig = installRig(run, [{ rule: 'pulse', slots: ['blaster'], energy: 400, recharge: 50, extra }], { log: true });
    dummy(run, 100, 0);
    tick(run, 6.5);
    return act(rig, 'activate').length;
  };
  const plain = fires(undefined);
  assert.equal(plain, 7, 'Pulse alone: 0.3, 1.3, ... 6.3');
  assert.ok(fires(['rapid']) >= 14, 'Pulse and Rapid: Rapid adds about 10');
  const run = newRun();
  const rig = installRig(run, [{ rule: 'pulse', slots: ['blaster'], energy: 400, recharge: 0, extra: ['rapid', 'pulse', 'nonsense'] }]);
  assert.equal(rig.chains[0].extra.length, 1, 'its own rule and unknown ones are ignored');
});

test('Retrofit: Stride as an extra only fires while moving; Reaper as an extra fires on kills', () => {
  const run = newRun();
  const rig = installRig(run, [{ rule: 'anchor', slots: ['blaster'], energy: 400, recharge: 50, extra: ['stride'] }], { log: true });
  dummy(run, 100, 0);
  for (let i = 0; i < 120; i++) run.update(STEP, { x: 1, y: 0 });         // walking: Anchor is silent, Stride fires
  const moving = act(rig, 'activate').length;
  assert.ok(moving >= 2, `stride fired while walking: ${moving}`);
  const run2 = newRun();
  const rig2 = installRig(run2, [{ rule: 'pulse', slots: ['blaster'], energy: 400, recharge: 50, extra: ['reaper'] }], { log: true });
  const e = dummy(run2, 100, 0, 1);
  run2.player.weapons.length = 0;
  tick(run2, 0.1);
  e.hp = 0;
  rigEvent(run2, 'kill');
  tick(run2, 0.05);
  assert.ok(act(rig2, 'activate').length >= 1, 'a kill started the chain');
});

test('takeReward Retrofit: a chain and a rule it lacks, at most 2 extras, kept through a chassis swap', () => {
  const rig = createOverclockedRun({ seed: 7, view: { w: 390, h: 844, insetTop: 0 }, debug: {}, sfx: () => {}, pilotId: 'rookie' }).rigState;
  assert.deepEqual(rewardChoices(rig, 'retrofit'), [0]);
  assert.ok(!retrofitRules(rig, 0).includes('pulse'), 'not its own rule');
  assert.equal(takeReward(rig, { id: 'retrofit', chain: 0, rule: 'pulse', n: 1 }), null);
  assert.equal(takeReward(rig, { id: 'retrofit', chain: 3, rule: 'reaper', n: 1 }), null);
  const a = takeReward(rig, { id: 'retrofit', chain: 0, rule: 'reaper', n: 1 });
  assert.deepEqual(a.chains[0].extra, ['reaper']);
  assert.equal(rig.chains[0].extra, undefined, 'the old rig is untouched');
  assert.equal(takeReward(a, { id: 'retrofit', chain: 0, rule: 'reaper', n: 2 }), null, 'not twice');
  const b = takeReward(a, { id: 'retrofit', chain: 0, rule: 'rapid', n: 2 });
  assert.deepEqual(rewardChoices(b, 'retrofit'), [], 'two extras is the limit');
  assert.deepEqual(chainDefOf(b, 0).extra, ['reaper', 'rapid']);
  const r = replaceChassis(b, 0, 'reaper', 1).rig;
  assert.deepEqual(r.chains[0].extra, ['rapid'], 'kept, minus the card the new chassis already has');
});

test('Feedback loop: the chain runs again after its last trigger, 3 deep, a share weaker each time, free', () => {
  const run = newRun();
  const rig = installRig(run, [{ rule: 'pulse', slots: ['blaster', 'on_hit', 'nova'], energy: 400, recharge: 50, loop: 0.5 }], { log: true });
  dummy(run, 100, 0, 1e9);
  tick(run, 5);
  const loops = act(rig, 'loop');
  assert.deepEqual([...new Set(loops.map((l) => l.depth))].sort(), [1, 2, 3], 'repeats 1, 2 and 3, never a 4th');
  for (const l of loops) assert.equal(l.scale, 0.5 ** l.depth);
  const none = newRun();
  const r2 = installRig(none, [{ rule: 'pulse', slots: ['blaster', 'on_hit', 'nova'], energy: 400, recharge: 50 }], { log: true });
  dummy(none, 100, 0, 1e9);
  tick(none, 3);
  assert.equal(act(r2, 'loop').length, 0);
  const nested = newRun();
  const r3 = installRig(nested, [{ rule: 'pulse', slots: ['blaster', 'on_hit', 'nova', 'on_kill', 'mortar'], energy: 400, recharge: 50, loop: 0.5 }], { log: true });
  dummy(nested, 100, 0, 1e9);
  tick(nested, 1.25);
  assert.equal(act(r3, 'loop').length, 0, 'the first trigger holds another: only the last one loops (and nothing died)');
});

test('takeReward Feedback loop: any chain with pieces; the second boss lifts every loop to 75%', () => {
  const rig = createOverclockedRun({ seed: 7, view: { w: 390, h: 844, insetTop: 0 }, debug: {}, sfx: () => {}, pilotId: 'splicer' }).rigState;
  assert.deepEqual(rewardChoices(rig, 'loop'), [0]);
  const a = takeReward(rig, { id: 'loop', chain: 0, n: 1 });
  assert.equal(a.chains[0].loop, 0.5);
  assert.equal(takeReward(a, { id: 'loop', chain: 0, n: 2 }).chains[0].loop, 0.75);
  assert.equal(chainDefOf(a, 0).loop, 0.5);
  assert.equal(replaceChassis(a, 0, 'relay', 1).rig.chains[0].loop, 0.5, 'a chassis swap keeps it');
});
