// Seeded PRNG (mulberry32). All gameplay randomness goes through a run's rng
// so a seed reproduces a run. Visual-only randomness uses a separate instance.

export function createRng(seed) {
  let s = seed >>> 0;

  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    // items: array, weightOf: item -> number >= 0. Returns null if total weight is 0.
    weighted(items, weightOf) {
      let total = 0;
      for (let i = 0; i < items.length; i++) total += weightOf(items[i]);
      if (total <= 0) return null;
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weightOf(items[i]);
        if (r < 0) return items[i];
      }
      return items[items.length - 1];
    },
    getState: () => s,
    setState: (v) => { s = v >>> 0; },
  };
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}
