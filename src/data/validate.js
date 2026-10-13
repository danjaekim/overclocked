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
import { EFFECTS } from '../effects/index.js';
import { RUN, WAVES, EVENTS } from './waves.js';
import { RUN_EVENTS } from '../game/run-events.js';
import { ENHANCE, REFORGE, AFFIXES, SHRINE } from './forge.js';
import { ORES } from './ores.js';
import { EVOLUTIONS } from './evolutions.js';
import { TITLES } from './titles.js';

const OPS = new Set(['flat', 'inc', 'more', 'set']);
// Events the dispatcher fires so far; the rest of the §4.6 list arrives with the systems that raise them.
const TRIGGER_EVENTS = new Set(['hit', 'crit', 'kill', 'interval']);

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
    if (!Array.isArray(w.triggers)) problems.push(`${at}: triggers must be an array`);
    else {
      w.triggers.forEach((t, i) => {
        const ta = `${at} trigger ${i}`;
        if (!TRIGGER_EVENTS.has(t.on)) problems.push(`${ta}: unknown event "${t.on}"`);
        if (!EFFECTS[t.effect]) problems.push(`${ta}: unknown effect "${t.effect}"`);
        if (t.on === 'interval' && !(t.every > 0)) problems.push(`${ta}: interval needs every > 0`);
        if (t.chance !== undefined && !(t.chance >= 0 && t.chance <= 1)) problems.push(`${ta}: chance must be 0..1`);
        if (t.minLevel !== undefined && !(t.minLevel >= 1 && t.minLevel <= w.maxLevel)) problems.push(`${ta}: minLevel out of range`);
        if (!t.params) problems.push(`${ta}: missing params`);
      });
    }
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
    if (e.ore && !ORES[e.ore.type]) problems.push(`${at}: unknown ore "${e.ore.type}"`);
    if (e.ore && !(e.ore.chance >= 0 && e.ore.chance <= 1)) problems.push(`${at}: ore chance must be 0..1`);
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

  let prev = -Infinity;
  EVENTS.forEach((ev, i) => {
    const at = `event ${i}`;
    if (!RUN_EVENTS[ev.event]) problems.push(`${at}: unknown event "${ev.event}"`);
    if (ev.event === 'boss' && !(ENEMIES[ev.enemy] && ENEMIES[ev.enemy].boss)) problems.push(`${at}: boss event needs an enemy with boss: true`);
    if (!(ev.at >= prev)) problems.push(`${at}: EVENTS must be sorted by "at"`);
    if (!(ev.at >= 0 && ev.at < RUN.designLength)) problems.push(`${at}: "at" must be within the run`);
    prev = ev.at;
  });

  const n = ENHANCE.maxLevel;
  if (ENHANCE.cost.length !== n) problems.push(`ENHANCE.cost must have ${n} entries`);
  if (ENHANCE.success.length !== n) problems.push(`ENHANCE.success must have ${n} entries`);
  if (!ENHANCE.success.every((c) => c > 0 && c <= 1)) problems.push('ENHANCE.success entries must be in (0, 1]');
  checkMods(ENHANCE.perLevel, 'ENHANCE.perLevel', problems);
  for (const [lvl, mods] of Object.entries(ENHANCE.breakpoints)) checkMods(mods, `ENHANCE breakpoint ${lvl}`, problems);
  for (const [id, w] of Object.entries(WEAPONS)) {
    const bps = (w.forge && w.forge.breakpoints) || {};
    for (const [lvl, mods] of Object.entries(bps)) checkMods(mods, `weapon ${id} forge breakpoint ${lvl}`, problems);
  }
  if (!(REFORGE.cost > 0)) problems.push('REFORGE.cost must be > 0');
  if (!(SHRINE.radius > 0 && SHRINE.channel > 0 && SHRINE.ttl > 0)) problems.push('SHRINE radius, channel and ttl must be > 0');
  for (const [id, a] of Object.entries(AFFIXES)) {
    const at = `affix ${id}`;
    if (!RARITIES[a.rarity]) problems.push(`${at}: unknown rarity "${a.rarity}"`);
    if (!a.mods && !a.triggers) problems.push(`${at}: needs mods or triggers`);
    if (a.mods) checkMods(a.mods, `${at} mods`, problems);
    for (const t of a.triggers || []) {
      if (!EFFECTS[t.effect]) problems.push(`${at}: unknown effect "${t.effect}"`);
      if (t.on === 'interval') problems.push(`${at}: affix triggers can't be interval (no timer is kept)`);
    }
  }

  for (const [id, e] of Object.entries(ENEMIES)) {
    if (e.ai === 'boss_charge' && !(e.charge && e.charge.every > 0 && e.charge.windup > 0 && e.charge.speed > 0 && e.charge.time > 0)) {
      problems.push(`enemy ${id}: boss_charge needs charge { every, windup, speed, time }`);
    }
  }

  for (const [id, w] of Object.entries(WEAPONS)) {
    if (w.evolvesInto && !WEAPONS[w.evolvesInto]) problems.push(`weapon ${id}: evolvesInto "${w.evolvesInto}" does not exist`);
    if (w.rarity === 'evolved' && w.pool !== false) problems.push(`weapon ${id}: evolved weapons must set pool: false`);
  }
  for (const r of EVOLUTIONS) {
    const at = `evolution ${r.id}`;
    if (!WEAPONS[r.from]) problems.push(`${at}: unknown from weapon "${r.from}"`);
    if (!WEAPONS[r.into]) problems.push(`${at}: unknown into weapon "${r.into}"`);
    else if (WEAPONS[r.into].pool !== false) problems.push(`${at}: the evolved weapon must set pool: false`);
    for (const q of r.requires) {
      if (q.passive && !PASSIVES[q.passive]) problems.push(`${at}: unknown passive "${q.passive}"`);
      if (q.title && !TITLES[q.title]) problems.push(`${at}: unknown title "${q.title}"`);
      if (q.passive && q.minLevel > PASSIVES[q.passive].maxLevel) problems.push(`${at}: minLevel above the passive's maxLevel`);
      if (q.weaponLevel > WEAPONS[r.from].maxLevel) problems.push(`${at}: weaponLevel above the weapon's maxLevel`);
    }
  }
  for (const [id, t] of Object.entries(TITLES)) {
    const at = `title ${id}`;
    if (!RARITIES[t.rarity]) problems.push(`${at}: unknown rarity "${t.rarity}"`);
    checkMods(t.mods, `${at} mods`, problems);
    if (!['offer', 'milestone'].includes(t.grant && t.grant.type)) problems.push(`${at}: grant.type must be offer or milestone`);
    if (t.grant.type === 'milestone' && !(t.grant.count > 0 && ['kills', 'enhance', 'boss'].includes(t.grant.event))) {
      problems.push(`${at}: milestone needs an event (kills|enhance|boss) and a count`);
    }
  }

  return problems;
}
