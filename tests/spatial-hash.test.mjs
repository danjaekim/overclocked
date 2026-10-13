import { test, assert } from './harness.mjs';
import { createSpatialHash } from '../src/core/spatial-hash.js';
import { createRng } from '../src/core/rng.js';

function scatter(n, spread, seed = 1) {
  const rng = createRng(seed);
  const pts = [];
  for (let i = 0; i < n; i++) pts.push({ id: i, x: rng.range(-spread, spread), y: rng.range(-spread, spread) });
  return pts;
}

const brute = (pts, x, y, r) => pts.filter((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= r * r).map((p) => p.id).sort((a, b) => a - b);

test('queryRadius matches brute force across many queries (incl. negative coords)', () => {
  const pts = scatter(500, 800);
  const hash = createSpatialHash({ capacity: 600 });
  hash.rebuild(pts, pts.length);
  const rng = createRng(7);
  const out = [];
  for (let q = 0; q < 300; q++) {
    const x = rng.range(-900, 900);
    const y = rng.range(-900, 900);
    const r = rng.range(5, 200);
    const n = hash.queryRadius(x, y, r, out);
    const got = out.slice(0, n).map((p) => p.id).sort((a, b) => a - b);
    assert.deepEqual(got, brute(pts, x, y, r));
  }
});

test('no duplicates even when distinct cells collide in a tiny table', () => {
  const pts = scatter(200, 400);
  const hash = createSpatialHash({ tableSize: 8, capacity: 200 });
  hash.rebuild(pts, pts.length);
  const out = [];
  const n = hash.queryRadius(0, 0, 100, out);
  const ids = out.slice(0, n).map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.slice().sort((a, b) => a - b), brute(pts, 0, 0, 100));
});

test('huge query falls back to a linear scan and stays correct', () => {
  const pts = scatter(300, 500);
  const hash = createSpatialHash({ capacity: 300 });
  hash.rebuild(pts, pts.length);
  const out = [];
  const n = hash.queryRadius(0, 0, 5000, out);
  assert.equal(n, 300);
});

test('queryNearest returns the closest match and honours the filter', () => {
  const pts = scatter(400, 600, 3);
  const hash = createSpatialHash({ capacity: 400 });
  hash.rebuild(pts, pts.length);
  const x = 10;
  const y = -20;
  const best = hash.queryNearest(x, y, 300);
  const inRange = pts.filter((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= 300 * 300);
  inRange.sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));
  assert.equal(best.id, inRange[0].id);
  const even = hash.queryNearest(x, y, 300, (p) => p.id % 2 === 0);
  assert.equal(even.id, inRange.find((p) => p.id % 2 === 0).id);
  assert.equal(hash.queryNearest(5000, 5000, 10), null);
});

test('a hash that has never been rebuilt is empty (no crash, no phantom item 0)', () => {
  const hash = createSpatialHash({ capacity: 16 });
  const out = [];
  assert.equal(hash.queryRadius(0, 0, 100, out), 0);
  assert.equal(hash.queryNearest(0, 0, 100), null);
  assert.equal(hash.queryRadius(0, 0, 100000, out), 0);
});

test('rebuild replaces previous contents and respects capacity', () => {
  const hash = createSpatialHash({ capacity: 10 });
  hash.rebuild(scatter(10, 100), 10);
  hash.rebuild([{ id: 0, x: 0, y: 0 }], 1);
  const out = [];
  assert.equal(hash.queryRadius(0, 0, 1000, out), 1);
  hash.rebuild(scatter(50, 100), 50);            // more than capacity: extras are ignored, not a crash
  assert.equal(hash.stats.items, 10);
});

test('stats report the fullest bucket', () => {
  const pts = [];
  for (let i = 0; i < 20; i++) pts.push({ id: i, x: 1 + i * 0.01, y: 1 });   // all in one cell
  const hash = createSpatialHash({ capacity: 64 });
  hash.rebuild(pts, pts.length);
  assert.equal(hash.stats.maxBucket, 20);
});
