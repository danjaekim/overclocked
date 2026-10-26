// Elites (docs/design-m10-m13.md §6.1): a normal enemy def spawned with the elite flag, a bigger
// body, more hp, one affix, and a chest on death. Elite events live in data/waves.js EVENTS.

export const ELITE = {
  hpMult: 6,
  radiusMult: 1.35,
  damageMult: 1.5,
  xpMult: 8,
  color: '#ffd34d',
  starsteelChance: 0.5,      // chance an elite (after the first, which always does) drops 1 starsteel
  affixes: {
    swift:        { name: 'Swift',        speedMult: 1.45 },
    warded:       { name: 'Warded',       damageTaken: 0.65, untilHpFrac: 0.5 },  // takes 35% less damage while above 50% hp
    regenerating: { name: 'Regenerating', regenFrac: 0.03, delay: 2 },             // 3% max hp per second, 2 s after its last hit
    armoured:     { name: 'Armoured',     armor: 7 },                               // counters many-small-hits builds (see armour in systems/damage.js)
    volatile:     { name: 'Volatile',     blastRadius: 95, blastMult: 1.3 },         // explodes when it dies: punishes standing in melee
  },
  secondAffixAfter: 420,     // seconds: elites spawned after this roll two affixes
};

// The affix definitions an elite carries (one, or two late in the run).
export function affixDefs(e) {
  const out = [];
  if (e.affix) out.push(ELITE.affixes[e.affix]);
  if (e.affix2) out.push(ELITE.affixes[e.affix2]);
  return out;
}

// Chest roll tuning (docs/design-m10-m13.md §6.2).
export const CHEST = {
  // weights for [1, 3, 5] rolls
  elite: [65, 28, 7],
  boss: [0, 0, 1],
  luckScale: 0.1,           // multiplies the 3 and 5 weights by (1 + luckScale * luck)
  firstEliteMin: 3,         // the first elite chest of a run is at least this many rolls
  newWeaponChance: 0.12,    // per roll after the first, 5-roll chests only, at most one per chest
  fusionNewChance: 0.3,     // ... and while a combo partner is on offer (see comboPartners), 3-roll chests too, at this chance
  comboPartnerBoost: 6,    // weight of a new-weapon roll that is the missing half of a combo you hold the other half of
  newWeaponTagBoost: 1.5,   // a new weapon sharing an element tag with an owned weapon
  weights: { weapon_up: 1.5, passive_up: 1.0, perk_up: 1.0 },
  blockerMult: 3,           // an upgrade that advances a blocked evolution
  oreFallback: 6,           // a roll with nothing left to upgrade turns into this much ore
};
