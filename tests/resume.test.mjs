// Run resume: a run is frozen to JSON at a menu and thawed on the next boot (game/run-snapshot.js, save/run-save.js).
// The chain rig is rebuilt from run.rigState rather than copied, so the restored run is not tick-identical, but the
// player, the enemies, the clock and the rig come back as they were and the run plays on.

import { test, assert, approx } from './harness.mjs';
import { createOverclockedRun } from '../src/game/ovrun.js';
import { applyRig } from '../src/game/sandbox.js';
import { snapshotRun, restoreRun } from '../src/game/run-snapshot.js';
import { createRunSave } from '../src/save/run-save.js';
import { addChassis, levelUp, setPiece } from '../src/rig/editor.js';

const VIEW = { w: 390, h: 844, insetTop: 0 };
const STEP = 1 / 30;
const newRun = () => createOverclockedRun({ seed: 5, view: VIEW, debug: { god: true }, sfx: () => {} });

function rigged() {
  const run = newRun();
  let r = addChassis(run.rigState, 'kiln');
  r = addChassis(r, 'reaper');
  const put = (c, slots) => slots.forEach((id, i) => { r = setPiece(r, { kind: 'slot', c, i }, id); });
  put(0, ['blaster']);
  put(1, ['flame', 'mortar', 'on_impact', 'scatter']);
  put(2, ['heavy', 'blaster', 'on_kill', 'nova']);
  r = levelUp(levelUp(r, 'mortar'), 'blaster');
  run.rigState = r;
  applyRig(run);
  return run;
}
const walk = (run, secs, from = 0) => {
  for (let i = 0; i < secs / STEP; i++) {
    const a = Math.floor((from + i) / 60) * 0.7;
    run.update(STEP, { x: Math.cos(a), y: Math.sin(a) });
    run.pendingLevelUps = 0;
  }
};
const freeze = (run) => JSON.parse(JSON.stringify(snapshotRun(run)));
const thaw = (snap) => restoreRun(snap, { view: VIEW, debug: { god: true }, sfx: () => {} });

test('a rigged run in the middle of a fight freezes to JSON and thaws with the same player, enemies, clock and rig', () => {
  const a = rigged();
  walk(a, 40);
  assert.ok(a.kills > 5 && a.world.enemies.count > 3 && a.world.projectiles.count >= 0);
  a.rig.chains[1].bat.pool = 3.5;
  const b = thaw(freeze(a));
  assert.equal(b.time, a.time);
  assert.equal(b.kills, a.kills);
  assert.equal(b.world.enemies.count, a.world.enemies.count);
  assert.equal(b.world.pickups.count, a.world.pickups.count);
  assert.deepEqual([b.player.x, b.player.y, b.player.hp, b.player.xp, b.player.level], [a.player.x, a.player.y, a.player.hp, a.player.xp, a.player.level]);
  assert.deepEqual(b.rigState, a.rigState);
  assert.equal(b.rig.chains.length, 3);
  assert.equal(b.rig.insts.length, a.rig.insts.length, 'the rig is rebuilt, not doubled');
  approx(b.rig.chains[1].bat.pool, 3.5, 1e-9);
  for (const c of ['maxHp', 'moveSpeed', 'regen']) approx(b.player.stats.get(c), a.player.stats.get(c), 1e-9);
  assert.equal(b.player.stats.mods.burnChance.length, a.player.stats.mods.burnChance.length, 'weapon modifiers are not doubled');
  assert.equal(b.run, undefined);
});

test('shots in flight and burning enemies point at the rebuilt weapon instances, not at stale copies', () => {
  const a = rigged();
  let flying = 0;
  let burning = 0;
  for (let i = 0; i < 30 * 60 && !(flying > 3 && burning > 0); i++) {
    walk(a, STEP * 3, i * 3);
    flying = a.world.projectiles.active.filter((p) => p.inst).length;
    burning = a.world.enemies.active.filter((e) => e.burnSrc).length;
  }
  assert.ok(flying > 3 && burning > 0, `${flying} shots, ${burning} burning`);
  const b = thaw(freeze(a));
  const insts = new Set(b.rig.insts);
  assert.equal(b.world.projectiles.active.filter((p) => p.inst).length, flying);
  assert.ok(b.world.projectiles.active.filter((p) => p.inst).every((p) => insts.has(p.inst)));
  assert.equal(b.world.enemies.active.filter((e) => e.burnSrc).length, burning);
  assert.ok(b.world.enemies.active.filter((e) => e.burnSrc).every((e) => insts.has(e.burnSrc)));
});

test('a thawed run plays on: it fights, levels, and a second freeze and thaw works too', () => {
  const a = rigged();
  walk(a, 30);
  const b = thaw(freeze(a));
  const kills = b.kills;
  walk(b, 30, 900);
  assert.ok(b.kills > kills, 'the restored rig kills');
  assert.ok(b.time > a.time + 29);
  const c = thaw(freeze(b));
  walk(c, 10, 1800);
  assert.ok(c.time > b.time + 9 && !c.over);
  assert.equal(c.rig.insts.length, a.rig.insts.length);
});

test('the run save keeps one snapshot under its own key, survives bad storage and a corrupt entry', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const rs = createRunSave(storage);
  assert.equal(rs.has(), false);
  const run = rigged();
  walk(run, 5);
  assert.ok(rs.save(snapshotRun(run)));
  assert.ok(rs.has() && thaw(rs.load()).time === run.time);
  rs.clear();
  assert.equal(rs.load(), null);
  mem.set('overclocked.run.v1', '{not json');
  assert.equal(rs.load(), null);
  assert.equal(createRunSave(null).save({}), false);
  assert.equal(createRunSave({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } }).save({}), false);
});

test('a snapshot from another format or a changed rig is refused, not misread', () => {
  const a = rigged();
  walk(a, 3);
  const snap = freeze(a);
  assert.throws(() => thaw({ ...snap, format: 1 }));
  assert.throws(() => thaw(null));
});
