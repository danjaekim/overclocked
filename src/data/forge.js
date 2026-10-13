// Forge, shrine and affix tuning (docs/architecture.md §6.3-6.5). Data only; the rules live in
// game/forge.js and systems/shrines.js. Arrays are indexed by the CURRENT enhance level:
// cost[3] is the price of going from +3 to +4.

export const ENHANCE = {
  maxLevel: 15,
  cost:    [3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 26, 30, 35, 40, 50],
  success: [1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15],
  perLevel: [{ stat: 'damage', op: 'inc', value: 0.08 }],
  // gained when reaching that level; a weapon's `forge.breakpoints` replaces an entry
  breakpoints: {
    5:  [{ stat: 'projectiles', op: 'flat', value: 1 }],
    10: [{ stat: 'damage', op: 'more', value: 0.3 }],
    15: [{ stat: 'damage', op: 'more', value: 0.5 }, { stat: 'area', op: 'inc', value: 0.25 }],
  },
  // On a failed enhance above this level there is a chance to lose ONE enhance level. A failure
  // never removes the weapon (tested invariant). downgradeChance 0 disables downgrades.
  downgradeAbove: 7,
  downgradeChance: 0.5,
  luckProtect: 0.05,       // each point of luck cuts the downgrade chance by 5% (max 50%)
};

export const REFORGE = {
  cost: 6,                 // iron
  costPerReforge: 2,       // extra iron per earlier reforge of the same weapon
  affixCount: { common: 1, uncommon: 2, rare: 2, epic: 3, evolved: 3 },
};

export const SALVAGE = { base: 2, perLevel: 1, perEnhance: 2 };   // ore returned

export const SHRINE = {
  maxActive: 1,
  ttl: 45,                 // seconds before a shrine fades
  bossShrineTtl: 90,
  radius: 40,              // activation radius, world units
  channel: 0.8,            // seconds standing inside to open the forge
  drain: 2,                // progress drains this many times faster outside the radius
  // The view is tall and narrow, so shrines appear just past the LEFT or RIGHT edge:
  // x offset beyond the view edge in [edgeMin, edgeMax], y offset within +-maxDy of the player.
  placement: { candidates: 6, edgeMin: 20, edgeMax: 120, maxDy: 300 },
};

// Affixes rolled by Reforge. `requires`: the weapon must have at least one of these tags.
// `mods` apply to that weapon only; `triggers` are extra weapon triggers (no interval ones).
export const AFFIXES = {
  keen:     { name: 'Keen',     rarity: 'common',   desc: '+5% crit chance',      mods: [{ stat: 'critChance', op: 'flat', value: 0.05 }] },
  swift:    { name: 'Swift',    rarity: 'common',   desc: '-8% cooldown',         mods: [{ stat: 'cooldown', op: 'inc', value: -0.08 }] },
  heavy:    { name: 'Heavy',    rarity: 'common',   desc: '+12% damage',          mods: [{ stat: 'damage', op: 'inc', value: 0.12 }] },
  wide:     { name: 'Wide',     rarity: 'common',   desc: '+15% area',            mods: [{ stat: 'area', op: 'inc', value: 0.15 }] },
  shoving:  { name: 'Shoving',  rarity: 'common',   desc: '+50% knockback',       mods: [{ stat: 'knockback', op: 'inc', value: 0.5 }] },
  piercing: { name: 'Piercing', rarity: 'uncommon', desc: '+1 pierce',            mods: [{ stat: 'pierce', op: 'flat', value: 1 }], requires: ['projectile'] },
  brutal:   { name: 'Brutal',   rarity: 'uncommon', desc: '+0.3 crit multiplier', mods: [{ stat: 'critMult', op: 'flat', value: 0.3 }] },
  twin:     { name: 'Twin',     rarity: 'rare',     desc: '+1 projectile/blade/swing', mods: [{ stat: 'projectiles', op: 'flat', value: 1 }], requires: ['projectile', 'orbit', 'arc'] },
  volatile: { name: 'Volatile', rarity: 'rare',     desc: '10% of kills explode',
              triggers: [{ on: 'kill', chance: 0.1, effect: 'explode', params: { radius: 50, damageFrac: 0.4 } }] },
};
