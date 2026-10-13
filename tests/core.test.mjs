import { test, assert, approx } from './harness.mjs';
import { createRng } from '../src/core/rng.js';
import { createPool } from '../src/core/pool.js';
import { perimeterPoint } from '../src/core/math.js';
import { RUN, WAVES } from '../src/data/waves.js';
import { ENEMIES } from '../src/data/enemies.js';

test('rng is deterministic per seed and differs across seeds', () => {
  const a = createRng(42);
  const b = createRng(42);
  const c = createRng(43);
  const sa = Array.from({ length: 20 }, () => a.next());
  const sb = Array.from({ length: 20 }, () => b.next());
  const sc = Array.from({ length: 20 }, () => c.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((v) => v >= 0 && v < 1));
});

test('rng state can be saved and restored', () => {
  const r = createRng(9);
  r.next(); r.next();
  const s = r.getState();
  const x = r.next();
  r.setState(s);
  assert.equal(r.next(), x);
});

test('rng.weighted respects weights and zero-weight items', () => {
  const r = createRng(5);
  const items = [{ n: 'a', w: 0 }, { n: 'b', w: 1 }, { n: 'c', w: 3 }];
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 4000; i++) counts[r.weighted(items, (x) => x.w).n]++;
  assert.equal(counts.a, 0);
  assert.ok(counts.c > counts.b * 2);
  assert.equal(r.weighted([{ w: 0 }], (x) => x.w), null);
});

test('pool: acquire/release keep a dense active list and never exceed capacity', () => {
  const pool = createPool(() => ({ v: 0 }), 4, (o) => { o.v = 0; });
  const objs = [pool.acquire(), pool.acquire(), pool.acquire(), pool.acquire()];
  assert.equal(pool.acquire(), null);
  assert.equal(pool.count, 4);
  pool.release(objs[1]);
  assert.equal(pool.count, 3);
  assert.ok(!objs[1].alive);
  assert.ok(pool.active.every((o) => o.alive && pool.active[o._i] === o));
  pool.release(objs[1]);                       // double release is a no-op
  assert.equal(pool.count, 3);
  const again = pool.acquire();
  assert.ok(again.alive);
  assert.equal(pool.count, 4);
});

test('pool: releasing while iterating backwards is safe', () => {
  const pool = createPool(() => ({ v: 0 }), 50);
  for (let i = 0; i < 50; i++) pool.acquire().v = i;
  const a = pool.active;
  for (let i = a.length - 1; i >= 0; i--) if (a[i].v % 2 === 0) pool.release(a[i]);
  assert.equal(pool.count, 25);
  assert.ok(pool.active.every((o) => o.v % 2 === 1));
});

test('pool: reset runs on every acquire', () => {
  const pool = createPool(() => ({ v: 0 }), 2, (o) => { o.v = 99; });
  const o = pool.acquire();
  assert.equal(o.v, 99);
  o.v = 1;
  pool.release(o);
  assert.equal(pool.acquire().v, 99);
});

test('perimeterPoint stays on the rectangle border and covers all four sides', () => {
  const out = { x: 0, y: 0 };
  const sides = new Set();
  for (let i = 0; i < 1000; i++) {
    perimeterPoint(10, -5, 100, 200, i / 1000, out);
    const onV = Math.abs(Math.abs(out.x - 10) - 100) < 1e-9;
    const onH = Math.abs(Math.abs(out.y + 5) - 200) < 1e-9;
    assert.ok(onV || onH, `off border at t=${i / 1000}`);
    assert.ok(Math.abs(out.x - 10) <= 100 + 1e-9 && Math.abs(out.y + 5) <= 200 + 1e-9);
    if (onH && out.y < -5) sides.add('top'); else if (onH) sides.add('bottom');
    if (onV && out.x > 10) sides.add('right'); else if (onV) sides.add('left');
  }
  assert.equal(sides.size, 4);
});

test('perimeterPoint side probability follows side length (tall view spawns mostly left/right)', () => {
  const out = { x: 0, y: 0 };
  let leftRight = 0;
  const n = 6000;
  for (let i = 0; i < n; i++) {
    perimeterPoint(0, 0, 260, 560, i / n, out);
    if (Math.abs(out.x) > 259.9) leftRight++;
  }
  approx(leftRight / n, 1120 / (1120 + 520), 0.01);
});

test('wave data is well formed and the timeline has no gaps', () => {
  assert.ok(RUN.length > 0 && RUN.designLength > 0);
  let t = 0;
  for (const seg of WAVES) {
    assert.equal(seg.from, t, `gap or overlap before segment starting ${seg.from}`);
    assert.ok(seg.to > seg.from);
    assert.ok(seg.hpScale > 0);
    for (const s of seg.spawns) {
      assert.ok(ENEMIES[s.enemy], `unknown enemy ${s.enemy}`);
      assert.ok(s.perSec >= 0);
    }
    t = seg.to;
  }
  assert.ok(t >= RUN.designLength, 'timeline ends before the run does');
});
