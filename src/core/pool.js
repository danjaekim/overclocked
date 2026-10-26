// Fixed-capacity object pool. All objects are created up front with a stable
// shape (factory), so there is no steady-state allocation and no hidden-class churn.
//
//   pool.active        dense array of live objects (iterate BACKWARDS if you release while looping)
//   pool.count         number of live objects
//   pool.acquire()     -> object, or null at capacity
//   pool.release(obj)  O(1) swap-remove

export function createPool(factory, capacity, reset) {
  const all = new Array(capacity);
  const free = new Array(capacity);
  for (let i = 0; i < capacity; i++) {
    const o = factory();
    o._i = -1;      // index in pool.active, -1 when free
    o.alive = false;
    all[i] = o;
    free[i] = o;
  }
  let freeCount = capacity;

  const pool = {
    active: [],
    count: 0,
    capacity,
    acquire() {
      if (freeCount === 0) return null;
      const o = free[--freeCount];
      if (reset) reset(o);
      o.alive = true;
      o._i = pool.active.length;
      pool.active.push(o);
      pool.count = pool.active.length;
      return o;
    },
    release(o) {
      if (!o.alive) return;
      const a = pool.active;
      const last = a[a.length - 1];
      a[o._i] = last;
      last._i = o._i;
      a.pop();
      o._i = -1;
      o.alive = false;
      free[freeCount++] = o;
      pool.count = a.length;
    },
    releaseAll() {
      const a = pool.active;
      for (let i = a.length - 1; i >= 0; i--) pool.release(a[i]);
    },
  };
  return pool;
}
