// Build recipes: sets of weapons and techniques that work together. They feed the compendium's
// Builds tab and the bench (tools/bench.mjs --builds), so the guide and the numbers use one list.
//   cls      the class that suits it best (any class can try it)
//   weapons  owned weapons, perks  owned techniques (a perk must be offered after the weapons: see tests)
//   idea     what the build does, in a line   tips  what to take, reroll for, and forge toward
//   bench    include in the bench table

export const BUILDS = [
  { id: 'wildfire', name: 'Wildfire', cls: 'archer', weapons: ['ember_bow', 'cinder_ward'], perks: ['kindling', 'fan_the_flames', 'wildfire', 'volley'],
    idea: 'Everything burns, and every burning kill sets the next group alight.',
    tips: 'Take Kindling early, then Fan the Flames. Wildfire only works on burning enemies, so fire weapons matter more than damage. Infuse a third weapon with Ember-touched at the forge.', bench: true },
  { id: 'storm chain', name: 'Storm Chain', cls: 'archer', weapons: ['ember_bow', 'storm_javelin'], perks: ['static_charge', 'arc_conductor', 'thunderclap', 'ricochet'],
    idea: 'Shocks arc from enemy to enemy, and shocked kills fire more bolts.',
    tips: 'Pick up Static Charge and Arc Conductor first. Thunderclap rewards killing shocked enemies, so keep a wide, piercing weapon on the screen. Conductive is the affix to reforge for.', bench: true },
  { id: 'splinter volley', name: 'Splinter Volley', cls: 'archer', weapons: ['ember_bow'], perks: ['ricochet', 'splitting_tips', 'volley', 'heavy_fletching', 'keen_eye'],
    idea: 'A hail of arrows that bounce and split into more arrows.',
    tips: 'Needs a projectile weapon and as many projectile perks as you can find. Ricocheting and Splitting affixes at the forge push it further. Good against single targets and bosses.', bench: true },
  { id: 'superconductor', name: 'Superconductor', cls: 'archer', weapons: ['ember_bow', 'rime_shards', 'storm_javelin'], perks: ['frostbite', 'static_charge', 'superconduct', 'keen_eye', 'headsman'],
    idea: 'Chill and shock the same enemy and it always crits; crits finish the wounded.',
    tips: 'Needs a frost source and a storm source before Superconduct is offered. Add Keen Eye for Headsman. Frost + storm resonance helps.', bench: true },
  { id: 'overload', name: 'Overload', cls: 'archer', weapons: ['ember_bow', 'storm_javelin', 'cinder_ward'], perks: ['kindling', 'arc_conductor', 'overload', 'fan_the_flames'],
    idea: 'Lightning chains that land on burning enemies explode and ignite the crowd.',
    tips: 'Needs both fire and storm. Keep enemies burning first, then add chains. Searing and Conductive are the affixes to look for.', bench: true },
  { id: 'glacier', name: 'Glacier', cls: 'smith', weapons: ['forge_hammer', 'rime_shards'], perks: ['frostbite', 'deep_freeze', 'shatter', 'long_reach'],
    idea: 'Freeze whole groups, then shatter them for area damage.',
    tips: 'Deep Freeze makes freezing easy; Shatter turns every frozen kill into an explosion. Long Reach keeps the hammer in range. Rime-touched on the hammer adds chill.', bench: true },
  { id: 'steam engine', name: 'Steam Engine', cls: 'smith', weapons: ['forge_hammer', 'cinder_ward', 'rime_shards'], perks: ['kindling', 'frostbite', 'quench', 'long_reach'],
    idea: 'Burning and chilled enemies flash to steam and scald everything around them.',
    tips: 'Needs fire and frost together. Vapor Wheel (fuse Cinder Ward and Rime Orbs) is the weapon version of the same idea.', bench: true },
  { id: 'reaper', name: 'Reaper', cls: 'berserker', weapons: ['rending_axe', 'spirit_blades'], perks: ['echo_strike', 'long_reach', 'bloodletting', 'keen_eye', 'headsman'],
    idea: 'Wide swings, lots of crits, and a heal on every hit; wounded enemies die outright.',
    tips: 'Keen Eye unlocks Headsman. Echo Strike doubles the swing. Evolve the axe into Reaper Axe with Keen Eye level 2.', bench: true },
  { id: 'prismatic mage', name: 'Prismatic Mage', cls: 'mage', weapons: ['arc_bolt', 'static_rod'], perks: ['static_charge', 'kindling', 'arc_conductor', 'overload', 'keen_eye'],
    idea: 'Never-miss bolts that burn and shock at once, with chains that explode on burning enemies.',
    tips: 'The Mage already has a small chance of every element, so any elemental perk helps. Scholar\'s Lens 2 evolves Arc Bolt into Prismatic Bolt.', bench: true },
  { id: 'hound pack', name: 'Hound Pack', cls: 'summoner', weapons: ['bone_call', 'cinder_mortar'], perks: ['kindling', 'fan_the_flames', 'wildfire'],
    idea: 'Hounds drag fire through the crowd while mortar shells light it up.',
    tips: 'Every extra projectile is another hound, so Volley-style bonuses and level-ups matter. Fleet Greaves 2 evolves Bone Call into Grave Legion.', bench: true },
  { id: 'sun saint', name: 'Sun Saint', cls: 'saint', weapons: ['halo', 'cinder_ward'], perks: ['long_reach', 'bloodletting', 'kindling', 'fan_the_flames'],
    idea: 'Two rings of burning light that heal you on every tick.',
    tips: 'Close-range perks (Long Reach, Bloodletting) apply to both rings. Tempered Core 2 evolves Halo into Radiant Halo.', bench: true },
];
