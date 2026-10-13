// Weapon definitions (docs/architecture.md §5.1). Data only.
//   base    behavior params at level 1; combined with stats by game/weapons.js#param
//   levels  modifiers gained at levels 2..maxLevel (index 0 = level 2); length === maxLevel - 1
// Level modifiers are auto-tagged `weapon:<instanceId>` when applied.

export const WEAPONS = {
  ember_bow: {
    name: 'Ember Bow',
    desc: 'Fires burning arrows at the nearest enemy.',
    class: 'archer',
    rarity: 'common',
    tags: ['projectile', 'ranged', 'fire'],
    behavior: 'projectile',
    base: {
      damage: 12, cooldown: 1.1, speed: 520, count: 1, pierce: 0,
      spread: 0.15, ttl: 1.2, radius: 5, range: 380,
    },
    maxLevel: 8,
    levels: [
      [{ stat: 'damage', op: 'inc', value: 0.2 }],
      [{ stat: 'projectiles', op: 'flat', value: 1 }],
      [{ stat: 'pierce', op: 'flat', value: 1 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.15 }],
      [{ stat: 'projectiles', op: 'flat', value: 1 }],
      [{ stat: 'damage', op: 'inc', value: 0.3 }],
      [{ stat: 'damage', op: 'more', value: 0.25 }],
    ],
    levelText: ['+20% damage', '+1 arrow', '+1 pierce', '-15% cooldown', '+1 arrow', '+30% damage', '25% more damage'],
    triggers: [],
    evolvesInto: null,     // storm_volley arrives with evolutions (M7)
  },
};
