// Evolution recipes (docs/architecture.md §5.5). Executed by the forge's Combine action.
// `requires` entries (ALL must hold):
//   { weaponLevel: n }               the weapon is at least this level
//   { passive: id, minLevel: n }     the player owns that passive at this level or higher
//   { enhance: n }                   the weapon is enhanced to at least +n
//   { starsteel: n }                 starsteel in the stash; spent when combining
//   { title: id }                    the player holds that title
//   { perk: id, minLevel: n }        the player owns that perk (technique) at this level or higher
// A recipe with `with: <weaponId>` is a COMBO: it needs one instance of `from` AND one of `with`
// (weaponLevel then applies to both). The `from` instance becomes `into` and keeps its enhance
// level and affixes; the `with` instance is consumed.
// Evolving keeps the instance (so enhance level and affixes carry over) and resets it to
// level 1 of the evolved weapon, which starts far stronger.

export const EVOLUTIONS = [
  {
    id: 'storm_volley',
    from: 'ember_bow',
    into: 'storm_volley',
    requires: [{ weaponLevel: 6 }, { passive: 'wind_sigil', minLevel: 1 }, { starsteel: 1 }],
  },
  {
    id: 'colossus_maul',
    from: 'forge_hammer',
    into: 'colossus_maul',
    requires: [{ weaponLevel: 6 }, { passive: 'tempered_core', minLevel: 2 }, { enhance: 3 }, { starsteel: 1 }],
  },
  // ---- every starting weapon and the other element weapons evolve through a status build ----
  { id: 'reaper_axe', from: 'rending_axe', into: 'reaper_axe',
    requires: [{ weaponLevel: 6 }, { perk: 'keen_eye', minLevel: 2 }, { starsteel: 1 }] },
  { id: 'seraph_blades', from: 'spirit_blades', into: 'seraph_blades',
    requires: [{ weaponLevel: 6 }, { perk: 'long_reach', minLevel: 2 }, { starsteel: 1 }] },
  { id: 'pyre_crown', from: 'cinder_ward', into: 'pyre_crown',
    requires: [{ weaponLevel: 6 }, { perk: 'fan_the_flames', minLevel: 2 }, { starsteel: 1 }] },
  { id: 'thunder_lance', from: 'storm_javelin', into: 'thunder_lance',
    requires: [{ weaponLevel: 6 }, { perk: 'arc_conductor', minLevel: 2 }, { starsteel: 1 }] },
  { id: 'glacial_bloom', from: 'rime_shards', into: 'glacial_bloom',
    requires: [{ weaponLevel: 6 }, { perk: 'deep_freeze', minLevel: 2 }, { starsteel: 1 }] },

  // ---- the three newer classes' starting weapons ----
  { id: 'prismatic_bolt', from: 'arc_bolt', into: 'prismatic_bolt',
    requires: [{ weaponLevel: 6 }, { passive: 'scholars_lens', minLevel: 2 }, { starsteel: 1 }] },
  { id: 'grave_legion', from: 'bone_call', into: 'grave_legion',
    requires: [{ weaponLevel: 6 }, { passive: 'fleet_greaves', minLevel: 2 }, { starsteel: 1 }] },
  { id: 'radiant_halo', from: 'halo', into: 'radiant_halo',
    requires: [{ weaponLevel: 6 }, { passive: 'tempered_core', minLevel: 2 }, { starsteel: 1 }] },

  // ---- branches (docs/design-m26-m28.md §3): a second evolution for each starter weapon. Combining
  // into one removes the other; the requirement differs so level-up picks steer toward a branch ----
  { id: 'sunpiercer', from: 'ember_bow', into: 'sunpiercer',
    requires: [{ weaponLevel: 6 }, { perk: 'keen_eye', minLevel: 2 }, { starsteel: 1 }] },
  { id: 'quakebreaker', from: 'forge_hammer', into: 'quakebreaker',
    requires: [{ weaponLevel: 6 }, { perk: 'long_reach', minLevel: 2 }, { starsteel: 1 }] },
  { id: 'whirlwind_cleaver', from: 'rending_axe', into: 'whirlwind_cleaver',
    requires: [{ weaponLevel: 6 }, { perk: 'bloodletting', minLevel: 2 }, { starsteel: 1 }] },
  { id: 'singularity', from: 'arc_bolt', into: 'singularity',
    requires: [{ weaponLevel: 6 }, { passive: 'quickening_gear', minLevel: 2 }, { starsteel: 1 }] },
  { id: 'bone_colossus', from: 'bone_call', into: 'bone_colossus',
    requires: [{ weaponLevel: 6 }, { passive: 'tempered_core', minLevel: 2 }, { starsteel: 1 }] },
  { id: 'judgement', from: 'halo', into: 'judgement',
    requires: [{ weaponLevel: 6 }, { passive: 'keen_whetstone', minLevel: 2 }, { starsteel: 1 }] },

  { id: 'tempest', from: 'static_rod', into: 'tempest',
    requires: [{ weaponLevel: 6 }, { perk: 'static_charge', minLevel: 2 }, { starsteel: 1 }] },
  { id: 'ricochet_saw', from: 'chakram', into: 'ricochet_saw',
    requires: [{ weaponLevel: 6 }, { perk: 'ricochet', minLevel: 2 }, { starsteel: 1 }] },
  { id: 'gyre', from: 'chakram', into: 'gyre',
    requires: [{ weaponLevel: 6 }, { passive: 'wind_sigil', minLevel: 2 }, { starsteel: 1 }] },

  // ---- combos: two element weapons become one that carries both ----
  { id: 'vapor_wheel', from: 'cinder_ward', with: 'rime_orbs', into: 'vapor_wheel',
    requires: [{ weaponLevel: 6 }, { starsteel: 1 }] },
  { id: 'stormshell_mortar', from: 'cinder_mortar', with: 'static_rod', into: 'stormshell_mortar',
    requires: [{ weaponLevel: 6 }, { starsteel: 1 }] },
  { id: 'stormfrost_lance', from: 'storm_javelin', with: 'rime_shards', into: 'stormfrost_lance',
    requires: [{ weaponLevel: 6 }, { starsteel: 1 }] },
];
