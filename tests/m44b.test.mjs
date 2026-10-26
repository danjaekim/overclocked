// M44g: damage number display scale (?numscale / ?numfx). Display only: the damage dealt never changes.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { addDamageNumber, setNumberStyle } from '../src/render/fx.js';

const newRun = () => createRun({ seed: 4, view: { w: 480, h: 1040 }, debug: { god: true } });
const shown = (run) => run.world.fx.active.filter((f) => f.kind === 0).map((f) => f.text);

test('numscale multiplies the shown number and abbreviates big ones', () => {
  const run = newRun();
  setNumberStyle(1, false);
  addDamageNumber(run, 0, 0, 24, false);
  setNumberStyle(10, false);
  addDamageNumber(run, 0, 0, 24, false);
  setNumberStyle(1000, false);
  addDamageNumber(run, 0, 0, 24, false);
  addDamageNumber(run, 0, 0, 1234, false);
  setNumberStyle(1, false);
  assert.deepEqual(shown(run), ['24', '240', '24K', '1.2M']);
});

test('numfx raises the live-number cap and lengthens their life', () => {
  const run = newRun();
  setNumberStyle(1, true);
  for (let i = 0; i < 90; i++) addDamageNumber(run, i, 0, 5, false);
  const n = shown(run).length;
  const ttl = run.world.fx.active[0].maxTtl;
  setNumberStyle(1, false);
  assert.ok(n > 60 && n <= 100, `up to 100 numbers alive, got ${n}`);
  assert.ok(ttl > 0.55, 'numbers linger');
});

// Singularity opens its vortex away from the player (docs M44i).
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
const vortexDist = (run) => {
  const v = run.hazards.find((h) => h.kind === 1);
  return v ? Math.hypot(v.x - run.player.x, v.y - run.player.y) : -1;
};
const sing = (enemies) => {
  const run = createRun({ seed: 4, view: { w: 480, h: 1040 }, debug: { god: true } });
  run.director.update = () => {};
  const w = addWeapon(run, 'singularity');
  w.cd = 0;
  for (const [x, y] of enemies) { const e = spawnEnemy(run, 'goblin', run.player.x + x, run.player.y + y); e.hp = e.maxHp = 1e9; e.speed = 0; }
  for (let i = 0; i < 20 && vortexDist(run) < 0; i++) run.update(1 / 60, { x: 0, y: 0 });
  return vortexDist(run);
};
test('singularity: the vortex opens on the thick crowd far from the player, not under them', () => {
  const d = sing([[50, 0], [220, 20], [230, 40], [215, 0], [225, -25]]);
  assert.ok(d >= 150, `vortex ${d} from the player`);
});
test('singularity: with only close enemies the vortex is still pushed out to a safe distance', () => {
  const d = sing([[40, 0], [60, 20]]);
  assert.ok(d >= 150, `vortex ${d} from the player`);
});
