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

const ELEMENTS = ['fire', 'frost', 'storm'];

// Each weapon of an entry for display: tier (rarity) and type decide its icon colour and shape; the forge marks
// (+level, starforged, legendary) come from the stored gear, if the entry has it.
export function weaponTiles(e) {
  const left = (e.fusions || []).slice();
  return e.weapons.map(([id, lvl], i) => {
    const def = WEAPONS[id];
    const fi = left.findIndex((g) => g[0] === id);
    const fused = fi >= 0 ? left.splice(fi, 1)[0] : null;
    const g = (e.gear && e.gear[i]) || [0, 0, 0, 0, 0];
    const tags = def ? def.tags : [];
    return {
      id, lvl,
      name: fused ? fused[3] : def ? def.name : id,
      glyph: def ? def.glyph : '?',
      tier: fused ? 'fused' : def ? def.rarity : 'common',
      type: tags.includes('close') ? 'close' : def && def.behavior === 'summon' ? 'summon' : 'ranged',
      elements: ELEMENTS.filter((x) => tags.includes(x)),
      enhance: g[0], star: !!g[1], tempers: g[2], effects: g[3], legendary: !!g[4],
    };
  });
}

const nameOf = (table, id) => (table[id] ? table[id].name : id);

export function className(id) {
  return nameOf(CLASSES, id);
}

// An entry's build as { weapons, passives, perks, titles } of display strings ("Forge Hammer 5").
export function buildNames(e) {
  const fmt = (table) => ([id, lvl]) => `${nameOf(table, id)} ${lvl}`;
  const fusions = (e.fusions || []).map(([host, donor, , name]) => ({ host, donor, name, text: `${name}: ${nameOf(WEAPONS, host)} + ${nameOf(WEAPONS, donor)}` }));
  const left = fusions.slice();
  // a fused weapon is listed under its fusion name ("Black Sun 7"), and the fusions get their own line
  const weapons = e.weapons.map(([id, lvl]) => {
    const i = left.findIndex((g) => g.host === id);
    if (i < 0) return `${nameOf(WEAPONS, id)} ${lvl}`;
    return `${left.splice(i, 1)[0].name} ${lvl}`;
  });
  return {
    fusions: fusions.map((g) => g.text),
    weapons,
    passives: e.passives.map(fmt(PASSIVES)),
    perks: e.perks.map(fmt(PERKS)),
    titles: e.titles.map((id) => nameOf(TITLES, id)),
  };
}
