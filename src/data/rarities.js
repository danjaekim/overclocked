// Rarity ladder (docs/architecture.md §5.6). `weight` is the base chance of appearing in a
// level-up offer; `luckScale` is how much each point of the luck stat boosts it.
// weight 0 = never offered normally (evolved items come from the forge, M7).

export const RARITIES = {
  common:   { name: 'Common',   weight: 100, luckScale: 0,    color: '#9aa0b0' },
  uncommon: { name: 'Uncommon', weight: 60,  luckScale: 0.10, color: '#5bc07a' },
  rare:     { name: 'Rare',     weight: 30,  luckScale: 0.20, color: '#4f9bff' },
  epic:     { name: 'Epic',     weight: 12,  luckScale: 0.30, color: '#b56bff' },
  evolved:  { name: 'Evolved',  weight: 0,   luckScale: 0,    color: '#ff9a3c' },
};
