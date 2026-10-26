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

  // status effects (M10, docs/design-m10-m13.md §3.3). All are read through a weapon's tag scope
  // and must never carry a `when` condition: they are read on every hit and stay cached.
  burnChance:     { base: 0,   min: 0, max: 1,     fmt: 'pct' },   // chance per hit to burn
  chillChance:    { base: 0,   min: 0, max: 1,     fmt: 'pct' },
  shockChance:    { base: 0,   min: 0, max: 1,     fmt: 'pct' },
  burnPower:      { base: 0.5, min: 0,             fmt: 'pct' },   // share of the hit added to the burn pool
  chillStacks:    { base: 1,   min: 0,             fmt: 'int' },   // chill stacks per application
  chains:         { base: 1,   min: 0,             fmt: 'int' },   // hops per shock
  chainDamage:    { base: 0.5, min: 0,             fmt: 'pct' },   // each hop, as a share of the hit
  statusDuration: { base: 1,   min: 0.1,           fmt: 'pct' },
  vsBurning:      { base: 1,   min: 0,             fmt: 'pct' },   // damage multiplier against a burning target
  vsChilled:      { base: 1,   min: 0,             fmt: 'pct' },   // ... chilled or frozen
  vsShocked:      { base: 1,   min: 0,             fmt: 'pct' },   // ... shocked
  ricochet:       { base: 0,   min: 0,             fmt: 'int' },   // (M11a) bounces after pierce runs out
  split:          { base: 0,   min: 0,             fmt: 'int' },   // (M11a) child projectiles on first hit
  splitDamage:    { base: 0.4, min: 0,             fmt: 'pct' },   // (M11a) child damage, share of the parent's
  lowHpDamage:    { base: 0,   min: 0,             fmt: 'pct' },   // (M26) extra damage multiplier that grows as your hp falls (full at 25% hp)
  homing:         { base: 0,   min: 0,             fmt: 'dec' },   // (M45c) radians per second a projectile curves toward the nearest enemy
  vsElite:        { base: 1,   min: 0,             fmt: 'pct' },   // (M45c) damage multiplier against elites and bosses
  stagger:        { base: 0,   min: 0,             fmt: 'dec' },   // (M45b) seconds every direct hit staggers its target (bosses take half)
  executeBelow:   { base: 0,   min: 0, max: 0.5,   fmt: 'pct' },   // (M11b) crits kill non-bosses under this hp fraction
};
