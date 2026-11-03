// v0.9: chassis that play differently (docs/plan-v09.md).
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { CHASSIS, migrateChassis, chassisForRule } from '../src/rig/chassis.js';
import { migrateRig, newRig } from '../src/rig/editor.js';
import { chassisCards } from '../src/rig/offers.js';
import { createRng } from '../src/core/rng.js';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { installRig } from '../src/rig/rig.js';
import { param } from '../src/game/weapon-params.js';
import { reactOnHit } from '../src/rig/reactions.js';
import { RELAY_ECHO, KILN_REACT } from '../src/rig/chassis.js';

const STEP = 1 / 60;
const newRun = () => {
  const run = createRun({ seed: 11, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};
const dummy = (run, x, y, hp = 1e9) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = hp; return e; };
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };

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
  assert.equal(CHASSIS.overdrive.quirk.costAdd, undefined, 'v0.11.6: no extra cost per piece');
  assert.equal(CHASSIS.reaper.quirk.killCharge, 0.3);
});

test('v0.9.1 Kiln: the same chain burns about twice as hard as on Standard, with no discount', () => {
  const firstBurn = (quirk) => {
    const run = newRun();
    installRig(run, [{ rule: 'pulse', slots: ['flame', 'blaster'], energy: 40, quirk }]);
    const e = dummy(run, 100, 0);
    for (let i = 0; i < 120 && !(e.burnT > 0); i++) run.update(STEP, { x: 0, y: 0 });
    return e.burnDps;
  };
  const plain = firstBurn({});
  const kiln = firstBurn(CHASSIS.kiln.quirk);
  assert.ok(plain > 0 && kiln > plain * 1.6, `burn ${plain} vs ${kiln}`);
});

test('v0.9.1 Kiln: Steam clouds can come twice as often', () => {
  const clouds = (quirk) => {
    const run = newRun();
    const rig = installRig(run, [{ rule: 'pulse', slots: ['flame', 'frost', 'blaster'], energy: 40, quirk }]);
    const node = rig.chains[0].nodes[0];
    const e = dummy(run, 100, 0);
    run.time = 10;
    reactOnHit(run, node, node.inst, e);
    run.time += 0.35;                                  // past Kiln's cooldown, inside Standard's
    reactOnHit(run, node, node.inst, e);
    return run.hazards.length;
  };
  assert.equal(clouds({}), 1);
  assert.equal(clouds(CHASSIS.kiln.quirk), 2);
  assert.equal(KILN_REACT, 0.5);
});

test('v0.9.1 Relay: every payload runs a second time later at 60%, for free; Standard runs it once', () => {
  const count = (quirk) => {
    const run = newRun();
    const rig = installRig(run, [{ rule: 'pulse', slots: ['blaster', 'on_hit', 'nova'], energy: 40, quirk }], { log: true });
    dummy(run, 100, 0);
    tick(run, 2);
    const pay = rig.log.filter((l) => l.ev === 'payload');
    return { first: pay.filter((l) => !l.echo).length, echo: pay.filter((l) => l.echo) };
  };
  const std = count({});
  const rel = count(CHASSIS.relay.quirk);
  assert.ok(std.first >= 1 && std.echo.length === 0);
  assert.ok(rel.first >= 1 && rel.echo.length >= 1 && rel.echo.length <= rel.first, JSON.stringify([rel.first, rel.echo.length]));
  assert.equal(rel.echo[0].pool, RELAY_ECHO.pool, 'it runs from its own pool, not the chain battery');
});

test('v0.9.1 Relay: an echo does not drain the battery or echo again', () => {
  const run = newRun();
  const rig = installRig(run, [{ rule: 'pulse', slots: ['blaster', 'on_hit', 'nova'], energy: 40, recharge: 0, quirk: CHASSIS.relay.quirk }], { log: true });
  dummy(run, 100, 0);
  tick(run, 0.5);
  const spent = 40 - rig.chains[0].bat.pool;
  const echoes = rig.log.filter((l) => l.ev === 'payload' && l.echo).length;
  const firsts = rig.log.filter((l) => l.ev === 'payload' && !l.echo).length;
  assert.ok(echoes <= firsts);
  const noEcho = (() => {
    const r2 = newRun();
    const g = installRig(r2, [{ rule: 'pulse', slots: ['blaster', 'on_hit', 'nova'], energy: 40, recharge: 0 }], { log: true });
    dummy(r2, 100, 0);
    tick(r2, 0.5);
    return 40 - g.chains[0].bat.pool;
  })();
  assert.ok(Math.abs(spent - noEcho) < 1e-6, `${spent} vs ${noEcho}`);
});

test('v0.9.2 Strider fires every 80 px you move: twice as often at twice the speed, never standing still', () => {
  const fires = (secs, speed) => {
    const run = newRun();
    const rig = installRig(run, [{ rule: 'stride', slots: ['nova'], energy: 1000, recharge: 0 }], { log: true });
    dummy(run, 0, 40);
    const mods = run.player.stats;
    void mods;
    run.player.stats.add({ stat: 'moveSpeed', op: 'inc', value: speed - 1, source: 'test' });
    for (let i = 0; i < Math.round(secs / STEP); i++) run.update(STEP, { x: Math.floor(i / 30) % 2 ? -1 : 1, y: 0 });
    return rig.log.filter((l) => l.ev === 'activate').length;
  };
  const slow = fires(5, 1);
  const fast = fires(5, 2);
  assert.ok(slow >= 8 && slow <= 10, `slow ${slow}`);
  assert.ok(fast >= 17 && fast <= 19, `fast ${fast}`);
  const still = (() => {
    const run = newRun();
    const rig = installRig(run, [{ rule: 'stride', slots: ['nova'], energy: 1000, recharge: 0 }], { log: true });
    dummy(run, 0, 40);
    tick(run, 5);
    return rig.log.filter((l) => l.ev === 'activate').length;
  })();
  assert.equal(still, 0);
});

test('v0.9.2 Anchor is a turret: x1.6 power and +50% area, only fired while you stand still', () => {
  assert.deepEqual([CHASSIS.anchor.quirk.power, CHASSIS.anchor.quirk.area], [1.6, 0.5]);
  const radius = (quirk) => {
    const run = newRun();
    const rig = installRig(run, [{ rule: 'anchor', slots: ['nova'], energy: 1000, recharge: 0, quirk }], { log: true });
    return { r: param(run, rig.chains[0].nodes[0].inst, 'radius'), p: rig.chains[0].nodes[0].power };
  };
  const plain = radius({});
  const turret = radius(CHASSIS.anchor.quirk);
  assert.ok(Math.abs(turret.r / plain.r - 1.5) < 1e-6, `radius ${plain.r} -> ${turret.r}`);
  assert.ok(Math.abs(turret.p / plain.p - 1.6) < 1e-6);
  const run = newRun();
  const rig = installRig(run, [{ rule: 'anchor', slots: ['nova'], energy: 1000, recharge: 0 }], { log: true });
  dummy(run, 0, 40);
  tick(run, 2);
  const still = rig.log.filter((l) => l.ev === 'activate').length;
  for (let i = 0; i < 120; i++) run.update(STEP, { x: 1, y: 0 });
  assert.ok(still >= 2 && rig.log.filter((l) => l.ev === 'activate').length === still, 'no activations while walking');
});
