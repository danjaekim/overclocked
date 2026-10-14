// Grafts (docs/design-m26-m28.md §4): at the forge, one evolved weapon (the donor) is consumed into
// another (the host). The host keeps its behaviour, level, enhance and affixes and gains the donor's
// element tags plus a graft effect. Twelve named pairs are "masterworks" with their own effect (all
// twelve are here); every other pair gets the generic echo.
// Data only; rules in game/graft.js.
//
// A masterwork: { id, host, donor, name, desc, mods, triggers, hooks }
//   mods      stat modifiers applied to the host (scoped to its instance tag)
//   triggers  extra triggers (data/weapons.js shape; effects in effects/index.js)
//   hooks     behaviour switches read by the host's behaviour or by projectile movement:
//             minionAura { radius, tick, damageFrac, burn, color }  each summon minion burns what is near it
//             launch { every, dist, speed }                         orbit blades shoot out and come back
//             bend                                                  the host's projectiles curve toward vortices
//             burnVortex { patchTtl }                               vortices burn what they pull and collapse into fire
//             crack { every, radius, ttl, tick, damageFrac }        shockwaves leave burning, shocking cracks
//             wrath { stay, linkFrac }                              pillars linger and are joined by lightning
//             endBurst { count, speed, ttl, pierce, damageFrac }    a projectile that runs out bursts into a ring of shards
//             familiars { count, every, damageFrac, range }         the host gains hounds that cast its attack

export const GRAFT = {
  cost: 1,                        // starsteel
  echoEvery: 3,                   // the generic graft casts the donor's attack on every 3rd attack...
  echoFrac: 0.5,                  // ...at this share of the donor's damage
};

export const MASTERWORKS = [
  {
    id: 'thunderscythe', host: 'reaper_axe', donor: 'stormshell_mortar', name: 'Thunderscythe',
    desc: 'Every sweep plants storm shells along the edge of the arc. They burst 0.4 s later, burning and shocking.',
    mods: [{ stat: 'shockChance', op: 'flat', value: 0.3 }],
    triggers: [{ on: 'attack', effect: 'shells', params: { perSwing: 3, dist: 0.85, spread: 1.1, tele: 0.4, radius: 46, damageFrac: 0.55 } }],
    hooks: {},
  },
  {
    id: 'glacier_maul', host: 'colossus_maul', donor: 'glacial_bloom', name: 'Glacier Maul',
    desc: 'Slams freeze everything in the arc. A slam that hits an already frozen enemy shatters it into ice shards.',
    mods: [{ stat: 'chillChance', op: 'flat', value: 1 }, { stat: 'chillStacks', op: 'flat', value: 3 }, { stat: 'statusDuration', op: 'inc', value: 0.5 }],   // a freeze lasts long enough for the next slam
    triggers: [{ on: 'hit', effect: 'shatter', params: { radius: 70, damageFrac: 0.6 } }],
    hooks: {},
  },
  {
    id: 'eventide_volley', host: 'storm_volley', donor: 'singularity', name: 'Eventide Volley',
    desc: 'Every 4th volley opens a vortex on its target, and your arrows bend toward vortices in flight.',
    mods: [],
    triggers: [{ on: 'attack', every: 4, effect: 'vortex', params: { radius: 95, ttl: 1.5, pull: 150, damageFrac: 3 } }],
    hooks: { bend: true },
  },
  {
    id: 'hellhounds', host: 'grave_legion', donor: 'pyre_crown', name: 'Hellhounds',
    desc: 'Every hound wears a small burning aura, so fire spreads wherever the pack runs.',
    mods: [{ stat: 'burnChance', op: 'flat', value: 0.3 }],
    triggers: [],
    hooks: { minionAura: { radius: 34, tick: 0.5, damageFrac: 0.4, burn: true, color: '#ff7a3c' } },
  },
  {
    id: 'spear_wheel', host: 'seraph_blades', donor: 'thunder_lance', name: 'Spear Wheel',
    desc: 'Every 3 s the blades shoot outward as piercing lances, then fly back into orbit.',
    mods: [{ stat: 'shockChance', op: 'flat', value: 0.4 }, { stat: 'chains', op: 'flat', value: 1 }],
    triggers: [],
    hooks: { launch: { every: 3, dist: 300, speed: 900 } },
  },
  {
    id: 'sanctum_titan', host: 'bone_colossus', donor: 'radiant_halo', name: 'Sanctum Titan',
    desc: 'The colossus carries the halo: anything near it burns, and its kills heal you.',
    mods: [{ stat: 'lifesteal', op: 'flat', value: 0.015 }],
    triggers: [{ on: 'kill', effect: 'heal', params: { amount: 2 } }],
    hooks: { minionAura: { radius: 105, tick: 0.45, damageFrac: 0.5, burn: true, color: '#ffe9a0' } },
  },
  {
    id: 'black_sun', host: 'singularity', donor: 'pyre_crown', name: 'Black Sun',
    desc: 'The vortex is a burning star. Everything it pulls in catches fire, and the collapse is a fire explosion that leaves burning ground.',
    mods: [{ stat: 'burnPower', op: 'flat', value: 0.3 }],
    triggers: [],
    hooks: { burnVortex: { patchTtl: 3.5 } },
  },
  {
    id: 'bladestorm', host: 'whirlwind_cleaver', donor: 'seraph_blades', name: 'Bladestorm',
    desc: 'The spin flings blades outward in a turning pattern. They cut everything on the way out.',
    mods: [],
    triggers: [{ on: 'attack', every: 2, effect: 'fling', params: { count: 3, speed: 330, ttl: 0.9, pierce: 4, radius: 10, twist: 0.7, damageFrac: 0.7 } }],
    hooks: {},
  },
  {
    id: 'comet', host: 'sunpiercer', donor: 'glacial_bloom', name: 'Comet',
    desc: 'The arrow chills what it pierces and bursts into a ring of ice shards where it ends. Frozen enemies along its line shatter.',
    mods: [{ stat: 'chillChance', op: 'flat', value: 0.5 }, { stat: 'chillStacks', op: 'flat', value: 1 }],
    triggers: [{ on: 'hit', effect: 'shatter', params: { radius: 55, damageFrac: 0.4 } }],
    hooks: { endBurst: { count: 10, speed: 380, ttl: 0.45, pierce: 2, damageFrac: 0.5 } },
  },
  {
    id: 'fault_line', host: 'quakebreaker', donor: 'stormshell_mortar', name: 'Fault Line',
    desc: 'Shockwaves leave a burning, shocking crack in the ground for 3 s. The horde walks into it.',
    mods: [{ stat: 'shockChance', op: 'flat', value: 0.2 }],
    triggers: [],
    hooks: { crack: { every: 42, radius: 30, ttl: 3, tick: 0.5, damageFrac: 0.25 } },
  },
  {
    id: 'wrath', host: 'judgement', donor: 'thunder_lance', name: 'Wrath',
    desc: 'Pillars stay for 1.5 s more, and lightning runs between every live pillar. Anything on a link is shocked.',
    mods: [{ stat: 'shockChance', op: 'flat', value: 0.3 }, { stat: 'chains', op: 'flat', value: 1 }],
    triggers: [],
    hooks: { wrath: { stay: 1.5, linkFrac: 0.25 } },
  },
  {
    id: 'familiars', host: 'prismatic_bolt', donor: 'grave_legion', name: 'Familiars',
    desc: 'Three spirit hounds hover beside you. Each casts a small prismatic bolt every 2 s.',
    mods: [],
    triggers: [],
    hooks: { familiars: { count: 3, every: 2, damageFrac: 0.6, range: 260 } },
  },
];

export const ELEMENT_ORDER = ['fire', 'frost', 'storm'];
export const ELEMENT_NAMES = { fire: 'Fire', frost: 'Frost', storm: 'Storm' };
