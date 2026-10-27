// The compendium's live weapon preview (v0.32.1): level choices, and the engine runs a weapon headless.

import { test, assert } from './harness.mjs';
import { WEAPONS } from '../src/data/weapons.js';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon, levelUpWeapon } from '../src/game/weapons.js';


test('every weapon runs in the preview setup (god run, unkillable crowd) without errors and does damage', () => {
  for (const id of Object.keys(WEAPONS)) {
    const run = createRun({ seed: 7, view: { w: 480, h: 300, scale: 1, insetTop: 0, isTouch: false }, debug: { god: true }, classId: 'smith' });
    run.director.update = () => {};
    run.player.weapons.length = 0;
    const inst = addWeapon(run, id);
    while (inst.level < WEAPONS[id].maxLevel) levelUpWeapon(run, inst);
    for (let i = 0; i < 26; i++) { const e = spawnEnemy(run, i % 8 === 0 ? 'brute' : 'goblin', 60 + i * 5, (i % 5) * 20 - 40); e.hp = e.maxHp = 1e9; e.speed = 30; }
    for (let t = 0; t < 600; t++) run.update(1 / 60, { x: Math.cos(t / 40) * 0.55, y: Math.sin(t / 40) * 0.55 });
    assert.ok(run.stats.total > 0, id);
  }
});
