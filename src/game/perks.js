// Owned perks (docs/design-m10-m13.md §4). Each level is a set of modifiers with source
// `perk:<id>:<level>:` (trailing colon so ids and levels never prefix-match each other).

import { PERKS } from '../data/perks.js';

export function findPerk(player, id) {
  return player.perks.find((p) => p.id === id) || null;
}

// requires: AND of ORs (see data/perks.js). ctx = { ownedTags: Set, perks: Map(id -> level), classId }.
export function meetsRequires(requires, ctx) {
  for (let i = 0; i < requires.length; i++) {
    const any = requires[i];
    let ok = false;
    for (let k = 0; k < any.length && !ok; k++) {
      const parts = any[k].split(':');
      if (parts[0] === 'tag') ok = ctx.ownedTags.has(parts[1]);
      else if (parts[0] === 'perk') ok = (ctx.perks.get(parts[1]) || 0) >= (parts[2] ? Number(parts[2]) : 1);
      else if (parts[0] === 'class') ok = ctx.classId === parts[1];
    }
    if (!ok) return false;
  }
  return true;
}

function applyLevel(run, entry) {
  const def = entry.def;
  for (const m of def.levels[entry.level - 1]) {
    run.player.stats.add({ ...m, source: `perk:${entry.id}:${entry.level}:` });
  }
  if (def.rule) run.rules[def.rule.id] = def.rule.values[entry.level - 1];
}

export function addPerk(run, id) {
  const def = PERKS[id];
  if (!def) throw new Error(`Unknown perk "${id}"`);
  const p = run.player;
  if (findPerk(p, id)) return null;
  const entry = { id, def, level: 1 };
  p.perks.push(entry);
  applyLevel(run, entry);
  return entry;
}

export function levelUpPerk(run, entry) {
  if (entry.level >= entry.def.maxLevel) return false;
  entry.level++;
  applyLevel(run, entry);
  return true;
}
