// Enemy definitions. Data only. `xp` and `ore` are used from M4/M6.
// ai: 'chase' = walk straight at the player (boss AIs arrive with M7).

export const ENEMIES = {
  goblin: {
    name: 'Goblin',
    hp: 10, speed: 70, damage: 5, radius: 10,
    xp: 1,
    ore: { chance: 0.02, type: 'iron' },
    ai: 'chase',
    color: '#6aa84f',
  },
  brute: {
    name: 'Brute',
    hp: 80, speed: 50, damage: 12, radius: 18,
    xp: 5,
    ore: { chance: 0.15, type: 'iron' },
    ai: 'chase',
    color: '#a64d79',
  },
};

// Largest enemy radius; collision queries use this so no candidate is missed.
export const MAX_ENEMY_RADIUS = Math.max(...Object.values(ENEMIES).map((e) => e.radius));
