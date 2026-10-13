// Every stat, declared once (docs/architecture.md §4.1). Engine code only ever READS final
// values; everything that makes the player stronger is a modifier on one of these.
// fmt is a display hint for tooltips: 'int' | 'dec' | 'pct' | 'mult'.

export const STATS = {
  // survival / utility
  maxHp:        { base: 100,  min: 1,              fmt: 'int' },
  moveSpeed:    { base: 150,  min: 40, max: 600,   fmt: 'int' },
  pickupRadius: { base: 70,   min: 20,             fmt: 'int' },
  armor:        { base: 0,                         fmt: 'int' },   // flat damage reduction
  regen:        { base: 0,                         fmt: 'dec' },   // hp per second
  xpGain:       { base: 1,    min: 0,              fmt: 'pct' },
  oreGain:      { base: 1,    min: 0,              fmt: 'pct' },
  luck:         { base: 0,                         fmt: 'int' },

  // offensive (read per weapon through tag scopes, §4.4)
  damage:       { base: 1,    min: 0,              fmt: 'pct' },   // multiplier on weapon base damage
  cooldown:     { base: 1,    min: 0.1,            fmt: 'pct' },   // multiplier; lower is faster
  area:         { base: 1,    min: 0.1,            fmt: 'pct' },
  projectiles:  { base: 0,    min: 0,              fmt: 'int' },   // additional projectiles
  pierce:       { base: 0,    min: 0,              fmt: 'int' },
  duration:     { base: 1,    min: 0.1,            fmt: 'pct' },
  projSpeed:    { base: 1,    min: 0.1,            fmt: 'pct' },
  critChance:   { base: 0.05, min: 0, max: 1,      fmt: 'pct' },
  critMult:     { base: 1.5,  min: 1,              fmt: 'mult' },
  knockback:    { base: 1,    min: 0,              fmt: 'pct' },
  lifesteal:    { base: 0,    min: 0,              fmt: 'pct' },
};
