// Playable classes (docs/architecture.md §5.7). Archer and Smith are open from the start; the
// rest unlock by playing (`unlock`: { event, count?, hint }, checked by game/unlocks.js):
//   boss   defeat the Warlord        win    survive the whole run
//   kills  at least `count` kills in one run        level  reach level `count` in one run

export const CLASSES = {
  archer: {
    name: 'Archer',
    blurb: 'Keeps its distance. Fast on its feet, high crit, fragile.',
    startWeapon: 'ember_bow',
    mods: [{ stat: 'critChance', op: 'flat', value: 0.05 }, { stat: 'moveSpeed', op: 'inc', value: 0.1 }],
    unlocked: true,
  },
  smith: {
    name: 'Smith',
    blurb: 'Stands and fights. Heavy hammer sweeps, tough, hits knock enemies back.',
    startWeapon: 'forge_hammer',
    mods: [
      { stat: 'maxHp', op: 'flat', value: 30 },
      { stat: 'armor', op: 'flat', value: 1 },
      { stat: 'knockback', op: 'inc', value: 0.15 },
    ],
    forge: { costMult: 0.8 },        // Smiths enhance for 20% less ore
    unlocked: true,
  },
  berserker: {
    name: 'Berserker',
    blurb: 'Reckless. Heals as it hits and hits much harder when wounded.',
    startWeapon: 'rending_axe',
    mods: [
      { stat: 'lifesteal', op: 'flat', value: 0.015 },
      { stat: 'damage', op: 'more', value: 0.25, when: 'hpBelow50' },
      { stat: 'moveSpeed', op: 'inc', value: 0.1 },
    ],
    unlocked: false,
    unlock: { event: 'boss', hint: 'Defeat the Warlord' },
  },
  mage: {
    name: 'Mage',
    blurb: 'Bolts that never miss. Every hit has a small chance to burn, chill and shock, so any element build works.',
    startWeapon: 'arc_bolt',
    mods: [
      { stat: 'area', op: 'inc', value: 0.15 },
      { stat: 'burnChance', op: 'flat', value: 0.08 },
      { stat: 'chillChance', op: 'flat', value: 0.08 },
      { stat: 'shockChance', op: 'flat', value: 0.08 },
    ],
    unlocked: false,
    unlock: { event: 'win', hint: 'Survive the full ten minutes' },
  },
  summoner: {
    name: 'Summoner',
    blurb: 'Fights through spirit hounds that cannot be hurt. Frail on its own, deadly with a pack.',
    startWeapon: 'bone_call',
    mods: [
      { stat: 'maxHp', op: 'flat', value: -10 },
      { stat: 'damage', op: 'more', value: 0.15, tags: ['summon'] },
      { stat: 'projectiles', op: 'flat', value: 1, tags: ['summon'] },
    ],
    unlocked: false,
    unlock: { event: 'kills', count: 2000, hint: 'Defeat 2000 enemies in one run' },
  },
  saint: {
    name: 'Saint',
    blurb: 'Hard to kill. A holy ring heals with every foe it burns, and wounds mend over time.',
    startWeapon: 'halo',
    mods: [
      { stat: 'regen', op: 'flat', value: 0.4 },
      { stat: 'maxHp', op: 'flat', value: 30 },
    ],
    unlocked: false,
    unlock: { event: 'level', count: 18, hint: 'Reach level 18 in one run' },
  },
};

export const DEFAULT_CLASS = 'archer';
