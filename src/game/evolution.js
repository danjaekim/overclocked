// Evolutions (docs/architecture.md §5.5): checking recipes and executing the forge's Combine.

import { EVOLUTIONS } from '../data/evolutions.js';
import { WEAPONS } from '../data/weapons.js';
import { BEHAVIORS } from '../behaviors/index.js';
import { makeTags } from '../stats/stats.js';
import { PASSIVES } from '../data/passives.js';
import { TITLES } from '../data/titles.js';
import { findPassive } from './passives.js';
import { hasTitle } from './titles.js';

export function recipesFor(inst) {
  return EVOLUTIONS.filter((r) => r.from === inst.weaponId);
}

function describe(req) {
  if (req.weaponLevel !== undefined) return `Weapon level ${req.weaponLevel}`;
  if (req.passive) return `${PASSIVES[req.passive].name} ${req.minLevel > 1 ? `Lv ${req.minLevel}` : ''}`.trim();
  if (req.enhance !== undefined) return `Enhanced to +${req.enhance}`;
  if (req.starsteel !== undefined) return `${req.starsteel} starsteel`;
  if (req.title) return `Title: ${TITLES[req.title].name}`;
  return '?';
}

function holds(run, inst, req) {
  if (req.weaponLevel !== undefined) return inst.level >= req.weaponLevel;
  if (req.passive) {
    const p = findPassive(run.player, req.passive);
    return !!p && p.level >= (req.minLevel || 1);
  }
  if (req.enhance !== undefined) return inst.enhance >= req.enhance;
  if (req.starsteel !== undefined) return run.starsteel >= req.starsteel;
  if (req.title) return hasTitle(run, req.title);
  return false;
}

// [{ text, ok }] for each requirement, for the forge UI.
export function checklist(run, inst, recipe) {
  return recipe.requires.map((req) => ({ text: describe(req), ok: holds(run, inst, req) }));
}

export function canEvolve(run, inst, recipe) {
  return recipe.requires.every((req) => holds(run, inst, req));
}

// Turns the instance into the evolved weapon in place. The instance id (and so every forge
// modifier scoped to it: enhance levels, affixes) is kept; the old weapon's level modifiers
// are removed and it restarts at level 1 of the new weapon.
export function evolve(run, inst, recipe) {
  if (inst.weaponId !== recipe.from || !canEvolve(run, inst, recipe)) return { ok: false };
  for (const req of recipe.requires) if (req.starsteel !== undefined) run.starsteel -= req.starsteel;

  const def = WEAPONS[recipe.into];
  run.player.stats.removeBySource(`weapon:${inst.instanceId}:`);
  inst.weaponId = recipe.into;
  inst.def = def;
  inst.level = 1;
  inst.tags = makeTags([...def.tags, inst.instanceTag]);
  inst.trigT = def.triggers.map(() => 0);
  BEHAVIORS[def.behavior].init(inst, run);
  run.toast = { text: `${def.name} forged!`, ttl: 3.5 };
  return { ok: true, into: def };
}
