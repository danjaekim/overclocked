// M42: the last five Starforge mutations (mortar Cluster Shells, bolt Seeking Bolt, summon Star-touched,
// pulse Echoing Rings, judge Double Strike) and the "every behavior has one" rule.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon, levelUpWeapon, canLevelUp } from '../src/game/weapons.js';
import { MUTATIONS, STARFORGE } from '../src/data/starforge.js';
import { WEAPONS } from '../src/data/weapons.js';
import { validateData } from '../src/data/validate.js';
import { starforge } from '../src/game/starforge.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = () => {
  const run = createRun({ seed: 13, view: VIEW, debug: { god: true }, classId: 'archer' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};
const maxed = (run, id) => { const w = addWeapon(run, id); while (canLevelUp(w)) levelUpWeapon(run, w); return w; };
const dummy = (run, x, y) => {
  const e = spawnEnemy(run, 'goblin', run.player.x + x, run.player.y + y);
  e.hp = e.maxHp = 1e9;
  e.speed = 0;
  e.home = { x: e.x, y: e.y };
  return e;
};
const hold = (run) => { for (const e of run.world.enemies.active) if (e.home) { e.x = e.home.x; e.y = e.home.y; e.kx = e.ky = 0; } };
const step = (run) => { hold(run); run.update(STEP, { x: 0, y: 0 }); };
const tick = (run, n) => { for (let i = 0; i < n; i++) step(run); };
const dealt = (run) => { let s = 0; for (const e of run.world.enemies.active) if (e.home) s += e.maxHp - e.hp; return s; };
function arena(run, radii = [50, 90, 130, 170]) {
  for (const r of radii) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + r; dummy(run, Math.cos(a) * r, Math.sin(a) * r); }
}
const ALL = { mortar: 'cinder_mortar', bolt: 'arc_bolt', summon: 'bone_call', pulse: 'halo', judge: 'judgement' };
function make(id, star) {
  const run = newRun();
  const w = maxed(run, id);
  if (star) { run.starsteel = 2; assert.ok(starforge(run, w).ok); }
  arena(run);
  return { run, w };
}

test('m42 every weapon behavior has a Starforge mutation, so every weapon can be starforged', () => {
  assert.deepEqual(validateData(), []);
  for (const [id, def] of Object.entries(WEAPONS)) assert.ok(MUTATIONS[def.behavior], `${id} (${def.behavior}) has no mutation`);
});

test('m42 every starred weapon out-damages the plain one over a few seconds', () => {
  for (const [b, id] of Object.entries(ALL)) {
    const run0 = make(id, false); tick(run0.run, 60 * 8);
    const run1 = make(id, true); tick(run1.run, 60 * 8);
    assert.ok(dealt(run1.run) > dealt(run0.run) * 1.02, `${b}: ${dealt(run1.run).toFixed(0)} vs ${dealt(run0.run).toFixed(0)}`);
  }
});

test('m42 cluster shells: a landing shell throws bomblets that land after their delay', () => {
  const { run, w } = make(ALL.mortar, true);
  let saw = 0;
  for (let i = 0; i < 60 * 6; i++) { step(run); saw = Math.max(saw, w.shells.filter((s) => s.sub).length); }
  assert.ok(saw >= MUTATIONS.mortar.bomblets, `bomblets seen: ${saw}`);
  const plain = make(ALL.mortar, false);
  for (let i = 0; i < 60 * 6; i++) { step(plain.run); assert.ok(!plain.w.shells.some((s) => s.sub)); }
});

test('m42 seeking bolt: each bolt strikes one more enemy than the plain weapon', () => {
  const struck = (star) => {
    const { run, w } = make(ALL.bolt, star);
    w.cd = 0;
    const before = new Map();
    for (const e of run.world.enemies.active) before.set(e.uid, e.hp);
    step(run); step(run);
    let n = 0;
    for (const e of run.world.enemies.active) if (e.hp < before.get(e.uid)) n++;
    return n;
  };
  assert.ok(struck(true) > struck(false));
});

test('m42 star-touched: one extra, larger minion', () => {
  const a = make(ALL.summon, false);
  const b = make(ALL.summon, true);
  tick(a.run, 60 * 20);
  tick(b.run, 60 * 20);
  assert.equal(b.w.minions.length, a.w.minions.length + 1);
});

test('m42 echoing rings: each pulse is followed by two cyan echoes', () => {
  const { run } = make(ALL.pulse, true);
  let maxCyan = 0;
  for (let i = 0; i < 60 * 4; i++) { step(run); maxCyan = Math.max(maxCyan, run.hazards.filter((h) => h.color === STARFORGE.color).length); }
  assert.ok(maxCyan >= 1, 'an echo ring appeared');
  const p = make(ALL.pulse, false);
  for (let i = 0; i < 60 * 4; i++) { step(p.run); assert.ok(!p.run.hazards.some((h) => h.color === STARFORGE.color)); }
});

test('m42 double strike: a second, cyan pillar lands on the same spot after the delay', () => {
  const { run, w } = make(ALL.judge, true);
  let queued = null;
  let sawStar = false;
  for (let i = 0; i < 60 * 6; i++) {
    step(run);
    if (!queued && w.again.length) queued = w.again[0];
    if (run.hazards.some((h) => h.star)) sawStar = true;
  }
  assert.ok(queued, 'a second strike was queued');
  assert.equal(queued.t <= MUTATIONS.judge.delay, true);
  assert.ok(sawStar, 'the second pillar exists and is drawn cyan');
});
