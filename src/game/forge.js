// Forge rules (docs/architecture.md §6.5): enhance, reforge, salvage. No DOM here; the forge
// overlay (ui/forge.js) calls these and shows the result. All forge modifiers go into the
// player's StatBlock scoped to the weapon (tags: [inst.instanceTag]) with sources
//   forge:<instanceId>:enh:<n>:...   one per enhance level
//   forge:<instanceId>:temper:<n>:   the temper chosen at +5 / +10
//   forge:<instanceId>:affix:<id>:   one per affix
// so removing them is a prefix removal (trailing ':' keeps :1: and :10: apart).
//
// INVARIANT (tested): no outcome of a failed enhance removes the weapon. Only salvage does.

import { markGone } from './run-stats.js';
import { ENHANCE, REFORGE, SALVAGE, AFFIXES, QUENCH } from '../data/forge.js';
import { instanceTagSet } from './weapons.js';
import { refreshResonance } from './resonance.js';
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

// ---- star quench (M39) ----------------------------------------------------------------------

// Charges one purchase would give at this weapon's current enhance level (0 = cannot be bought).
export function quenchCharges(inst) {
  if (inst.enhance >= ENHANCE.maxLevel) return 0;
  for (const [from, n] of QUENCH.bands) if (inst.enhance >= from) return n;
  return 0;
}

export function canQuench(run, inst) {
  const n = quenchCharges(inst);
  return n > 0 && run.starsteel >= QUENCH.cost && (inst.quench || 0) < QUENCH.maxCharges;
}

// Spends starsteel for charges. Returns { ok, charges, total }.
export function quench(run, inst) {
  if (!canQuench(run, inst)) return { ok: false, charges: 0, total: inst.quench || 0 };
  const n = Math.min(quenchCharges(inst), QUENCH.maxCharges - (inst.quench || 0));
  run.starsteel -= QUENCH.cost;
  inst.quench = (inst.quench || 0) + n;
  return { ok: true, charges: n, total: inst.quench };
}

// The odds the next attempt really has (a charge makes it certain).
export function enhanceOdds(inst) {
  return (inst.quench || 0) > 0 ? 1 : enhanceChance(inst);
}

export function canEnhance(run, inst) {
  return inst.enhance < ENHANCE.maxLevel && !inst.pendingTemper && run.ore >= enhanceCost(run, inst);
}

function addEnhanceMods(run, inst, level) {
  const bp = (inst.def.forge && inst.def.forge.breakpoints && inst.def.forge.breakpoints[level]) || ENHANCE.breakpoints[level];
  const stats = run.player.stats;
  for (const m of ENHANCE.perLevel) stats.add({ ...m, tags: [inst.instanceTag], source: enhSource(inst, level) + 'level' });
  const ts = run.trait && run.trait.temperedSteel;                  // Smith: each enhance level is worth more
  if (ts) stats.add({ stat: 'damage', op: 'inc', value: ts.damage, tags: [inst.instanceTag], source: enhSource(inst, level) + 'smith' });
  if (bp) for (const m of bp) stats.add({ ...m, tags: [inst.instanceTag], source: enhSource(inst, level) + 'bp' });
  if (temperOptions(inst, level)) inst.pendingTemper = level;       // +5 and +10: the player now chooses
}

// ---- tempers -------------------------------------------------------------------------------

const temperSource = (inst, level) => `forge:${inst.instanceId}:temper:${level}:`;

// The two temper choices for this weapon at that enhance level (its own, else the generic pair).
export function temperOptions(inst, level) {
  const own = inst.def.forge && inst.def.forge.tempers && inst.def.forge.tempers[level];
  return own || ENHANCE.tempers[level] || null;
}

// Commits one of the two tempers for the pending level.
export function chooseTemper(run, inst, index) {
  const level = inst.pendingTemper;
  const opts = level ? temperOptions(inst, level) : null;
  if (!opts || !opts[index]) return { ok: false };
  const t = opts[index];
  for (const m of t.mods) run.player.stats.add({ ...m, tags: [inst.instanceTag], source: temperSource(inst, level) });
  inst.tempers[level] = t;
  inst.pendingTemper = 0;
  syncTags(run, inst);
  return { ok: true, temper: t };
}

// Recomputes the weapon's gained element tags from its affixes and tempers, rebuilds its tag scope,
// and refreshes resonance, because a new tag can complete (or break) a set.
export function syncTags(run, inst) {
  const tags = [];
  for (const id of inst.affixes) for (const t of AFFIXES[id].addTags || []) tags.push(t);
  for (const t of Object.values(inst.tempers)) for (const x of t.addTags || []) tags.push(x);
  if (inst.fusion) tags.push(...inst.fusion.tags);                 // the donor's elements
  inst.addTags = [...new Set(tags)];
  inst.tags = instanceTagSet(inst);
  refreshResonance(run);
}

// Spends ore and rolls. Returns { ok, outcome: 'success' | 'fail' | 'downgrade', cost, level, quenched }.
// ok is false (nothing spent) when the action isn't possible.
export function enhance(run, inst) {
  if (!canEnhance(run, inst)) return { ok: false, outcome: 'blocked', cost: 0, level: inst.enhance };
  const cost = enhanceCost(run, inst);
  run.ore -= cost;
  const quenched = (inst.quench || 0) > 0;              // a Star Quench charge: certain, no roll, no downgrade
  if (quenched) inst.quench--;
  if (quenched || run.rng.next() < enhanceChance(inst)) {
    inst.enhance++;
    addEnhanceMods(run, inst, inst.enhance);
    onMilestone(run, 'enhance', inst.enhance);
    return { ok: true, outcome: 'success', cost, level: inst.enhance, quenched };
  }
  // failure: the ore is lost; above the threshold one enhance level may be lost too
  if (run.rng.next() < downgradeChance(run, inst)) {
    run.player.stats.removeBySource(enhSource(inst, inst.enhance));
    if (inst.tempers[inst.enhance]) {                   // losing +5 / +10 takes its temper with it
      run.player.stats.removeBySource(temperSource(inst, inst.enhance));
      delete inst.tempers[inst.enhance];
      syncTags(run, inst);
    }
    if (inst.pendingTemper === inst.enhance) inst.pendingTemper = 0;
    inst.enhance--;
    return { ok: true, outcome: 'downgrade', cost, level: inst.enhance };
  }
  return { ok: true, outcome: 'fail', cost, level: inst.enhance };
}

// ---- reforge: one slot at a time, pick one of three ---------------------------------------

export function reforgeCost(inst) {
  return REFORGE.cost + REFORGE.costPerReforge * (inst.reforges || 0);
}

// How many affix slots this weapon has (by rarity).
export function slotCount(inst) {
  return REFORGE.affixCount[inst.def.rarity] || 1;
}

// [{ index, affixId | null }] for every slot; an empty slot has affixId null.
export function reforgeSlots(inst) {
  const out = [];
  for (let i = 0; i < slotCount(inst); i++) out.push({ index: i, affixId: inst.affixes[i] || null });
  return out;
}

export function canReforge(run, inst) {
  return !inst.pendingReforge && run.ore >= reforgeCost(inst);
}

// Affixes this weapon is allowed to have: `requires` is checked against its CURRENT tags
// (including ones gained from other affixes and tempers).
export function eligibleAffixes(inst) {
  return Object.keys(AFFIXES).filter((id) => {
    const req = AFFIXES[id].requires;
    return !req || req.some((t) => inst.tags.set.has(t));
  });
}

// Rebuilds every affix modifier, trigger and gained tag from inst.affixes. Simple and exact, so
// replacing one slot can never leave stale modifiers behind.
export function rebuildAffixes(run, inst) {
  const stats = run.player.stats;
  stats.removeBySource(`forge:${inst.instanceId}:affix:`);
  inst.extraTriggers = inst.fusion ? [...inst.fusion.triggers] : [];     // a fusion's triggers survive a reforge
  for (const id of inst.affixes) {
    const a = AFFIXES[id];
    for (const m of a.mods || []) stats.add({ ...m, tags: [inst.instanceTag], source: `forge:${inst.instanceId}:affix:${id}:` });
    if (a.triggers) inst.extraTriggers.push(...a.triggers);
  }
  syncTags(run, inst);
}

// Pays for a reforge of one slot and rolls the options. Returns { ok, slot, options }. The options
// stay on the weapon until picked (or kept), so closing the forge never gives a free reroll.
export function rollReforge(run, inst, slot) {
  if (!canReforge(run, inst) || slot < 0 || slot >= slotCount(inst) || slot > inst.affixes.length) {
    return { ok: false, options: [] };
  }
  run.ore -= reforgeCost(inst);
  inst.reforges = (inst.reforges || 0) + 1;

  const others = inst.affixes.filter((_, i) => i !== slot);
  const hasInfusion = others.some((id) => AFFIXES[id].infusion);
  let pool = eligibleAffixes(inst).filter((id) => !others.includes(id) && !(hasInfusion && AFFIXES[id].infusion));
  const weight = (id) => RARITIES[AFFIXES[id].rarity].weight;
  const options = [];
  const want = Math.min(REFORGE.options, pool.length);
  while (options.length < want) {
    const id = run.rng.weighted(pool, weight);
    pool = pool.filter((x) => x !== id);
    options.push(id);
  }
  // at least one option is uncommon or better, when the pool has one
  const good = (id) => AFFIXES[id].rarity !== 'common';
  if (options.length && !options.some(good)) {
    const better = pool.filter(good);
    if (better.length) options[options.length - 1] = run.rng.weighted(better, weight);
  }
  inst.pendingReforge = { slot, options };
  return { ok: true, slot, options };
}

// Commits one option into the rolled slot (replacing what was there).
export function applyReforge(run, inst, index) {
  const pending = inst.pendingReforge;
  if (!pending || !pending.options[index]) return { ok: false };
  const id = pending.options[index];
  inst.affixes[pending.slot] = id;
  inst.pendingReforge = null;
  rebuildAffixes(run, inst);
  return { ok: true, affix: id };
}

// Declines all options: the slot keeps what it had. The ore stays spent.
export function keepCurrent(inst) {
  inst.pendingReforge = null;
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
  markGone(run, inst);
  refreshResonance(run);
  const ore = salvageValue(inst);
  run.ore += ore;
  return { ok: true, ore };
}
