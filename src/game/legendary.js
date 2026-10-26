// Legendary forge tier (M45d). No DOM here; the forge overlay calls these.
//   inst.legendary         the id of the legendary the weapon wears, or null
//   inst.pendingLegendary  { options } while the three shown choices wait to be picked (they stay on the weapon, so
//                          closing the forge never gives a free reroll)
// The effect's modifiers and triggers are applied by rebuildAffixes (game/forge.js), so reforging, fusing and salvage
// keep them consistent with the rest of the weapon's forge state.

import { LEGENDARY, LEGENDARIES } from '../data/forge.js';
import { rebuildAffixes } from './forge.js';

export function legendaryEligible(inst) {
  return Object.keys(LEGENDARIES).filter((id) => {
    const req = LEGENDARIES[id].requires;
    return !req || req.some((t) => inst.tags.set.has(t));
  });
}

// Why the weapon cannot roll legendaries now (null when it can). A weapon that has one pays the cheaper reroll price.
export function legendaryBlocker(run, inst) {
  if (inst.pendingLegendary) return 'Pick one first.';
  if (inst.pendingTemper) return 'Choose a temper first.';
  if (inst.enhance < LEGENDARY.unlockEnhance) return `Needs +${LEGENDARY.unlockEnhance}.`;
  if (run.starsteel < legendaryCost(inst)) return `Needs ${legendaryCost(inst)} starsteel.`;
  return null;
}
export const legendaryCost = (inst) => (inst.legendary ? LEGENDARY.reroll : LEGENDARY.cost);
export const canLegendary = (run, inst) => legendaryBlocker(run, inst) === null;

export function rollLegendary(run, inst) {
  if (!canLegendary(run, inst)) return { ok: false, options: [] };
  run.starsteel -= legendaryCost(inst);
  let pool = legendaryEligible(inst).filter((id) => id !== inst.legendary);
  const options = [];
  while (options.length < Math.min(LEGENDARY.options, pool.length)) {
    const id = pool[Math.floor(run.rng.next() * pool.length)];
    pool = pool.filter((x) => x !== id);
    options.push(id);
  }
  inst.pendingLegendary = { options };
  return { ok: true, options };
}

export function applyLegendary(run, inst, index) {
  const pending = inst.pendingLegendary;
  if (!pending || !pending.options[index]) return { ok: false };
  inst.legendary = pending.options[index];
  inst.pendingLegendary = null;
  rebuildAffixes(run, inst);
  run.toast = { text: `${LEGENDARIES[inst.legendary].name}!`, ttl: 3 };
  return { ok: true, legendary: inst.legendary };
}

// Declines the shown choices: the weapon keeps what it has. The starsteel stays spent.
export function keepLegendary(inst) {
  inst.pendingLegendary = null;
}
