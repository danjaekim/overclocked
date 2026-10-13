// Titles (docs/architecture.md §5.4): run-long modifiers, not levelled. Granted by a milestone
// or offered (rarely) on level-up. Mods may use `when` conditions from stats/conditions.js.
//   grant: { type: 'milestone', event: 'kills' | 'enhance' | 'boss', count }
//        | { type: 'offer', rarity }

export const TITLES = {
  unyielding: {
    name: 'Unyielding',
    desc: '40% more damage while below half HP',
    rarity: 'epic',
    grant: { type: 'offer' },
    mods: [{ stat: 'damage', op: 'more', value: 0.4, when: 'hpBelow50' }],
  },
  slayer: {
    name: 'Slayer',
    desc: '15% more damage (1000 kills)',
    rarity: 'epic',
    grant: { type: 'milestone', event: 'kills', count: 1000 },
    mods: [{ stat: 'damage', op: 'more', value: 0.15 }],
  },
  forgemaster: {
    name: 'Forgemaster',
    desc: '+20% area, +50% ore (an item enhanced to +5)',
    rarity: 'epic',
    grant: { type: 'milestone', event: 'enhance', count: 5 },
    mods: [{ stat: 'area', op: 'inc', value: 0.2 }, { stat: 'oreGain', op: 'inc', value: 0.5 }],
  },
  warbreaker: {
    name: 'Warbreaker',
    desc: '25% more damage, +25% pickup range (the Warlord slain)',
    rarity: 'epic',
    grant: { type: 'milestone', event: 'boss', count: 1 },
    mods: [{ stat: 'damage', op: 'more', value: 0.25 }, { stat: 'pickupRadius', op: 'inc', value: 0.25 }],
  },
};
