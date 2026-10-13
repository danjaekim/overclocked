// Weapon definitions (docs/architecture.md §5.1). Data only.
//   base    behavior params at level 1; combined with stats by game/weapons.js#param
//   levels  modifiers gained at levels 2..maxLevel (index 0 = level 2); length === maxLevel - 1
// Level modifiers are auto-tagged `weapon:<instanceId>` when applied.

export const WEAPONS = {
  ember_bow: {
    name: 'Ember Bow',
    desc: 'Fires burning arrows at the nearest enemy.',
    class: 'archer',
    glyph: 'B',
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
    levelText: ['+20% damage', '+1 arrow', '+1 pierce', '-15% cooldown; 15% of kills explode', '+1 arrow', '+30% damage', '25% more damage'],   // lv5 also: 15% chance to explode on kill
    triggers: [
      { on: 'kill', chance: 0.15, effect: 'explode', params: { radius: 55, damageFrac: 0.5 }, minLevel: 5 },
    ],
    evolvesInto: null,     // storm_volley arrives with evolutions (M7)
  },

  forge_hammer: {
    name: 'Forge Hammer',
    desc: 'Sweeps a heavy blow at the nearest enemy. Hits everything in the arc.',
    class: 'smith',
    glyph: 'H',
    rarity: 'common',
    tags: ['melee', 'arc', 'physical'],
    behavior: 'arc',
    base: { damage: 24, cooldown: 1.0, count: 1, range: 82, arcWidth: 1.9 },
    maxLevel: 8,
    levels: [
      [{ stat: 'damage', op: 'inc', value: 0.25 }],
      [{ stat: 'area', op: 'inc', value: 0.2 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.15 }],
      [{ stat: 'projectiles', op: 'flat', value: 1 }],
      [{ stat: 'damage', op: 'inc', value: 0.3 }],
      [{ stat: 'area', op: 'inc', value: 0.25 }],
      [{ stat: 'damage', op: 'more', value: 0.3 }],
    ],
    levelText: ['+25% damage', '+20% area; a shield every 12s', '-15% cooldown', 'swings again behind you', '+30% damage', '+25% area', '30% more damage'],
    triggers: [
      { on: 'interval', every: 12, effect: 'shield', params: { amount: 20 }, minLevel: 3 },   // lv3+: forge aegis
    ],
    evolvesInto: null,
  },

  spirit_blades: {
    name: 'Spirit Blades',
    desc: 'Blades of light circle you, cutting anything that gets close.',
    class: null,
    glyph: 'S',
    rarity: 'uncommon',
    tags: ['orbit', 'magic', 'light'],
    behavior: 'orbit',
    base: { damage: 9, cooldown: 1, tickEvery: 0.4, count: 2, range: 74, radius: 11, speed: 3.2 },
    maxLevel: 8,
    levels: [
      [{ stat: 'damage', op: 'inc', value: 0.25 }],
      [{ stat: 'projectiles', op: 'flat', value: 1 }],
      [{ stat: 'area', op: 'inc', value: 0.2 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.2 }],
      [{ stat: 'projectiles', op: 'flat', value: 1 }],
      [{ stat: 'damage', op: 'inc', value: 0.35 }],
      [{ stat: 'damage', op: 'more', value: 0.3 }],
    ],
    levelText: ['+25% damage', '+1 blade', '+20% area', 'hits 20% faster', '+1 blade', '+35% damage', '30% more damage'],
    triggers: [],
    evolvesInto: null,
  },

  cinder_ward: {
    name: 'Cinder Ward',
    desc: 'A ring of embers burns everything around you.',
    class: null,
    glyph: 'C',
    rarity: 'uncommon',
    tags: ['aura', 'fire', 'magic'],
    behavior: 'aura',
    base: { damage: 7, cooldown: 0.6, range: 80 },
    maxLevel: 8,
    levels: [
      [{ stat: 'damage', op: 'inc', value: 0.3 }],
      [{ stat: 'area', op: 'inc', value: 0.2 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.2 }],
      [{ stat: 'damage', op: 'inc', value: 0.35 }],
      [{ stat: 'area', op: 'inc', value: 0.25 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.2 }],
      [{ stat: 'damage', op: 'more', value: 0.4 }],
    ],
    levelText: ['+30% damage', '+20% area', 'burns 20% faster', '+35% damage', '+25% area', 'burns 20% faster', '40% more damage'],
    triggers: [],
    evolvesInto: null,
  },

  storm_javelin: {
    name: 'Storm Javelin',
    desc: 'Hurls a heavy javelin that pierces through a line of enemies.',
    class: null,
    glyph: 'J',
    rarity: 'uncommon',
    tags: ['projectile', 'ranged', 'lightning'],
    behavior: 'projectile',
    base: { damage: 22, cooldown: 1.7, speed: 440, count: 1, pierce: 3, spread: 0.2, ttl: 1.3, radius: 7, range: 420 },
    maxLevel: 8,
    levels: [
      [{ stat: 'damage', op: 'inc', value: 0.25 }],
      [{ stat: 'pierce', op: 'flat', value: 2 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.15 }],
      [{ stat: 'projectiles', op: 'flat', value: 1 }],
      [{ stat: 'damage', op: 'inc', value: 0.3 }],
      [{ stat: 'pierce', op: 'flat', value: 3 }],
      [{ stat: 'damage', op: 'more', value: 0.3 }],
    ],
    levelText: ['+25% damage', '+2 pierce', '-15% cooldown', '+1 javelin', '+30% damage', '+3 pierce', '30% more damage'],
    triggers: [],
    evolvesInto: null,
  },
};
