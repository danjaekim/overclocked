// Enemy definitions. Data only. `xp` and `ore` are used from M4/M6.
// ai: 'chase' = walk straight at the player; 'boss_charge' = chase, then telegraph and dash.
// boss: true marks the single big enemy tracked by run.boss (HUD bar, drops, titles).

export const ENEMIES = {
  goblin: {
    name: 'Goblin',
    hp: 10, speed: 60, damage: 5, radius: 10,
    xp: 1,
    ore: { chance: 0.04, type: 'iron' },
    ai: 'chase',
    color: '#6aa84f',
  },
  brute: {
    name: 'Brute',
    hp: 80, speed: 50, damage: 12, radius: 18,
    xp: 5,
    ore: { chance: 0.3, type: 'iron' },
    ai: 'chase',
    color: '#a64d79',
  },
  warlord: {
    name: 'Warlord',
    hp: 1800, speed: 52, damage: 25, radius: 34,
    xp: 100,
    ore: { chance: 1, type: 'starsteel', count: 2 },
    ai: 'boss_charge',
    boss: true,
    charge: { every: 5, windup: 0.9, speed: 340, time: 0.7 },
    color: '#c0392b',
  },
};

// Largest enemy radius; collision queries use this so no candidate is missed.
export const MAX_ENEMY_RADIUS = Math.max(...Object.values(ENEMIES).map((e) => e.radius));
