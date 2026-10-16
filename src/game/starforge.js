// Starforge rules (docs/design-m39-m42.md §5). No DOM here; the forge overlay calls these.
//   inst.star   true once the weapon is starforged (plain data, so run snapshots keep it)
// The mutation itself is looked up from the weapon's CURRENT behavior, so an evolution needs no migration.

import { STARFORGE, MUTATIONS } from '../data/starforge.js';

// The mutation this weapon would have (or has), or null when its behavior has none yet.
export function mutationOf(inst) {
  return MUTATIONS[inst.def.behavior] || null;
}

// Why the weapon cannot be starforged right now (null when it can).
export function starforgeBlocker(run, inst) {
  if (inst.star) return 'Already starforged.';
  if (!mutationOf(inst)) return 'No mutation for this weapon yet.';
  if (inst.level < inst.def.maxLevel) return `Reach level ${inst.def.maxLevel} first.`;
  if (run.starsteel < STARFORGE.cost) return `Needs ${STARFORGE.cost} starsteel.`;
  return null;
}

export const canStarforge = (run, inst) => starforgeBlocker(run, inst) === null;

// Spends starsteel and stars the weapon. Returns { ok, mutation }.
export function starforge(run, inst) {
  if (!canStarforge(run, inst)) return { ok: false };
  run.starsteel -= STARFORGE.cost;
  inst.star = true;
  const m = mutationOf(inst);
  run.toast = { text: `${m.name}!`, ttl: 3 };
  return { ok: true, mutation: m };
}

// The live mutation for a behavior's code: the data entry when this weapon is starred, else null.
export function activeMutation(inst) {
  return inst.star ? MUTATIONS[inst.def.behavior] || null : null;
}
