// Perks / "techniques" (docs/design-m10-m13.md §4). Many small stackable upgrades with no slot cap.
// Same shape as passives (`levels` of modifiers, `levelText`) plus:
//   requires  AND of ORs. Each inner list is satisfied by any ONE entry:
//               'tag:<t>'  you own a weapon (instance tags, so forge infusions count) with tag t
//               'perk:<id>[:<minLevel>]'   you own that perk
//               'class:<id>'
//             A perk whose requires do not hold is never offered, so the pool grows as you commit.
//   affinity  owned-weapon tags that make this perk 1.5x as likely to be offered
//   rule      optional engine rule: run.rules[rule.id] = rule.values[level - 1] (null when unowned)
// Modifier `tags` scope a modifier to weapons carrying ALL those tags.

const FIRE = ['tag:fire', 'perk:kindling'];
const FROST = ['tag:frost', 'perk:frostbite'];
const STORM = ['tag:storm', 'perk:static_charge'];

export const PERKS = {
  // ---- element enablers: any build can pick up an element -----------------------------------
  kindling: {
    name: 'Kindling', glyph: 'k', rarity: 'common', maxLevel: 3, requires: [], affinity: ['fire'],
    desc: 'Your hits set enemies on fire.',
    levels: [
      [{ stat: 'burnChance', op: 'flat', value: 0.10 }, { stat: 'burnPower', op: 'flat', value: 0.10 }],
      [{ stat: 'burnChance', op: 'flat', value: 0.10 }, { stat: 'burnPower', op: 'flat', value: 0.10 }],
      [{ stat: 'burnChance', op: 'flat', value: 0.10 }, { stat: 'burnPower', op: 'flat', value: 0.10 }],
    ],
    levelText: ['+10% burn chance, burns +10% harder', '+10% burn chance, burns +10% harder', '+10% burn chance, burns +10% harder'],
  },
  frostbite: {
    name: 'Frostbite', glyph: 'f', rarity: 'common', maxLevel: 3, requires: [], affinity: ['frost'],
    desc: 'Your hits chill enemies; enough chill freezes them.',
    levels: [
      [{ stat: 'chillChance', op: 'flat', value: 0.12 }],
      [{ stat: 'chillChance', op: 'flat', value: 0.12 }],
      [{ stat: 'chillChance', op: 'flat', value: 0.12 }, { stat: 'chillStacks', op: 'flat', value: 1 }],
    ],
    levelText: ['+12% chill chance', '+12% chill chance', '+12% chill chance, +1 chill stack per hit'],
  },
  static_charge: {
    name: 'Static Charge', glyph: 's', rarity: 'common', maxLevel: 3, requires: [], affinity: ['storm'],
    desc: 'Your hits can shock, arcing lightning to nearby enemies.',
    levels: [
      [{ stat: 'shockChance', op: 'flat', value: 0.08 }],
      [{ stat: 'shockChance', op: 'flat', value: 0.08 }, { stat: 'chains', op: 'flat', value: 1 }],
      [{ stat: 'shockChance', op: 'flat', value: 0.08 }],
    ],
    levelText: ['+8% shock chance', '+8% shock chance, +1 chain', '+8% shock chance'],
  },

  // ---- element amplifiers --------------------------------------------------------------------
  fan_the_flames: {
    name: 'Fan the Flames', glyph: 'F', rarity: 'uncommon', maxLevel: 3, requires: [FIRE], affinity: ['fire'],
    desc: 'Burning enemies take more damage.',
    levels: [
      [{ stat: 'vsBurning', op: 'inc', value: 0.20 }],
      [{ stat: 'vsBurning', op: 'inc', value: 0.20 }],
      [{ stat: 'vsBurning', op: 'inc', value: 0.20 }, { stat: 'burnPower', op: 'flat', value: 0.25 }],
    ],
    levelText: ['+20% damage to burning enemies', '+20% damage to burning enemies', '+20% damage to burning enemies, burns +25% harder'],
  },
  deep_freeze: {
    name: 'Deep Freeze', glyph: 'D', rarity: 'uncommon', maxLevel: 3, requires: [FROST], affinity: ['frost'],
    desc: 'Chilled and frozen enemies take more damage.',
    levels: [
      [{ stat: 'vsChilled', op: 'inc', value: 0.15 }],
      [{ stat: 'vsChilled', op: 'inc', value: 0.15 }, { stat: 'statusDuration', op: 'inc', value: 0.2, tags: ['frost'] }],
      [{ stat: 'vsChilled', op: 'inc', value: 0.15 }],
    ],
    levelText: ['+15% damage to chilled enemies', '+15% damage to chilled enemies, frost lasts 20% longer', '+15% damage to chilled enemies'],
  },
  arc_conductor: {
    name: 'Arc Conductor', glyph: 'A', rarity: 'uncommon', maxLevel: 3, requires: [STORM], affinity: ['storm'],
    desc: 'Lightning jumps farther and hits harder.',
    levels: [
      [{ stat: 'chains', op: 'flat', value: 1 }, { stat: 'chainDamage', op: 'flat', value: 0.10 }],
      [{ stat: 'chains', op: 'flat', value: 1 }, { stat: 'chainDamage', op: 'flat', value: 0.10 }],
      [{ stat: 'chains', op: 'flat', value: 1 }, { stat: 'chainDamage', op: 'flat', value: 0.10 }],
    ],
    levelText: ['+1 chain, chains +10% damage', '+1 chain, chains +10% damage', '+1 chain, chains +10% damage'],
  },

  // ---- projectile ----------------------------------------------------------------------------
  ricochet: {
    name: 'Ricochet', glyph: 'r', rarity: 'uncommon', maxLevel: 3, requires: [['tag:projectile']], affinity: ['projectile'],
    desc: 'Projectiles that run out of pierce bounce to a new enemy.',
    levels: [
      [{ stat: 'ricochet', op: 'flat', value: 1, tags: ['projectile'] }],
      [{ stat: 'ricochet', op: 'flat', value: 1, tags: ['projectile'] }],
      [{ stat: 'ricochet', op: 'flat', value: 1, tags: ['projectile'] }],
    ],
    levelText: ['+1 bounce', '+1 bounce', '+1 bounce'],
  },
  splitting_tips: {
    name: 'Splitting Tips', glyph: 'p', rarity: 'uncommon', maxLevel: 3, requires: [['tag:projectile']], affinity: ['projectile'],
    desc: 'Projectiles split into smaller shots on their first hit.',
    levels: [
      [{ stat: 'split', op: 'flat', value: 2, tags: ['projectile'] }],
      [{ stat: 'splitDamage', op: 'flat', value: 0.2, tags: ['projectile'] }],
      [{ stat: 'split', op: 'flat', value: 1, tags: ['projectile'] }],
    ],
    levelText: ['split into 2 shots on first hit', 'split shots deal +20% of the hit', '+1 split shot'],
  },
  heavy_fletching: {
    name: 'Heavy Fletching', glyph: 'h', rarity: 'common', maxLevel: 3, requires: [['tag:projectile']], affinity: ['projectile'],
    desc: 'Bigger, heavier projectiles.',
    levels: [
      [{ stat: 'area', op: 'inc', value: 0.20, tags: ['projectile'] }, { stat: 'knockback', op: 'inc', value: 0.15, tags: ['projectile'] }],
      [{ stat: 'area', op: 'inc', value: 0.20, tags: ['projectile'] }, { stat: 'knockback', op: 'inc', value: 0.15, tags: ['projectile'] }],
      [{ stat: 'area', op: 'inc', value: 0.20, tags: ['projectile'] }, { stat: 'knockback', op: 'inc', value: 0.15, tags: ['projectile'] }],
    ],
    levelText: ['+20% projectile size, +15% knockback', '+20% projectile size, +15% knockback', '+20% projectile size, +15% knockback'],
  },
  volley: {
    name: 'Volley', glyph: 'V', rarity: 'rare', maxLevel: 2, requires: [['tag:projectile']], affinity: ['projectile'],
    desc: 'Every projectile weapon fires more shots.',
    levels: [
      [{ stat: 'projectiles', op: 'flat', value: 1, tags: ['projectile'] }],
      [{ stat: 'projectiles', op: 'flat', value: 1, tags: ['projectile'] }],
    ],
    levelText: ['+1 projectile', '+1 projectile'],
  },

  // ---- close range ---------------------------------------------------------------------------
  long_reach: {
    name: 'Long Reach', glyph: 'l', rarity: 'common', maxLevel: 3, requires: [['tag:close']], affinity: ['close'],
    desc: 'Melee, blades and auras reach farther.',
    levels: [
      [{ stat: 'area', op: 'inc', value: 0.15, tags: ['close'] }],
      [{ stat: 'area', op: 'inc', value: 0.15, tags: ['close'] }],
      [{ stat: 'area', op: 'inc', value: 0.15, tags: ['close'] }],
    ],
    levelText: ['+15% area', '+15% area', '+15% area'],
  },
  echo_strike: {
    name: 'Echo Strike', glyph: 'e', rarity: 'rare', maxLevel: 2, requires: [['tag:arc', 'tag:orbit']], affinity: ['arc', 'orbit'],
    desc: 'An extra swing or blade on every arc and orbit weapon.',
    levels: [
      [{ stat: 'projectiles', op: 'flat', value: 1, tags: ['arc'] }, { stat: 'projectiles', op: 'flat', value: 1, tags: ['orbit'] }],
      [{ stat: 'projectiles', op: 'flat', value: 1, tags: ['arc'] }, { stat: 'projectiles', op: 'flat', value: 1, tags: ['orbit'] }],
    ],
    levelText: ['+1 swing / blade', '+1 swing / blade'],
  },
  bloodletting: {
    name: 'Bloodletting', glyph: 'b', rarity: 'uncommon', maxLevel: 3, requires: [['tag:close']], affinity: ['close'],
    desc: 'Close-range hits heal you.',
    levels: [
      [{ stat: 'lifesteal', op: 'flat', value: 0.01, tags: ['close'] }],
      [{ stat: 'lifesteal', op: 'flat', value: 0.01, tags: ['close'] }],
      [{ stat: 'lifesteal', op: 'flat', value: 0.01, tags: ['close'] }, { stat: 'maxHp', op: 'inc', value: 0.10 }],
    ],
    levelText: ['+1% lifesteal', '+1% lifesteal', '+1% lifesteal, +10% max HP'],
  },

  // ---- crit ----------------------------------------------------------------------------------
  keen_eye: {
    name: 'Keen Eye', glyph: 'K', rarity: 'common', maxLevel: 3, requires: [], affinity: [],
    desc: 'Find the weak point. More crits.',
    levels: [
      [{ stat: 'critChance', op: 'flat', value: 0.05 }],
      [{ stat: 'critChance', op: 'flat', value: 0.05 }],
      [{ stat: 'critChance', op: 'flat', value: 0.05 }, { stat: 'critMult', op: 'flat', value: 0.25 }],
    ],
    levelText: ['+5% crit chance', '+5% crit chance', '+5% crit chance, +0.25 crit multiplier'],
  },
};
