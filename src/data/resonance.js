// Resonance (docs/design-m10-m13.md §4.4): owning several weapons that share a tag grants a set
// bonus. Tier 1 needs 2 such weapons, tier 2 needs 3 (tier 2 adds to tier 1). Counted over weapon
// INSTANCE tags, so a forge infusion can bring a weapon into a set. Each modifier is scoped to the
// weapons carrying the tag, so a set only strengthens its own members.

export const RESONANCE = {
  fire: {
    name: 'Fire',
    tiers: [
      [{ stat: 'burnPower', op: 'flat', value: 0.25 }],
      [{ stat: 'vsBurning', op: 'more', value: 0.10 }],
    ],
    text: ['burns +25% harder', '+10% more damage to burning enemies'],
  },
  frost: {
    name: 'Frost',
    tiers: [
      [{ stat: 'chillStacks', op: 'flat', value: 1 }],
      [{ stat: 'statusDuration', op: 'inc', value: 0.25 }],
    ],
    text: ['+1 chill stack per hit', 'frost lasts 25% longer'],
  },
  storm: {
    name: 'Storm',
    tiers: [
      [{ stat: 'chains', op: 'flat', value: 1 }],
      [{ stat: 'chainDamage', op: 'flat', value: 0.15 }],
    ],
    text: ['+1 chain', 'chains deal +15% more'],
  },
  projectile: {
    name: 'Marksman',
    tiers: [
      [],
      [{ stat: 'pierce', op: 'flat', value: 1 }],
    ],
    text: ['', '+1 pierce'],
  },
  close: {
    name: 'Bruiser',
    tiers: [
      [],
      [{ stat: 'area', op: 'inc', value: 0.15 }],
    ],
    text: ['', '+15% area'],
  },
};
