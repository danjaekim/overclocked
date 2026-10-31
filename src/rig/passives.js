// Passives (docs/plan-v066-v07.md, M5): rule changes that point at how the rig is built. Each stacks to `max` (3); a stack only
// raises the number. The rig keeps the counts in rig.passives { id: stacks }. How each one is applied:
//   compile time  last_word, hair_trigger        rig/chain.js reads def.passives
//   run time      siphon, overflow, redline, momentum, turret    rig/rig.js reads chain.pv (passiveValues below)
//   stat mods     ricochet, glass_cannon          game/sandbox.js applyPassives adds them under the source 'passive:'
//   death rules   pyromaniac, conductor, permafrost   game/sandbox.js applyPassives sets run.rules (the engine is systems/status.js)
// `fits(rig)` says whether the passive does anything for what the rig owns; offers lean on it (rig/offers.js).

import { PERKS } from '../data/perks.js';

const ownedIds = (rig) => {
  const ids = new Set(rig.bench.filter(Boolean));
  for (const c of rig.chains) for (const id of c.slots) if (id) ids.add(id);
  return ids;
};
const hasAny = (rig, list) => { const o = ownedIds(rig); return list.some((id) => o.has(id)); };
const TRIGGERS = ['on_impact', 'on_kill', 'on_hit', 'every_3rd'];
const rule = (id) => PERKS[id].rule.values;

export const PASSIVES = {
  last_word: {
    name: 'Last Word', max: 3, values: [1.3, 1.5, 1.7],
    desc: (n) => `The last weapon in each chain hits x${PASSIVES.last_word.values[n - 1]}`,
    fits: (rig) => rig.chains.length >= 2,
  },
  hair_trigger: {
    name: 'Hair Trigger', max: 3, values: [1.5, 1.8, 2.1],
    desc: (n) => `Payloads hit x${PASSIVES.hair_trigger.values[n - 1]}; every modifier costs 1 more`,
    fits: (rig) => hasAny(rig, TRIGGERS),
  },
  ricochet: {
    name: 'Ricochet', max: 3, values: [1, 1, 2],
    desc: (n) => `Shots bounce to ${PASSIVES.ricochet.values[n - 1]} more enem${PASSIVES.ricochet.values[n - 1] === 1 ? 'y' : 'ies'} and hit 20% softer`,
    fits: (rig) => hasAny(rig, ['blaster', 'nova']),
  },
  pyromaniac: {
    name: 'Pyromaniac', max: 3, values: [{ n: 2, mult: 0.8 }, { n: 3, mult: 0.9 }, { n: 4, mult: 1 }],   // under 1 on purpose: above it each death lights more than it had and the pack burns itself out of the bench
    desc: (n) => { const v = PASSIVES.pyromaniac.values[n - 1]; return `A burning enemy that dies passes ${Math.round(v.mult * 100)}% of its burn to ${v.n} enemies near it`; },
    fits: (rig) => hasAny(rig, ['flame']),
    needs: ['flame'],
  },
  conductor: {
    name: 'Conductor', max: 3, values: rule('thunderclap'),
    desc: (n) => `A shocked enemy that dies fires ${PASSIVES.conductor.values[n - 1].hops} bolts at enemies near it`,
    fits: (rig) => hasAny(rig, ['storm', 'chain_bolt']),
    needs: ['storm', 'chain_bolt'],
  },
  permafrost: {
    name: 'Permafrost', max: 3, values: rule('shatter').map((v) => ({ ...v, any: true })),
    desc: (n) => `A chilled or frozen enemy that dies bursts for ${Math.round(PASSIVES.permafrost.values[n - 1].frac * 100)}% of its max HP`,
    fits: (rig) => hasAny(rig, ['frost']),
    needs: ['frost'],
  },
  siphon: {
    name: 'Siphon', max: 3, values: [0.15, 0.25, 0.35],
    desc: (n) => `Every kill gives every chain ${PASSIVES.siphon.values[n - 1]} energy`,
    fits: (rig) => hasAny(rig, ['on_kill']) || rig.chains.some((c) => c.chassis === 'reaper'),
  },
  overflow: {
    name: 'Overflow', max: 3, values: [0.25, 0.4, 0.55],
    desc: (n) => `Recharge past a full battery is banked: the next activation hits up to +${Math.round(PASSIVES.overflow.values[n - 1] * 100)}% harder`,
    fits: () => true,
  },
  redline: {
    name: 'Redline', max: 3, values: [1.2, 1.3, 1.4],
    desc: (n) => `A chain under half battery recharges ${Math.round(PASSIVES.redline.values[n - 1] * 100)}% faster`,
    fits: () => true,
  },
  momentum: {
    name: 'Momentum', max: 3, values: [0.15, 0.3, 0.45],
    desc: (n) => `+${Math.round(PASSIVES.momentum.values[n - 1] * 100)}% recharge while moving, -20% while standing still`,
    fits: (rig) => rig.chains.some((c) => c.chassis === 'strider'),
  },
  turret: {
    name: 'Turret Mode', max: 3, values: [0.3, 0.45, 0.6],
    desc: (n) => `After 1 s standing still, rig damage +${Math.round(PASSIVES.turret.values[n - 1] * 100)}%; moving resets it`,
    fits: (rig) => rig.chains.some((c) => c.chassis === 'anchor'),
  },
  glass_cannon: {
    name: 'Glass Cannon', max: 3, values: [0.3, 0.3, 0.3],
    desc: () => 'Max HP x0.7 and all damage +30% for each stack',
    fits: () => true,
  },
};

export const PASSIVE_IDS = Object.keys(PASSIVES);

// The numbers one chain's runtime reads: each is 0 (or 1 where it multiplies) when the passive is not owned.
export function passiveValues(stacks) {
  const v = (id) => { const n = (stacks && stacks[id]) || 0; return n > 0 ? PASSIVES[id].values[Math.min(n, PASSIVES[id].max) - 1] : 0; };
  return {
    lastWord: v('last_word') || 1,
    hairTrigger: v('hair_trigger') || 1,
    siphon: v('siphon'),
    overflow: v('overflow'),
    redline: v('redline'),
    momentum: v('momentum'),
    turret: v('turret'),
  };
}
