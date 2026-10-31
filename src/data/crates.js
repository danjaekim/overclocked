// Supply crates (systems/crates.js): sparse breakable props that drop a little help. Data only.
// They arrive from `crate` events in data/waves.js (about one every 40 s), just past the left or
// right edge of the view with an arrow pointing at them, and fade after `ttl` seconds.
// What falls out is a weighted roll. Heals are weighted up while you are hurt and never rolled at full
// health, so a heal is an occasional assist rather than something to build a run around.

export const CRATES = {
  maxActive: 3,
  ttl: 70,
  placement: { candidates: 6, edgeMin: 10, edgeMax: 90, maxDy: 260 },
  // hp fraction at or below which the heal weight is multiplied (first match wins)
  hurt: [[0.35, 4], [0.6, 2.5]],
  loot: {
    heal: { weight: 3, frac: 0.15 },             // a heart worth 15% of max hp
    xp:   { weight: 4, gems: 4, perGem: 0.04 },  // 4 gems, each worth 4% of the xp to the next level (at least 2)
    ore:  { weight: 3, amount: 3, type: 'iron' },
    // pulls in every gem, ore and heart on the ground; only rolled when at least `minOnGround` of them are
    // lying around, so it is never wasted on an empty floor
    magnet: { weight: 2, minOnGround: 8 },
  },
};
