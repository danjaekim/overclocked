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
