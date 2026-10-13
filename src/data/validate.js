// Boot-time schema checks for all data files (docs/architecture.md §5). Returns a list of
// problems (empty = OK). main.js throws on problems in ?debug=1 and logs them otherwise;
// tests assert it is empty. Extend this whenever a data file or schema rule is added.

import { STATS } from '../stats/stat-defs.js';
import { CONDITIONS } from '../stats/conditions.js';
import { BEHAVIORS } from '../behaviors/index.js';
import { WEAPONS } from './weapons.js';
import { PASSIVES } from './passives.js';
import { RARITIES } from './rarities.js';
import { CLASSES } from './classes.js';
import { ENEMIES } from './enemies.js';
import { RUN, WAVES } from './waves.js';

const OPS = new Set(['flat', 'inc', 'more', 'set']);

function checkMods(mods, where, problems) {
  if (!Array.isArray(mods)) {
    problems.push(`${where}: modifiers must be an array`);
    return;
  }
  mods.forEach((m, i) => {
    const at = `${where}[${i}]`;
    if (!STATS[m.stat]) problems.push(`${at}: unknown stat "${m.stat}"`);
    if (!OPS.has(m.op)) problems.push(`${at}: unknown op "${m.op}"`);
    if (typeof m.value !== 'number' || Number.isNaN(m.value)) problems.push(`${at}: value must be a number`);
    if (m.when && !CONDITIONS[m.when]) problems.push(`${at}: unknown condition "${m.when}"`);
    if (m.tags !== undefined && !Array.isArray(m.tags)) problems.push(`${at}: tags must be an array`);
  });
}

export function validateData() {
  const problems = [];

  for (const [id, w] of Object.entries(WEAPONS)) {
    const at = `weapon ${id}`;
    if (!BEHAVIORS[w.behavior]) problems.push(`${at}: unknown behavior "${w.behavior}"`);
    if (!Array.isArray(w.tags)) problems.push(`${at}: tags must be an array`);
    if (!(w.maxLevel >= 1)) problems.push(`${at}: maxLevel must be >= 1`);
    if (!w.base) problems.push(`${at}: missing base`);
    if (w.levels.length !== w.maxLevel - 1) {
      problems.push(`${at}: levels.length (${w.levels.length}) must equal maxLevel - 1 (${w.maxLevel - 1})`);
    }
    if (w.levelText.length !== w.levels.length) {
      problems.push(`${at}: levelText.length (${w.levelText.length}) must equal levels.length (${w.levels.length})`);
    }
    w.levels.forEach((mods, i) => checkMods(mods, `${at} level ${i + 2}`, problems));
  }

  for (const [id, w] of Object.entries(WEAPONS)) {
    if (!RARITIES[w.rarity]) problems.push(`weapon ${id}: unknown rarity "${w.rarity}"`);
  }

  for (const [id, p] of Object.entries(PASSIVES)) {
    const at = `passive ${id}`;
    if (!RARITIES[p.rarity]) problems.push(`${at}: unknown rarity "${p.rarity}"`);
    if (!(p.maxLevel >= 1)) problems.push(`${at}: maxLevel must be >= 1`);
    if (p.levels.length !== p.maxLevel) {
      problems.push(`${at}: levels.length (${p.levels.length}) must equal maxLevel (${p.maxLevel})`);
    }
    if (p.levelText.length !== p.levels.length) {
      problems.push(`${at}: levelText.length (${p.levelText.length}) must equal levels.length (${p.levels.length})`);
    }
    p.levels.forEach((mods, i) => checkMods(mods, `${at} level ${i + 1}`, problems));
  }

  for (const [id, c] of Object.entries(CLASSES)) {
    const at = `class ${id}`;
    if (!WEAPONS[c.startWeapon]) problems.push(`${at}: unknown startWeapon "${c.startWeapon}"`);
    checkMods(c.mods, `${at} mods`, problems);
  }

  for (const [id, e] of Object.entries(ENEMIES)) {
    const at = `enemy ${id}`;
    for (const k of ['hp', 'speed', 'damage', 'radius']) {
      if (!(e[k] > 0)) problems.push(`${at}: ${k} must be > 0`);
    }
    if (!e.color) problems.push(`${at}: missing color`);
  }

  if (!(RUN.length > 0 && RUN.designLength > 0)) problems.push('RUN: length and designLength must be > 0');
  let t = 0;
  WAVES.forEach((seg, i) => {
    const at = `wave ${i}`;
    if (seg.from !== t) problems.push(`${at}: starts at ${seg.from} but the previous segment ended at ${t}`);
    if (!(seg.to > seg.from)) problems.push(`${at}: "to" must be after "from"`);
    for (const s of seg.spawns) {
      if (!ENEMIES[s.enemy]) problems.push(`${at}: unknown enemy "${s.enemy}"`);
    }
    t = seg.to;
  });
  if (t < RUN.designLength) problems.push(`WAVES end at ${t}, before RUN.designLength (${RUN.designLength})`);

  return problems;
}
