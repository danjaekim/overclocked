// M35: run resume. A paused run is snapshotted to JSON and restored exactly: after restoring, the run
// plays on identically to the one that never stopped (game/run-snapshot.js, save/run-save.js).

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { addWeapon } from '../src/game/weapons.js';
import { fuse } from '../src/game/fusion.js';
import { RUN_EVENTS } from '../src/game/run-events.js';
import { snapshotRun, restoreRun, SNAPSHOT_FORMAT } from '../src/game/run-snapshot.js';
import { createRunSave } from '../src/save/run-save.js';
import { VERSION } from '../src/version.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (seed, classId = 'archer') => createRun({ seed, view: VIEW, debug: { god: true }, classId });

// A walking route that changes direction, so the player really moves.
function play(run, ticks, from = 0) {
  for (let i = from; i < from + ticks; i++) {
    const a = Math.floor(i / 90) * 0.7;
    run.update(STEP, { x: Math.cos(a), y: Math.sin(a) });
    run.pendingLevelUps = 0;
  }
}

const digest = (r) => JSON.stringify([
  r.time.toFixed(4), r.kills, r.rng.getState(), r.fxRng.getState(),
  r.world.enemies.count, r.world.projectiles.count, r.world.pickups.count, r.hazards.length, r.enemyShots.length,
  r.player.x, r.player.y, r.player.hp, r.player.xp, r.player.level, r.stats.total, r.ore, r.starsteel,
  r.world.enemies.active.reduce((a, e) => a + e.x * 1.3 + e.y + e.hp * 0.01, 0),
  r.player.weapons.map((w) => [w.weaponId, w.level, w.cd]),
]);

function freeze(run) {
  return JSON.parse(JSON.stringify(snapshotRun(run)));       // through real JSON, like storage does
}
const thaw = (snap) => restoreRun(snap, { view: VIEW, debug: { god: true }, sfx: () => {} });

// Snapshot `a` now, restore it as `b`, and play both on: they must never differ.
function assertContinues(a, ticks, from) {
  const b = thaw(freeze(a));
  a.world.hash.rebuild(a.world.enemies.active, a.world.enemies.count);       // the restore rebuilds the hash too
  assert.equal(digest(b), digest(a), 'identical right after the restore');
  for (let i = 0; i < ticks; i++) {
    const t = from + i;
    const ang = Math.floor(t / 90) * 0.7;
    const mv = { x: Math.cos(ang), y: Math.sin(ang) };
    a.update(STEP, mv); b.update(STEP, mv);
    a.pendingLevelUps = b.pendingLevelUps = 0;
    if (i % 20 === 0 || i === ticks - 1) assert.equal(digest(b), digest(a), `diverged ${i} ticks after the restore`);
  }
  return b;
}

test('m35: a mid-run snapshot restores and then plays on identically (starter weapon, 40 s)', () => {
  const a = newRun(7);
  play(a, 40 * 60);
  assert.ok(a.kills > 5 && a.world.enemies.count > 3);
  assertContinues(a, 600, 40 * 60);
});

test('m35: every weapon, all three classes, a long run (5 min): enemies, pickups, hazards, statuses all survive', () => {
  for (const [cls, seed] of [['archer', 3], ['smith', 5], ['berserker', 9]]) {
    const a = newRun(seed, cls);
    a.debugLoadout();
    play(a, 300 * 60);
    assert.ok(a.world.enemies.count > 10, cls);
    assertContinues(a, 900, 300 * 60);
  }
});

test('m35: masterwork and generic fusions, a boss and elites in play restore exactly', () => {
  const a = newRun(21);
  a.player.weapons.length = 0;
  a.starsteel = 9;
  const host = addWeapon(a, 'vapor_wheel');
  const donor = addWeapon(a, 'radiant_halo');
  const other = addWeapon(a, 'tempest');
  const donor2 = addWeapon(a, 'thunder_lance');
  assert.ok(fuse(a, host, donor).masterwork);
  assert.ok(fuse(a, other, donor2).ok);
  play(a, 90 * 60);
  RUN_EVENTS.boss(a, { enemy: 'warlord' });
  RUN_EVENTS.elite(a, { enemy: 'brute' });
  play(a, 600, 90 * 60);
  assert.ok(a.bossAlive || a.world.enemies.count > 0);
  const b = assertContinues(a, 900, 90 * 60 + 600);
  assert.equal(b.fusions.length, 2);
  assert.ok(b.player.weapons.every((w) => w.def === a.player.weapons.find((x) => x.weaponId === w.weaponId).def), 'defs are the shipped data, not copies');
});

test('m35: the restored run keeps working state: pools, weapon ids, rng, director and stats', () => {
  const a = newRun(4);
  play(a, 120 * 60);
  const snap = freeze(a);
  const b = thaw(snap);
  assert.equal(b.world.enemies.count, a.world.enemies.count);
  assert.equal(b.world.nextUid, a.world.nextUid);
  assert.deepEqual(b.director.getState(), a.director.getState());
  assert.equal(b.rng.getState(), a.rng.getState());
  assert.equal(b.player.stats.get('damage'), a.player.stats.get('damage'));
  assert.equal(b.view, VIEW);
  // new weapons after a restore never reuse an instance id
  const w = addWeapon(b, 'rending_axe') || addWeapon(b, 'spirit_blades');
  assert.ok(w && !a.player.weapons.some((x) => x.instanceId === w.instanceId));
  // pool entities are real pool members: releasing works and the counts stay consistent
  const e = b.world.enemies.active[0];
  b.world.enemies.release(e);
  assert.equal(b.world.enemies.count, a.world.enemies.count - 1);
});

test('m35: a snapshot is small enough for localStorage and stamps its format', () => {
  const a = newRun(8);
  a.debugLoadout();
  play(a, 420 * 60);
  const text = JSON.stringify(snapshotRun(a));
  assert.ok(text.length < 1.5e6, `snapshot is ${text.length} bytes`);
  assert.equal(JSON.parse(text).format, SNAPSHOT_FORMAT);
  assert.throws(() => restoreRun({ ...JSON.parse(text), format: SNAPSHOT_FORMAT + 1 }, { view: VIEW, debug: {}, sfx: () => {} }));
});

test('m35: state a snapshot cannot hold (a function) fails loudly instead of being lost', () => {
  const a = newRun(2);
  play(a, 300);
  a.player.weapons[0].oops = () => 1;
  assert.throws(() => snapshotRun(a), /function at .*oops/);
});

test('m35: the run save stores, loads and clears one snapshot, and survives bad storage', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const rs = createRunSave(storage);
  assert.equal(rs.load(), null);
  assert.equal(rs.has(), false);
  const a = newRun(6);
  play(a, 600);
  assert.equal(rs.save(snapshotRun(a)), true);
  assert.equal(rs.has(), true);
  const snap = rs.load();
  assert.equal(snap.seed, 6);
  const b = restoreRun(snap, { view: VIEW, debug: { god: true }, sfx: () => {} });
  assert.equal(b.kills, a.kills);
  rs.clear();
  assert.equal(rs.load(), null);
  mem.set('overforged.run.v1', '{not json');
  assert.equal(rs.load(), null);
  // missing / throwing storage: no crash, just no resume
  assert.equal(createRunSave(null).save({ a: 1 }), false);
  assert.equal(createRunSave(null).load(), null);
  const full = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('x'); } };
  assert.equal(createRunSave(full).save({ a: 1 }), false);
  assert.equal(createRunSave(full).has(), false);
  assert.ok(/^0\.(3[5-9]|[4-9]\d)\./.test(VERSION), VERSION);
});
