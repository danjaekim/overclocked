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

test('the full piece set: 5 weapons, 7 modifiers, 4 triggers and 7 rule cards', () => {
  const n = { weapon: 0, modifier: 0, trigger: 0 };
  for (const p of Object.values(PIECES)) n[p.type]++;
  assert.deepEqual(n, { weapon: 5, modifier: 7, trigger: 4 });
  assert.equal(Object.keys(RULES).length, 7);
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

test('Storm shocks, Heavy doubles damage and area and slows shots, Sunder passes through 2 more', () => {
  const { run, chain } = rigOf(['storm', 'heavy', 'sunder', 'blaster']);
  const inst = chain.nodes[0].inst;
  const plain = rigOf(['blaster']).chain.nodes[0].inst;
  const r2 = rigOf(['blaster']).run;
  assert.equal(run.player.stats.getFor('shockChance', inst.tags), 1);
  approx(param(run, inst, 'damage') / param(r2, plain, 'damage'), 2, 1e-9);
  approx(param(run, inst, 'radius') / param(r2, plain, 'radius'), 2, 1e-9);
  assert.ok(param(run, inst, 'speed') < param(r2, plain, 'speed'));
  assert.equal(param(run, inst, 'pierce') - param(r2, plain, 'pierce'), 2);
  assert.equal(chain.nodes[0].cost, 1 + 1 + 2 + 1);  // blaster 1 + storm 1 + heavy 2 + sunder 1
});

test('Echo fires the weapon twice, 0.2 s apart, at 75% each, for one payment', () => {
  const { run, rig } = rigOf(['echo', 'blaster']);
  dummy(run, 120, 0);
  tick(run, 0.31);
  assert.equal(events(rig, 'fire').length, 1);
  const first = run.world.projectiles.active[0];
  approx(first.dmg, param(run, rig.chains[0].nodes[0].inst, 'damage') * 0.75, 1e-9);
  assert.equal(events(rig, 'fire')[0].pool, 40 - 3);
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

test('a Blaster volley is three separate hits: On Hit runs its payload once for each', () => {
  const { run, rig } = rigOf(['blaster', 'on_hit', 'nova']);
  dummy(run, 100, 0, 5000);
  tick(run, 0.7);                                                    // one pulse at 0.3 s; the shots land well before 0.7
  assert.equal(events(rig, 'fire', 'blaster').length, 1);
  assert.equal(events(rig, 'payload').length, 3);
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

test('piece levels add 10% a level to the attack, to each held modifier, and to a trigger\'s payload', () => {
  const slots = ['flame', 'mortar', 'on_impact', 'nova'];
  const base = compileChain({ rule: 'pulse', slots });
  assert.equal(base.nodes[0].power, 1);
  const lv = compileChain({ rule: 'pulse', slots, levels: { mortar: 3, flame: 2, on_impact: 5 } });
  approx(lv.nodes[0].power, 1.2 * 1.1, 1e-9);
  approx(lv.nodes[0].trigger.payload[0].power, 1.4 * 1.3 * 1.25 * 1.25, 1e-9);   // level 5 trigger, the payload bonus, two signature steps
  const { run, rig } = rigOf(['blaster'], { levels: { blaster: 5 } });
  dummy(run, 120, 0);
  tick(run, 0.4);
  approx(run.world.projectiles.active[0].dmg, param(run, rig.chains[0].nodes[0].inst, 'damage') * 1.4, 1e-9);
});

test('analyze words the new triggers and costs Every 3rd at nothing', () => {
  const a = analyzeChain({ rule: 'reaper', slots: ['blaster', 'every_3rd', 'echo', 'nova'], energy: 12 });
  assert.ok(a.text.startsWith('On any kill, at most 4 times a second:'));
  assert.ok(a.text.includes('every 3rd time'));
  assert.equal(a.cost, 1 + 0 + (2 + 3 - 1));
});

test('signature levels: Scatter gains copies at 3 and 5, Heavy and Blaster gain stat mods, triggers boost the payload and Every 3rd speeds up', () => {
  const sc = (lv) => compileChain({ rule: 'pulse', slots: ['scatter', 'nova'], levels: { scatter: lv } }).nodes[0];
  assert.deepEqual([1, 3, 5].map((l) => sc(l).copies), [5, 6, 7]);
  const hv = compileChain({ rule: 'pulse', slots: ['heavy', 'sunder', 'blaster'], levels: { heavy: 5, sunder: 3, blaster: 3 } }).nodes[0];
  assert.deepEqual(hv.sigMods.map((m) => m.stat).sort(), ['area', 'area', 'projectiles']);
  assert.equal(hv.sunder, 6, 'Sunder at level 3 holds one more stack');
  const ev = (lv) => compileChain({ rule: 'pulse', slots: ['blaster', 'every_3rd', 'nova'], levels: { every_3rd: lv } }).nodes[0].trigger;
  assert.deepEqual([1, 3, 5].map((l) => ev(l).every), [3, 3, 2]);
  approx(ev(1).payload[0].power, 1.3 * 2, 1e-9);                                   // the payload bonus and Every 3rd's own x2
  approx(ev(3).payload[0].power, 1.2 * 1.3 * 2 * 1.25, 1e-9);
  const ec = (lv) => compileChain({ rule: 'pulse', slots: ['echo', 'nova'], levels: { echo: lv } }).nodes[0];
  assert.deepEqual([1, 3, 5].map((l) => [ec(l).echoMult, ec(l).echoShots]), [[0.75, 1], [0.9, 1], [0.9, 2]]);
});

test('Spite hits harder and heals more the lower your hp is', () => {
  const heal = (hp) => {
    const run = newRun();
    installRig(run, [{ rule: 'spite', slots: ['nova'], energy: 10 }], { log: true });
    run.player.hp = hp;
    const rig = run.rig;
    rigEvent(run, 'hurt');
    tick(run, 0.05);
    return { healed: run.player.hp - hp, scale: rig.log.find((l) => l.ev === 'activate') && rig.chains[0].act.scale };
  };
  const hi = heal(run0max());
  function run0max() { const r = newRun(); return r.player.maxHp - 1; }
  const lo = heal(10);
  assert.ok(lo.scale > hi.scale && lo.healed > hi.healed, JSON.stringify([lo, hi]));
});

test('reactions: every ordered pair of elements has one, the same element twice intensifies', () => {
  const r = (a, b) => compileChain({ rule: 'pulse', slots: [a, b, 'blaster'] }).nodes[0].reaction;
  assert.deepEqual(
    [['flame', 'frost'], ['frost', 'flame'], ['flame', 'storm'], ['storm', 'flame'], ['frost', 'storm'], ['storm', 'frost'], ['flame', 'flame'], ['frost', 'frost'], ['storm', 'storm']].map(([a, b]) => r(a, b)),
    ['steam', 'shatter', 'overload', 'plasma', 'superconduct', 'static', 'intensify_fire', 'intensify_frost', 'intensify_storm']);
  assert.equal(compileChain({ rule: 'pulse', slots: ['flame', 'sunder', 'frost', 'blaster'] }).nodes[0].reaction, 'steam');   // held in order, neighbours in the element sequence
  assert.equal(compileChain({ rule: 'pulse', slots: ['flame', 'blaster'] }).nodes[0].reaction, null);
});

test('reactions: Overload bursts a burning enemy and spends its fire, Plasma leaves burning ground, Static pulls enemies in', () => {
  const ov = rigOf(['flame', 'storm', 'blaster']);
  const a = dummy(ov.run, 100, 0);
  const b = dummy(ov.run, 100, 30);
  tick(ov.run, 1.6);                                          // the first hit lights it, a later one sets it off
  assert.ok(b.hp < b.maxHp, 'the neighbour took blast damage');
  const pl = rigOf(['storm', 'flame', 'blaster']);
  dummy(pl.run, 100, 0);
  tick(pl.run, 0.8);
  assert.ok(pl.run.hazards.length > 0, 'burning ground');
  const st = rigOf(['storm', 'frost', 'blaster']);
  const c = dummy(st.run, 100, 0);
  const d = dummy(st.run, 100, 60);
  tick(st.run, 0.7);
  assert.ok(Math.abs(d.y - c.y) < 60, 'pulled together');
});

test('reactions: Superconduct adds crit chance and Intensify adds status power to the weapon only', () => {
  const sc = rigOf(['frost', 'storm', 'blaster', 'nova']);
  const [blaster, nova] = sc.chain.nodes.map((n) => n.inst);
  const base = sc.run.player.stats.getFor('critChance', nova.tags);
  approx(sc.run.player.stats.getFor('critChance', blaster.tags) - base, 0.75, 1e-9);
  const it = rigOf(['flame', 'flame', 'blaster', 'nova']);
  const [b2, n2] = it.chain.nodes.map((n) => n.inst);
  assert.ok(it.run.player.stats.getFor('burnPower', b2.tags) > it.run.player.stats.getFor('burnPower', n2.tags));
});

test('overclocked levels 6 and 7 add x1.25 power each on top of level 5', () => {
  const p = (lv) => compileChain({ rule: 'pulse', slots: ['blaster'], levels: { blaster: lv } }).nodes[0].power;
  approx(p(5), 1.4, 1e-9);
  approx(p(6), 1.4 * 1.25, 1e-9);
  approx(p(7), 1.4 * 1.25 * 1.25, 1e-9);
});

test('Sunder: each direct hit adds a stack, up to the cap, and the stacks wear off 3 s after the last hit', async () => {
  const { SUNDER } = await import('../src/rig/pieces.js');
  const { run, rig } = rigOf(['sunder', 'blaster']);
  const e = dummy(run, 100, 0);
  tick(run, 0.55);                                                   // the first 3-shot volley has landed
  assert.equal(e.sunderN, 3);
  tick(run, 1.2);                                                    // later volleys cap it
  assert.equal(e.sunderN, SUNDER.max);
  rig.chains[0].bat.pool = 0;                                        // stop firing and watch the clock
  tick(run, SUNDER.duration + 0.3);
  assert.equal(e.sunderN, 0);
});

test('Sunder raises the damage an enemy takes by 8% a stack, from any source', async () => {
  const { SUNDER } = await import('../src/rig/pieces.js');
  const { resolveHit } = await import('../src/game/hit.js');
  const { run, rig } = rigOf(['blaster']);
  const inst = rig.chains[0].nodes[0].inst;
  const a = dummy(run, 500, 500);
  const b = dummy(run, -500, -500);
  b.sunderN = 4; b.sunderS = 10;
  run.player.stats.add({ stat: 'critChance', op: 'flat', value: -1, tags: [inst.instanceTag], source: 'test' });
  resolveHit(run, inst, a, 100, 1, 0);
  resolveHit(run, inst, b, 100, 1, 0);
  run.update(STEP, { x: 0, y: 0 });
  approx((1e9 - b.hp) / (1e9 - a.hp), 1 + SUNDER.per * 4, 1e-6);
});

test('migrateRig renames Pierce to Sunder in slots, bench and levels', async () => {
  const { migrateRig } = await import('../src/rig/editor.js');
  const r = migrateRig({ chains: [{ slots: ['pierce', 'blaster', null] }], bench: ['pierce', null], levels: { pierce: 3, blaster: 2 } });
  assert.deepEqual(r.chains[0].slots, ['sunder', 'blaster', null]);
  assert.deepEqual(r.bench, ['sunder', null]);
  assert.deepEqual(r.levels, { blaster: 2, sunder: 3 });
});

test('a saved run history entry that names Pierce loads as Sunder, and a resumed run does too', async () => {
  const { entryFromSummary, normalize } = await import('../src/save/save.js');
  const e = entryFromSummary({ classId: 'smith', time: 1, kills: 1, level: 1, seed: 1, rig: { chains: [{ rule: 'pulse', slots: ['pierce', 'blaster'] }], levels: { pierce: 3 } } }, 1);
  assert.deepEqual(e.rig.chains[0].slots, ['sunder', 'blaster']);
  assert.deepEqual(e.rig.levels, { sunder: 3 });
  const { snapshotRun, restoreRun } = await import('../src/game/run-snapshot.js');
  const { createOverclockedRun } = await import('../src/game/ovrun.js');
  const run = createOverclockedRun({ seed: 3, view: { w: 390, h: 844, insetTop: 0 }, debug: {}, sfx: () => {} });
  run.rigState.bench = ['pierce', null, null];
  run.rigState.levels.pierce = 2;
  const back = restoreRun(JSON.parse(JSON.stringify(snapshotRun(run))), { view: { w: 390, h: 844, insetTop: 0 }, debug: {}, sfx: () => {} });
  assert.equal(back.rigState.bench[0], 'sunder');
  assert.equal(back.rigState.levels.sunder, 2);
  assert.equal(back.rigState.levels.pierce, undefined);
  void normalize;
});
