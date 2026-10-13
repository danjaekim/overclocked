// Evolution recipes (docs/architecture.md §5.5). Executed by the forge's Combine action.
// `requires` entries (ALL must hold):
//   { weaponLevel: n }               the weapon is at least this level
//   { passive: id, minLevel: n }     the player owns that passive at this level or higher
//   { enhance: n }                   the weapon is enhanced to at least +n
//   { starsteel: n }                 starsteel in the stash; spent when combining
//   { title: id }                    the player holds that title
// Evolving keeps the instance (so enhance level and affixes carry over) and resets it to
// level 1 of the evolved weapon, which starts far stronger.

export const EVOLUTIONS = [
  {
    id: 'storm_volley',
    from: 'ember_bow',
    into: 'storm_volley',
    requires: [{ weaponLevel: 8 }, { passive: 'wind_sigil', minLevel: 1 }, { starsteel: 1 }],
  },
  {
    id: 'colossus_maul',
    from: 'forge_hammer',
    into: 'colossus_maul',
    requires: [{ weaponLevel: 8 }, { passive: 'tempered_core', minLevel: 2 }, { enhance: 3 }, { starsteel: 1 }],
  },
];
