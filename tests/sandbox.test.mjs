// M2: the sandbox (game/sandbox.js) and the Steam and Shatter reactions (rig/reactions.js).

import { test, assert } from './harness.mjs';
import { createSandboxRun, loadChain, chainKeys, SANDBOX, START_CHAINS } from '../src/game/sandbox.js';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { installRig } from '../src/rig/rig.js';
import { TEST_CHAINS } from '../src/rig/presets.js';
import { gainXp } from '../src/game/xp.js';
import { ST } from '../src/data/statuses.js';

const STEP = 1 / 60;
const tick = (run, s, move = { x: 0, y: 0 }) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, move); };
const view = { w: 480, h: 1040 };
const sandbox = () => createSandboxRun({ seed: 5, view, debug: {}, sfx: () => {} });
const bare = () => {
  const run = createRun({ seed: 11, view, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};
const dummy = (run, x, y, hp = 1e9) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = hp; return e; };

test('sandbox: starts with two chains, no class weapon, and an arena that fills to its target', () => {
  const run = sandbox();
  assert.equal(run.player.weapons.length, 0);
  assert.deepEqual(run.rig.chains.map((c) => c.def.key), START_CHAINS);
  assert.deepEqual(chainKeys(run), START_CHAINS);
  tick(run, 10);
  assert.ok(run.world.enemies.count >= SANDBOX.target - 10 && run.world.enemies.count <= SANDBOX.target, `enemies ${run.world.enemies.count}`);
});

test('sandbox: the chains kill things, the player cannot die and the run never ends, and XP levels you up', () => {
  const run = sandbox();
  tick(run, 90);
  assert.ok(run.kills > 20, `kills ${run.kills}`);
  assert.equal(run.over, false);
  assert.ok(run.player.level > 1, 'kills gave XP');
  assert.equal(run.pendingLevelUps, run.player.level - 1);
  assert.equal(run.player.hp, run.player.maxHp);
});

test('sandbox: loading a chain replaces one slot and keeps the other', () => {
  const run = sandbox();
  tick(run, 2);
  loadChain(run, 1, 'kill_chain');
  assert.deepEqual(chainKeys(run), ['cluster_mortar', 'kill_chain']);
  assert.deepEqual(run.rig.chains.map((c) => c.def.slots.filter(Boolean)), [TEST_CHAINS.cluster_mortar.slots, TEST_CHAINS.kill_chain.slots]);
  tick(run, 5);
  assert.ok(run.kills > 0);
});

test('sandbox: the old chain leaves no element modifiers behind when replaced', () => {
  const run = sandbox();
  const before = run.player.stats.mods.burnChance.length;
  assert.ok(before > 0);                                       // Cluster mortar's Flame
  loadChain(run, 0, 'blaster');
  assert.equal(run.player.stats.mods.burnChance.length, 0);
});

test('Steam: a hit on the fire-then-frost nova leaves a cloud, and enemies in it wander slower for 2 s', () => {
  const run = bare();
  installRig(run, [{ rule: 'pulse', slots: ['flame', 'frost', 'nova'] }]);
  for (let i = 0; i < 12; i++) dummy(run, Math.cos(i / 12 * Math.PI * 2) * 60, Math.sin(i / 12 * Math.PI * 2) * 60);
  tick(run, 1.2);
  const steams = run.hazards.filter((h) => h.kind === 8);
  assert.ok(steams.length >= 1, 'a cloud');
  const blind = [...run.world.enemies.active].filter((e) => e.steamT > 0);
  assert.ok(blind.length > 0, 'enemies in the cloud are blind');
  assert.ok(blind.every((e) => e.steamT <= 2));
});

test('Steam does not come from an ordinary fire nova, and clouds are throttled per node', () => {
  const run = bare();
  installRig(run, [{ rule: 'pulse', slots: ['flame', 'nova'] }]);
  for (let i = 0; i < 12; i++) dummy(run, Math.cos(i / 12 * Math.PI * 2) * 60, Math.sin(i / 12 * Math.PI * 2) * 60);
  tick(run, 1.2);
  assert.equal(run.hazards.filter((h) => h.kind === 8).length, 0);
  const run2 = bare();
  installRig(run2, [{ rule: 'pulse', slots: ['flame', 'frost', 'nova'] }]);
  for (let i = 0; i < 12; i++) dummy(run2, Math.cos(i / 12 * Math.PI * 2) * 60, Math.sin(i / 12 * Math.PI * 2) * 60);
  tick(run2, 1.2);
  assert.ok(run2.hazards.filter((h) => h.kind === 8).length <= 3);
});

test('Shatter: a chilled enemy that is hit bursts, hurting its neighbours and losing its chill', () => {
  const run = bare();
  installRig(run, [{ rule: 'pulse', slots: ['frost', 'flame', 'blaster'] }]);
  const target = dummy(run, 100, 0);
  const near = dummy(run, 100, 30);
  const far = dummy(run, 100, 300);
  tick(run, 0.8);
  assert.ok(near.hp < near.maxHp, 'the shards reached the neighbour');
  assert.equal(far.hp, far.maxHp);
  assert.ok(target.hp < target.maxHp);
  assert.equal(target.status & (ST.CHILL | ST.FROZEN), 0, 'the ice is spent');
});

test('Shatter does not happen for an unordered pair or without frost', () => {
  const run = bare();
  installRig(run, [{ rule: 'pulse', slots: ['flame', 'frost', 'blaster'] }]);   // that is Steam
  const target = dummy(run, 100, 0);
  const near = dummy(run, 100, 30);
  tick(run, 0.8);
  assert.equal(near.hp, near.maxHp);
  assert.ok(target.hp < target.maxHp);
});
