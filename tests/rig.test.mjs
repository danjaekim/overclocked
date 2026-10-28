// M1: the chain engine (src/rig). Pure compile rules first, then the six test chains run headless.

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { param } from '../src/game/weapon-params.js';
import { ST } from '../src/data/statuses.js';
import { compileChain, chainCost } from '../src/rig/chain.js';
import { installRig, removeRig } from '../src/rig/rig.js';
import { TEST_CHAINS } from '../src/rig/presets.js';
import { PIECES } from '../src/rig/pieces.js';

const STEP = 1 / 60;
const newRun = () => {
  const run = createRun({ seed: 11, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};
const dummy = (run, x, y, hp = 1e9) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = hp; return e; };
const tick = (run, s, move = { x: 0, y: 0 }) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, move); };
const rigWith = (key, opts = {}) => {      // the pool is pinned to 10, which the numbers below were worked out for (the game default is 16)
  const run = newRun();
  const rig = installRig(run, [{ ...TEST_CHAINS[key], energy: 10, ...opts }], { log: true });
  return { run, rig, chain: rig.chains[0] };
};
const events = (rig, ev, piece) => rig.log.filter((l) => l.ev === ev && (piece === undefined || l.piece === piece));
const crowd = (run, cx, cy, n = 8) => { for (let i = 0; i < n; i++) dummy(run, cx + (i % 4) * 22, cy + Math.floor(i / 4) * 22); };

// ---- compile rules ----

test('every piece in the test chains exists and every test chain compiles with no problems', () => {
  for (const [key, def] of Object.entries(TEST_CHAINS)) {
    for (const id of def.slots) assert.ok(PIECES[id], `${key}: ${id}`);
    assert.deepEqual(compileChain(def).problems, [], key);
  }
});

test('compile: the spec example is a held Flame, a Mortar with On Impact, and a Scatter Nova payload', () => {
  const c = compileChain(TEST_CHAINS.cluster_mortar);
  assert.equal(c.nodes.length, 1);
  const m = c.nodes[0];
  assert.deepEqual([m.piece, m.mods, m.elements, m.cost], ['mortar', ['flame'], ['fire'], 4]);
  assert.equal(m.trigger.piece, 'on_impact');
  const [nova] = m.trigger.payload;
  assert.deepEqual([nova.piece, nova.scatter, nova.cost], ['nova', true, 4]);
  assert.equal(chainCost(c.nodes), 9);         // 1 + 3 + 1 + 4 (a payload piece costs 1 less): all but one of the pool
});

test('compile: modifiers apply to the next weapon only and the order of elements is kept', () => {
  const a = compileChain({ rule: 'pulse', slots: ['flame', 'frost', 'nova', 'mortar'] });
  assert.deepEqual(a.nodes[0].elements, ['fire', 'frost']);
  assert.equal(a.nodes[0].reaction, 'steam');
  assert.deepEqual(a.nodes[1].mods, []);
  assert.equal(compileChain({ rule: 'pulse', slots: ['frost', 'flame', 'nova'] }).nodes[0].reaction, 'shatter');
  assert.equal(compileChain({ rule: 'pulse', slots: ['flame', 'nova'] }).nodes[0].reaction, null);
});

test('compile: a trigger takes everything to its right, and a modifier does not cross a trigger', () => {
  const c = compileChain({ rule: 'pulse', slots: ['mortar', 'on_impact', 'flame', 'nova', 'on_kill', 'blaster'] });
  const [m] = c.nodes;
  const [nova] = m.trigger.payload;
  assert.deepEqual(nova.mods, ['flame']);
  assert.equal(nova.trigger.piece, 'on_kill');                       // attaches to the nearest weapon on its left, inside the payload
  assert.equal(nova.trigger.payload[0].piece, 'blaster');
  assert.deepEqual(c.problems, []);
});

test('compile: pieces that can never run are reported with a reason', () => {
  const noWeapon = compileChain({ rule: 'pulse', slots: ['on_impact', 'nova', 'flame'] });
  assert.deepEqual(noWeapon.problems.map((p) => p.idx), [0, 1, 2]);
  assert.equal(noWeapon.problems[0].why, 'no weapon before this trigger');
  assert.deepEqual(noWeapon.nodes, []);
  const trailing = compileChain({ rule: 'pulse', slots: ['mortar', 'flame'] });
  assert.deepEqual(trailing.problems, [{ idx: 1, why: 'no weapon after this modifier' }]);
  const stranded = compileChain({ rule: 'pulse', slots: ['mortar', 'flame', 'on_impact', 'nova'] });
  assert.deepEqual(stranded.problems, [{ idx: 1, why: 'no weapon after this modifier' }]);
  const twice = compileChain({ rule: 'pulse', slots: ['mortar', 'on_impact', 'on_kill', 'nova'] });
  assert.equal(twice.problems[0].idx, 2);                            // a second trigger with no weapon of its own in the payload
});

// ---- the six test chains, headless ----

test('1 Blaster: one volley per pulse, 2 energy, full power, from the player', () => {
  const { run, rig, chain } = rigWith('blaster');
  dummy(run, 120, 0);
  tick(run, 0.4);
  const fires = events(rig, 'fire');
  assert.equal(fires.length, 1);
  assert.deepEqual([fires[0].piece, fires[0].copies, fires[0].pool], ['blaster', 1, 8]);
  const prs = run.world.projectiles.active;
  assert.equal(prs.length, 1);
  approx(prs[0].dmg, param(run, chain.nodes[0].inst, 'damage'), 1e-9);
  tick(run, 1);                                                       // the next pulse refills the pool
  assert.equal(events(rig, 'fire').length, 2);
  assert.equal(events(rig, 'fire')[1].pool, 8);
});

test('2 Scatter shot: five shots at 40% power, aimed apart, for 4 energy', () => {
  const { run, rig, chain } = rigWith('scatter_shot');
  dummy(run, 150, 0);
  tick(run, 0.4);
  const f = events(rig, 'fire')[0];
  assert.deepEqual([f.copies, f.pool], [5, 6]);
  const prs = run.world.projectiles.active;
  assert.equal(prs.length, 5);
  const full = param(run, chain.nodes[0].inst, 'damage');
  for (const pr of prs) approx(pr.dmg, full * 0.4, 1e-9);
  assert.equal(new Set(prs.map((pr) => pr.dy.toFixed(3))).size, 5);
});

test('3 Cluster mortar: a burning shell, then five novas at the crater, exactly the 10 energy', () => {
  const { run, rig } = rigWith('cluster_mortar');
  crowd(run, 140, -20);
  tick(run, 0.5);
  const mortar = events(rig, 'fire', 'mortar')[0];
  assert.deepEqual([mortar.mods, mortar.armed, mortar.pool], [['flame'], true, 5]);
  assert.equal(events(rig, 'fire', 'nova').length, 0);                // the shell has not landed yet
  tick(run, 0.6);                                                     // it lands at about 1.0 s
  const pay = events(rig, 'payload');
  assert.equal(pay.length, 1);
  assert.equal(pay[0].trigger, 'on_impact');
  const nova = events(rig, 'fire', 'nova');
  assert.equal(nova.length, 1);
  assert.deepEqual([nova[0].copies, nova[0].pool], [5, 1]);
  assert.deepEqual([nova[0].x, nova[0].y], [pay[0].x, pay[0].y]);     // from the crater, not the player
  assert.equal(events(rig, 'dry').length, 0);
  const burning = [...run.world.enemies.active].filter((e) => e.alive && (e.status & ST.BURN)).length;
  assert.ok(burning > 0, 'the flame made the blast burn');
  tick(run, 0.2);
  assert.equal(run.world.projectiles.count > 0, true);                // the novas' shots are in flight
});

test('4 Steam nova: fire then frost on one nova, and both statuses land', () => {
  const { run, chain } = rigWith('steam_nova');
  const inst = chain.nodes[0].inst;
  assert.equal(chain.nodes[0].reaction, 'steam');
  assert.equal(run.player.stats.getFor('burnChance', inst.tags), 1);
  assert.equal(run.player.stats.getFor('chillChance', inst.tags), 1);
  for (let i = 0; i < 16; i++) dummy(run, Math.cos(i * Math.PI / 8) * 70, Math.sin(i * Math.PI / 8) * 70);   // a ring, so the six shots find someone
  tick(run, 1);
  const hit = [...run.world.enemies.active].filter((e) => e.status & ST.BURN);
  assert.ok(hit.length > 0, 'burning');
  assert.ok(hit.every((e) => e.status & (ST.CHILL | ST.FROZEN)), 'and chilled');
});

test('5 Shatter shell: Stride waits for movement, then casts a frost-then-fire shell for 5 energy', () => {
  const { run, rig, chain } = rigWith('shatter_shell');
  assert.equal(chain.nodes[0].reaction, 'shatter');
  dummy(run, 130, 0);
  tick(run, 1.5);
  assert.equal(events(rig, 'activate').length, 0);                    // standing still: no activation
  tick(run, 0.5, { x: 0.01, y: 0 });
  const a = events(rig, 'activate');
  assert.equal(a.length, 1);
  const f = events(rig, 'fire', 'mortar')[0];
  assert.deepEqual([f.mods, f.pool, f.armed], [['frost', 'flame'], 5, false]);
  tick(run, 1.5, { x: 0.01, y: 0 });                                  // every 0.5 s while moving
  assert.ok(events(rig, 'activate').length >= 3);
});

test('6 Kill chain: kills set off novas, whose kills set off more, until the energy runs out', () => {
  const { run, rig } = rigWith('kill_chain');
  for (let i = 0; i < 24; i++) {                                      // a ring of one-hit goblins, so every shot kills something
    const a = (i / 24) * Math.PI * 2;
    dummy(run, 100 + Math.cos(a) * 70, 130 + Math.sin(a) * 70, 1);
  }
  tick(run, 1);                                                       // the first activation only
  const mine = (ev, piece) => events(rig, ev, piece).filter((l) => l.act === 1);
  assert.equal(mine('fire', 'blaster')[0].pool, 7);                   // 2 for the Blaster + 1 for On Kill
  const novas = mine('fire', 'nova');
  assert.equal(novas.length, 3);                                      // 7 pays for a nova + its On Kill (3, payload pieces cost 1 less), then two more novas (2 each)
  assert.deepEqual(novas.map((n) => n.armed), [true, false, false]);  // the later ones have nothing left to arm a trigger with
  assert.equal(novas[2].pool, 0);
  assert.ok(mine('payload').length >= 3, 'kills kept asking for payloads');
  assert.ok(rig.log.every((l) => l.pool === undefined || l.pool >= 0));
});

// ---- engine rules ----

test('energy: a chain with an empty pool never fires, and rig pieces never fire on a cooldown of their own', () => {
  const run = newRun();
  const rig = installRig(run, [{ rule: 'pulse', slots: ['blaster', 'nova', 'mortar'], energy: 0 }], { log: true });
  crowd(run, 100, 0);
  tick(run, 3);
  assert.equal(run.world.projectiles.count, 0);
  assert.equal(events(rig, 'fire').length, 0);
  assert.ok(events(rig, 'dry').length >= 2);
});

test('energy: the activation stops at the first piece it cannot pay for', () => {
  const run = newRun();
  const rig = installRig(run, [{ rule: 'pulse', slots: ['mortar', 'mortar', 'mortar', 'mortar'], energy: 10 }], { log: true });
  crowd(run, 130, 0);
  tick(run, 0.4);
  assert.equal(events(rig, 'fire').length, 3);                        // 3 + 3 + 3, and the fourth needs 3 of the 1 left
  assert.equal(events(rig, 'dry').length, 1);
  assert.equal(events(rig, 'dry')[0].pool, 1);
});

test('with no enemy in range a piece does not fire and spends nothing', () => {
  const { run, rig } = rigWith('blaster');
  tick(run, 0.5);
  assert.equal(events(rig, 'fire').length, 0);
  assert.equal(events(rig, 'skip').length, 1);
});

test('a second chain runs on its own timer and pool', () => {
  const run = newRun();
  const rig = installRig(run, [{ ...TEST_CHAINS.blaster, energy: 10 }, { rule: 'pulse', slots: ['nova'], energy: 10 }], { log: true });
  dummy(run, 90, 0);
  tick(run, 0.4);
  const acts = events(rig, 'activate');
  assert.deepEqual(acts.map((a) => a.chain), [0, 1]);
  assert.deepEqual(events(rig, 'fire').map((f) => f.pool), [8, 7]);
});

test('installing a rig again replaces the first; its shots in flight set nothing off', () => {
  const { run, rig } = rigWith('cluster_mortar');
  crowd(run, 140, -20);
  tick(run, 0.6);
  assert.equal(run.rig, rig);
  const before = run.player.stats.mods.burnChance.length;
  assert.ok(before > 0);
  removeRig(run);
  assert.equal(run.rig, null);
  assert.equal(run.player.stats.mods.burnChance.length, 0);
  tick(run, 1);                                                       // the shell lands with no rig behind it
  assert.equal(events(rig, 'payload').length, 0);
});
