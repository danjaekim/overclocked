// Forge, shrine and affix tuning (docs/architecture.md §6.3-6.5). Data only; the rules live in
// game/forge.js and systems/shrines.js. Arrays are indexed by the CURRENT enhance level:
// cost[3] is the price of going from +3 to +4.

export const ENHANCE = {
  maxLevel: 15,
  cost:    [3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 26, 30, 35, 40, 50],
  success: [1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15],
  perLevel: [{ stat: 'damage', op: 'inc', value: 0.08 }],
  // gained automatically when reaching that level (+5 and +10 are a CHOICE of tempers instead)
  breakpoints: {
    15: [{ stat: 'damage', op: 'more', value: 0.5 }, { stat: 'area', op: 'inc', value: 0.25 }],
  },
  // Reaching +5 and +10 offers two tempers; the player picks one (docs/design-m10-m13.md section 7.3).
  // A weapon's own `forge.tempers` replaces an entry. `addTags` gives the weapon an element tag.
  tempers: {
    5: [
      { id: 'honed',  name: 'Honed',  desc: '30% more damage',          mods: [{ stat: 'damage', op: 'more', value: 0.3 }] },
      { id: 'hasted', name: 'Hasted', desc: '-20% cooldown',            mods: [{ stat: 'cooldown', op: 'inc', value: -0.2 }] },
    ],
    10: [
      { id: 'mighty', name: 'Mighty', desc: '30% more damage',          mods: [{ stat: 'damage', op: 'more', value: 0.3 }] },
      { id: 'vast',   name: 'Vast',   desc: '30% more area, +1 projectile / swing / blade', mods: [{ stat: 'area', op: 'more', value: 0.3 }, { stat: 'projectiles', op: 'flat', value: 1 }] },
    ],
  },
  // On a failed enhance above this level there is a chance to lose ONE enhance level. A failure
  // never removes the weapon (tested invariant). downgradeChance 0 disables downgrades.
  downgradeAbove: 7,
  downgradeChance: 0.5,
  luckProtect: 0.05,       // each point of luck cuts the downgrade chance by 5% (max 50%)
};

// Star Quench (M39): starsteel buys guaranteed enhance attempts. `bands` is [minEnhanceLevel, charges] checked
// from the top: buying at +10 to +12 gives 2 charges, at +13 or +14 gives 1, at +4 to +9 gives 3. A charge makes
// the next enhance attempt succeed (no roll, no downgrade); the ore is still paid. Below the lowest band the
// odds are already near-certain, so it cannot be bought; at max level there is nothing to buy.
export const QUENCH = {
  cost: 1,                 // starsteel per purchase
  maxCharges: 9,           // a weapon holds at most this many at once
  bands: [[13, 1], [10, 2], [4, 3]],
};

// One reforge fills or replaces ONE affix slot: you see `options` random affixes and pick one (or keep
// what you have; the ore is spent either way). At least one option is uncommon or better when one exists.
export const REFORGE = {
  options: 3,
  cost: 6,                 // iron
  costPerReforge: 2,       // extra iron per earlier reforge of the same weapon
  affixCount: { common: 1, uncommon: 2, rare: 2, epic: 3, evolved: 3 },
};

export const SALVAGE = { base: 2, perLevel: 1, perEnhance: 2 };   // ore returned

export const SHRINE = {
  maxActive: 1,
  ttl: 80,                 // seconds before a shrine fades (was 45: too easy to miss while fighting)
  bossShrineTtl: 150,
  radius: 40,              // activation radius, world units
  channel: 0.8,            // seconds standing inside to open the forge
  drain: 2,                // progress drains this many times faster outside the radius
  // The view is tall and narrow, so shrines appear just past the LEFT or RIGHT edge:
  // x offset beyond the view edge in [edgeMin, edgeMax], y offset within +-maxDy of the player.
  placement: { candidates: 6, edgeMin: 20, edgeMax: 120, maxDy: 300 },
};

// Affixes rolled by Reforge (pick one of three, one slot at a time).
//   requires  the weapon must carry at least one of these tags (its own, or ones it gained)
//   addTags   the weapon gains these tags while it has the affix (infusions: it joins that element's perks and sets)
//   infusion  a weapon can hold only one infusion at a time
export const AFFIXES = {
  keen:     { name: 'Keen',     rarity: 'common',   desc: '+5% crit chance',      mods: [{ stat: 'critChance', op: 'flat', value: 0.05 }] },
  swift:    { name: 'Swift',    rarity: 'common',   desc: '-8% cooldown',         mods: [{ stat: 'cooldown', op: 'inc', value: -0.08 }] },
  heavy:    { name: 'Heavy',    rarity: 'common',   desc: '+12% damage',          mods: [{ stat: 'damage', op: 'inc', value: 0.12 }] },
  wide:     { name: 'Wide',     rarity: 'common',   desc: '+15% area',            mods: [{ stat: 'area', op: 'inc', value: 0.15 }] },
  shoving:  { name: 'Shoving',  rarity: 'common',   desc: '+50% knockback',       mods: [{ stat: 'knockback', op: 'inc', value: 0.5 }] },
  piercing: { name: 'Piercing', rarity: 'uncommon', desc: '+1 pierce',            mods: [{ stat: 'pierce', op: 'flat', value: 1 }], requires: ['projectile'] },
  brutal:   { name: 'Brutal',   rarity: 'uncommon', desc: '+0.3 crit multiplier', mods: [{ stat: 'critMult', op: 'flat', value: 0.3 }] },
  ember_touched: { name: 'Ember-touched', rarity: 'uncommon', infusion: true, addTags: ['fire'],
                   desc: 'Becomes a fire weapon: +25% burn chance', mods: [{ stat: 'burnChance', op: 'flat', value: 0.25 }] },
  rime_touched:  { name: 'Rime-touched',  rarity: 'uncommon', infusion: true, addTags: ['frost'],
                   desc: 'Becomes a frost weapon: +25% chill chance', mods: [{ stat: 'chillChance', op: 'flat', value: 0.25 }] },
  storm_touched: { name: 'Storm-touched', rarity: 'uncommon', infusion: true, addTags: ['storm'],
                   desc: 'Becomes a storm weapon: +20% shock chance', mods: [{ stat: 'shockChance', op: 'flat', value: 0.20 }] },
  twin:     { name: 'Twin',     rarity: 'rare',     desc: '+1 projectile/blade/swing/slam', mods: [{ stat: 'projectiles', op: 'flat', value: 1 }], requires: ['projectile', 'orbit', 'arc'] },
  volatile: { name: 'Volatile', rarity: 'rare',     desc: '10% of kills explode',
              triggers: [{ on: 'kill', chance: 0.1, effect: 'explode', params: { radius: 50, damageFrac: 0.4 } }] },
  ricocheting: { name: 'Ricocheting', rarity: 'rare', desc: '+2 bounces', mods: [{ stat: 'ricochet', op: 'flat', value: 2 }], requires: ['projectile'] },
  splitting:   { name: 'Splitting',   rarity: 'rare', desc: 'Splits into 2 shots on first hit', mods: [{ stat: 'split', op: 'flat', value: 2 }], requires: ['projectile'] },
  conductive:  { name: 'Conductive',  rarity: 'rare', desc: '+1 chain, chains +15% damage', mods: [{ stat: 'chains', op: 'flat', value: 1 }, { stat: 'chainDamage', op: 'flat', value: 0.15 }], requires: ['storm'] },
  searing:     { name: 'Searing',     rarity: 'rare', desc: '+40% damage to burning enemies', mods: [{ stat: 'vsBurning', op: 'inc', value: 0.4 }], requires: ['fire'] },
  vampiric:    { name: 'Vampiric',    rarity: 'rare', desc: '+2% lifesteal', mods: [{ stat: 'lifesteal', op: 'flat', value: 0.02 }] },
  executioner: { name: 'Executioner', rarity: 'epic', desc: 'Crits execute non-bosses under 15% HP', mods: [{ stat: 'executeBelow', op: 'flat', value: 0.15 }] },
  colossal:    { name: 'Colossal',    rarity: 'epic', desc: '30% more area', mods: [{ stat: 'area', op: 'more', value: 0.3 }] },
};

// Default tempers by weapon behavior (M45b, docs/design-m45.md). Lookup order: a weapon's own `forge.tempers`, then its
// behavior's pair here, then ENHANCE.tempers (Honed/Hasted, Mighty/Vast). Keyed by behavior id, then +5 / +10.
const SHOT = {
  5: [
    { id: 'longshot', name: 'Longshot', desc: '+2 pierce, +40% speed, 30% more damage', mods: [{ stat: 'pierce', op: 'flat', value: 2 }, { stat: 'projSpeed', op: 'inc', value: 0.4 }, { stat: 'damage', op: 'more', value: 0.3 }] },
    { id: 'barrage', name: 'Barrage', desc: '+2 projectiles', mods: [{ stat: 'projectiles', op: 'flat', value: 2 }] },
  ],
  10: [
    { id: 'splitshot', name: 'Splitshot', desc: 'Hits split into 3 projectiles that hit for 60% as hard', mods: [{ stat: 'split', op: 'flat', value: 3 }, { stat: 'splitDamage', op: 'flat', value: 0.2 }] },
    { id: 'ricochet_shot', name: 'Ricochet', desc: 'Bounces 3 times after its pierce runs out', mods: [{ stat: 'ricochet', op: 'flat', value: 3 }] },
  ],
};
const STRIKE = {
  5: [
    { id: 'crushing', name: 'Crushing', desc: '50% more damage, hits stagger for 0.4 s, +10% cooldown', mods: [{ stat: 'damage', op: 'more', value: 0.5 }, { stat: 'stagger', op: 'flat', value: 0.4 }, { stat: 'cooldown', op: 'inc', value: 0.1 }] },
    { id: 'flurry', name: 'Flurry', desc: '-20% cooldown, 10% less area', mods: [{ stat: 'cooldown', op: 'inc', value: -0.2 }, { stat: 'area', op: 'more', value: -0.1 }] },
  ],
  10: [
    { id: 'quaking', name: 'Quaking', desc: '40% more area, +50% knockback', mods: [{ stat: 'area', op: 'more', value: 0.4 }, { stat: 'knockback', op: 'inc', value: 0.5 }] },
    { id: 'searing_strike', name: 'Searing', desc: 'Becomes a fire weapon: +60% burn chance', mods: [{ stat: 'burnChance', op: 'flat', value: 0.6 }], addTags: ['fire'] },
  ],
};
const ORBIT = {
  5: [
    { id: 'halo_blades', name: 'Halo of blades', desc: '+2 blades', mods: [{ stat: 'projectiles', op: 'flat', value: 2 }] },
    { id: 'whirling', name: 'Whirling', desc: 'Spins 30% faster, 50% more damage', mods: [{ stat: 'projSpeed', op: 'inc', value: 0.3 }, { stat: 'damage', op: 'more', value: 0.5 }] },
  ],
  10: [
    { id: 'razor_ring', name: 'Razor ring', desc: '35% more damage, +10% crit chance, +0.3 crit multiplier', mods: [{ stat: 'damage', op: 'more', value: 0.35 }, { stat: 'critChance', op: 'flat', value: 0.1 }, { stat: 'critMult', op: 'flat', value: 0.3 }] },
    { id: 'storm_ring', name: 'Storm ring', desc: 'Becomes a storm weapon: +40% shock chance, +1 chain', mods: [{ stat: 'shockChance', op: 'flat', value: 0.4 }, { stat: 'chains', op: 'flat', value: 1 }], addTags: ['storm'] },
  ],
};
const RING = {
  5: [
    { id: 'wide_ring', name: 'Wide ring', desc: '35% more area, 15% more damage', mods: [{ stat: 'area', op: 'more', value: 0.35 }, { stat: 'damage', op: 'more', value: 0.15 }] },
    { id: 'searing_ring', name: 'Searing ring', desc: 'Ticks 15% faster', mods: [{ stat: 'cooldown', op: 'inc', value: -0.15 }] },
  ],
  10: [
    { id: 'vast_ring', name: 'Vast ring', desc: '40% more area, 15% more damage', mods: [{ stat: 'area', op: 'more', value: 0.4 }, { stat: 'damage', op: 'more', value: 0.15 }] },
    { id: 'brand', name: 'Brand', desc: 'Becomes a fire weapon: +50% burn chance, burns +30% harder', mods: [{ stat: 'burnChance', op: 'flat', value: 0.5 }, { stat: 'burnPower', op: 'flat', value: 0.3 }], addTags: ['fire'] },
  ],
};
const MINIONS = {
  5: [
    { id: 'pack', name: 'Pack', desc: '+2 minions', mods: [{ stat: 'projectiles', op: 'flat', value: 2 }] },
    { id: 'alpha', name: 'Alpha', desc: 'Minions 40% bigger, 40% more damage', mods: [{ stat: 'area', op: 'more', value: 0.4 }, { stat: 'damage', op: 'more', value: 0.4 }] },
  ],
  10: [
    { id: 'horde', name: 'Horde', desc: '+1 minion, 15% more damage', mods: [{ stat: 'projectiles', op: 'flat', value: 1 }, { stat: 'damage', op: 'more', value: 0.15 }] },
    { id: 'warband', name: 'Warband', desc: '50% more damage, 30% more area', mods: [{ stat: 'damage', op: 'more', value: 0.5 }, { stat: 'area', op: 'more', value: 0.3 }] },
  ],
};
const BOLTS = {
  5: [
    { id: 'forked', name: 'Forked', desc: '+2 bolts, +2 chains, chains hit 10% harder', mods: [{ stat: 'projectiles', op: 'flat', value: 2 }, { stat: 'chains', op: 'flat', value: 2 }, { stat: 'chainDamage', op: 'flat', value: 0.1 }] },
    { id: 'focused', name: 'Focused', desc: '45% more damage', mods: [{ stat: 'damage', op: 'more', value: 0.45 }] },
  ],
  10: [
    { id: 'arc_storm', name: 'Arc storm', desc: '+3 chains, chains hit 30% harder', mods: [{ stat: 'chains', op: 'flat', value: 3 }, { stat: 'chainDamage', op: 'flat', value: 0.3 }] },
    { id: 'overload', name: 'Overload', desc: 'Becomes a storm weapon: +40% damage, +30% shock chance', mods: [{ stat: 'damage', op: 'more', value: 0.4 }, { stat: 'shockChance', op: 'flat', value: 0.3 }], addTags: ['storm'] },
  ],
};
const TRAIL = {
  5: [
    { id: 'lingering', name: 'Lingering', desc: '80% longer lasting, 15% more damage', mods: [{ stat: 'duration', op: 'inc', value: 0.8 }, { stat: 'damage', op: 'more', value: 0.15 }] },
    { id: 'scorched', name: 'Scorched', desc: '40% more damage, 20% more area', mods: [{ stat: 'damage', op: 'more', value: 0.4 }, { stat: 'area', op: 'more', value: 0.2 }] },
  ],
  10: [
    { id: 'everlasting', name: 'Everlasting', desc: '60% longer lasting, 20% more damage', mods: [{ stat: 'duration', op: 'inc', value: 0.6 }, { stat: 'damage', op: 'more', value: 0.2 }] },
    { id: 'cinders', name: 'Cinders', desc: 'Becomes a fire weapon: +50% burn chance', mods: [{ stat: 'burnChance', op: 'flat', value: 0.5 }], addTags: ['fire'] },
  ],
};
const ORDNANCE = {
  5: [
    { id: 'salvo', name: 'Salvo', desc: '+1 projectile', mods: [{ stat: 'projectiles', op: 'flat', value: 1 }] },
    { id: 'heavy_ordnance', name: 'Heavy', desc: '40% more damage, 25% more area, +15% cooldown', mods: [{ stat: 'damage', op: 'more', value: 0.4 }, { stat: 'area', op: 'more', value: 0.25 }, { stat: 'cooldown', op: 'inc', value: 0.15 }] },
  ],
  10: [
    { id: 'bombardment', name: 'Bombardment', desc: '+1 projectile, 15% more damage', mods: [{ stat: 'projectiles', op: 'flat', value: 1 }, { stat: 'damage', op: 'more', value: 0.15 }] },
    { id: 'frostbound', name: 'Frostbound', desc: 'Becomes a frost weapon: +70% chill chance, 30% more damage to chilled enemies', mods: [{ stat: 'chillChance', op: 'flat', value: 0.7 }, { stat: 'vsChilled', op: 'more', value: 0.3 }], addTags: ['frost'] },
  ],
};
export const TEMPERS_BY_BEHAVIOR = {
  projectile: SHOT,
  nova: SHOT,
  rod: SHOT,
  slam: STRIKE,
  arc: STRIKE,
  orbit: ORBIT,
  aura: RING,
  pulse: RING,
  summon: MINIONS,
  bolt: BOLTS,
  chain: BOLTS,
  trail: TRAIL,
  mortar: ORDNANCE,
  boomerang: ORDNANCE,
  judge: ORDNANCE,
};
