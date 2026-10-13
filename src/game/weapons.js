// Weapon instances owned by the player: creation, levelling (as modifiers) and the per-tick
// update that hands each instance to its behavior.

import { WEAPONS } from '../data/weapons.js';
import { BEHAVIORS } from '../behaviors/index.js';
import { makeTags } from '../stats/stats.js';
import { updateIntervalTriggers } from './triggers.js';
import { SLOTS } from '../data/progression.js';

export const MAX_WEAPONS = SLOTS.weapons;

let nextInstance = 1;

// Applies a weapon definition's baseMods (its elemental identity) to the instance.
export function applyBaseMods(run, inst) {
  for (const m of inst.def.baseMods || []) {
    run.player.stats.add({ ...m, tags: [inst.instanceTag], source: `weapon:${inst.instanceId}:base:` });
  }
}

export function addWeapon(run, weaponId) {
  const def = WEAPONS[weaponId];
  if (!def) throw new Error(`Unknown weapon "${weaponId}"`);
  const p = run.player;
  if (p.weapons.length >= MAX_WEAPONS) return null;

  const instanceId = nextInstance++;
  const inst = {
    instanceId,
    weaponId,
    def,
    level: 1,
    enhance: 0,
    affixes: [],            // affix ids rolled by the forge
    extraTriggers: [],      // triggers granted by affixes
    reforges: 0,
    // read scope: the weapon's own tags plus a tag unique to this instance, so weapon-local
    // upgrades (levels, forge) and global ones flow through the same stat math
    tags: makeTags([...def.tags, `weapon:${instanceId}`]),
    instanceTag: `weapon:${instanceId}`,
    cd: 0,
    trigT: def.triggers.map(() => 0),     // interval-trigger timers
  };
  p.weapons.push(inst);
  applyBaseMods(run, inst);
  BEHAVIORS[def.behavior].init(inst, run);
  return inst;
}

export function canLevelUp(inst) {
  return inst.level < inst.def.maxLevel;
}

// Applies the next level's modifiers. Level N+1 uses levels[N - 1].
export function levelUpWeapon(run, inst) {
  if (!canLevelUp(inst)) return false;
  const mods = inst.def.levels[inst.level - 1];
  inst.level++;
  for (const m of mods) {
    run.player.stats.add({ ...m, tags: [inst.instanceTag], source: `weapon:${inst.instanceId}:${inst.level}` });
  }
  return true;
}

export function updateWeapons(run, dt) {
  const ws = run.player.weapons;
  for (let i = 0; i < ws.length; i++) {
    const inst = ws[i];
    BEHAVIORS[inst.def.behavior].update(inst, dt, run);
    if (inst.trigT.length) updateIntervalTriggers(run, inst, dt);
  }
}
