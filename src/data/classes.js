// Playable classes (docs/architecture.md §5.7). Archer and Smith are open from the start; the
// rest unlock by playing (`unlock`: { event, count?, hint }, checked by game/unlocks.js):
//   boss   defeat the Warlord        win    survive the whole run
//   kills  at least `count` kills in one run        level  reach level `count` in one run
//
// Each class also has a `trait` (docs/architecture.md M36, game/class-traits.js): a signature mechanic
// that applies to whatever weapons you hold, so the same build plays differently on another class.
//   longShot  { near, far, bonus }        hits deal up to +bonus damage the farther the target (near..far)
//   spellburst { frac, radius, cap }      an enemy that dies burning, chilled or shocked bursts once per element (systems/status.js)
//   ward      { amount, delay }            a shield of `amount` that refills after `delay` s without being hit
//   dodge     { chance, grace }            a hit on you misses (then `grace` s of invulnerability)
//   temperedSteel { damage }             each enhance level also adds `damage` (inc) to that weapon (game/forge.js)
//   heavyBlows { chance, stun, vsStunned }  direct hits may stagger (bosses half as long); staggered enemies take +vsStunned
//   frenzy    { per, max, time }           each kill adds a stack (max) for `time` s: weapons per x faster each
//   souls     { base, perLevel, speed, range, max }   kills release a soul at one of the enemies nearest you (within range)
//   nova      { every, radius, speed, base, perLevel, heal } a ring of light from you every `every` s
// `text` lines are shown on the class card and the build screen.

export const CLASSES = {
  archer: {
    name: 'Archer',
    blurb: 'Keeps its distance. Every ranged weapon fires one more shot, and arrows rain on the thickest crowds.',
    startWeapon: 'ember_bow',
    mods: [
      { stat: 'critChance', op: 'flat', value: 0.05 },
      { stat: 'moveSpeed', op: 'inc', value: 0.1 },
      { stat: 'cooldown', op: 'more', value: -0.15, when: 'moving' },          // Fleet
      { stat: 'projectiles', op: 'flat', value: 1, tags: ['ranged'] },        // Quiver: one more shot from every ranged weapon (M43; was +1 pierce, which arrows rarely used)
      { stat: 'maxHp', op: 'flat', value: 20 },                               // M45f: the Archer had no sustain at all and bled out around 8:00 (bots 58/69% -> 85/95%, docs/balance-playbook.md)
      { stat: 'regen', op: 'flat', value: 0.3 },
    ],
    trait: {
      name: 'Deadeye',
      text: ['Rain of Arrows: every 3 s arrows fall on the thickest crowd in range of your ranged weapon, more with every extra shot it fires', 'Quiver: every ranged weapon fires one more shot', 'Long Shot: hits deal up to 50% more damage the farther the target', 'Fleet: weapons attack 15% faster while you move', 'Evasion: 25% of hits miss you', 'Steady hands: +20 max HP and a little regeneration'],
      longShot: { near: 60, far: 220, bonus: 0.5 },
      dodge: { chance: 0.25, grace: 0.25 },
      // Rain of Arrows (game/class-traits.js): needs a ranged weapon; damage is `frac` x that weapon's, arrows = `arrows`
      // + `perProj` per extra projectile it fires (Quiver counts), up to `max`; spread and radius grow with area.
      rain: { every: 3, arrows: 6, perProj: 2, max: 18, spread: 60, radius: 26, frac: 0.55, delay: 0.45, stagger: 0.04, reach: 240 },   // reach: stays on a phone screen, so you see it and the gems land near you
    },
    unlocked: true,
  },
  smith: {
    name: 'Smith',
    blurb: 'Stands and fights. Heavy hammer sweeps, tough, hits knock enemies back.',
    startWeapon: 'forge_hammer',
    mods: [
      { stat: 'maxHp', op: 'flat', value: 30 },
      { stat: 'armor', op: 'flat', value: 1 },
      { stat: 'knockback', op: 'inc', value: 0.15 },
      { stat: 'oreGain', op: 'inc', value: 0.3 },
      { stat: 'area', op: 'inc', value: 0.15, tags: ['close'] },
    ],
    forge: { costMult: 0.8 },        // Smiths enhance for 20% less ore
    trait: {
      name: 'Forgemaster',
      text: ['Tempered Steel: every enhance level gives 6% more damage on top of the usual 8%', 'Heavy Blows: hits may stagger (10%); staggered enemies take 40% more damage from you', 'Finds 30% more ore and enhances for 20% less', 'Close-range weapons reach 15% wider'],
      heavyBlows: { chance: 0.1, stun: 0.4, vsStunned: 0.4 },
      temperedSteel: { damage: 0.06 },
    },
    unlocked: true,
  },
  berserker: {
    name: 'Berserker',
    blurb: 'Reckless. Heals as it hits and hits much harder when wounded.',
    startWeapon: 'rending_axe',
    mods: [
      { stat: 'lifesteal', op: 'flat', value: 0.02 },
      { stat: 'armor', op: 'flat', value: 2 },
      { stat: 'damage', op: 'more', value: 0.25, when: 'hpBelow50' },
      { stat: 'moveSpeed', op: 'inc', value: 0.1 },
      { stat: 'damage', op: 'inc', value: 0.15, tags: ['close'] },
    ],
    trait: {
      name: 'Bloodlust',
      text: ['Frenzy: every kill makes your weapons 2% faster for 3 s, stacking to 30%', 'Heals as it hits (2%); 2 armor; 25% more damage below half health', 'Close-range weapons deal 15% more damage'],
      frenzy: { per: 0.02, max: 15, time: 3 },
    },
    unlocked: false,
    unlock: { event: 'boss', hint: 'Defeat the Warlord' },
  },
  mage: {
    name: 'Mage',
    blurb: 'Bolts that never miss. Every hit may burn, chill or shock, and whatever dies under an element bursts in it.',
    startWeapon: 'arc_bolt',
    mods: [
      { stat: 'area', op: 'inc', value: 0.15 },
      { stat: 'burnChance', op: 'flat', value: 0.08 },
      { stat: 'chillChance', op: 'flat', value: 0.08 },
      { stat: 'shockChance', op: 'flat', value: 0.08 },
      { stat: 'burnPower', op: 'inc', value: 0.8 },
      { stat: 'vsBurning', op: 'inc', value: 0.1 },
      { stat: 'vsChilled', op: 'inc', value: 0.1 },
      { stat: 'vsShocked', op: 'inc', value: 0.1 },
      { stat: 'chillStacks', op: 'flat', value: 1 },
      { stat: 'chains', op: 'flat', value: 1 },
      { stat: 'statusDuration', op: 'inc', value: 0.25 },
    ],
    trait: {
      name: 'Attunement',
      ward: { amount: 15, delay: 5 },
      spellburst: { frac: 0.25, radius: 55, cap: 300 },       // Spellburst (systems/status.js): an enemy dying under an element bursts in it
      text: ['Spellburst: an enemy that dies burning, chilled or shocked bursts in each of those elements, for a quarter of its max HP', 'Elements are stronger: burns hit 80% harder, chills stack twice, shocks jump once more, all last 25% longer', 'Every hit has an 8% chance each to burn, chill and shock', 'Burning, chilled and shocked enemies each take 10% more damage from you', 'Arcane Ward: a 15-point shield that refills after 5 s without being hit', 'Spells reach 15% wider'],
    },
    unlocked: false,
    unlock: { event: 'win', hint: 'Survive the full ten minutes' },
  },
  summoner: {
    name: 'Summoner',
    blurb: 'Fights through spirit hounds that cannot be hurt. Frail on its own, deadly with a pack.',
    startWeapon: 'bone_call',
    mods: [
      { stat: 'maxHp', op: 'flat', value: -10 },
      { stat: 'damage', op: 'more', value: 0.15, tags: ['summon'] },
      { stat: 'projectiles', op: 'flat', value: 1, tags: ['summon'] },
    ],
    trait: {
      name: 'Soul Harvest',
      text: ['Every kill releases a soul that flies at one of the enemies closest to you', 'Summons deal 15% more damage, and you call one more'],
      souls: { base: 12, perLevel: 3, speed: 400, range: 220, max: 24 },
    },
    unlocked: false,
    unlock: { event: 'kills', count: 2000, hint: 'Defeat 2000 enemies in one run' },
  },
  saint: {
    name: 'Saint',
    blurb: 'Hard to kill. A holy ring heals with every foe it burns, and wounds mend over time.',
    startWeapon: 'halo',
    mods: [
      { stat: 'regen', op: 'flat', value: 0.4 },
      { stat: 'maxHp', op: 'flat', value: 30 },
    ],
    trait: {
      name: 'Sanctuary',
      text: ['Holy Nova: every 6 s a ring of light bursts from you, blessing what it hits (they take 10% more damage) and healing you', 'Wounds mend over time'],
      nova: { every: 6, radius: 150, speed: 340, base: 6, perLevel: 1.5, heal: 1.5 },
    },
    unlocked: false,
    unlock: { event: 'level', count: 18, hint: 'Reach level 18 in one run' },
  },
};

export const DEFAULT_CLASS = 'archer';
