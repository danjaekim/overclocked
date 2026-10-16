// M43: the Archer rework (docs/architecture.md M43). Quiver: every ranged weapon fires one more shot. Rain of Arrows:
// arrows fall on the thickest nearby crowd, only with a ranged weapon, more with every extra shot. Ember Bow: Embers
// (arrows burst on impact) from level 4.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon, levelUpWeapon, canLevelUp } from '../src/game/weapons.js';
import { CLASSES } from '../src/data/classes.js';
import { validateData } from '../src/data/validate.js';
import { makeTags } from '../src/stats/stats.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId = 'archer') => {
  const run = createRun({ seed: 4, view: VIEW, debug: { god: true }, classId });
  run.director.update = () => {};
  return run;
};
const crowd = (run, cx, cy, n = 12) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.4; const r = 8 + (i % 4) * 9;
    const e = spawnEnemy(run, 'goblin', run.player.x + cx + Math.cos(a) * r, run.player.y + cy + Math.sin(a) * r);
    e.hp = e.maxHp = 1e9; e.speed = 0; e.home = { x: e.x, y: e.y };
    out.push(e);
  }
  return out;
};
const hold = (run) => { for (const e of run.world.enemies.active) if (e.home) { e.x = e.home.x; e.y = e.home.y; e.kx = e.ky = 0; } };
const step = (run) => { hold(run); run.update(STEP, { x: 0, y: 0 }); };

test('m43 data validates; the Archer has Quiver and Rain of Arrows and no longer +1 pierce', () => {
  assert.deepEqual(validateData(), []);
  const a = CLASSES.archer;
  assert.ok(a.trait.rain);
  assert.ok(a.mods.some((m) => m.stat === 'projectiles' && m.tags && m.tags.includes('ranged')));
  assert.ok(!a.mods.some((m) => m.stat === 'pierce'));
});

test('m43 Quiver: ranged weapons fire one more shot; close weapons do not', () => {
  const run = newRun();
  const st = run.player.stats;
  assert.equal(st.getFor('projectiles', makeTags(['ranged', 'projectile', 'weapon:1'])), 1);
  assert.equal(st.getFor('projectiles', makeTags(['ranged', 'thrown', 'weapon:2'])), 1);
  assert.equal(st.getFor('projectiles', makeTags(['melee', 'close', 'weapon:3'])), 0);
  assert.equal(newRun('smith').player.stats.getFor('projectiles', makeTags(['ranged', 'weapon:1'])), 0);
});

test('m43 rain of arrows: falls on the crowd, lands after its delay and hurts what it lands on', () => {
  const run = newRun();
  run.player.weapons[0].cd = 1e9;                         // only the rain may hurt the crowd
  const es = crowd(run, 0, -150);
  let saw = 0;
  for (let i = 0; i < 60 * 5; i++) { step(run); run.player.weapons[0].cd = 1e9; saw = Math.max(saw, run.cls.rain.length); }
  assert.ok(saw >= CLASSES.archer.trait.rain.arrows, `arrows in the air: ${saw}`);
  assert.ok(es.some((e) => e.hp < e.maxHp), 'the rain hit the crowd');
  const r = run.stats.src.get(-3);
  assert.ok(r && r.dmg > 0 && r.name === 'Rain of Arrows', 'credited as Rain of Arrows in the damage breakdown');
});

test('m43 rain of arrows needs a ranged weapon, and other classes never get it', () => {
  const run = newRun();
  run.player.weapons.length = 0;
  addWeapon(run, 'forge_hammer');
  crowd(run, 0, -150);
  for (let i = 0; i < 60 * 5; i++) { step(run); assert.equal(run.cls.rain.length, 0); }
  const smith = newRun('smith');
  smith.player.weapons.length = 0;
  addWeapon(smith, 'storm_javelin');
  crowd(smith, 0, -150);
  for (let i = 0; i < 60 * 5; i++) { step(smith); assert.ok(!smith.cls.rain || smith.cls.rain.length === 0); }
});

test('m43 rain of arrows grows with the ranged weapon\'s extra shots', () => {
  const most = (extra) => {
    const run = newRun();
    const bow = run.player.weapons[0];
    if (extra) run.player.stats.add({ stat: 'projectiles', op: 'flat', value: extra, tags: [bow.instanceTag], source: 't' });
    crowd(run, 0, -150, 16);
    let m = 0;
    for (let i = 0; i < 60 * 4; i++) { step(run); m = Math.max(m, run.cls.rain.length); }
    return m;
  };
  assert.ok(most(2) > most(0));
});

test('m43 Embers: the Ember Bow\'s arrows burst on impact from level 4, not before', () => {
  const splash = (level) => {
    const run = newRun();
    run.trait = { ...run.trait, rain: undefined };
    const bow = run.player.weapons[0];
    while (bow.level < level && canLevelUp(bow)) levelUpWeapon(run, bow);
    const [target, ...rest] = crowd(run, 0, -160, 6);
    for (let i = 0; i < 60 * 3; i++) step(run);
    const blasts = run.stats.causes[3];                     // 'Blasts'
    void target; void rest;
    return blasts;
  };
  assert.equal(splash(3), 0, 'level 3: no embers');
  assert.ok(splash(4) > 0, 'level 4: arrows burst');
});
