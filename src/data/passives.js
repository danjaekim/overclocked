// Passive definitions (docs/architecture.md §5.3). Data only.
//   levels   modifiers gained at level 1..maxLevel (index 0 = level 1); length === maxLevel
//   tags     for offer filtering and evolution recipes (not the same as modifier `tags`, which
//            scope a modifier to weapons that have those tags)

export const PASSIVES = {
  tempered_core: {
    name: 'Tempered Core',
    desc: 'A heart of folded steel. More health and armor.',
    rarity: 'common',
    tags: ['defense'],
    maxLevel: 5,
    levels: [
      [{ stat: 'maxHp', op: 'inc', value: 0.10 }, { stat: 'armor', op: 'flat', value: 1 }],
      [{ stat: 'maxHp', op: 'inc', value: 0.10 }],
      [{ stat: 'armor', op: 'flat', value: 1 }, { stat: 'regen', op: 'flat', value: 0.3 }],
      [{ stat: 'maxHp', op: 'inc', value: 0.15 }],
      [{ stat: 'maxHp', op: 'inc', value: 0.15 }, { stat: 'armor', op: 'flat', value: 1 }],
    ],
    levelText: ['+10% max HP, +1 armor', '+10% max HP', '+1 armor, +0.3 HP/s', '+15% max HP', '+15% max HP, +1 armor'],
    triggers: [],
  },

  fleet_greaves: {
    name: 'Fleet Greaves',
    desc: 'Light boots. Move faster and pull in loot from farther away.',
    rarity: 'common',
    tags: ['mobility'],
    maxLevel: 5,
    levels: [
      [{ stat: 'moveSpeed', op: 'inc', value: 0.08 }],
      [{ stat: 'moveSpeed', op: 'inc', value: 0.08 }],
      [{ stat: 'pickupRadius', op: 'inc', value: 0.25 }],
      [{ stat: 'moveSpeed', op: 'inc', value: 0.08 }],
      [{ stat: 'moveSpeed', op: 'inc', value: 0.10 }, { stat: 'pickupRadius', op: 'inc', value: 0.25 }],
    ],
    levelText: ['+8% move speed', '+8% move speed', '+25% pickup range', '+8% move speed', '+10% move speed, +25% pickup range'],
    triggers: [],
  },

  keen_whetstone: {
    name: 'Keen Whetstone',
    desc: 'A fine edge on everything you carry. More damage.',
    rarity: 'common',
    tags: ['offense'],
    maxLevel: 5,
    levels: [
      [{ stat: 'damage', op: 'inc', value: 0.10 }],
      [{ stat: 'damage', op: 'inc', value: 0.10 }],
      [{ stat: 'damage', op: 'inc', value: 0.10 }],
      [{ stat: 'damage', op: 'inc', value: 0.10 }],
      [{ stat: 'damage', op: 'inc', value: 0.10 }, { stat: 'critChance', op: 'flat', value: 0.05 }],
    ],
    levelText: ['+10% damage', '+10% damage', '+10% damage', '+10% damage', '+10% damage, +5% crit chance'],
    triggers: [],
  },

  quickening_gear: {
    name: 'Quickening Gear',
    desc: 'Clockwork in the handles. Weapons fire faster.',
    rarity: 'uncommon',
    tags: ['offense', 'speed'],
    maxLevel: 5,
    levels: [
      [{ stat: 'cooldown', op: 'inc', value: -0.06 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.06 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.06 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.06 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.10 }],
    ],
    levelText: ['-6% cooldown', '-6% cooldown', '-6% cooldown', '-6% cooldown', '-10% cooldown'],
    triggers: [],
  },

  scholars_lens: {
    name: "Scholar's Lens",
    desc: 'See what the fight teaches. More experience from every kill.',
    rarity: 'uncommon',
    tags: ['utility'],
    maxLevel: 5,
    levels: [
      [{ stat: 'xpGain', op: 'inc', value: 0.10 }],
      [{ stat: 'xpGain', op: 'inc', value: 0.10 }, { stat: 'pickupRadius', op: 'inc', value: 0.15 }],
      [{ stat: 'xpGain', op: 'inc', value: 0.10 }],
      [{ stat: 'xpGain', op: 'inc', value: 0.10 }, { stat: 'pickupRadius', op: 'inc', value: 0.15 }],
      [{ stat: 'xpGain', op: 'inc', value: 0.15 }],
    ],
    levelText: ['+10% XP', '+10% XP, +15% pickup range', '+10% XP', '+10% XP, +15% pickup range', '+15% XP'],
    triggers: [],
  },

  wind_sigil: {
    name: 'Wind Sigil',
    desc: 'A rune that carries shots farther. Only affects projectile weapons.',
    rarity: 'rare',
    tags: ['wind', 'offense'],
    maxLevel: 5,
    levels: [
      [{ stat: 'projSpeed', op: 'inc', value: 0.12, tags: ['projectile'] }],
      [{ stat: 'pierce', op: 'flat', value: 1, tags: ['projectile'] }],
      [{ stat: 'projSpeed', op: 'inc', value: 0.12, tags: ['projectile'] }],
      [{ stat: 'projectiles', op: 'flat', value: 1, tags: ['projectile'] }],
      [{ stat: 'pierce', op: 'flat', value: 1, tags: ['projectile'] }, { stat: 'projSpeed', op: 'inc', value: 0.15, tags: ['projectile'] }],
    ],
    levelText: ['+12% projectile speed', '+1 pierce', '+12% projectile speed', '+1 projectile', '+1 pierce, +15% projectile speed'],
    triggers: [],
  },
};
