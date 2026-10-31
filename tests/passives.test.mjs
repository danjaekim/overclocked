// M5: the twelve rig passives (src/rig/passives.js). One test each, proving the rule fires.

import { test, assert, approx } from './harness.mjs';
import { createOverclockedRun } from '../src/game/ovrun.js';
import { applyRig } from '../src/game/sandbox.js';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { installRig, rigEvent } from '../src/rig/rig.js';
import { compileChain } from '../src/rig/chain.js';
import { PASSIVES, PASSIVE_IDS } from '../src/rig/passives.js';
import { takePassive, newRig } from '../src/rig/editor.js';
import { makeOffers, applyOffer, describeOffer } from '../src/rig/offers.js';
import { createRng } from '../src/core/rng.js';

const STEP = 1 / 60;
const VIEW = { w: 390, h: 844, insetTop: 0 };
const tick = (run, s, move = { x: 0, y: 0 }) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, move); };
const dummy = (run, x, y, hp = 1e9) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = hp; return e; };
const bare = () => {
  const run = createRun({ seed: 11, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};
const withPassives = (passives) => {
  const run = createOverclockedRun({ seed: 3, view: VIEW, debug: { god: true }, sfx: () => {} });
  run.director.update = () => {};
  run.rigState.passives = passives;
  applyRig(run);
  return run;
};

test('there are twelve passives, each stacking to 3 with a card text for every stack', () => {
  assert.equal(PASSIVE_IDS.length, 12);
  for (const id of PASSIVE_IDS) {
    const p = PASSIVES[id];
    assert.equal(p.max, 3);
    for (let n = 1; n <= 3; n++) assert.ok(typeof p.desc(n) === 'string' && p.desc(n).length > 5, `${id} stack ${n}`);
  }
});

test('Last Word: the last top-level weapon of a chain hits harder, by stack', () => {
  const slots = ['blaster', 'nova'];
  const plain = compileChain({ rule: 'pulse', slots });
  [1, 2, 3].forEach((n) => {
    const c = compileChain({ rule: 'pulse', slots, passives: { last_word: n } });
    approx(c.nodes[0].power, plain.nodes[0].power, 1e-9);
    approx(c.nodes[1].power, plain.nodes[1].power * PASSIVES.last_word.values[n - 1], 1e-9);
  });
});

test('Hair Trigger: payloads hit harder and every modifier costs 1 more', () => {
  const slots = ['flame', 'mortar', 'on_impact', 'nova'];
  const plain = compileChain({ rule: 'pulse', slots });
  const c = compileChain({ rule: 'pulse', slots, passives: { hair_trigger: 2 } });
  approx(c.nodes[0].trigger.payload[0].power, plain.nodes[0].trigger.payload[0].power * PASSIVES.hair_trigger.values[1], 1e-9);
  assert.equal(c.nodes[0].cost, plain.nodes[0].cost + 1, 'one modifier, one more energy');
  approx(c.nodes[0].power, plain.nodes[0].power, 1e-9, 'the carrier itself is unchanged');
});

test('Ricochet: projectile weapons bounce, others do not, and it goes with the stack', () => {
  const run = withPassives({ ricochet: 3 });
  const proj = { key: 'projectile', has: (t) => t === 'projectile' };
  const st = run.player.stats;
  assert.equal(st.getFor('ricochet', tagsOf(run, 'blaster')), PASSIVES.ricochet.values[2]);
  assert.equal(st.getFor('ricochet', tagsOf(run, 'slam')), 0);
  void proj;
});

function tagsOf(run, piece) {
  const rig = installRig(run, [{ rule: 'pulse', slots: [piece], energy: 40 }]);
  const tags = rig.chains[0].nodes[0].inst.tags;
  applyRig(run);
  return tags;
}

test('Pyromaniac, Conductor and Permafrost switch on the Wildfire, Thunderclap and Shatter death rules, and off again', () => {
  const run = withPassives({ pyromaniac: 3, conductor: 1, permafrost: 2 });
  assert.deepEqual(run.rules.wildfire, PASSIVES.pyromaniac.values[2]);
  assert.deepEqual(run.rules.thunderclap, PASSIVES.conductor.values[0]);
  assert.deepEqual(run.rules.shatter, PASSIVES.permafrost.values[1]);
  run.rigState.passives = {};
  applyRig(run);
  assert.equal(run.rules.wildfire, undefined);
  assert.equal(run.rules.thunderclap, undefined);
  assert.equal(run.rules.shatter, undefined);
});

test('Siphon: every kill gives a chain energy', () => {
  const run = bare();
  const rig = installRig(run, [{ rule: 'pulse', slots: [], energy: 20, recharge: 0, passives: { siphon: 2 } }]);
  rig.chains[0].bat.pool = 0;
  for (let i = 0; i < 4; i++) rigEvent(run, 'kill');
  tick(run, STEP);
  approx(rig.chains[0].bat.pool, 4 * PASSIVES.siphon.values[1], 1e-9);
});

test('Overflow: recharge past a full battery is banked and makes the next activation hit harder, once', () => {
  const run = bare();
  const rig = installRig(run, [{ rule: 'pulse', slots: ['blaster'], energy: 10, recharge: 20, passives: { overflow: 3 } }]);
  dummy(run, 100, 0);
  tick(run, 0.25);                                                     // full the whole time: overflow banks, the first pulse is at 0.3 s
  const bank = rig.chains[0].bat.over;
  assert.ok(bank > 0, 'banked');
  tick(run, 0.1);
  const act = rig.chains[0].act;
  assert.ok(act.scale > 1 && act.scale <= 1 + PASSIVES.overflow.values[2] + 1e-9, `scale ${act.scale}`);
  assert.equal(rig.chains[0].bat.over < bank, true, 'the bank was spent');
});

test('Redline: a battery under half recharges faster, a fuller one does not', () => {
  const gain = (pool, passives) => {
    const run = bare();
    const rig = installRig(run, [{ rule: 'pulse', slots: [], energy: 100, recharge: 10, passives }]);
    rig.chains[0].bat.pool = pool;
    tick(run, 0.5);
    return rig.chains[0].bat.pool - pool;
  };
  approx(gain(60, { redline: 2 }), 5, 0.1);                             // plenty left: normal rate
  approx(gain(10, {}), 5, 0.1);
  approx(gain(10, { redline: 2 }), 5 * (1 + PASSIVES.redline.values[1]), 0.1);
  approx(gain(30, { redline: 2 }), 5 * (1 + PASSIVES.redline.values[1]), 0.1);
  approx(gain(60, { redline: 2 }), 5, 0.1);
});

test('Momentum: more recharge while moving, less while standing still', () => {
  const gain = (move, passives) => {
    const run = bare();
    const rig = installRig(run, [{ rule: 'pulse', slots: [], energy: 100, recharge: 10, passives }]);
    rig.chains[0].bat.pool = 0;
    tick(run, 1, move);
    return rig.chains[0].bat.pool;
  };
  approx(gain({ x: 1, y: 0 }, { momentum: 1 }), 10 * (1 + PASSIVES.momentum.values[0]), 0.2);
  approx(gain({ x: 0, y: 0 }, { momentum: 1 }), 10 * 0.8, 0.2);
  approx(gain({ x: 0, y: 0 }, {}), 10, 0.2);
});

test('Turret Mode: after a second standing still the rig hits harder; moving resets it', () => {
  const scaleAfter = (move) => {
    const run = bare();
    const rig = installRig(run, [{ rule: 'pulse', slots: ['blaster'], energy: 100, recharge: 100, passives: { turret: 2 } }]);
    dummy(run, 100, 0);
    tick(run, 1.4, move);                                              // pulses at 0.3 s and 1.3 s
    return rig.chains[0].act.scale;
  };
  approx(scaleAfter({ x: 0, y: 0 }), 1 + PASSIVES.turret.values[1], 1e-9);
  approx(scaleAfter({ x: 1, y: 0 }), 1, 1e-9);
});

test('Glass Cannon: each stack cuts max HP to 70% and adds 30% damage to everything', () => {
  const base = withPassives({});
  const g = withPassives({ glass_cannon: 2 });
  tick(base, STEP); tick(g, STEP);
  approx(g.player.maxHp / base.player.maxHp, 0.7 * 0.7, 1e-6);
  approx(g.player.stats.getFor('damage', tagsOf(g, 'blaster')) / base.player.stats.getFor('damage', tagsOf(base, 'blaster')), 1.3 * 1.3, 1e-6);
});

test('passive cards: offered, applied up to 3 stacks, then never offered again', () => {
  let r = newRig([{ rule: 'pulse', slots: ['blaster'] }]);
  const seen = new Set();
  for (let i = 0; i < 400; i++) for (const c of makeOffers(createRng(i), r)) if (c.kind === 'passive') seen.add(c.id);
  assert.ok(seen.size >= 8, `${seen.size} different passives offered`);
  const card = { kind: 'passive', id: 'siphon' };
  assert.match(describeOffer(r, card).tag, /passive · 1\/3/);
  for (let n = 1; n <= 3; n++) { r = applyOffer(r, card); assert.equal(r.passives.siphon, n); }
  assert.equal(takePassive(r, 'siphon'), null, 'capped at 3');
  for (let i = 0; i < 300; i++) assert.ok(!makeOffers(createRng(i), r).some((c) => c.kind === 'passive' && c.id === 'siphon'));
});

test('a rig without passives (an old save or resumed run) works, and passives survive a resume', async () => {
  const { snapshotRun, restoreRun } = await import('../src/game/run-snapshot.js');
  const run = withPassives({ siphon: 2, glass_cannon: 1 });
  delete run.rigState.passives;
  applyRig(run);                                                       // no passives key at all: nothing breaks
  run.rigState.passives = { siphon: 2, glass_cannon: 1 };
  applyRig(run);
  const back = restoreRun(JSON.parse(JSON.stringify(snapshotRun(run))), { view: VIEW, debug: {}, sfx: () => {} });
  assert.deepEqual(back.rigState.passives, { siphon: 2, glass_cannon: 1 });
  assert.equal(back.rig.chains[0].pv.siphon, PASSIVES.siphon.values[1]);
});
