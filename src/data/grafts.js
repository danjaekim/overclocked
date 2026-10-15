// Grafts (docs/design-m26-m28.md §4): at the forge, one evolved weapon (the donor) is consumed into
// another (the host). The host keeps its behaviour, level, enhance and affixes and gains the donor's
// element tags plus a graft effect. Named pairs are "masterworks" with their own effect (twelve from
// M27, four more from M34); every other pair gets a generic PAYLOAD (below): the first hit of every attack
// the host makes also fires an effect shaped like the donor's attack.
// Data only; rules in game/graft.js.
//
// A masterwork: { id, host, donor, name, desc, mods, triggers, hooks }
//   mods      stat modifiers applied to the host (scoped to its instance tag)
//   triggers  extra triggers (data/weapons.js shape; effects in effects/index.js)
//   hooks     behaviour switches read by the host's behaviour or by projectile movement:
//             minionAura { radius, tick, damageFrac, burn, color }  each summon minion burns what is near it
//             minionPulse { every, range, speed, damageFrac, heal, color }  each minion sends out blessing rings of light
//             launch { every, dist, speed }                         orbit blades shoot out and come back
//             bend                                                  the host's projectiles curve toward vortices
//             burnVortex { patchTtl }                               vortices burn what they pull and collapse into fire
//             crack { every, radius, ttl, tick, damageFrac }        shockwaves leave burning, shocking cracks
//             wrath { stay, linkFrac }                              pillars linger and are joined by lightning
//             endBurst { count, speed, ttl, pierce, damageFrac }    a projectile that runs out bursts into a ring of shards
//             familiars { count, every, damageFrac, targets, range } the host gains hounds that cast its attack
//             aurora { every, rings, gap, range, speed, damageFrac, heal } trail patches bless; every nth is a ring beacon
//             millstone { radius, damageFrac, stun }               a parked boomerang ends in a slam on its spot
//             bounceRod { radius, ttl, every, zaps, frac, max, link } each boomerang bounce plants a rod
//             rodFork { gens, falloff, jump, boost }               every rod zap forks on as a branching chain

export const GRAFT = {
  cost: 1,                        // starsteel
  payloadMinGap: 0.15,            // a grafted weapon fires its payload at most this often (s), so fast auras and orbits cannot spam it
};

// Generic graft payloads (docs/design-m30-m33.md §3). The donor's behavior picks one. `frac` is the
// share of the HOST's damage the payload deals (per shot, tick or target); `gap` overrides the
// minimum gap; `text` finishes the sentence "Every attack's first hit ...". Effects: effects/payloads.js.
export const PAYLOADS = {
  shrapnel:   { name: 'Shrapnel',   frac: 0.8, text: 'bursts into 3 small shots' },
  cleave:     { name: 'Cleaving',   frac: 1.0,  text: 'cuts a half-circle around the target' },
  spin:       { name: 'Whirling Blades', frac: 0.3, text: 'sets 3 blades spinning around the target for 1.2 s' },
  imprint:    { name: 'Imprint',    frac: 0.3,  text: 'leaves a ring on the ground for 2 s' },
  arc:        { name: 'Arcing',     frac: 1.6,  text: 'jumps to the nearest other enemy' },
  arc2:       { name: 'Arcing',     frac: 1.2, text: 'jumps twice to the nearest other enemies' },
  burst:      { name: 'Shards',     frac: 0.7,  text: 'bursts into 6 shards' },
  blast:      { name: 'Blasts',     frac: 1.0,  text: 'is followed by a blast' },
  pounce:     { name: 'Hounds',     frac: 1.2,  text: 'is pounced on by a spirit hound' },
  smite:      { name: 'Judgement',  frac: 1.5,  text: 'is struck by a pillar of light', gap: 0.6 },
  saw:        { name: 'Saws',       frac: 0.8,  text: 'throws a disc through the target both ways' },
  frost_step: { name: 'Frost',      frac: 0.3, text: 'leaves a chilling patch for 1.5 s' },
  ripple:     { name: 'Ripples',    frac: 1.0,  text: 'sends out a small expanding ring' },
  quake:      { name: 'Quakes',     frac: 1.2,  text: 'cracks the ground around the target' },
  spark:      { name: 'Sparks',     frac: 0.5,  text: 'plants a small rod that zaps nearby enemies for 1.2 s' },
};

// Donor behavior -> payload id. Every behavior in behaviors/index.js must have an entry (validate.js).
export const SHAPE_PAYLOAD = {
  projectile: 'shrapnel', arc: 'cleave', orbit: 'spin', aura: 'imprint', bolt: 'arc', nova: 'burst', mortar: 'blast',
  summon: 'pounce', judge: 'smite', boomerang: 'saw', trail: 'frost_step', pulse: 'ripple', slam: 'quake',
  chain: 'arc2', rod: 'spark',
};

// The payload a donor weapon def gives (a spinning aura, Whirlwind Cleaver, counts as an arc).
export function payloadFor(def) {
  if (def.behavior === 'aura' && def.base.spin) return 'cleave';
  return SHAPE_PAYLOAD[def.behavior] || 'shrapnel';
}

// The sentence for a payload: "Every attack's first hit <text> (<frac>% damage)."
export function payloadText(id) {
  const p = PAYLOADS[id];
  return `Every attack's first hit ${p.text} (${Math.round(p.frac * 100)}% of its damage).`;
}

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
    desc: 'Slams freeze everything in the crater. A slam that hits an already frozen enemy shatters it into ice shards.',
    mods: [{ stat: 'chillChance', op: 'flat', value: 1 }, { stat: 'chillStacks', op: 'flat', value: 3 }, { stat: 'statusDuration', op: 'inc', value: 0.5 }],   // a freeze lasts long enough for the next slam
    triggers: [{ on: 'hit', effect: 'shatter', params: { radius: 70, damageFrac: 1.0 } }],
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
    hooks: { minionAura: { radius: 46, tick: 0.4, damageFrac: 0.6, burn: true, color: '#ff7a3c' } },
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
    desc: 'The colossus carries the halo: it sends out rings of light that bless and burn everything they pass and mend you a little for each. Its kills heal you.',
    mods: [{ stat: 'lifesteal', op: 'flat', value: 0.015 }, { stat: 'burnChance', op: 'flat', value: 0.3 }],
    triggers: [{ on: 'kill', effect: 'heal', params: { amount: 2 } }],
    hooks: { minionPulse: { every: 0.9, range: 130, speed: 300, damageFrac: 0.9, heal: 0.3, color: '#ffe9a0' } },
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
    triggers: [{ on: 'attack', effect: 'fling', params: { count: 4, speed: 330, ttl: 0.9, pierce: 5, radius: 10, twist: 0.7, damageFrac: 1.0 } }],
    hooks: {},
  },
  {
    id: 'comet', host: 'sunpiercer', donor: 'glacial_bloom', name: 'Comet',
    desc: 'The arrow chills everything it pierces and bursts into a ring of ice shards at the last enemy it struck. Frozen enemies along its line shatter.',
    mods: [{ stat: 'chillChance', op: 'flat', value: 1 }, { stat: 'chillStacks', op: 'flat', value: 2 }],
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
    desc: 'Three spirit hounds hover beside you. Every 1.2 s each casts a prismatic bolt that strikes two enemies.',
    mods: [],
    triggers: [],
    hooks: { familiars: { count: 3, every: 1.2, damageFrac: 1.0, targets: 2, range: 260 } },
  },
];

MASTERWORKS.push(
  // ---- M34: masterworks for the M31-M33 shapes (docs/design-m30-m33.md §6.2b) ----
  {
    id: 'aurora_wake', host: 'vapor_wheel', donor: 'radiant_halo', name: 'Aurora Wake',
    desc: 'Your wake blesses everything that walks through it, and every 3rd patch is a beacon that sends out two rings of light.',
    mods: [{ stat: 'lifesteal', op: 'flat', value: 0.01 }],
    triggers: [],
    hooks: { aurora: { every: 3, rings: 2, gap: 0.45, range: 120, speed: 260, damageFrac: 3, heal: 0.3 } },
  },
  {
    id: 'millstone', host: 'gyre', donor: 'colossus_maul', name: 'Millstone',
    desc: 'When the parked saw stops spinning, the maul comes down on the crowd it gathered: a crater that crushes and staggers.',
    mods: [],
    triggers: [],
    hooks: { millstone: { radius: 80, damageFrac: 2.5, stun: 0.6 } },
  },
  {
    id: 'storm_saw', host: 'ricochet_saw', donor: 'thunder_lance', name: 'Storm Saw',
    desc: 'Every bounce plants a short lightning rod. Rods near each other link, so the saw\'s path becomes a lightning fence.',
    mods: [{ stat: 'shockChance', op: 'flat', value: 0.4 }],
    triggers: [],
    hooks: { bounceRod: { radius: 85, ttl: 2, every: 0.5, zaps: 2, frac: 0.5, max: 7, link: 170 } },
  },
  {
    id: 'stormspire', host: 'thunder_lance', donor: 'tempest', name: 'Stormspire',
    desc: 'Every zap from a planted rod forks on like Tempest, branching through the crowd around the rod.',
    mods: [{ stat: 'shockChance', op: 'flat', value: 0.3 }],
    triggers: [],
    hooks: { rodFork: { gens: 2, falloff: 0.85, jump: 120, boost: 1.4 } },
  },
);

export const ELEMENT_ORDER = ['fire', 'frost', 'storm'];
export const ELEMENT_NAMES = { fire: 'Fire', frost: 'Frost', storm: 'Storm' };
