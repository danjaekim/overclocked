// Uniform-grid spatial hash over an unbounded world. Cell coordinates are hashed into a
// fixed table (collisions are fine: every candidate is distance-checked and de-duplicated).
//
//   hash.rebuild(list, n)               list: array of {x, y, ...}; rebuilt once per tick
//   hash.queryRadius(x, y, r, out) -> n fills out[0..n) with objects whose centre is within r
//   hash.queryNearest(x, y, r, pred) -> closest object within r (optionally filtered), or null.
//                                       Objects with `prop === 1` (supply crates) are skipped: it is the aiming query.
//
// Items are stored by reference, so an object released from its pool after the rebuild is
// still safe to touch; callers should skip entries with `alive === false`.
// No allocation after construction.

const PRIME_X = 73856093;
const PRIME_Y = 19349663;

export function createSpatialHash({ cellSize = 64, tableSize = 4096, capacity = 1024 } = {}) {
  if ((tableSize & (tableSize - 1)) !== 0) throw new Error('tableSize must be a power of two');
  const mask = tableSize - 1;
  const inv = 1 / cellSize;
  const head = new Int32Array(tableSize);
  const bucketCount = new Uint16Array(tableSize);
  const next = new Int32Array(capacity);
  const mark = new Int32Array(capacity);
  const items = new Array(capacity).fill(null);
  let count = 0;
  let stamp = 0;
  head.fill(-1);        // empty until the first rebuild (0 would mean "item 0")

  const stats = { maxBucket: 0, items: 0 };

  const cellKey = (cx, cy) => (Math.imul(cx, PRIME_X) ^ Math.imul(cy, PRIME_Y)) & mask;

  function nextStamp() {
    if (++stamp > 2000000000) {
      mark.fill(0);
      stamp = 1;
    }
    return stamp;
  }

  function rebuild(list, n = list.length) {
    head.fill(-1);
    bucketCount.fill(0);
    count = n < capacity ? n : capacity;
    let maxBucket = 0;
    for (let i = 0; i < count; i++) {
      const o = list[i];
      items[i] = o;
      const k = cellKey(Math.floor(o.x * inv), Math.floor(o.y * inv));
      next[i] = head[k];
      head[k] = i;
      const c = ++bucketCount[k];
      if (c > maxBucket) maxBucket = c;
    }
    stats.maxBucket = maxBucket;
    stats.items = count;
  }

  function queryRadius(x, y, r, out) {
    let n = 0;
    const r2 = r * r;
    const x0 = Math.floor((x - r) * inv);
    const x1 = Math.floor((x + r) * inv);
    const y0 = Math.floor((y - r) * inv);
    const y1 = Math.floor((y + r) * inv);

    // Very large queries are cheaper as a linear scan than a walk over thousands of cells.
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > tableSize >> 1) {
      for (let i = 0; i < count; i++) {
        const o = items[i];
        const dx = o.x - x;
        const dy = o.y - y;
        if (dx * dx + dy * dy <= r2) out[n++] = o;
      }
      return n;
    }

    const s = nextStamp();
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = head[cellKey(cx, cy)]; i !== -1; i = next[i]) {
          if (mark[i] === s) continue;
          mark[i] = s;
          const o = items[i];
          const dx = o.x - x;
          const dy = o.y - y;
          if (dx * dx + dy * dy <= r2) out[n++] = o;
        }
      }
    }
    return n;
  }

  function queryNearest(x, y, r, pred) {
    let best = null;
    let bestD2 = r * r;
    const x0 = Math.floor((x - r) * inv);
    const x1 = Math.floor((x + r) * inv);
    const y0 = Math.floor((y - r) * inv);
    const y1 = Math.floor((y + r) * inv);

    if ((x1 - x0 + 1) * (y1 - y0 + 1) > tableSize >> 1) {
      for (let i = 0; i < count; i++) {
        const o = items[i];
        if (o.prop === 1) continue;
        if (pred && !pred(o)) continue;
        const dx = o.x - x;
        const dy = o.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= bestD2) { bestD2 = d2; best = o; }
      }
      return best;
    }

    const s = nextStamp();
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = head[cellKey(cx, cy)]; i !== -1; i = next[i]) {
          if (mark[i] === s) continue;
          mark[i] = s;
          const o = items[i];
          if (o.prop === 1) continue;                    // breakable props are hit by everything but never aimed at
          if (pred && !pred(o)) continue;
          const dx = o.x - x;
          const dy = o.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= bestD2) { bestD2 = d2; best = o; }
        }
      }
    }
    return best;
  }

  return { rebuild, queryRadius, queryNearest, stats };
}
