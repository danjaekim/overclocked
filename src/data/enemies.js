// Enemy definitions. Data only. `xp` and `ore` are used from M4/M6.
// ai: 'chase' = walk straight at the player; 'ranged' = close to `ranged.range`, then shoot; 'boss_charge' = chase, then telegraph and dash.
// boss: true marks the single big enemy tracked by run.boss (HUD bar, drops, titles).

export const ENEMIES = {
  goblin: {
    name: 'Street Drone',
    hp: 10, speed: 60, damage: 5, radius: 10,
    xp: 1,
    ore: { chance: 0.04, type: 'iron' },
    ai: 'chase',
    color: '#ff2e97',
  },
  brute: {
    name: 'Bruiser',
    hp: 80, speed: 50, damage: 12, radius: 18,
    xp: 5,
    ore: { chance: 0.3, type: 'iron' },
    ai: 'chase',
    color: '#ff8a1f',
  },
  // Armoured goblin: every hit loses `armor` damage (never more than 60% of it), so many small hits
  // barely scratch it and heavy hits, burns and shocks do. Damage over time ignores armor.
  shieldbearer: {
    name: 'Riot Unit',
    hp: 30, speed: 50, damage: 7, radius: 12,
    xp: 2,
    ore: { chance: 0.12, type: 'iron' },
    ai: 'chase',
    armor: 5,
    color: '#4f7bff',
  },
  // Ranged goblin: walks into `range`, stops, flashes, then throws a slow shot at where you stand.
  slinger: {
    name: 'Spitter',
    hp: 14, speed: 46, damage: 4, radius: 10,
    xp: 2,
    ore: { chance: 0.08, type: 'iron' },
    ai: 'ranged',
    ranged: { range: 230, cooldown: 2.4, windup: 0.4, shotSpeed: 150, shotDamage: 7, shotTtl: 2.6, shotR: 5 },
    color: '#b6ff3b',
  },
  // Bursts into three goblins when it dies, so a build that only kills one big thing at a time floods.
  splitter: {
    name: 'Swarm Pod',
    hp: 40, speed: 55, damage: 6, radius: 15,
    xp: 4,
    ore: { chance: 0.1, type: 'iron' },
    ai: 'chase',
    splits: 3,
    color: '#ff3b5c',
  },
  // Wards everything near it (half damage) while it lives, so it has to be found and killed first.
  shaman: {
    name: 'Hacker',
    hp: 36, speed: 48, damage: 4, radius: 11,
    xp: 4,
    ore: { chance: 0.1, type: 'iron' },
    ai: 'chase',
    ward: { radius: 130 },
    color: '#c86bff',
  },
  warlord: {
    name: 'Enforcer',
    hp: 1800, speed: 52, damage: 18, radius: 34,
    fight: 35, hpMaxMult: 10, rawShare: 0.3,              // boss hp = your recent raw dps (overkill included, so it follows the rig, not the crowd) x rawShare x `fight` seconds, between 1x and `hpMaxMult` x hp (run-events.js boss)          // 25 in Overforged; bots in a rig run died to it within 20-40 s at full hp (v0.5.5)
    xp: 100,
    ore: { chance: 1, type: 'starsteel', count: 2 },
    ai: 'boss_charge',
    boss: true,
    charge: { every: 5, windup: 0.9, speed: 340, time: 0.7, rageAt: 0.5, windupRage: 0.6 },
    color: '#ff2e97',
  },
  // Late heavy: slow, thick-skinned, and when it reaches you it stops and slams a marked circle around itself.
  crusher: {
    name: 'Wrecker',
    hp: 300, speed: 38, damage: 16, radius: 24,
    xp: 12,
    ore: { chance: 0.5, type: 'iron' },
    ai: 'slammer',
    armor: 6,
    slam: { every: 6, windup: 0.9, radius: 95, damage: 12 },
    color: '#ff8a1f',
  },
  // The late boss: stands off and calls down Meteor Fall (systems/boss-zones.js). Below `rageAt` of its hp it
  // casts faster and drops more circles.
  seer: {
    name: 'Oracle',
    hp: 3500, speed: 70, damage: 30, radius: 36,
    fight: 45, hpMaxMult: 40, rawShare: 0.2,
    xp: 200,
    ore: { chance: 1, type: 'starsteel', count: 3 },
    ai: 'boss_caster',
    boss: true,
    caster: { range: 300, every: 4.2, windup: 0.8, count: 4, countRage: 7, rageAt: 0.5, rageSpeed: 1.5, radius: 58, spread: 170, fuse: 1.15, stagger: 0.12, lead: 0.35, damage: 18 },
    color: '#c86bff',
  },
};

// A boss calls an escort at each of these hp fractions (once each): `count` from the wave mix plus `brutes` brutes.
export const ESCORT = { at: [0.66, 0.33], count: 20, brutes: 2 };

// Props: breakable things that live in the enemy pool, so every weapon, swing and blast hits them with
// no special cases, but that are not enemies: they never move or hurt you, weapons do not aim at them,
// and breaking one is not a kill (systems/crates.js decides what falls out). `ttl`: seconds before it fades.
export const PROPS = {
  crate: { name: 'Cargo Drop', hp: 15, speed: 0, damage: 0, radius: 14, xp: 0, ttl: 70, prop: true, color: '#ffd23f' },
};

// Largest enemy radius; collision queries use this so no candidate is missed.
export const MAX_ENEMY_RADIUS = Math.max(...Object.values(ENEMIES).map((e) => e.radius));
