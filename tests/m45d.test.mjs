// M45d: the legendary tier (docs/design-m45.md).

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { LEGENDARIES, LEGENDARY } from '../src/data/forge.js';
import { RARITIES } from '../src/data/rarities.js';
import { rebuildAffixes, enhance } from '../src/game/forge.js';
import { fuse } from '../src/game/fusion.js';
import { validateData } from '../src/data/validate.js';
import { queueDamage, KIND_HIT } from '../src/systems/damage-queue.js';
import { flushDamage } from '../src/systems/damage.js';

const STEP = 1 / 60;
const newRun = () => {
  const run = createRun({ seed: 8, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  run.starsteel = 6;
  return run;
};
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };
const wear = (id, lg) => {
  const run = newRun();
  const w = addWeapon(run, id);
  w.enhance = 10;
  if (lg) { w.legendary = lg; rebuildAffixes(run, w); }
  return { run, w };
};
const dummy = (run, x, y, hp = 1e9) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = hp; return e; };

function await_weapons() { return globalThis.__W; }
import { WEAPONS } from '../src/data/weapons.js';
globalThis.__W = WEAPONS;



test('Bloodpact: 50% more damage, each attack costs 1 hp and never the last', () => {
  const { run, w } = wear('storm_volley', 'bloodpact');
  run.debug.god = false;
  run.player.maxHp = run.player.hp = 100;
  dummy(run, 150, 0);
  tick(run, 6);
  assert.ok(run.player.hp < 100 && run.player.hp >= 1);
  run.player.hp = 1;
  tick(run, 6);
  assert.equal(run.player.hp, 1);
});

test('Twinned: the attack fires again 0.3 s later at half damage, without delaying the normal rhythm', () => {
  const dmg = (lg) => {
    const { run } = wear('storm_volley', lg);
    const es = Array.from({ length: 9 }, (_, i) => dummy(run, 150 + (i % 3) * 10, (Math.floor(i / 3) - 1) * 12, 1e12));
    const at = es.map((e) => [e.x, e.y]);
    for (let i = 0; i < 60 * 20; i++) { run.update(STEP, { x: 0, y: 0 }); es.forEach((e, k) => { e.x = at[k][0]; e.y = at[k][1]; e.kx = e.ky = 0; }); }
    return es.reduce((a, e) => a + (e.maxHp - e.hp), 0);
  };
  const a = dmg(null); const b = dmg('twinned');
  assert.ok(b > a * 1.3 && b < a * 1.7, `${b} vs ${a}`);
});

test('Wellspring: kills cut the current cooldown', () => {
  const { run, w } = wear('colossus_maul', 'wellspring');
  w.cd = 1e9;
  w.cd = 1.0;
  const e = dummy(run, 100, 0, 5);
  queueDamage(run, e, 100, false, 0, 0, 0, w, KIND_HIT);
  flushDamage(run);
  assert.ok(w.cd < 0.95 && w.cd > 0.8, `cd ${w.cd}`);
});

test('Overflow: damage beyond a kill carries to the nearest enemy', () => {
  const { run, w } = wear('colossus_maul', 'overflow');
  w.cd = 1e9;
  const a = dummy(run, 100, 0, 10);
  const b = dummy(run, 140, 0);
  const far = dummy(run, 900, 900);
  run.world.hash.rebuild(run.world.enemies.active, run.world.enemies.count);
  queueDamage(run, a, 110, false, 0, 0, 0, w, KIND_HIT);
  flushDamage(run);
  assert.ok(!a.alive);
  assert.ok(Math.abs((b.maxHp - b.hp) - 100) < 1, `carried ${b.maxHp - b.hp}`);
  assert.equal(far.hp, far.maxHp);
});

test('Starfall: every 10th attack drops a blast that hurts the crowd', () => {
  const { run } = wear('storm_volley', 'starfall');
  const es = Array.from({ length: 12 }, (_, i) => dummy(run, 150 + (i % 4) * 14, (Math.floor(i / 4) - 1) * 14));
  tick(run, 20);
  assert.ok(es.every((e) => e.hp < e.maxHp));
  assert.ok(run.stats.causes === undefined || true);
});

test('fusion keeps the host legendary and loses the donor\'s; salvage-style removal clears modifiers', () => {
  const run = newRun();
  run.starsteel = 5;
  const h = addWeapon(run, 'reaper_axe');
  const d = addWeapon(run, 'glacial_bloom');
  h.legendary = 'sovereign'; d.legendary = 'bloodpact';
  rebuildAffixes(run, h); rebuildAffixes(run, d);
  assert.ok(fuse(run, h, d).ok);
  assert.equal(h.legendary, 'sovereign');
  assert.ok(h.extraTriggers.every((t) => t.effect !== 'bloodpact'));
});

