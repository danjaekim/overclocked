// The fixed-step loop (core/loop.js): paused frames are drawn once, not every frame (v0.11.3), and half rate keeps the sim speed.
import { test, assert } from './harness.mjs';

function fakeRaf() {
  let cb = null, now = performance.now();
  globalThis.requestAnimationFrame = (f) => { cb = f; return 1; };
  globalThis.cancelAnimationFrame = () => { cb = null; };
  return { tick(ms = 1000 / 60) { now += ms; const f = cb; cb = null; if (f) f(now); } };
}

test('a paused loop draws one frame, then none until invalidated or the stamp changes', async () => {
  const raf = fakeRaf();
  const { createLoop } = await import('../src/core/loop.js');
  let paused = false, stamp = 'a', draws = 0, updates = 0;
  const loop = createLoop({ update: () => { updates++; }, render: () => { draws++; }, isPaused: () => paused, stamp: () => stamp });
  loop.start();
  for (let i = 0; i < 10; i++) raf.tick();
  assert.equal(draws, 10);
  paused = true;
  for (let i = 0; i < 10; i++) raf.tick();
  assert.equal(draws, 11, 'one frame on entering the pause');
  loop.invalidate();
  for (let i = 0; i < 5; i++) raf.tick();
  assert.equal(draws, 12, 'one more after invalidate');
  stamp = 'b';
  for (let i = 0; i < 5; i++) raf.tick();
  assert.equal(draws, 13, 'and one when the stamp changes');
  paused = false;
  raf.tick();
  assert.equal(draws, 14);
  loop.stop();
});

test('half rate draws every other frame and the simulation still advances 60 steps a second', async () => {
  const raf = fakeRaf();
  const { createLoop } = await import('../src/core/loop.js');
  let draws = 0, updates = 0;
  const loop = createLoop({ update: () => { updates++; }, render: () => { draws++; }, halfRate: () => true });
  loop.start();
  for (let i = 0; i < 120; i++) raf.tick();
  assert.ok(Math.abs(draws - 60) <= 1, `${draws} draws in 120 frames`);
  assert.ok(Math.abs(updates - 120) <= 2, `${updates} steps`);
  loop.stop();
});
