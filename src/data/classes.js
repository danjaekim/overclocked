// Playable classes (docs/architecture.md §5.7). Archer and Smith are open from the start;
// the Berserker unlocks by defeating the Warlord (`unlock`, handled in game.js + save). Mage,
// Summoner and Saint come after M8.

export const CLASSES = {
  archer: {
    name: 'Archer',
    blurb: 'Keeps its distance. Fast shots, high crit, fragile.',
    startWeapon: 'ember_bow',
    mods: [{ stat: 'critChance', op: 'flat', value: 0.05 }],
    unlocked: true,
  },
  smith: {
    name: 'Smith',
    blurb: 'Stands and fights. Heavy hammer sweeps, tough, hits knock enemies back.',
    startWeapon: 'forge_hammer',
    mods: [
      { stat: 'maxHp', op: 'flat', value: 40 },
      { stat: 'armor', op: 'flat', value: 1 },
      { stat: 'knockback', op: 'inc', value: 0.25 },
    ],
    forge: { costMult: 0.8 },        // Smiths enhance for 20% less ore
    unlocked: true,
  },
  berserker: {
    name: 'Berserker',
    blurb: 'Reckless. Heals as it hits and hits much harder when wounded.',
    startWeapon: 'rending_axe',
    mods: [
      { stat: 'lifesteal', op: 'flat', value: 0.03 },
      { stat: 'damage', op: 'more', value: 0.3, when: 'hpBelow50' },
      { stat: 'moveSpeed', op: 'inc', value: 0.1 },
    ],
    unlocked: false,
    unlock: { event: 'boss', hint: 'Defeat the Warlord' },
  },
};

export const DEFAULT_CLASS = 'archer';
