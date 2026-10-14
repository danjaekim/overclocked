// Run history model (M17): filtering, totals and display names for the stored entries. Pure, so it is
// tested without a DOM; ui/history.js renders it.

import { CLASSES } from '../data/classes.js';
import { WEAPONS } from '../data/weapons.js';
import { PASSIVES } from '../data/passives.js';
import { PERKS } from '../data/perks.js';
import { TITLES } from '../data/titles.js';

// Newest first, optionally one class and/or wins only.
export function filterHistory(history, { cls, winsOnly } = {}) {
  return history.filter((e) => (!cls || e.cls === cls) && (!winsOnly || e.won)).slice().reverse();
}

// Classes that appear in the history, in the class list's own order.
export function classesIn(history) {
  const seen = new Set(history.map((e) => e.cls));
  return Object.keys(CLASSES).filter((id) => seen.has(id));
}

export function summarize(list) {
  const n = list.length;
  const wins = list.filter((e) => e.won).length;
  const sum = (k) => list.reduce((a, e) => a + e[k], 0);
  return {
    runs: n,
    wins,
    winRate: n ? wins / n : 0,
    avgLevel: n ? sum('level') / n : 0,
    avgKills: n ? sum('kills') / n : 0,
    bestTime: n ? Math.max(...list.map((e) => e.time)) : 0,
    bestKills: n ? Math.max(...list.map((e) => e.kills)) : 0,
    bestLevel: n ? Math.max(...list.map((e) => e.level)) : 0,
  };
}

const nameOf = (table, id) => (table[id] ? table[id].name : id);

export function className(id) {
  return nameOf(CLASSES, id);
}

// An entry's build as { weapons, passives, perks, titles } of display strings ("Forge Hammer 5").
export function buildNames(e) {
  const fmt = (table) => ([id, lvl]) => `${nameOf(table, id)} ${lvl}`;
  const grafts = (e.grafts || []).map(([host, donor, , name]) => ({ host, donor, name, text: `${name}: ${nameOf(WEAPONS, host)} + ${nameOf(WEAPONS, donor)}` }));
  const left = grafts.slice();
  // a grafted weapon is listed under its graft name ("Black Sun 7"), and the grafts get their own line
  const weapons = e.weapons.map(([id, lvl]) => {
    const i = left.findIndex((g) => g.host === id);
    if (i < 0) return `${nameOf(WEAPONS, id)} ${lvl}`;
    return `${left.splice(i, 1)[0].name} ${lvl}`;
  });
  return {
    grafts: grafts.map((g) => g.text),
    weapons,
    passives: e.passives.map(fmt(PASSIVES)),
    perks: e.perks.map(fmt(PERKS)),
    titles: e.titles.map((id) => nameOf(TITLES, id)),
  };
}
