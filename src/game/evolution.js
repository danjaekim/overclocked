// Evolutions (docs/architecture.md §5.5): checking recipes and executing the forge's Combine.

import { EVOLUTIONS } from '../data/evolutions.js';
import { WEAPONS } from '../data/weapons.js';
import { BEHAVIORS } from '../behaviors/index.js';
import { instanceTagSet } from './weapons.js';
import { PASSIVES } from '../data/passives.js';
import { TITLES } from '../data/titles.js';
import { applyBaseMods } from './weapons.js';
import { refreshResonance } from './resonance.js';
import { findPassive } from './passives.js';
import { findPerk } from './perks.js';
import { PERKS } from '../data/perks.js';
import { markGone } from './run-stats.js';
import { hasTitle } from './titles.js';

// Recipes this weapon takes part in: as the weapon that evolves, or (fusions) as the partner.
export function recipesFor(inst) {
  return EVOLUTIONS.filter((r) => r.from === inst.weaponId || r.with === inst.weaponId);
}

// The instances a recipe works on: a is the `from` weapon, b the fusion partner (null otherwise).
// Either is null when you don't own it.
export function pair(run, recipe) {
  const ws = run.player.weapons;
  const a = ws.find((w) => w.weaponId === recipe.from) || null;
  const b = recipe.with ? ws.find((w) => w.weaponId === recipe.with && w !== a) || null : null;
  return { a, b };
}

export function describe(req, recipe) {
  if (req.weaponLevel !== undefined) {
    return recipe && recipe.with ? `${WEAPONS[recipe.from].name} and ${WEAPONS[recipe.with].name} at level ${req.weaponLevel}` : `Weapon level ${req.weaponLevel}`;
  }
  if (req.perk) return `${PERKS[req.perk].name} ${req.minLevel > 1 ? `Lv ${req.minLevel}` : ''}`.trim() + ' (technique)';
  if (req.passive) return `${PASSIVES[req.passive].name} ${req.minLevel > 1 ? `Lv ${req.minLevel}` : ''}`.trim();
  if (req.enhance !== undefined) return `Enhanced to +${req.enhance}`;
  if (req.starsteel !== undefined) return `${req.starsteel} starsteel`;
  if (req.title) return `Title: ${TITLES[req.title].name}`;
  return '?';
}

function holds(run, inst, req, recipe) {
  if (req.weaponLevel !== undefined) {
    if (recipe && recipe.with) {
      const { a, b } = pair(run, recipe);
      return !!a && !!b && a.level >= req.weaponLevel && b.level >= req.weaponLevel;
    }
    return inst.level >= req.weaponLevel;
  }
  if (req.perk) {
    const k = findPerk(run.player, req.perk);
    return !!k && k.level >= (req.minLevel || 1);
  }
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
  const list = recipe.requires.map((req) => ({ text: describe(req, recipe), ok: holds(run, inst, req, recipe) }));
  if (recipe.with) {                                   // a fusion also needs both weapons in hand
    const { a, b } = pair(run, recipe);
    list.unshift({ text: `Own ${WEAPONS[recipe.from].name} and ${WEAPONS[recipe.with].name}`, ok: !!a && !!b });
  }
  return list;
}

export function canEvolve(run, inst, recipe) {
  if (recipe.with) {
    const { a, b } = pair(run, recipe);
    if (!a || !b) return false;
  } else if (inst.weaponId !== recipe.from) {
    return false;
  }
  return recipe.requires.every((req) => holds(run, inst, req, recipe));
}

// Turns the instance into the evolved weapon in place. The instance id (and so every forge
// modifier scoped to it: enhance levels, affixes) is kept; the old weapon's level modifiers
// are removed and it restarts at level 1 of the new weapon.
export function evolve(run, clicked, recipe) {
  if (!canEvolve(run, clicked, recipe)) return { ok: false };
  const { a: inst, b: partner } = pair(run, recipe);
  for (const req of recipe.requires) if (req.starsteel !== undefined) run.starsteel -= req.starsteel;
  if (partner) {                                       // fusion: the partner is consumed
    const p = run.player;
    inst.quench = (inst.quench || 0) + (partner.quench || 0);          // its Quench charges are kept
    p.stats.removeBySource(`weapon:${partner.instanceId}:`);
    p.stats.removeBySource(`forge:${partner.instanceId}:`);
    p.weapons.splice(p.weapons.indexOf(partner), 1);
    markGone(run, partner);
  }

  const def = WEAPONS[recipe.into];
  run.player.stats.removeBySource(`weapon:${inst.instanceId}:`);
  inst.weaponId = recipe.into;
  inst.def = def;
  inst.level = 1;
  inst.tags = instanceTagSet(inst);
  inst.trigT = def.triggers.map(() => 0);
  applyBaseMods(run, inst);
  BEHAVIORS[def.behavior].init(inst, run);
  refreshResonance(run);
  run.toast = { text: partner ? `${def.name} fused!` : `${def.name} forged!`, ttl: 3.5 };
  return { ok: true, into: def };
}
