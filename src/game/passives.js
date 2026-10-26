// Passive items owned by the player. Each level is a set of modifiers added to the stat block
// with source `passive:<id>:<level>`, so a whole passive can be removed by prefix.

import { PASSIVES } from '../data/passives.js';
import { SLOTS } from '../data/progression.js';

export function findPassive(player, id) {
  return player.passives.find((p) => p.id === id) || null;
}

function applyLevel(run, entry) {
  const mods = entry.def.levels[entry.level - 1];
  for (const m of mods) run.player.stats.add({ ...m, source: `passive:${entry.id}:${entry.level}` });
}

export function addPassive(run, id) {
  const def = PASSIVES[id];
  if (!def) throw new Error(`Unknown passive "${id}"`);
  const p = run.player;
  if (findPassive(p, id) || p.passives.length >= SLOTS.passives) return null;
  const entry = { id, def, level: 1 };
  p.passives.push(entry);
  applyLevel(run, entry);
  return entry;
}

export function canLevelUpPassive(entry) {
  return entry.level < entry.def.maxLevel;
}

export function levelUpPassive(run, entry) {
  if (!canLevelUpPassive(entry)) return false;
  entry.level++;
  applyLevel(run, entry);
  return true;
}
