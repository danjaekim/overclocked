// Build recipes: sets of weapons and techniques that work together. They feed the compendium's
// Builds tab and the bench (tools/bench.mjs --builds, and --builds --late for the finished builds), so the
// guide and the numbers use one list.
//   cls      the class that suits it best (a build only uses weapons that class can actually be offered)
//   weapons  the base weapons you pick up, perks  the techniques (a perk must be offered after the weapons: see tests)
//   passives the passives the evolutions need
//   end      the finished build: `weapons` after evolving, `fuse` the masterwork pair [host, donor] if it has one
//   idea     what the build does, in a line   tips  what to take, reroll for, and forge toward
//   bench    include in the bench table
// Chosen from a late-game bench of every candidate (docs/architecture.md M44p): the ones that cleared crowds and
// bosses clearly slower than the rest were left out. Classes with fewer than four builds have fewer strong
// partners today; see the notes in docs/roadmap.md.

export const BUILDS = [
  // ---- Archer
  { id: 'wildfire', name: 'Wildfire', cls: 'archer', weapons: ['ember_bow', 'cinder_ward'], perks: ['kindling', 'fan_the_flames', 'wildfire', 'keen_eye', 'volley'], passives: [],
    end: { weapons: ['sunpiercer', 'pyre_crown'] },
    idea: 'Everything burns, and every burning kill sets the next group alight.',
    tips: 'Take Kindling early, then Fan the Flames. Wildfire only works on burning enemies, so fire weapons matter more than damage. Keen Eye 2 turns the bow into Sunpiercer and Fan the Flames 2 turns the ward into Pyre Crown.', bench: true },
  { id: 'comet', name: 'Comet', cls: 'archer', weapons: ['ember_bow', 'rime_shards'], perks: ['keen_eye', 'frostbite', 'deep_freeze', 'shatter'], passives: [],
    end: { weapons: ['sunpiercer', 'glacial_bloom'], fuse: ['sunpiercer', 'glacial_bloom'] },
    idea: 'One piercing arrow chills the whole line, bursts into ice, and shatters whatever it froze.',
    tips: 'Keen Eye 2 evolves the bow into Sunpiercer and Deep Freeze 2 evolves the shards into Glacial Bloom. Fuse them for the Comet masterwork. Shatter pays off every time a frozen enemy dies.', bench: true },
  { id: 'overload', name: 'Overload', cls: 'archer', weapons: ['ember_bow', 'storm_javelin', 'cinder_ward'], perks: ['kindling', 'fan_the_flames', 'static_charge', 'arc_conductor', 'overload'], passives: ['wind_sigil'],
    end: { weapons: ['storm_volley', 'thunder_lance', 'pyre_crown'] },
    idea: 'Lightning chains that land on burning enemies explode and ignite the crowd.',
    tips: 'Needs both fire and storm. Keep enemies burning first, then add chains. Wind Sigil turns the bow into Storm Volley, Arc Conductor 2 the javelin into Thunder Lance. Searing and Conductive are the affixes to look for.', bench: true },
  { id: 'superconductor', name: 'Superconductor', cls: 'archer', weapons: ['ember_bow', 'rime_shards', 'storm_javelin'], perks: ['frostbite', 'static_charge', 'superconduct', 'keen_eye', 'volley'], passives: [],
    end: { weapons: ['sunpiercer', 'stormfrost_lance'] },
    idea: 'Chill and shock the same enemy and it always crits.',
    tips: 'Needs a frost source and a storm source before Superconduct is offered. Combine the javelin with the shards into Stormfrost Lance, which chills and shocks in one hit. Keen Eye turns the bow into Sunpiercer.', bench: true },
  { id: 'stormfall', name: 'Stormfall', cls: 'archer', weapons: ['ember_bow', 'cinder_mortar', 'static_rod', 'cinder_ward'], perks: ['static_charge', 'kindling', 'fan_the_flames', 'overload', 'volley'], passives: ['wind_sigil'],
    end: { weapons: ['storm_volley', 'stormshell_mortar', 'pyre_crown'], fuse: ['storm_volley', 'stormshell_mortar'] },
    idea: 'Every other volley the sky answers: storm shells fall on the target and in a ring around it.',
    tips: 'Wind Sigil turns the bow into Storm Volley; combine Cinder Mortar with Static Rod into Stormshell Mortar and fuse the two for Stormfall. Add Cinder Ward (Fan the Flames 2 makes Pyre Crown) for the burning crowd the shells feed on. Volley and shock perks make the shells chain.', bench: true },

  // ---- Smith
  { id: 'steam engine', name: 'Steam Engine', cls: 'smith', weapons: ['forge_hammer', 'cinder_ward', 'rime_orbs'], perks: ['kindling', 'frostbite', 'quench', 'long_reach'], passives: [],
    end: { weapons: ['quakebreaker', 'vapor_wheel'] },
    idea: 'Burning and chilled enemies flash to steam and scald everything around them.',
    tips: 'Needs fire and frost together. Combine Cinder Ward with Rime Orbs into Vapor Wheel, a trail that burns and chills at once. Long Reach 2 turns the hammer into Quakebreaker.', bench: true },
  { id: 'fault line', name: 'Fault Line', cls: 'smith', weapons: ['forge_hammer', 'cinder_mortar', 'static_rod'], perks: ['long_reach', 'kindling', 'static_charge', 'overload'], passives: [],
    end: { weapons: ['quakebreaker', 'stormshell_mortar'], fuse: ['quakebreaker', 'stormshell_mortar'] },
    idea: 'Every shockwave leaves a burning, shocking crack that the horde walks into.',
    tips: 'Combine Cinder Mortar with Static Rod into Stormshell Mortar, and take Long Reach 2 for Quakebreaker. Fuse the two for Fault Line. Wide hammers and area perks make the cracks longer.', bench: true },
  { id: 'glacier', name: 'Glacier', cls: 'smith', weapons: ['forge_hammer', 'rime_shards'], perks: ['frostbite', 'deep_freeze', 'shatter', 'long_reach'], passives: ['tempered_core'],
    end: { weapons: ['colossus_maul', 'glacial_bloom'], fuse: ['colossus_maul', 'glacial_bloom'] },
    idea: 'Freeze whole groups, then shatter them for area damage.',
    tips: 'Deep Freeze makes freezing easy; Shatter turns every frozen kill into an explosion. Tempered Core 2 and three enhance levels evolve the hammer into Colossus Maul. Fuse it with Glacial Bloom for Glacier Maul. Strong against crowds, slower against a lone boss.', bench: true },

  // ---- Berserker
  { id: 'reaper', name: 'Reaper', cls: 'berserker', weapons: ['rending_axe', 'spirit_blades'], perks: ['keen_eye', 'headsman', 'echo_strike', 'long_reach', 'bloodletting'], passives: [],
    end: { weapons: ['reaper_axe', 'seraph_blades'] },
    idea: 'Wide swings, lots of crits, and a heal on every hit; wounded enemies die outright.',
    tips: 'Keen Eye unlocks Headsman. Echo Strike doubles the swing. Keen Eye 2 evolves the axe into Reaper Axe, Long Reach 2 the blades into Seraph Blades.', bench: true },
  { id: 'thunderscythe', name: 'Thunderscythe', cls: 'berserker', weapons: ['rending_axe', 'cinder_mortar', 'static_rod'], perks: ['keen_eye', 'headsman', 'kindling', 'static_charge', 'overload'], passives: [],
    end: { weapons: ['reaper_axe', 'stormshell_mortar'], fuse: ['reaper_axe', 'stormshell_mortar'] },
    idea: 'Every sweep plants storm shells that burn and shock the crowd a moment later.',
    tips: 'Keen Eye 2 for Reaper Axe, then combine Cinder Mortar and Static Rod into Stormshell Mortar and fuse the two. The shells keep working while you are not in melee range.', bench: true },
  { id: 'spear wheel', name: 'Spear Wheel', cls: 'berserker', weapons: ['rending_axe', 'spirit_blades', 'storm_javelin'], perks: ['keen_eye', 'headsman', 'long_reach', 'static_charge', 'arc_conductor'], passives: [],
    end: { weapons: ['reaper_axe', 'seraph_blades', 'thunder_lance'], fuse: ['seraph_blades', 'thunder_lance'] },
    idea: 'The blades shoot outward as piercing lances every few seconds while the axe keeps you healed.',
    tips: 'Long Reach 2 makes Seraph Blades and Arc Conductor 2 makes Thunder Lance; fuse them for Spear Wheel. Keep Keen Eye for Reaper Axe and Headsman.', bench: true },

  // ---- Mage
  { id: 'prismatic mage', name: 'Prismatic Mage', cls: 'mage', weapons: ['arc_bolt', 'static_rod'], perks: ['static_charge', 'kindling', 'arc_conductor', 'overload', 'keen_eye'], passives: ['scholars_lens'],
    end: { weapons: ['prismatic_bolt', 'tempest'] },
    idea: 'Never-miss bolts that burn and shock at once, with chains that explode on burning enemies.',
    tips: 'The Mage already has a small chance of every element, so any elemental perk helps. Scholar\'s Lens 2 evolves Arc Bolt into Prismatic Bolt, Static Charge 2 evolves the rod into Tempest.', bench: true },
  { id: 'black sun', name: 'Black Sun', cls: 'mage', weapons: ['arc_bolt', 'cinder_ward'], perks: ['kindling', 'fan_the_flames', 'wildfire'], passives: ['quickening_gear'],
    end: { weapons: ['singularity', 'pyre_crown'], fuse: ['singularity', 'pyre_crown'] },
    idea: 'A burning star pulls the crowd in, sets it alight and collapses in a fire explosion.',
    tips: 'Quickening Gear 2 evolves Arc Bolt into Singularity and Fan the Flames 2 turns the ward into Pyre Crown. Fuse them for Black Sun. Fire perks matter more than raw damage.', bench: true },
  { id: 'stormshell mage', name: 'Stormshell Mage', cls: 'mage', weapons: ['arc_bolt', 'cinder_mortar', 'static_rod'], perks: ['kindling', 'static_charge', 'overload', 'chain_reaction'], passives: ['scholars_lens'],
    end: { weapons: ['prismatic_bolt', 'stormshell_mortar'] },
    idea: 'Shells burn and shock whole groups while chain reactions finish what is left.',
    tips: 'Combine Cinder Mortar with Static Rod into Stormshell Mortar. It is the fastest crowd clearer of the Mage builds; Chain Reaction chains the kills.', bench: true },
  { id: 'stormspire', name: 'Stormspire', cls: 'mage', weapons: ['arc_bolt', 'storm_javelin', 'static_rod'], perks: ['static_charge', 'arc_conductor', 'thunderclap'], passives: ['scholars_lens'],
    end: { weapons: ['prismatic_bolt', 'thunder_lance', 'tempest'], fuse: ['thunder_lance', 'tempest'] },
    idea: 'Planted rods zap and fork through the crowd, and shocked kills fire more lightning.',
    tips: 'Arc Conductor 2 evolves the javelin into Thunder Lance and Static Charge 2 evolves the rod into Tempest; fuse them for Stormspire. Thunderclap rewards killing shocked enemies.', bench: true },

  // ---- Summoner
  { id: 'hound pack', name: 'Hound Pack', cls: 'summoner', weapons: ['bone_call', 'cinder_ward'], perks: ['kindling', 'fan_the_flames', 'wildfire'], passives: ['fleet_greaves'],
    end: { weapons: ['grave_legion', 'pyre_crown'], fuse: ['grave_legion', 'pyre_crown'] },
    idea: 'Hounds drag fire through the crowd, each wearing a burning aura of its own.',
    tips: 'Fleet Greaves 2 evolves Bone Call into Grave Legion; fuse it with Pyre Crown for Hellhounds. Every extra summon is another burning hound, so Volley-style bonuses and level-ups matter.', bench: true },
  { id: 'soul colossus', name: 'Soul Colossus', cls: 'summoner', weapons: ['bone_call', 'cinder_mortar'], perks: ['kindling', 'fan_the_flames', 'chain_reaction'], passives: ['tempered_core'],
    end: { weapons: ['bone_colossus', 'cinder_mortar'] },
    idea: 'One huge spirit holds the line while chain reactions release a steady stream of souls.',
    tips: 'Tempered Core 2 evolves Bone Call into Bone Colossus, and the same passive makes the frail Summoner tougher. Every kill releases a soul, so Chain Reaction feeds it.', bench: true },
  { id: 'storm pack', name: 'Storm Pack', cls: 'summoner', weapons: ['bone_call', 'storm_javelin', 'static_rod'], perks: ['static_charge', 'arc_conductor', 'thunderclap'], passives: ['fleet_greaves'],
    end: { weapons: ['grave_legion', 'thunder_lance', 'tempest'], fuse: ['thunder_lance', 'tempest'] },
    idea: 'The hounds hold the crowd while planted rods fork lightning through it.',
    tips: 'Fleet Greaves 2 for Grave Legion, then Arc Conductor 2 and Static Charge 2 for Thunder Lance and Tempest, which fuse into Stormspire. The Summoner stays at range while the pack works.', bench: true },
  { id: 'stormfangs', name: 'Stormfangs', cls: 'summoner', weapons: ['bone_call', 'storm_javelin', 'rime_shards'], perks: ['frostbite', 'static_charge', 'superconduct', 'volley'], passives: ['fleet_greaves'],
    end: { weapons: ['grave_legion', 'stormfrost_lance'], fuse: ['grave_legion', 'stormfrost_lance'] },
    idea: 'Every hound fires piercing frost-and-lightning lances, so chilled and shocked enemies always crit.',
    tips: 'Fleet Greaves 2 for Grave Legion; combine Storm Javelin with Rime Shards into Stormfrost Lance, then fuse the two for Stormfangs. Superconduct rewards enemies that are both chilled and shocked, which the lances do in one hit.', bench: true },
  { id: 'seraph titan', name: 'Seraph Titan', cls: 'summoner', weapons: ['bone_call', 'spirit_blades'], perks: ['long_reach', 'echo_strike', 'bloodletting'], passives: ['tempered_core'],
    end: { weapons: ['bone_colossus', 'seraph_blades'], fuse: ['bone_colossus', 'seraph_blades'] },
    idea: 'One huge spirit in a wheel of blades: it cuts and blesses everything near it and its kills heal you.',
    tips: 'Tempered Core 2 evolves Bone Call into Bone Colossus and Long Reach 2 evolves the blades into Seraph Blades; fuse them for Seraph Titan. Bloodletting and the kill heal make the frail Summoner much harder to kill.', bench: true },

  // ---- Saint
  { id: 'sun saint', name: 'Sun Saint', cls: 'saint', weapons: ['halo', 'cinder_ward'], perks: ['long_reach', 'bloodletting', 'kindling', 'fan_the_flames'], passives: ['tempered_core'],
    end: { weapons: ['radiant_halo', 'pyre_crown'] },
    idea: 'Two rings of burning light that heal you on every tick.',
    tips: 'Close-range perks (Long Reach, Bloodletting) apply to both rings. Tempered Core 2 evolves Halo Pulse into Radiant Pulse and Fan the Flames 2 turns the ward into Pyre Crown.', bench: true },
  { id: 'aurora', name: 'Aurora', cls: 'saint', weapons: ['halo', 'cinder_ward', 'rime_orbs'], perks: ['long_reach', 'bloodletting', 'kindling', 'frostbite'], passives: ['tempered_core'],
    end: { weapons: ['radiant_halo', 'vapor_wheel'], fuse: ['vapor_wheel', 'radiant_halo'] },
    idea: 'Your wake blesses everything that walks through it, and beacons send out rings of light.',
    tips: 'Combine Cinder Ward with Rime Orbs into Vapor Wheel, evolve the halo with Tempered Core 2, and fuse the two for Aurora Wake. Stay in motion so the wake keeps landing.', bench: true },
  { id: 'seraph choir', name: 'Seraph Choir', cls: 'saint', weapons: ['halo', 'spirit_blades', 'storm_javelin'], perks: ['long_reach', 'echo_strike', 'bloodletting', 'static_charge', 'arc_conductor'], passives: ['tempered_core'],
    end: { weapons: ['radiant_halo', 'seraph_blades', 'thunder_lance'], fuse: ['seraph_blades', 'thunder_lance'] },
    idea: 'Rings of light heal you while the blades fire out as lances and fly back.',
    tips: 'Long Reach 2 makes Seraph Blades and Arc Conductor 2 makes Thunder Lance; fuse them for Spear Wheel. Echo Strike adds another blade.', bench: true },
];
