// Playable classes (docs/architecture.md §5.7). Archer and Smith so far; Berserker, Mage,
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
    unlocked: true,
  },
};

export const DEFAULT_CLASS = 'archer';
