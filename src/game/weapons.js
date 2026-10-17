// Weapon instances owned by the player: creation, levelling (as modifiers) and the per-tick
// update that hands each instance to its behavior.

import { WEAPONS } from '../data/weapons.js';
import { BEHAVIORS } from '../behaviors/index.js';
import { makeTags } from '../stats/stats.js';
import { updateIntervalTriggers } from './triggers.js';
import { SLOTS } from '../data/progression.js';
import { refreshResonance } from './resonance.js';

export const MAX_WEAPONS = SLOTS.weapons;

let nextInstance = 1;

// Weapon instance ids count up across the whole session; run snapshots save and restore the counter.
export const getInstanceCounter = () => nextInstance;
export const setInstanceCounter = (n) => { nextInstance = n; };

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
    star: false,            // starforged: one behavior mutation (game/starforge.js)
    quench: 0,              // Star Quench charges: each makes the next enhance attempt certain (game/forge.js)
    affixes: [],            // affix ids rolled by the forge
    extraTriggers: [],      // triggers granted by affixes
    reforges: 0,
    tempers: {},            // chosen tempers by enhance level: { 5: temperDef } (game/forge.js)
    pendingTemper: 0,       // enhance level (5 or 10) whose temper has not been chosen yet
    pendingReforge: null,   // { slot, options: [affixId] } rolled and paid for, not yet picked
    addTags: [],            // element tags gained from affixes and tempers
    // read scope: the weapon's own tags plus a tag unique to this instance, so weapon-local
    // upgrades (levels, forge) and global ones flow through the same stat math
    tags: makeTags([...def.tags, `weapon:${instanceId}`]),
    instanceTag: `weapon:${instanceId}`,
    fusion: null,            // { id, name, donorId, tags, triggers, hooks } once fused (game/fusion.js)
    cd: 0,
    trigT: def.triggers.map(() => 0),     // interval-trigger timers
  };
  p.weapons.push(inst);
  applyBaseMods(run, inst);
  BEHAVIORS[def.behavior].init(inst, run);
  refreshResonance(run);
  return inst;
}

// A weapon's tag scope: its own tags, any it gained from affixes/tempers (infusions), and the
// per-instance tag. Rebuild whenever those change (game/forge.js#syncTags).
export function instanceTagSet(inst) {
  return makeTags([...inst.def.tags, ...inst.addTags, inst.instanceTag]);
}

// The name to show for a weapon: a fused weapon carries its masterwork (or generic fusion) name.
export function weaponName(inst) {
  return inst.fusion ? inst.fusion.name : inst.def.name;
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
