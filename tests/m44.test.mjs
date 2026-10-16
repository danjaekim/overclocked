// M44: the Mage rework (docs/architecture.md M44). Spellburst: an enemy that dies burning, chilled or shocked bursts in
// each of those elements. Arc Bolt: two targets from the start, and each bolt bursts where it strikes.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { CLASSES } from '../src/data/classes.js';
import { WEAPONS } from '../src/data/weapons.js';
import { validateData } from '../src/data/validate.js';
import { ST } from '../src/data/statuses.js';
import { queueDamage, KIND_HIT, CAUSE } from '../src/systems/damage-queue.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId) => {
  const run = createRun({ seed: 4, view: VIEW, debug: { god: true }, classId });
  run.director.update = () => {};
  return run;
};
const dummy = (run, x, y, hp = 1e9) => {
  const e = spawnEnemy(run, 'goblin', run.player.x + x, run.player.y + y);
  e.hp = e.maxHp = hp; e.speed = 0; e.home = { x: e.x, y: e.y };
  return e;
};
const step = (run) => { for (const e of run.world.enemies.active) if (e.home) { e.x = e.home.x; e.y = e.home.y; e.kx = e.ky = 0; } run.update(STEP, { x: 0, y: 0 }); };

// Kills a goblin carrying `mask` next to a tough neighbour and returns what the neighbour lost.
function neighbourLoss(classId, mask) {
  const run = newRun(classId);
  const src = run.player.weapons ? run.player.weapons[0] : run.weapons[0];
  const victim = dummy(run, 150, 0, 50);
  const near = dummy(run, 175, 0);
  if (mask & ST.BURN) { victim.burnT = 3; victim.burnDps = 1; }       // real timers: the status mask is rebuilt from them each tick
  if (mask & ST.CHILL) { victim.chill = 1; victim.chillT = 3; }
  if (mask & ST.SHOCK) victim.shockT = 2;
  victim.status = mask | ST.TIMERS;
  queueDamage(run, victim, 1e6, false, 0, 0, 0, src, KIND_HIT, CAUSE.DIRECT);
  step(run);
  assert.ok(!victim.alive, 'the victim died');
  return near.maxHp - near.hp;
}

test('m44 data validates; the Mage has Spellburst and a two-target Arc Bolt that bursts', () => {
  assert.deepEqual(validateData(), []);
  assert.ok(CLASSES.mage.trait.spellburst);
  assert.equal(WEAPONS.arc_bolt.base.count, 2);
  assert.ok(WEAPONS.arc_bolt.triggers.some((t) => t.on === 'hit' && t.effect === 'explode' && t.direct));
});

test('m44 spellburst: an enemy dying under an element bursts, and more elements burst harder', () => {
  const none = neighbourLoss('mage', 0);
  const one = neighbourLoss('mage', ST.BURN);
  const three = neighbourLoss('mage', ST.BURN | ST.CHILL | ST.SHOCK);
  assert.ok(one > none + 1, `one element bursts (${none} -> ${one})`);
  assert.ok(three > one * 2, `three elements burst three times (${one} -> ${three})`);
});

test('m44 spellburst: only the Mage has it', () => {
  assert.ok(neighbourLoss('archer', ST.BURN) <= neighbourLoss('archer', 0) + 1);
});

test('m44 arc bolt: a burst where each bolt lands hurts enemies near the target', () => {
  const run = newRun('mage');
  const w = run.player.weapons ? run.player.weapons[0] : run.weapons[0];
  const target = dummy(run, 60, 0);
  const near = dummy(run, 80, 0);   // behind the target: only the burst reaches it (the second bolt may, so count both)
  w.cd = 0;
  for (let i = 0; i < 4; i++) step(run);
  assert.ok(target.hp < target.maxHp);
  assert.ok(near.hp < near.maxHp);
});
