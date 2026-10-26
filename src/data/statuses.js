// Status effect tuning (docs/design-m10-m13.md §3). Data only; rules live in systems/status.js.
//   burn   damage over time; every application adds a share of the hit to a pool dealt over `duration`
//   chill  slows 10% per stack; at maxStacks the enemy freezes, then is freeze-immune for a while
//   shock  marks the enemy and chains an arc of damage to nearby enemies

export const BURN = { duration: 3, tickEvery: 0.25, color: '#ff8a3c' };
export const CHILL = {
  maxStacks: 4, slowPerStack: 0.10, duration: 2.5,
  freezeTime: 1.0, freezeImmune: 1.5,
  bossMaxStacks: 2,            // bosses never freeze; their chill stops here
  eliteFreezeMult: 0.5,        // elites stay frozen half as long
  color: '#7fd4ff',
};
export const SHOCK = { duration: 2, chainRange: 120, maxHops: 8, color: '#ffe066' };

// Bit flags in enemy.status. TIMERS is set whenever any status timer is running, so the
// status system can skip untouched enemies with a single test.
export const ST = { BURN: 1, CHILL: 2, FROZEN: 4, SHOCK: 8, TIMERS: 16 };
