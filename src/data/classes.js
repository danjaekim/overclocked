// Playable classes (docs/architecture.md §5.7). Only the Archer exists until M5.

export const CLASSES = {
  archer: {
    name: 'Archer',
    startWeapon: 'ember_bow',
    mods: [{ stat: 'critChance', op: 'flat', value: 0.05 }],
    unlocked: true,
  },
};

export const DEFAULT_CLASS = 'archer';
