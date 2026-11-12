// Pilots (docs/plan-v12-pilots.md): the class you pick before a run. A pilot is a run-wide rule, a few stats, a cost,
// a starting chain and a sprite. Chassis stay per chain; a pilot's bonus must still work after its starting chassis is
// replaced. Data and pure helpers only: ovrun.js builds the run from it, the rig reads `rig.pilot` (pilotRig below).
//
//   start      the first chain: { chassis, mk, slots: [piece ids], size: starting slot count }
//   mods       stat modifiers for the whole run (source 'pilot:')
//   sig        the signature passive: starts at Lv1 and can go to Lv `sigMax` (one more than anyone else's cap)
//   rules      slotsStart / slotsMax (every chassis starts / can grow by that many slots), maxChains, braceArmor
//              (armor while standing still for a second, which is when Turret Mode is on), braceHeal { perKill, cap }
//              (while braced, each kill heals perKill of max HP, at most cap of max HP a second)
//   freeReroll / shopMult   Broker: free rerolls per level-up, and the workbench price multiplier
//   reward     the boss reward id (data/boss-rewards.js), taken after the Warlord and the Seer
//   cost       the line shown under the rule in the picker

export const DEFAULT_PILOT = 'rookie';

export const PILOTS = {
  rookie: {
    name: 'Rookie', short: 'Rookie',
    desc: 'The plain starter: a Standard chain and a Blaster, no rule change.',
    cost: 'No cost, no bonus',
    start: { chassis: 'standard', mk: 1, slots: ['blaster'], size: 3 },
    mods: [], sig: null, rules: {},
  },
  courier: {
    name: 'Courier', short: 'Courier',
    desc: 'Fast and light. Starts on Strider with Momentum (recharge while moving, up to Lv4). +20% move speed, +40% pickup range.',
    cost: '-20 max HP',
    start: { chassis: 'strider', mk: 1, slots: ['blaster'], size: 4 },
    mods: [
      { stat: 'moveSpeed', op: 'inc', value: 0.2 },
      { stat: 'pickupRadius', op: 'inc', value: 0.4 },
      { stat: 'maxHp', op: 'flat', value: -20 },
    ],
    sig: { id: 'momentum', max: 4 }, rules: {},
  },
  bulwark: {
    name: 'Bulwark', short: 'Bulwark',
    desc: 'A turret. Starts on Anchor with Turret Mode (damage after standing still, up to Lv4). +50 max HP, +3 armor. Braced (still for 1 s): +4 armor, and each kill heals 0.5% max HP (up to 2% a second).',
    cost: '-15% move speed',
    start: { chassis: 'anchor', mk: 1, slots: ['blaster'], size: 4 },
    mods: [
      { stat: 'maxHp', op: 'flat', value: 50 },
      { stat: 'armor', op: 'flat', value: 3 },
      { stat: 'moveSpeed', op: 'inc', value: -0.15 },
    ],
    sig: { id: 'turret', max: 4 }, rules: { braceArmor: 4, braceHeal: { perKill: 0.005, cap: 0.02 } },
  },
  splicer: {
    name: 'Splicer', short: 'Splicer',
    desc: 'Long chains. Every chain starts with 1 more slot and can grow 2 further. Starts with Hair Trigger (payload power, up to Lv4) and an Echo.',
    cost: 'Two chains at most instead of three',
    start: { chassis: 'standard', mk: 1, slots: ['echo', 'blaster'], size: 4 },
    mods: [],
    sig: { id: 'hair_trigger', max: 4 }, rules: { slotsStart: 1, slotsMax: 2, maxChains: 2 },
  },
  broker: {
    name: 'Broker', short: 'Broker',
    desc: 'A dealer. The first reroll of every level-up is free, and the workbench sells everything 25% cheaper. Kills drop gold 20% less often.',
    cost: '-25 max HP, less gold from kills',
    start: { chassis: 'standard', mk: 1, slots: ['blaster'], size: 3 },
    mods: [
      { stat: 'maxHp', op: 'flat', value: -25 },
      { stat: 'oreGain', op: 'inc', value: -0.2 },
    ],
    sig: null, rules: { freeReroll: 1, shopMult: 0.75 },
  },
  overclocker: {
    name: 'Overclocker', short: 'Overclocker',
    desc: 'Built for big picks. Its boss rewards (after the Warlord and the Seer): Overcharge triples one piece\'s defining number.',
    cost: '-15 max HP',
    start: { chassis: 'standard', mk: 1, slots: ['blaster'], size: 3 },
    mods: [{ stat: 'maxHp', op: 'flat', value: -15 }], sig: null, rules: {}, reward: 'overcharge',
  },
};

export const PILOT_IDS = ['rookie', 'courier', 'bulwark', 'splicer', 'broker', 'overclocker'];
export const pilotOf = (id) => PILOTS[id] || PILOTS[DEFAULT_PILOT];
export const isPilot = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(PILOTS, id);

// What the rig needs to know (rig.pilot, kept in the rig state so saves, snapshots and clones carry it).
export function pilotRig(id) {
  const p = pilotOf(id);
  return { id: isPilot(id) ? id : DEFAULT_PILOT, sig: p.sig ? p.sig.id : null, sigMax: p.sig ? p.sig.max : 0, ...p.rules, ...(p.reward ? { reward: p.reward } : {}) };
}
