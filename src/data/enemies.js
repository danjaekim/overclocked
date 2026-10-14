// Enemy definitions. Data only. `xp` and `ore` are used from M4/M6.
// ai: 'chase' = walk straight at the player; 'ranged' = close to `ranged.range`, then shoot; 'boss_charge' = chase, then telegraph and dash.
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
  // Armoured goblin: every hit loses `armor` damage (never more than 75% of it), so many small hits
  // barely scratch it and heavy hits, burns and shocks do. Damage over time ignores armor.
  shieldbearer: {
    name: 'Shieldbearer',
    hp: 30, speed: 50, damage: 7, radius: 12,
    xp: 2,
    ore: { chance: 0.12, type: 'iron' },
    ai: 'chase',
    armor: 5,
    color: '#8fa3b8',
  },
  // Ranged goblin: walks into `range`, stops, flashes, then throws a slow shot at where you stand.
  slinger: {
    name: 'Slinger',
    hp: 14, speed: 46, damage: 4, radius: 10,
    xp: 2,
    ore: { chance: 0.08, type: 'iron' },
    ai: 'ranged',
    ranged: { range: 230, cooldown: 2.4, windup: 0.4, shotSpeed: 150, shotDamage: 7, shotTtl: 2.6, shotR: 5 },
    color: '#b06ad0',
  },
  // Bursts into three goblins when it dies, so a build that only kills one big thing at a time floods.
  splitter: {
    name: 'Splitter',
    hp: 40, speed: 55, damage: 6, radius: 15,
    xp: 4,
    ore: { chance: 0.1, type: 'iron' },
    ai: 'chase',
    splits: 3,
    color: '#d98cae',
  },
  // Wards everything near it (half damage) while it lives, so it has to be found and killed first.
  shaman: {
    name: 'Shaman',
    hp: 36, speed: 48, damage: 4, radius: 11,
    xp: 4,
    ore: { chance: 0.1, type: 'iron' },
    ai: 'chase',
    ward: { radius: 130 },
    color: '#5aa8b0',
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
