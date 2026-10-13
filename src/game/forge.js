// Forge rules (docs/architecture.md §6.5): enhance, reforge, salvage. No DOM here; the forge
// overlay (ui/forge.js) calls these and shows the result. All forge modifiers go into the
// player's StatBlock scoped to the weapon (tags: [inst.instanceTag]) with sources
//   forge:<instanceId>:enh:<n>:...   one per enhance level
//   forge:<instanceId>:affix:<id>    one per affix
// so removing them is a prefix removal (trailing ':' keeps :1: and :10: apart).
//
// INVARIANT (tested): no outcome of a failed enhance removes the weapon. Only salvage does.

import { ENHANCE, REFORGE, SALVAGE, AFFIXES } from '../data/forge.js';
import { RARITIES } from '../data/rarities.js';
import { CLASSES } from '../data/classes.js';
import { onMilestone } from './titles.js';

const enhSource = (inst, n) => `forge:${inst.instanceId}:enh:${n}:`;

export function enhanceCost(run, inst) {
  const base = ENHANCE.cost[inst.enhance];
  const mult = (CLASSES[run.player.classId].forge || {}).costMult || 1;
  return Math.max(1, Math.ceil(base * mult));
}

export function enhanceChance(inst) {
  return ENHANCE.success[inst.enhance];
}

// Chance that a failure loses an enhance level (0 at or below the threshold).
export function downgradeChance(run, inst) {
  if (inst.enhance <= ENHANCE.downgradeAbove) return 0;
  const luck = run.player.stats.get('luck');
  const protect = Math.min(0.5, Math.max(0, luck) * ENHANCE.luckProtect);
  return ENHANCE.downgradeChance * (1 - protect);
}

export function canEnhance(run, inst) {
  return inst.enhance < ENHANCE.maxLevel && run.ore >= enhanceCost(run, inst);
}

function addEnhanceMods(run, inst, level) {
  const bp = (inst.def.forge && inst.def.forge.breakpoints && inst.def.forge.breakpoints[level]) || ENHANCE.breakpoints[level];
  const stats = run.player.stats;
  for (const m of ENHANCE.perLevel) stats.add({ ...m, tags: [inst.instanceTag], source: enhSource(inst, level) + 'level' });
  if (bp) for (const m of bp) stats.add({ ...m, tags: [inst.instanceTag], source: enhSource(inst, level) + 'bp' });
}

// Spends ore and rolls. Returns { ok, outcome: 'success' | 'fail' | 'downgrade', cost, level }.
// ok is false (nothing spent) when the action isn't possible.
export function enhance(run, inst) {
  if (!canEnhance(run, inst)) return { ok: false, outcome: 'blocked', cost: 0, level: inst.enhance };
  const cost = enhanceCost(run, inst);
  run.ore -= cost;
  if (run.rng.next() < enhanceChance(inst)) {
    inst.enhance++;
    addEnhanceMods(run, inst, inst.enhance);
    onMilestone(run, 'enhance', inst.enhance);
    return { ok: true, outcome: 'success', cost, level: inst.enhance };
  }
  // failure: the ore is lost; above the threshold one enhance level may be lost too
  if (run.rng.next() < downgradeChance(run, inst)) {
    run.player.stats.removeBySource(enhSource(inst, inst.enhance));
    inst.enhance--;
    return { ok: true, outcome: 'downgrade', cost, level: inst.enhance };
  }
  return { ok: true, outcome: 'fail', cost, level: inst.enhance };
}

// ---- reforge -------------------------------------------------------------------------------

export function reforgeCost(inst) {
  return REFORGE.cost + REFORGE.costPerReforge * (inst.reforges || 0);
}

export function canReforge(run, inst) {
  return run.ore >= reforgeCost(inst);
}

// Affixes this weapon is allowed to roll.
export function eligibleAffixes(inst) {
  return Object.keys(AFFIXES).filter((id) => {
    const req = AFFIXES[id].requires;
    return !req || req.some((t) => inst.def.tags.includes(t));
  });
}

function clearAffixes(run, inst) {
  run.player.stats.removeBySource(`forge:${inst.instanceId}:affix:`);
  inst.affixes = [];
  inst.extraTriggers = [];
}

// Rerolls all affixes: 1 at common up to 3 at epic, distinct, weighted by rarity.
export function reforge(run, inst) {
  if (!canReforge(run, inst)) return { ok: false, affixes: inst.affixes };
  run.ore -= reforgeCost(inst);
  inst.reforges = (inst.reforges || 0) + 1;
  clearAffixes(run, inst);

  const pool = eligibleAffixes(inst);
  const want = Math.min(REFORGE.affixCount[inst.def.rarity] || 1, pool.length);
  for (let n = 0; n < want; n++) {
    const id = run.rng.weighted(pool, (a) => RARITIES[AFFIXES[a].rarity].weight);
    pool.splice(pool.indexOf(id), 1);
    const a = AFFIXES[id];
    for (const m of a.mods || []) {
      run.player.stats.add({ ...m, tags: [inst.instanceTag], source: `forge:${inst.instanceId}:affix:${id}` });
    }
    if (a.triggers) inst.extraTriggers.push(...a.triggers);
    inst.affixes.push(id);
  }
  return { ok: true, affixes: inst.affixes };
}

// ---- salvage -------------------------------------------------------------------------------

export function salvageValue(inst) {
  return SALVAGE.base + SALVAGE.perLevel * inst.level + SALVAGE.perEnhance * inst.enhance;
}

// You can't salvage your last weapon (you'd be defenceless).
export function canSalvage(run) {
  return run.player.weapons.length > 1;
}

export function salvage(run, inst) {
  if (!canSalvage(run)) return { ok: false, ore: 0 };
  const p = run.player;
  p.stats.removeBySource(`weapon:${inst.instanceId}:`);
  p.stats.removeBySource(`forge:${inst.instanceId}:`);
  p.weapons.splice(p.weapons.indexOf(inst), 1);
  const ore = salvageValue(inst);
  run.ore += ore;
  return { ok: true, ore };
}
