// M4: the other eight pieces, the three other rule cards, and piece levels (src/rig).

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { param } from '../src/game/weapon-params.js';
import { compileChain, analyzeChain } from '../src/rig/chain.js';
import { installRig, rigEvent } from '../src/rig/rig.js';
import { PIECES, RULES } from '../src/rig/pieces.js';
import { damagePlayer } from '../src/systems/damage.js';

const STEP = 1 / 60;
const newRun = () => {
  const run = createRun({ seed: 11, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};
const dummy = (run, x, y, hp = 1e9) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = hp; return e; };
const tick = (run, s, move = { x: 0, y: 0 }) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, move); };
const rigOf = (slots, extra = {}) => {
  const run = newRun();
  const rig = installRig(run, [{ rule: 'pulse', slots, energy: 40, ...extra }], { log: true });
  return { run, rig, chain: rig.chains[0] };
};
const events = (rig, ev, piece) => rig.log.filter((l) => l.ev === ev && (piece === undefined || l.piece === piece));

test('the full piece set: 5 weapons, 7 modifiers, 4 triggers and 5 rule cards', () => {
  const n = { weapon: 0, modifier: 0, trigger: 0 };
  for (const p of Object.values(PIECES)) n[p.type]++;
  assert.deepEqual(n, { weapon: 5, modifier: 7, trigger: 4 });
  assert.equal(Object.keys(RULES).length, 5);
});

test('Chain Bolt hits the nearest enemy and jumps, and carries its On Impact', () => {
  const { run, rig } = rigOf(['chain_bolt', 'on_impact', 'nova']);
  const a = dummy(run, 100, 0);
  const b = dummy(run, 150, 0);
  tick(run, 0.4);
  assert.equal(events(rig, 'fire', 'chain_bolt').length, 1);
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp, 'both enemies were struck');
  tick(run, 0.1);
  assert.equal(events(rig, 'payload').length, 1);
  assert.equal(events(rig, 'fire', 'nova').length, 1);
});

test('Slam craters the crowd after its shadow, and On Impact fires from the crater', () => {
  const { run, rig } = rigOf(['slam', 'on_impact', 'blaster']);
  const a = dummy(run, 90, 0);
  tick(run, 0.34);
  assert.equal(events(rig, 'fire', 'slam').length, 1);
  assert.equal(a.hp, a.maxHp, 'the shadow has not landed yet');
  tick(run, 0.3);
  assert.ok(a.hp < a.maxHp, 'the crater hit');
  assert.equal(events(rig, 'payload').length, 1);
});

test('Storm shocks, Heavy doubles damage and area and slows shots, Pierce adds 2', () => {
  const { run, chain } = rigOf(['storm', 'heavy', 'pierce', 'blaster']);
  const inst = chain.nodes[0].inst;
  const plain = rigOf(['blaster']).chain.nodes[0].inst;
  const r2 = rigOf(['blaster']).run;
  assert.equal(run.player.stats.getFor('shockChance', inst.tags), 1);
  approx(param(run, inst, 'damage') / param(r2, plain, 'damage'), 2, 1e-9);
  approx(param(run, inst, 'radius') / param(r2, plain, 'radius'), 2, 1e-9);
  assert.ok(param(run, inst, 'speed') < param(r2, plain, 'speed'));
  assert.equal(param(run, inst, 'pierce') - param(r2, plain, 'pierce'), 2);
  assert.equal(chain.nodes[0].cost, 2 + 1 + 2 + 1 + 1 - 1 + 0);  // blaster 2 + storm 1 + heavy 2 + pierce 1
});

test('Echo fires the weapon twice, 0.2 s apart, at 60% each, for one payment', () => {
  const { run, rig } = rigOf(['echo', 'blaster']);
  dummy(run, 120, 0);
  tick(run, 0.31);
  assert.equal(events(rig, 'fire').length, 1);
  const first = run.world.projectiles.active[0];
  approx(first.dmg, param(run, rig.chains[0].nodes[0].inst, 'damage') * 0.6, 1e-9);
  assert.equal(events(rig, 'fire')[0].pool, 40 - 4);
  tick(run, 0.25);
  assert.equal(events(rig, 'echo').length, 1);
  assert.equal(events(rig, 'fire').length, 1, 'the echo is not a second payment');
});

test('On Hit runs its payload from every enemy hit', () => {
  const { run, rig } = rigOf(['blaster', 'on_hit', 'nova']);
  dummy(run, 100, 0);
  tick(run, 0.7);
  assert.ok(events(rig, 'payload').length >= 1);
  assert.ok(events(rig, 'fire', 'nova').length >= 1);
});

test('Every 3rd runs its payload from the player on every third attack, for 0 energy', () => {
  const { run, rig } = rigOf(['blaster', 'every_3rd', 'nova']);
  dummy(run, 100, 0);
  tick(run, 3.4);                                                    // pulses at 0.3, 1.3, 2.3, 3.3
  assert.equal(events(rig, 'fire', 'blaster').length, 4);
  const payloads = events(rig, 'payload');
  assert.equal(payloads.length, 1);
  assert.deepEqual([payloads[0].x, payloads[0].y], [run.player.x, run.player.y]);
  assert.equal(compileChain({ rule: 'pulse', slots: ['blaster', 'every_3rd', 'nova'] }).nodes[0].trigger.cost, 0);
});

test('Anchor runs only while standing still', () => {
  const run = newRun();
  const rig = installRig(run, [{ rule: 'anchor', slots: ['blaster'], energy: 10 }], { log: true });
  dummy(run, 100, 0);
  tick(run, 1, { x: 1, y: 0 });
  assert.equal(events(rig, 'activate').length, 0);
  tick(run, 1);
  assert.ok(events(rig, 'activate').length >= 1);
});

test('Reaper runs when something dies, at most four times a second', () => {
  const run = newRun();
  const rig = installRig(run, [{ rule: 'reaper', slots: ['blaster'], energy: 10 }], { log: true });
  tick(run, 1);
  assert.equal(events(rig, 'activate').length, 0, 'nothing has died');
  for (let i = 0; i < 10; i++) { rigEvent(run, 'kill'); tick(run, 0.05); }   // ten kills in half a second
  assert.ok(events(rig, 'activate').length >= 1 && events(rig, 'activate').length <= 3);
  const n = events(rig, 'activate').length;
  tick(run, 1);
  assert.equal(events(rig, 'activate').length, n, 'no kills, no activations');
});

test('Spite runs when the player is hit', () => {
  const run = newRun();
  const rig = installRig(run, [{ rule: 'spite', slots: ['nova'], energy: 10 }], { log: true });
  dummy(run, 100, 0);
  tick(run, 1);
  assert.equal(events(rig, 'activate').length, 0);
  damagePlayer(run, 5);
  tick(run, 0.1);
  assert.equal(events(rig, 'activate').length, 1);
});

test('piece levels add 20% a level to the attack, to each held modifier, and to a trigger\'s payload', () => {
  const slots = ['flame', 'mortar', 'on_impact', 'nova'];
  const base = compileChain({ rule: 'pulse', slots });
  assert.equal(base.nodes[0].power, 1);
  const lv = compileChain({ rule: 'pulse', slots, levels: { mortar: 3, flame: 2, on_impact: 5 } });
  approx(lv.nodes[0].power, 1.4 * 1.2, 1e-9);
  approx(lv.nodes[0].trigger.payload[0].power, 1.8, 1e-9);
  const { run, rig } = rigOf(['blaster'], { levels: { blaster: 5 } });
  dummy(run, 120, 0);
  tick(run, 0.4);
  approx(run.world.projectiles.active[0].dmg, param(run, rig.chains[0].nodes[0].inst, 'damage') * 1.8, 1e-9);
});

test('analyze words the new triggers and costs Every 3rd at nothing', () => {
  const a = analyzeChain({ rule: 'reaper', slots: ['blaster', 'every_3rd', 'echo', 'nova'], energy: 12 });
  assert.ok(a.text.startsWith('On any kill, at most 4 times a second:'));
  assert.ok(a.text.includes('every 3rd time'));
  assert.equal(a.cost, 2 + 0 + 2 + 3);
});
