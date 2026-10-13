// Weapon definitions (docs/architecture.md §5.1). Data only.
//   base    behavior params at level 1; combined with stats by game/weapons.js#param
//   levels  modifiers gained at levels 2..maxLevel (index 0 = level 2); length === maxLevel - 1
// Level modifiers are auto-tagged `weapon:<instanceId>` when applied.
//   baseMods  optional modifiers applied when the weapon is gained (its elemental identity),
//             source `weapon:<instanceId>:base:`; re-applied when the weapon evolves.
// Element tags: fire, frost, storm. `close` marks melee/aura weapons for perks (docs/design-m10-m13.md).

export const WEAPONS = {
  ember_bow: {
    name: 'Ember Bow',
    desc: 'Fires burning arrows at the nearest enemy.',
    class: 'archer',
    glyph: 'B',
    rarity: 'common',
    tags: ['projectile', 'ranged', 'fire'],
    baseMods: [{ stat: 'burnChance', op: 'flat', value: 0.35 }],
    forge: {
      tempers: {
        5: [
          { id: 'longbow', name: 'Longbow', desc: 'One heavy, piercing arrow: -1 arrow, +2 pierce, +40% speed, 60% more damage', mods: [{ stat: 'projectiles', op: 'flat', value: -1 }, { stat: 'pierce', op: 'flat', value: 2 }, { stat: 'projSpeed', op: 'inc', value: 0.4 }, { stat: 'damage', op: 'more', value: 0.6 }] },
          { id: 'shortbow', name: 'Shortbow', desc: 'A hail of arrows: +1 arrow, -25% cooldown', mods: [{ stat: 'projectiles', op: 'flat', value: 1 }, { stat: 'cooldown', op: 'inc', value: -0.25 }] },
        ],
        10: [
          { id: 'flamebow', name: 'Flamebow', desc: 'Becomes a fire weapon: +50% burn chance, burns +30% harder', mods: [{ stat: 'burnChance', op: 'flat', value: 0.5 }, { stat: 'burnPower', op: 'flat', value: 0.3 }], addTags: ['fire'] },
          { id: 'stormbow', name: 'Stormbow', desc: 'Becomes a storm weapon: +40% shock chance, +1 chain', mods: [{ stat: 'shockChance', op: 'flat', value: 0.4 }, { stat: 'chains', op: 'flat', value: 1 }], addTags: ['storm'] },
        ],
      },
    },
    behavior: 'projectile',
    base: {
      damage: 14, cooldown: 0.9, speed: 520, count: 1, pierce: 1,
      spread: 0.02, gap: 7, ttl: 1.2, radius: 5, range: 380,
    },
    maxLevel: 8,
    levels: [
      [{ stat: 'damage', op: 'inc', value: 0.2 }],
      [{ stat: 'projectiles', op: 'flat', value: 1 }],
      [{ stat: 'pierce', op: 'flat', value: 1 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.15 }],
      [{ stat: 'projectiles', op: 'flat', value: 1 }],
      [{ stat: 'damage', op: 'inc', value: 0.3 }],
      [{ stat: 'damage', op: 'more', value: 0.1 }],
    ],
    levelText: ['+20% damage', '+1 arrow', '+1 pierce', '-15% cooldown; 15% of kills explode', '+1 arrow', '+30% damage', '10% more damage'],   // lv5 also: 15% chance to explode on kill
    triggers: [
      { on: 'kill', chance: 0.15, effect: 'explode', params: { radius: 55, damageFrac: 0.5 }, minLevel: 5 },
    ],
    evolvesInto: 'storm_volley',
  },

  forge_hammer: {
    name: 'Forge Hammer',
    desc: 'Sweeps a heavy blow at the nearest enemy. Hits everything in the arc.',
    class: 'smith',
    glyph: 'H',
    rarity: 'common',
    tags: ['melee', 'arc', 'physical', 'close'],
    behavior: 'arc',
    base: { damage: 24, cooldown: 1.0, count: 1, range: 82, arcWidth: 1.9 },
    forge: {
      tempers: {
        5: [
          { id: 'maul_grip', name: 'Maul grip', desc: '40% more damage, +15% cooldown', mods: [{ stat: 'damage', op: 'more', value: 0.4 }, { stat: 'cooldown', op: 'inc', value: 0.15 }] },
          { id: 'twin_hammers', name: 'Twin hammers', desc: 'Swings again behind you', mods: [{ stat: 'projectiles', op: 'flat', value: 1 }] },
        ],
        10: [
          { id: 'molten', name: 'Molten', desc: 'Becomes a fire weapon: +60% burn chance', mods: [{ stat: 'burnChance', op: 'flat', value: 0.6 }], addTags: ['fire'] },
          { id: 'quake', name: 'Quake', desc: '40% more area, +50% knockback', mods: [{ stat: 'area', op: 'more', value: 0.4 }, { stat: 'knockback', op: 'inc', value: 0.5 }] },
        ],
      },
    },
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
    evolvesInto: 'colossus_maul',
  },

  spirit_blades: {
    name: 'Spirit Blades',
    desc: 'Blades of light circle you, cutting anything that gets close.',
    class: null,
    glyph: 'S',
    rarity: 'uncommon',
    tags: ['orbit', 'magic', 'light', 'close'],
    behavior: 'orbit',
    base: { damage: 9, cooldown: 1, tickEvery: 0.4, count: 2, range: 46, radius: 12, speed: 3.2 },
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
    tags: ['aura', 'fire', 'magic', 'close'],
    baseMods: [{ stat: 'burnChance', op: 'flat', value: 0.25 }],
    behavior: 'aura',
    base: { damage: 6, cooldown: 0.6, range: 80 },
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
    tags: ['projectile', 'ranged', 'storm'],
    baseMods: [{ stat: 'shockChance', op: 'flat', value: 0.5 }],
    forge: {
      tempers: {
        5: [
          { id: 'harpoon', name: 'Harpoon', desc: '+3 pierce, 25% more damage', mods: [{ stat: 'pierce', op: 'flat', value: 3 }, { stat: 'damage', op: 'more', value: 0.25 }] },
          { id: 'bundle', name: 'Bundle', desc: '+2 javelins', mods: [{ stat: 'projectiles', op: 'flat', value: 2 }] },
        ],
        10: [
          { id: 'thunderhead', name: 'Thunderhead', desc: '+2 chains', mods: [{ stat: 'chains', op: 'flat', value: 2 }] },
          { id: 'ice_lance', name: 'Ice lance', desc: 'Becomes a frost weapon: +70% chill chance, +1 chill stack', mods: [{ stat: 'chillChance', op: 'flat', value: 0.7 }, { stat: 'chillStacks', op: 'flat', value: 1 }], addTags: ['frost'] },
        ],
      },
    },
    behavior: 'projectile',
    base: { damage: 22, cooldown: 1.7, speed: 440, count: 1, pierce: 3, spread: 0.02, gap: 9, ttl: 1.3, radius: 7, range: 420 },
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

  rime_shards: {
    name: 'Rime Shards',
    desc: 'Bursts of ice shards in every direction. Chills what they hit; two chills freeze.',
    class: null,
    glyph: 'R',
    rarity: 'uncommon',
    tags: ['projectile', 'ranged', 'frost'],
    baseMods: [{ stat: 'chillChance', op: 'flat', value: 1 }, { stat: 'chillStacks', op: 'flat', value: 1 }],
    behavior: 'nova',
    base: { damage: 8, cooldown: 1.4, speed: 300, count: 6, pierce: 0, ttl: 0.7, radius: 6, range: 220 },
    maxLevel: 8,
    levels: [
      [{ stat: 'damage', op: 'inc', value: 0.25 }],
      [{ stat: 'projectiles', op: 'flat', value: 2 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.15 }],
      [{ stat: 'pierce', op: 'flat', value: 1 }],
      [{ stat: 'projectiles', op: 'flat', value: 2 }],
      [{ stat: 'damage', op: 'inc', value: 0.35 }],
      [{ stat: 'damage', op: 'more', value: 0.3 }],
    ],
    levelText: ['+25% damage', '+2 shards', '-15% cooldown', '+1 pierce', '+2 shards', '+35% damage', '30% more damage'],
    triggers: [],
    evolvesInto: null,
  },

  rending_axe: {
    name: 'Rending Axe',
    desc: 'A wide, brutal swing at the nearest enemy. Hits everything in the arc.',
    class: 'berserker',
    glyph: 'X',
    rarity: 'common',
    tags: ['melee', 'arc', 'physical', 'close'],
    behavior: 'arc',
    base: { damage: 24, cooldown: 0.9, count: 1, range: 74, arcWidth: 2.3 },
    forge: {
      tempers: {
        5: [
          { id: 'cleaver', name: 'Cleaver', desc: '+0.5 crit multiplier', mods: [{ stat: 'critMult', op: 'flat', value: 0.5 }] },
          { id: 'whirl', name: 'Whirl', desc: 'Swings again behind you, +20% area', mods: [{ stat: 'projectiles', op: 'flat', value: 1 }, { stat: 'area', op: 'inc', value: 0.2 }] },
        ],
        10: [
          { id: 'bloodaxe', name: 'Bloodaxe', desc: '+2% lifesteal, crits execute under 10% HP', mods: [{ stat: 'lifesteal', op: 'flat', value: 0.02 }, { stat: 'executeBelow', op: 'flat', value: 0.1 }] },
          { id: 'frost_axe', name: 'Frostbite axe', desc: 'Becomes a frost weapon: +60% chill chance', mods: [{ stat: 'chillChance', op: 'flat', value: 0.6 }], addTags: ['frost'] },
        ],
      },
    },
    maxLevel: 8,
    levels: [
      [{ stat: 'damage', op: 'inc', value: 0.25 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.15 }],
      [{ stat: 'area', op: 'inc', value: 0.2 }],
      [{ stat: 'critChance', op: 'flat', value: 0.1 }],
      [{ stat: 'damage', op: 'inc', value: 0.3 }],
      [{ stat: 'projectiles', op: 'flat', value: 1 }],
      [{ stat: 'damage', op: 'more', value: 0.3 }],
    ],
    levelText: ['+25% damage', '-15% cooldown', '+20% area', '+10% crit chance', '+30% damage', 'swings again behind you', '30% more damage'],
    triggers: [],
    evolvesInto: null,
  },

  // ---- evolved weapons (pool: false; reached only through the forge's Combine, data/evolutions.js)

  storm_volley: {
    name: 'Storm Volley',
    desc: 'A fan of lightning-wreathed arrows that tears through the line.',
    class: null,
    pool: false,
    glyph: 'V',
    rarity: 'evolved',
    tags: ['projectile', 'ranged', 'fire', 'storm'],
    baseMods: [{ stat: 'burnChance', op: 'flat', value: 0.3 }, { stat: 'shockChance', op: 'flat', value: 0.3 }],
    behavior: 'projectile',
    base: { damage: 15, cooldown: 0.75, speed: 620, count: 4, pierce: 3, spread: 0.02, gap: 8, ttl: 1.3, radius: 6, range: 440 },
    maxLevel: 6,
    levels: [
      [{ stat: 'damage', op: 'inc', value: 0.25 }],
      [{ stat: 'projectiles', op: 'flat', value: 1 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.15 }],
      [{ stat: 'pierce', op: 'flat', value: 2 }],
      [{ stat: 'damage', op: 'more', value: 0.3 }],
    ],
    levelText: ['+25% damage', '+1 arrow', '-15% cooldown', '+2 pierce', '30% more damage'],
    triggers: [
      { on: 'kill', chance: 0.2, effect: 'explode', params: { radius: 60, damageFrac: 0.6 } },
    ],
    evolvesInto: null,
  },

  colossus_maul: {
    name: 'Colossus Maul',
    desc: 'A huge maul that crushes everything in a wide arc and shields you as you fight.',
    class: null,
    pool: false,
    glyph: 'M',
    rarity: 'evolved',
    tags: ['melee', 'arc', 'physical', 'close'],
    behavior: 'arc',
    base: { damage: 60, cooldown: 1.1, count: 1, range: 105, arcWidth: 2.4 },
    maxLevel: 6,
    levels: [
      [{ stat: 'damage', op: 'inc', value: 0.3 }],
      [{ stat: 'area', op: 'inc', value: 0.2 }],
      [{ stat: 'projectiles', op: 'flat', value: 1 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.15 }],
      [{ stat: 'damage', op: 'more', value: 0.35 }],
    ],
    levelText: ['+30% damage', '+20% area', 'swings again behind you', '-15% cooldown', '35% more damage'],
    triggers: [
      { on: 'interval', every: 8, effect: 'shield', params: { amount: 30 } },
    ],
    evolvesInto: null,
  },
};
