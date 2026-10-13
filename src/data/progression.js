// Run progression tuning. Data only; the formulas live in game/xp.js.
//   xp needed to go from level L to L+1 = round(base + linear*(L-1) + quad*(L-1)^2)
// With the current waves a good run ends around level 22-28.

export const XP = { base: 5, linear: 6, quad: 0.4 };

export const SLOTS = { weapons: 6, passives: 6 };

export const LEVELUP = {
  inputLock: 0.35,          // seconds before the level-up cards accept taps (no accidental picks)
  iframesAfter: 1.0,        // seconds of invulnerability when the run resumes
  healFraction: 0.3,        // the fallback "Rest" offer
  offers: 3,
};

export const GEM = {
  baseMagnet: 150,          // starting speed once a gem is attracted
  accel: 1400,
  maxSpeed: 800,
  // value thresholds -> look: [min value, radius, color]
  tiers: [
    [0,   5, '#6ec5ff'],
    [5,   6, '#6bf0a0'],
    [25,  7, '#c58bff'],
    [100, 8, '#ffd34d'],
  ],
};
