// Balance benchmark (docs/roadmap.md M9). Headless, deterministic, no dependencies.
//
//   node tools/bench.mjs                 everything (a few minutes)
//   node tools/bench.mjs --weapons       per-weapon damage tests only
//   node tools/bench.mjs --bots          bot runs only
//   node tools/bench.mjs --builds        the perk build table (docs/design-m10-m13.md section 5)
//   node tools/bench.mjs --quick         fewer bot seeds
//   node tools/bench.mjs --starforge    star vs no star DPS for every weapon (STAR_ONLY=id,id narrows it)
//   node tools/bench.mjs --masterworks   each masterwork at +15 with and without its star (MW_ONLY=id,id narrows it)
//   node tools/bench.mjs --classes       the same builds played by every class (class identity)
//   node tools/bench.mjs --dps          max-level DPS per weapon, single / pinned crowd / live crowd (DPS_IDS=id,id narrows it)
//   node tools/bench.mjs --tempers      generic temper DPS vs none, one weapon per behavior (M45a; TEMPER_SET / TEMPER_IDS)
//   --lib                                imported by another script (tools/*.mjs): run nothing, use the exports
//   node tools/bench.mjs --json          machine-readable output
//
// 1. Single-target DPS: one immobile dummy in range, one weapon at a time, at levels 1, 4, 8.
// 2. Crowd clear: 20 enemies (15 goblins, 5 brutes at 2x hp) converge on a stationary,
//    invulnerable player holding one weapon; reports kills after 10 s and 20 s.
// 3. Bot runs: a simple policy plays full runs per class (non-god) and reports level, kills,
//    survival and boss kills. The bot is crude (it strafes away from crowds and picks upgrades
//    greedily), so read it as a RELATIVE comparison between classes, not an absolute skill level.

import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon, levelUpWeapon, canLevelUp } from '../src/game/weapons.js';
import { WEAPONS } from '../src/data/weapons.js';
import { WAVES } from '../src/data/waves.js';
import { BUILDS as SHARED_BUILDS } from '../src/data/builds.js';
import { CLASSES } from '../src/data/classes.js';
import { ENEMIES } from '../src/data/enemies.js';
import { generateOffers } from '../src/game/upgrades.js';
import { offerState, applyOffer } from '../src/game/apply-offer.js';
import { recipesFor, canEvolve, evolve } from '../src/game/evolution.js';
import { enhance, canEnhance, chooseTemper, quench, canQuench, temperOptions, rebuildAffixes, eligibleAffixes } from '../src/game/forge.js';
import { canStarforge, starforge } from '../src/game/starforge.js';
import { MUTATIONS } from '../src/data/starforge.js';
if (process.env.SF_OVERRIDE) for (const [b, o] of Object.entries(JSON.parse(process.env.SF_OVERRIDE))) Object.assign(MUTATIONS[b], o);   // tuning sweeps without editing data
if (process.env.CLASS_OVERRIDE) for (const [c, o] of Object.entries(JSON.parse(process.env.CLASS_OVERRIDE))) {   // class tuning sweeps: {"archer":{"addMods":[{"stat":"maxHp","op":"flat","value":30}],"trait":{"dodge":{"chance":0.3}},"startWeapon":"x"}}
  if (o.addMods) CLASSES[c].mods.push(...o.addMods);
  if (o.trait) Object.assign(CLASSES[c].trait, o.trait);
  if (o.mods) CLASSES[c].mods = o.mods;
  if (o.dropTrait) for (const k of o.dropTrait) delete CLASSES[c].trait[k];
  if (o.startWeapon) CLASSES[c].startWeapon = o.startWeapon;
}
if (process.env.ENEMY_OVERRIDE) for (const [id, o] of Object.entries(JSON.parse(process.env.ENEMY_OVERRIDE))) {   // {"seer":{"hp":4000,"caster":{"damage":30}}}: one level of nesting is merged
  for (const [k, v] of Object.entries(o)) ENEMIES[id][k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...ENEMIES[id][k], ...v } : v;
}
if (process.env.WEAPON_OVERRIDE) for (const [id, o] of Object.entries(JSON.parse(process.env.WEAPON_OVERRIDE))) {   // {"ember_bow":{"base":{"cooldown":0.7},"triggers":[...],"levels":[...]}}
  const w = WEAPONS[id];
  if (o.base) Object.assign(w.base, o.base);
  if (o.triggers) w.triggers = o.triggers;
  if (o.levels) w.levels = o.levels;
  if (o.baseMods) w.baseMods = o.baseMods;
}
const STAR_ONLY = process.env.STAR_ONLY ? process.env.STAR_ONLY.split(',') : null;
import { addPerk, levelUpPerk, findPerk } from '../src/game/perks.js';
import { PERKS } from '../src/data/perks.js';
import { openChest } from '../src/game/chests.js';
import { fuse } from '../src/game/fusion.js';
import { MASTERWORKS } from '../src/data/fusions.js';

const args = process.argv.slice(2);
const SPEND = process.env.BOT_SPEND || 'all';        // what the bot buys with starsteel at the forge: 'none' | 'quench' | 'all' (Quench and Starforge)
const flag = (n) => args.includes(n);
const argv = process.argv;
const numArg = (n, d) => (argv.includes(n) ? Number(argv[argv.indexOf(n) + 1]) : d);
const STAR_WEAPONS = ['ember_bow', 'storm_volley', 'sunpiercer', 'forge_hammer', 'colossus_maul', 'quakebreaker', 'spirit_blades', 'seraph_blades', 'chakram', 'ricochet_saw', 'gyre'];
const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const LEVELS = [1, 4, 8];

// classId 'none' (the default since M43): no class mods and no trait, so a weapon is measured on its own, not on the
// Archer's kit (Quiver and Rain of Arrows would otherwise add to every number). Pass a class to see a kit's effect.
function loneWeaponRun(weaponId, level, classId = 'none', seed = 1) {
  const bare = classId === 'none';
  const run = createRun({ seed, view: VIEW, debug: { god: true }, classId: bare ? 'archer' : classId });
  if (bare) { run.player.stats.removeBySource('class:'); run.trait = {}; run.cls.inst = null; run.cls.rain = []; }
  run.player.stats.removeBySource(`weapon:${run.player.weapons[0].instanceId}:`);
  run.player.weapons.length = 0;
  run.director.update = () => {};                 // no wave spawns: we place enemies ourselves
  const inst = addWeapon(run, weaponId);
  while (inst.level < level && canLevelUp(inst)) levelUpWeapon(run, inst);
  return { run, inst };
}

// Where a typical fight happens: projectile weapons engage at range (fans of arrows spread out
// and side arrows miss a lone target), everything else is up close.
const engageDist = (id) => (['projectile', 'rod'].includes(WEAPONS[id].behavior) ? 170 : WEAPONS[id].behavior === 'trail' ? 12 : 60);   // a trail hurts what stands on it

function singleTargetDps(weaponId, level) {
  const { run } = loneWeaponRun(weaponId, level);
  const dist = engageDist(weaponId);
  const dummy = spawnEnemy(run, 'brute', dist, 0);
  dummy.hp = dummy.maxHp = 1e12;
  dummy.speed = 0;
  const seconds = 20;
  for (let i = 0; i < seconds / STEP; i++) {
    run.update(STEP, { x: 0, y: 0 });
    dummy.x = dist; dummy.y = 0; dummy.kx = dummy.ky = 0;   // knockback must not move it out of range
  }
  return (1e12 - dummy.hp) / seconds;
}

function crowdClear(weaponId, level) {
  const { run } = loneWeaponRun(weaponId, level);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const d = 180 + (i % 4) * 25;
    const brute = i % 4 === 3;
    spawnEnemy(run, brute ? 'brute' : 'goblin', Math.cos(a) * d, Math.sin(a) * d, brute ? 2 : 1);
  }
  let at10 = 0;
  let clearedAt = null;
  for (let i = 0; i < 20 / STEP; i++) {
    run.update(STEP, { x: 0, y: 0 });
    if (i === Math.round(10 / STEP)) at10 = run.kills;
    if (run.world.enemies.count === 0 && clearedAt === null) { clearedAt = run.time; break; }
  }
  return { kills10: clearedAt !== null && clearedAt < 10 ? 20 : at10, kills20: run.kills, clearedAt };
}

// Fusion value (docs/design-m30-m33.md §3.4): crowd damage per second of an evolved host alone and with a
// donor of each shape fused in. Tough dummies in a ring so nothing dies and the count stays constant.
function fusionCrowdDps(hostId, donorId) {
  const run = createRun({ seed: 1, view: VIEW, debug: { god: true }, classId: 'archer' });
  run.player.stats.removeBySource(`weapon:${run.player.weapons[0].instanceId}:`);
  run.player.weapons.length = 0;
  run.director.update = () => {};
  run.starsteel = 3;
  const host = addWeapon(run, hostId);
  while (host.level < 6 && canLevelUp(host)) levelUpWeapon(run, host);
  if (donorId) { const d = addWeapon(run, donorId); if (!fuse(run, host, d).ok) return null; }
  const dummies = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const d = 90 + (i % 3) * 40;
    const e = spawnEnemy(run, 'goblin', Math.cos(a) * d, Math.sin(a) * d);
    e.hp = e.maxHp = 1e12; e.speed = 0;
    dummies.push([e, Math.cos(a) * d, Math.sin(a) * d]);
  }
  const seconds = 15;
  for (let i = 0; i < seconds / STEP; i++) {
    run.update(STEP, { x: 0, y: 0 });
    for (const [e, x, y] of dummies) { e.x = x; e.y = y; e.kx = e.ky = 0; }
  }
  return dummies.reduce((a, [e]) => a + (1e12 - e.hp), 0) / seconds;
}

// Starforge value (docs/design-m39-m42.md): damage per second of a max-level weapon with and without its star,
// averaged over a few seeds. single = one tough dummy at the usual fighting distance; held = 24 dummies pinned
// in rings around the player; flow = a live crowd that is topped back up to 40 walking goblins (2,500 hp, late-run toughness) whenever
// some die while you walk a slow circle, scored as hp killed per second, so knockback, scattering and
// moving count the way they do in a real fight.
function starDps(weaponId, star, mode, seed, prep) {
  const { run, inst: inst0 } = loneWeaponRun(weaponId, 99, process.env.BENCH_CLASS || 'none', seed);
  let inst = inst0;
  if (prep) inst = prep(run, inst0) || inst0;      // e.g. enhance to +15 and fusion a donor on (--masterworks)
  if (star) inst.star = true;
  const seconds = mode === 'single' ? 20 : 15;
  const HP = 2500;
  const dummies = [];
  if (mode === 'single') {
    const dist = engageDist(weaponId);
    const e = spawnEnemy(run, 'brute', dist, 0);
    e.hp = e.maxHp = 1e12; e.speed = 0;
    dummies.push([e, dist, 0]);
  } else if (mode === 'held') {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const d = 90 + (i % 3) * 40;
      const e = spawnEnemy(run, 'goblin', Math.cos(a) * d, Math.sin(a) * d);
      e.hp = e.maxHp = 1e12; e.speed = 0;
      dummies.push([e, Math.cos(a) * d, Math.sin(a) * d]);
    }
  }
  let spawned = 0;
  const top = () => {
    while (run.world.enemies.count < 40) {
      const a = run.rng.next() * Math.PI * 2;
      const d = 190 + run.rng.next() * 110;
      const e = spawnEnemy(run, 'goblin', run.player.x + Math.cos(a) * d, run.player.y + Math.sin(a) * d);
      if (!e) return;
      e.hp = e.maxHp = HP;
      spawned++;
    }
  };
  let killed = 0;
  for (let i = 0; i < seconds / STEP; i++) {
    if (mode === 'flow') top();
    const k0 = run.kills;
    const t = i * STEP * 0.9;                                    // in the live crowd you walk a slow circle, as in a real fight
    run.update(STEP, mode === 'flow' ? { x: Math.cos(t) * 0.55, y: Math.sin(t) * 0.55 } : { x: 0, y: 0 });
    killed += run.kills - k0;
    if (mode !== 'flow') for (const [e, x, y] of dummies) { e.x = x; e.y = y; e.kx = e.ky = 0; }
  }
  if (mode === 'flow') {
    let partial = 0;
    for (const e of run.world.enemies.active) partial += HP - e.hp;
    return (killed * HP + partial) / seconds;
  }
  return dummies.reduce((a, [e]) => a + (1e12 - e.hp), 0) / seconds;
}

// ---- bot -------------------------------------------------------------------------------------

const SMART = process.env.BOT_POLICY === 'smart';   // a bot that chases evolution requirements and the perks/passives that scale what it owns
const WISH = new Set(['volley', 'heavy_fletching', 'splitting_tips', 'keen_eye', 'wind_sigil', 'broad_strokes', 'kindling', 'fan_the_flames', 'keen_whetstone', 'quickening_gear', 'tempered_core', 'long_reach', 'bloodletting', 'scholars_lens']);
function smartBonus(o, run) {
  if (!SMART) return 0;
  let b = 0;
  const id = o.id;
  if (id && WISH.has(id)) b += 30;
  for (const w of run.player.weapons) for (const r of recipesFor(w)) for (const q of r.requires || []) if ((q.passive === id || q.perk === id) && id) b += 70;
  return b;
}
function scoreOffer(o, run) {
  return scoreOffer0(o, run) + smartBonus(o, run);
}
function scoreOffer0(o, run) {
  // greedy depth: finish owned weapons, then take evolution partners, then strong passives
  if (o.kind === 'weapon_up') return 100 + o.toLevel;
  if (o.kind === 'passive_up') return 60 + o.toLevel;
  if (o.kind === 'passive_new') return o.id === 'wind_sigil' || o.id === 'tempered_core' ? 70 : 40;
  if (o.kind === 'weapon_new') return 50;
  if (o.kind === 'perk_up') return 55 + o.toLevel + (o.boost > 1 ? 10 : 0);
  if (o.kind === 'perk_new') return 45 + (o.boost > 1 ? 15 : 0);
  if (o.kind === 'title_new') return 80;
  return 0;
}

function chestPickup(run) {
  for (const g of run.world.pickups.active) if (g.kind === 2) return g;
  return null;
}

// Classes whose kit is short range: the bot engages instead of kiting (a fair fight for each role)
const MELEE = new Set(['smith', 'berserker', 'saint']);

// What the bot owns right now: weapons (id, level, enhance), passive and perk counts and ids.
function snapBuild(run) {
  const p = run.player;
  return { weapons: p.weapons.map((w) => [w.weaponId, w.level, w.enhance]), passives: p.passives.map((i) => [i.id, i.level]), perks: p.perks.map((i) => [i.id, i.level]) };
}

export function playBot(classId, seed, onTick) {
  const run = createRun({ seed, view: VIEW, debug: { god: false }, classId });
  const move = { x: 0, y: 0 };
  let evolved = 0;
  let chests = 0;
  let bossSeen = false;
  const at = { 300: null };
  const ss = { earned: 0, spent: 0, prev: run.starsteel, first: null };
  let forges = 0;
  let hurtTicks = 0;
  let ticks = 0;
  const iron = { earned: 0, prev: run.ore };                                    // iron income      // starsteel flow
  const late = { n: 0, sum: 0, clear: 0, hp: 0 };       // crowd after 300 s: how full is the screen? (how often is it nearly empty?)
  while (!run.over && run.time < 601) {
    const p = run.player;
    let near = null;
    let nd = 1e9;
    let sx = 0;
    let sy = 0;
    for (const e of run.world.enemies.active) {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d < nd) { nd = d; near = e; }
      if (d < 110) { sx += dx / (d * d + 1); sy += dy / (d * d + 1); }
    }
    const l = Math.hypot(sx, sy);
    const melee = MELEE.has(classId);
    const hurt = p.hp < p.maxHp * (0.45);    
    if (melee && !hurt && near) {                 // melee classes wade in while healthy
      const dx = near.x - p.x; const dy = near.y - p.y; const d = Math.hypot(dx, dy) || 1;
      move.x = dx / d; move.y = dy / d;
    } else if (l > 0) {                           // back off the crowd, with a sideways bias so enemies stay in range
      const fx = sx / l; const fy = sy / l; const a = 0.6;
      move.x = fx * Math.cos(a) - fy * Math.sin(a);
      move.y = fx * Math.sin(a) + fy * Math.cos(a);
    } else if (chestPickup(run)) {                 // chests are worth a detour
      const s = chestPickup(run);
      const dx = s.x - p.x; const dy = s.y - p.y; const d = Math.hypot(dx, dy) || 1;
      move.x = dx / d; move.y = dy / d;
    } else if (run.shrines[0]) {
      const s = run.shrines[0];
      const dx = s.x - p.x; const dy = s.y - p.y; const d = Math.hypot(dx, dy) || 1;
      move.x = dx / d; move.y = dy / d;
    } else if (near) {
      const dx = near.x - p.x; const dy = near.y - p.y; const d = Math.hypot(dx, dy) || 1;
      move.x = dx / d; move.y = dy / d;
    } else { move.x = 0; move.y = 0; }

    run.update(STEP, move);
    if (onTick) onTick(run);
    ticks++;
    if (hurt) hurtTicks++;
    if (run.ore > iron.prev) iron.earned += run.ore - iron.prev;
    iron.prev = run.ore;
    if (run.starsteel !== ss.prev) { const d = run.starsteel - ss.prev; if (d > 0) { ss.earned += d; if (ss.first === null) ss.first = Math.round(run.time); } else ss.spent -= d; ss.prev = run.starsteel; }
    if (run.time >= 300 && run.world.tick % 30 === 0) {
      const n = run.world.enemies.count;
      late.n++; late.sum += n; late.hp += p.hp / p.maxHp;
      if (n <= 25) late.clear++;
    }
    if (run.bossAlive) bossSeen = true;
    if (at[300] === null && run.time >= 300) at[300] = { level: p.level, kills: run.kills, hp: Math.round(p.hp), build: snapBuild(run) };

    while (run.pendingChests.length > 0) { openChest(run, run.pendingChests.shift()); chests++; }
    while (run.pendingLevelUps > 0) {
      const offers = generateOffers(offerState(run), run.rng);
      offers.sort((a, b) => scoreOffer(b, run) - scoreOffer(a, run));
      applyOffer(run, offers[0]);
      run.pendingLevelUps--;
    }
    if (run.forgeReady) {
      run.forgeReady = false;
      forges++;
      for (const w of p.weapons) for (const r of recipesFor(w)) if (canEvolve(run, w, r)) { evolve(run, w, r); evolved++; }
      if (run.starsteel !== ss.prev) { ss.spent += ss.prev - run.starsteel; ss.prev = run.starsteel; }
      for (let i = 0; i < 30; i++) { const w = p.weapons[0]; if (w && w.pendingTemper) chooseTemper(run, w, 0); if (SPEND !== 'none' && w && canStarforge(run, w) && SPEND === 'all') starforge(run, w); if (SPEND !== 'none' && w && w.enhance >= 7 && !w.quench && canQuench(run, w)) quench(run, w); if (w && canEnhance(run, w)) enhance(run, w); else break; }
      iron.prev = run.ore;
    }
  }
  return {
    won: run.won, time: Math.round(run.time), level: run.player.level, kills: run.kills,
    bossSeen, bossKilled: run.bossKilled, evolved, chests, titles: run.titles.length,
    at300: at[300], buildEnd: snapBuild(run),
    forges, hurt: +(hurtTicks / Math.max(1, ticks)).toFixed(2),
    iron: { earned: iron.earned, left: run.ore, topEnhance: Math.max(0, ...run.player.weapons.map((w) => w.enhance)) },
    starsteel: { earned: ss.earned, spent: ss.spent, left: run.starsteel, first: ss.first, elites: run.eliteKills },
    late: late.n ? { avg: Math.round(late.sum / late.n), clear: +(late.clear / late.n).toFixed(3), hp: +(late.hp / late.n).toFixed(2) } : null,
  };
}

// ---- builds ----------------------------------------------------------------------------------
// Each build row of docs/design-m10-m13.md section 5, set up directly at a mid-run power level
// (weapons level 5, perks level 2 or max). Reports a crowd of 120 for 20 s and a stationary-boss
// duel. Target: every build within 2x of the median; outliers show up here before playtests.

// --late: the end state of a build (`end: { weapons, fuse }` in data/builds.js): evolved weapons at max level, perks at
// level 3, the masterwork fused if the build has one. Measured against a bigger crowd and a 20000 hp boss.
const LATE = flag('--late');
const LATE_BASE = { archer: 'sunpiercer', smith: 'colossus_maul', berserker: 'reaper_axe', mage: 'prismatic_bolt', summoner: 'grave_legion', saint: 'radiant_halo' };

const BUILDS = LATE ? [
  ...Object.entries(LATE_BASE).flatMap(([cls, id]) => [
    { id: `baseline-${cls}`, cls, weapons: [id], perks: [], end: { weapons: [id] } },
    ...SHARED_BUILDS.filter((b) => b.bench && b.cls === cls && b.end),
  ]),
] : [
  { id: 'baseline-archer', cls: 'archer', weapons: ['ember_bow'], perks: [] },
  ...SHARED_BUILDS.filter((b) => b.bench && ['archer'].includes(b.cls)),
  { id: 'baseline-smith', cls: 'smith', weapons: ['forge_hammer'], perks: [] },
  ...SHARED_BUILDS.filter((b) => b.bench && b.cls === 'smith'),
  { id: 'baseline-berserker', cls: 'berserker', weapons: ['rending_axe'], perks: [] },
  ...SHARED_BUILDS.filter((b) => b.bench && b.cls === 'berserker'),
  { id: 'baseline-mage', cls: 'mage', weapons: ['arc_bolt'], perks: [] },
  ...SHARED_BUILDS.filter((b) => b.bench && b.cls === 'mage'),
  { id: 'baseline-summoner', cls: 'summoner', weapons: ['bone_call'], perks: [] },
  ...SHARED_BUILDS.filter((b) => b.bench && b.cls === 'summoner'),
  { id: 'baseline-saint', cls: 'saint', weapons: ['halo'], perks: [] },
  ...SHARED_BUILDS.filter((b) => b.bench && b.cls === 'saint'),
];

function buildRun(b, seed = 1) {
  const run = createRun({ seed, view: VIEW, debug: { god: true }, classId: b.cls });
  run.director.update = () => {};
  if (LATE) {
    const want = b.end.weapons;
    for (const w of [...run.player.weapons]) {
      if (want.includes(w.weaponId)) continue;
      run.player.stats.removeBySource(`weapon:${w.instanceId}:`);
      run.player.weapons.splice(run.player.weapons.indexOf(w), 1);
    }
    for (const id of want) if (!run.player.weapons.some((w) => w.weaponId === id)) addWeapon(run, id);
    for (const w of run.player.weapons) while (w.level < w.def.maxLevel && canLevelUp(w)) levelUpWeapon(run, w);
    for (const id of b.perks) {
      addPerk(run, id);
      const e = findPerk(run.player, id);
      while (e.level < Math.min(3, PERKS[id].maxLevel)) levelUpPerk(run, e);
    }
    if (b.end.fuse) {
      const [h, d] = b.end.fuse.map((id) => run.player.weapons.find((w) => w.weaponId === id));
      run.starsteel = 1;
      if (!h || !d || !fuse(run, h, d).ok) throw new Error(`${b.id}: fusion failed`);
    }
    return run;
  }
  for (const id of b.weapons) if (!run.player.weapons.some((w) => w.weaponId === id)) addWeapon(run, id);
  for (const w of run.player.weapons) while (w.level < 5 && canLevelUp(w)) levelUpWeapon(run, w);
  for (const id of b.perks) {
    addPerk(run, id);
    const e = findPerk(run.player, id);
    while (e.level < Math.min(2, PERKS[id].maxLevel)) levelUpPerk(run, e);
  }
  return run;
}

function buildCrowd(b) {
  const run = buildRun(b);
  const N = LATE ? 300 : 200;
  const hpK = LATE ? 10 : 3;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 * 4;
    const d = 120 + (i % 8) * 30;
    const brute = i % 6 === 5;
    spawnEnemy(run, brute ? 'brute' : 'goblin', Math.cos(a) * d, Math.sin(a) * d, hpK);
  }
  for (let i = 0; i < 60 / STEP; i++) {
    run.update(STEP, { x: 0, y: 0 });
    if (run.world.enemies.count === 0) return run.time;
  }
  return null;
}

function buildBoss(b) {
  const run = buildRun(b);
  const bx = LATE ? 55 : 110;
  const boss = spawnEnemy(run, 'warlord', bx, 0);
  boss.speed = 0;
  if (LATE) boss.hp = boss.maxHp = 20000;
  for (let i = 0; i < 60 / STEP; i++) {
    run.update(STEP, { x: 0, y: 0 });
    boss.x = bx; boss.y = 0; boss.kx = boss.ky = 0; boss.ai = 0; boss.aiCd = 99;
    if (!boss.alive) return run.time;
  }
  return null;
}

// ---- report ----------------------------------------------------------------------------------

const out = { weapons: {}, bots: {} };
const pad = (v, n) => String(v).padEnd(n);
const num = (v, d = 0) => (typeof v === 'number' ? v.toFixed(d) : '-');

if (!flag('--bots') && !flag('--builds') && !flag('--fusions') && !flag('--classes') && !flag('--starforge') && !flag('--masterworks') && !flag('--dps') && !flag('--tempers') && !flag('--affixes') && !flag('--lib')) {
  const ids = Object.keys(WEAPONS).filter((id) => WEAPONS[id].pool !== false || WEAPONS[id].rarity === 'evolved');
  if (!flag('--json')) {
    console.log('\nWEAPONS  (single-target dps | crowd of 20: kills after 10 s / 20 s)');
    console.log(pad('weapon', 16) + LEVELS.map((l) => pad(`L${l} dps`, 9) + pad(`L${l} 10s/20s`, 13)).join(''));
  }
  for (const id of ids) {
    const row = {};
    let line = pad(id, 16);
    for (const lvl of LEVELS) {
      if (lvl > WEAPONS[id].maxLevel) { line += pad('-', 9) + pad('-', 13); continue; }
      const dps = singleTargetDps(id, lvl);
      const c = crowdClear(id, lvl);
      row[lvl] = { dps, kills10: c.kills10, kills20: c.kills20 };
      line += pad(num(dps), 9) + pad(`${c.kills10}/${c.kills20}`, 13);
    }
    out.weapons[id] = row;
    if (!flag('--json')) console.log(line);
  }
}

// Weapon balance: damage per second at max level in the three Starforge modes (single target, pinned crowd of 24,
// live crowd of 40 walking goblins), no star, mean of `--seeds` (default 3). DPS_IDS=id,id picks the weapons (default all).
// WEAPON_OVERRIDE applies, so tools/variants.mjs can compare a weapon change against the original.
if (flag('--dps')) {
  const nSeeds = numArg('--seeds', 3);
  const seeds = Array.from({ length: nSeeds }, (_, i) => i + 1);
  const ids = process.env.DPS_IDS ? process.env.DPS_IDS.split(',') : Object.keys(WEAPONS);
  const rows = [];
  for (const id of ids) {
    const row = { id, behavior: WEAPONS[id].behavior };
    for (const mode of ['single', 'held', 'flow']) row[mode] = seeds.reduce((a, sd) => a + starDps(id, false, mode, sd), 0) / seeds.length;
    rows.push(row);
  }
  if (flag('--json')) out.dps = rows;
  else {
    console.log(`\nWEAPON DPS  (max level, no star; mean of ${nSeeds} seeds)`);
    console.log(pad('weapon', 18) + pad('behavior', 11) + pad('single', 9) + pad('held', 9) + pad('live', 9));
    for (const r of rows) console.log(pad(r.id, 18) + pad(r.behavior, 11) + pad(num(r.single), 9) + pad(num(r.held), 9) + pad(num(r.flow), 9));
  }
}

// Generic temper balance (M45a): one weapon per behavior, each temper applied alone on a max-level weapon.
// Reports DPS relative to no temper in single / held / live modes. Candidates are listed here so numbers can be
// swept without editing data; TEMPER_IDS=id,id narrows the weapons. Pairs: honed vs hasted (+5), mighty vs vast (+10).
if (flag('--tempers') && !flag('--real')) {
  const nSeeds = numArg('--seeds', 3);
  const seeds = Array.from({ length: nSeeds }, (_, i) => i + 1);
  const ids = process.env.TEMPER_IDS ? process.env.TEMPER_IDS.split(',') : ['storm_volley', 'colossus_maul', 'spirit_blades', 'cinder_ward', 'thunder_lance', 'rime_shards', 'reaper_axe', 'static_rod', 'chakram', 'rime_orbs', 'cinder_mortar', 'prismatic_bolt', 'bone_call', 'halo', 'judgement'];
  const cands = process.env.TEMPER_SET ? JSON.parse(process.env.TEMPER_SET) : {
    none: [],
    'honed20': [{ stat: 'damage', op: 'more', value: 0.2 }],
    'honed30': [{ stat: 'damage', op: 'more', value: 0.3 }],
    'hasted20': [{ stat: 'cooldown', op: 'inc', value: -0.2 }],
    'hasted15': [{ stat: 'cooldown', op: 'inc', value: -0.15 }],
    'mighty30': [{ stat: 'damage', op: 'more', value: 0.3 }],
    'vast': [{ stat: 'area', op: 'more', value: 0.3 }, { stat: 'projectiles', op: 'flat', value: 1 }],
  };
  const rows = [];
  for (const id of ids) {
    const base = {};
    for (const [name, mods] of Object.entries(cands)) {
      const r = {};
      for (const mode of ['single', 'held', 'flow']) {
        r[mode] = seeds.reduce((a, sd) => a + starDps(id, false, mode, sd, (run, inst) => {
          for (const m of mods) run.player.stats.add({ ...m, tags: [inst.instanceTag], source: 'bench:temper' });
        }), 0) / seeds.length;
      }
      if (name === 'none') Object.assign(base, r);
      rows.push({ id, name, ...r, rel: { single: r.single / (base.single || 1), held: r.held / (base.held || 1), flow: r.flow / (base.flow || 1) } });
    }
  }
  if (flag('--json')) out.tempers = rows;
  else {
    console.log(`\nTEMPERS  (DPS relative to no temper; mean of ${nSeeds} seeds; columns single / held / live)`);
    const names = Object.keys(cands).filter((n) => n !== 'none');
    console.log(pad('weapon', 16) + names.map((n) => pad(n, 17)).join(''));
    for (const id of ids) {
      const f = (r) => `${r.rel.single.toFixed(2)} ${r.rel.held.toFixed(2)} ${r.rel.flow.toFixed(2)}`;
      console.log(pad(id, 16) + names.map((n) => pad(f(rows.find((r) => r.id === id && r.name === n)), 17)).join(''));
    }
  }
}

// The real tempers each weapon is offered (M45b): --tempers --real prints, per representative weapon, DPS of each of its four
// tempers (two at +5, two at +10) relative to the bare weapon, as single / held / live.
if (flag('--tempers') && flag('--real')) {
  const nSeeds = numArg('--seeds', 3);
  const seeds = Array.from({ length: nSeeds }, (_, i) => i + 1);
  const ids = process.env.TEMPER_IDS ? process.env.TEMPER_IDS.split(',') : ['storm_volley', 'colossus_maul', 'spirit_blades', 'cinder_ward', 'thunder_lance', 'rime_shards', 'reaper_axe', 'static_rod', 'chakram', 'rime_orbs', 'cinder_mortar', 'prismatic_bolt', 'bone_call', 'halo', 'judgement'];
  console.log(`\nREAL TEMPERS  (DPS relative to the bare weapon; mean of ${nSeeds} seeds; single / held / live)`);
  for (const id of ids) {
    const meas = (opt) => ['single', 'held', 'flow'].map((mode) => seeds.reduce((a, sd) => a + starDps(id, false, mode, sd, (run, inst) => {
      if (opt) for (const m of opt.mods) run.player.stats.add({ ...m, tags: [inst.instanceTag], source: 'bench:temper' });
      if (opt && opt.addTags) for (const t of opt.addTags) inst.tags.set.add(t);
    }), 0) / seeds.length);
    const base = meas(null);
    const probe = loneWeaponRun(id, 99).inst;
    const cells = [];
    for (const lvl of [5, 10]) for (const o of temperOptions(probe, lvl)) {
      const r = meas(o);
      cells.push(pad(o.id, 15) + r.map((v, i) => (base[i] > 0 ? v / base[i] : 0).toFixed(2)).join(' '));
    }
    console.log(pad(id, 15) + cells.join(' | '));
  }
}

// Affix value (M45c): every eligible affix on a few weapons, DPS relative to the bare weapon (single / held / live).
// Bane only shows on elites and bosses, which this bench does not spawn, so it reads 1.00 here.
if (flag('--affixes')) {
  const nSeeds = numArg('--seeds', 2);
  const seeds = Array.from({ length: nSeeds }, (_, i) => i + 1);
  const ids = process.env.AFFIX_IDS ? process.env.AFFIX_IDS.split(',') : ['storm_volley', 'reaper_axe', 'cinder_mortar', 'bone_call', 'static_rod'];
  console.log(`\nAFFIXES  (DPS relative to the bare weapon; mean of ${nSeeds} seeds; single / held / live)`);
  for (const id of ids) {
    const meas = (affix) => ['single', 'held', 'flow'].map((mode) => seeds.reduce((a, sd) => a + starDps(id, false, mode, sd, (run, inst) => {
      if (affix) { inst.affixes = [affix]; rebuildAffixes(run, inst); }
    }), 0) / seeds.length);
    const base = meas(null);
    const probe = loneWeaponRun(id, 99).inst;
    console.log(`${id}`);
    for (const a of eligibleAffixes(probe)) {
      const r = meas(a);
      console.log('  ' + pad(a, 14) + r.map((v, i) => (base[i] > 0 ? v / base[i] : 0).toFixed(2)).join(' '));
    }
  }
}

if (flag('--starforge')) {
  const seeds = [1, 2, 3, 4, 5];
  const avg = (id, star, mode) => seeds.reduce((a, sd) => a + starDps(id, star, mode, sd), 0) / seeds.length;
  const rows = [];
  for (const id of STAR_ONLY || STAR_WEAPONS) {
    const row = { id, behavior: WEAPONS[id].behavior };
    for (const mode of ['single', 'held', 'flow']) {
      const a = avg(id, false, mode);
      const b = avg(id, true, mode);
      row[mode] = { base: a, star: b, gain: a > 0 ? b / a - 1 : null };
    }
    rows.push(row);
  }
  if (flag('--json')) out.starforge = rows;
  else {
    console.log('\nSTARFORGE  (damage per second at max level, star vs no star; mean of 5 seeds)');
    console.log(pad('weapon', 15) + pad('behavior', 11) + ['single', 'held crowd', 'live crowd'].map((m) => pad(m + ' base>star', 22)).join(''));
    const pct = (g) => (g === null ? 'n/a' : `${g >= 0 ? '+' : ''}${Math.round(g * 100)}%`);
    for (const r of rows) console.log(pad(r.id, 15) + pad(r.behavior, 11) + ['single', 'held', 'flow'].map((m) => pad(`${num(r[m].base)}>${num(r[m].star)} ${pct(r[m].gain)}`, 22)).join(''));
  }
}

if (flag('--builds')) {
  console.log(LATE ? '\nBUILDS, LATE  (evolved weapons L6, perks L3, fusion applied; crowd = 300 enemies at 10x hp, boss = 20000 hp)' : '\nBUILDS  (mid-run power: weapons L5, perks L2; crowd = seconds to clear 200 enemies at 3x hp (cap 60); boss = seconds to kill the Warlord)');
  console.log(pad('build', 22) + pad('crowd s', 10) + pad('boss s', 8));
  const rows = BUILDS.map((b) => ({ b, kills: buildCrowd(b), boss: buildBoss(b) }));
  for (const r of rows) console.log(pad(r.b.id, 22) + pad(r.kills === null ? '>60' : r.kills.toFixed(1), 10) + pad(r.boss === null ? '>60' : r.boss.toFixed(1), 8));
  const k = rows.map((r) => r.kills === null ? 60 : r.kills).sort((a, b) => a - b);
  const bs = rows.map((r) => r.boss === null ? 60 : r.boss).sort((a, b) => a - b);
  console.log(`median crowd ${k[Math.floor(k.length / 2)].toFixed(1)} s, median boss ${bs[Math.floor(bs.length / 2)].toFixed(1)} s`);
}

// Difficulty experiments without editing data: --hp 1.3 scales enemy hp, --rate 1.2 spawn rates.
if (argv.includes('--hp') || argv.includes('--rate') || argv.includes('--speed')) {
  const hpK = numArg('--hp', 1);
  const rateK = numArg('--rate', 1);
  for (const seg of WAVES) {
    seg.hpScale *= hpK;
    if (argv.includes('--speed')) seg.speedScale = (seg.speedScale === undefined ? 1 : seg.speedScale) * Math.pow(numArg('--speed', 1), seg.from / 600 * 2);
    for (const sp of seg.spawns) { sp.perSec *= rateK; if (sp.perSecEnd !== undefined) sp.perSecEnd *= rateK; }
  }
}

// ---- masterworks (M42 balance): a host at max level and +15, with and without its masterwork fusion and its star ----
function to15(run, inst) {
  run.ore = 1e9;
  for (let g = 0; g < 200 && inst.enhance < 15; g++) {
    if (inst.pendingTemper) chooseTemper(run, inst, 0);
    inst.quench = 1;
    enhance(run, inst);
  }
  if (inst.pendingTemper) chooseTemper(run, inst, 0);
  run.ore = 0;
}
if (flag('--masterworks')) {
  const seeds = [1, 2, 3];
  const only = process.env.MW_ONLY ? process.env.MW_ONLY.split(',') : null;
  const avg = (f) => seeds.reduce((a, sd) => a + f(sd), 0) / seeds.length;
  const plain = (run, inst) => { to15(run, inst); return inst; };
  const fused = (donorId) => (run, inst) => {
    to15(run, inst);
    run.starsteel = 10;
    const d = addWeapon(run, donorId);
    const r = fuse(run, inst, d);
    if (!r.ok) throw new Error('fusion failed ' + inst.def.name + '<' + donorId);
    return inst;
  };
  const pct = (a, b) => (b > 0 ? `${a / b >= 1 ? '+' : ''}${Math.round((a / b - 1) * 100)}%` : 'n/a');
  console.log('\nMASTERWORKS at +15  (dps: plain host / host+star / masterwork / masterwork+star; the percentages are against the plain host)');
  console.log(pad('masterwork', 16) + pad('host<donor', 36) + ['single', 'held', 'flow'].map((m) => pad(m, 44)).join(''));
  for (const mw of MASTERWORKS) {
    if (only && !only.includes(mw.id)) continue;
    const cells = ['single', 'held', 'flow'].map((mode) => {
      const a = avg((sd) => starDps(mw.host, false, mode, sd, plain));
      const b = avg((sd) => starDps(mw.host, true, mode, sd, plain));
      const c = avg((sd) => starDps(mw.host, false, mode, sd, fused(mw.donor)));
      const d = avg((sd) => starDps(mw.host, true, mode, sd, fused(mw.donor)));
      return pad(`${num(a)}/${num(b)}/${num(c)}/${num(d)}  ${pct(c, a)} ${pct(d, a)}`, 44);
    });
    console.log(pad(mw.id, 16) + pad(`${mw.host}<${mw.donor}`, 36) + cells.join(''));
  }
}

if (!flag('--weapons') && !flag('--builds') && !flag('--fusions') && !flag('--classes') && !flag('--starforge') && !flag('--masterworks') && !flag('--dps') && !flag('--tempers') && !flag('--affixes') && !flag('--lib')) {
  const nSeeds = numArg('--seeds', flag('--quick') ? 3 : 6);
  const seeds = Array.from({ length: nSeeds }, (_, i) => i + 1);
  const classes = argv.includes('--class') ? [argv[argv.indexOf('--class') + 1]] : Object.keys(CLASSES);
  if (!flag('--json')) {
    console.log(`\nBOT RUNS  (${seeds.length} seeds per class; crude bot, compare classes against each other)`);
    console.log(pad('class', 11) + pad('won', 6) + pad('avg time', 10) + pad('avg lvl', 9) + pad('avg kills', 11) + pad('lvl@5:00', 10) + pad('boss kills', 11) + pad('chests', 8));
  }
  for (const cls of classes) {
    const runs = seeds.map((s) => playBot(cls, s));
    out.bots[cls] = runs;
    const avg = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
    const lvl5 = runs.filter((r) => r.at300).map((r) => r.at300.level);
    if (!flag('--json')) {
      console.log(
        pad(cls, 11) + pad(`${runs.filter((r) => r.won).length}/${runs.length}`, 6) + pad(num(avg((r) => r.time)), 10)
        + pad(num(avg((r) => r.level), 1), 9) + pad(num(avg((r) => r.kills)), 11)
        + pad(lvl5.length ? num(lvl5.reduce((a, b) => a + b, 0) / lvl5.length, 1) : '-', 10)
        + pad(`${runs.filter((r) => r.bossKilled).length}/${runs.length}`, 11)
        + pad(num(avg((r) => r.chests), 1), 8)
      );
    }
  }
}

if (flag('--fusions')) {
  const hosts = ['storm_volley', 'colossus_maul', 'seraph_blades', 'pyre_crown', 'prismatic_bolt', 'grave_legion'];
  const donors = ['thunder_lance', 'reaper_axe', 'seraph_blades', 'pyre_crown', 'singularity', 'glacial_bloom', 'stormshell_mortar', 'bone_colossus', 'judgement'];
  console.log('\nFUSION VALUE  (crowd dps, host at level 6, 24 dummies; generic payload target: +35% to +60%; "m" = masterwork)');
  for (const h of hosts) {
    const base = fusionCrowdDps(h, null);
    const cells = donors.filter((d) => d !== h).map((d) => {
      const v = fusionCrowdDps(h, d);
      if (v === null) return `${WEAPONS[d].behavior}:-`;
      const mw = MASTERWORKS.some((m) => (m.host === h && m.donor === d));
      return `${WEAPONS[d].behavior}:${v >= base ? '+' : ''}${Math.round((v / base - 1) * 100)}%${mw ? 'm' : ''}`;
    });
    console.log(pad(h, 16) + pad(num(base), 7) + cells.join('  '));
  }
}

// ---- class identity: the same build on every class ---------------------------------------------
// Each build (shared weapons only, level 5, enhanced to +4, no perks) is played by every class against the same
// stream of enemies walking in from the edge for 40 s, the player strolling in a slow circle (so
// Fleet and Long Shot see normal play). Reports damage dealt; god mode, so it measures offense only.
const CLASS_BUILDS = [
  { id: 'ranged', weapons: ['storm_javelin', 'rime_shards', 'chakram'] },
  { id: 'close', weapons: ['spirit_blades', 'cinder_ward', 'rime_orbs'] },
  { id: 'elemental', weapons: ['static_rod', 'cinder_mortar', 'rime_shards'] },
  { id: 'mixed', weapons: ['storm_javelin', 'cinder_ward', 'static_rod'] },
];

function classBuildDamage(cls, b, seed = 1) {
  const bare = cls === 'none';                                       // no class at all: the reference
  const run = createRun({ seed, view: VIEW, debug: { god: true }, classId: bare ? 'archer' : cls });
  run.director.update = () => {};
  const p = run.player;
  if (bare) { p.stats.removeBySource('class:'); run.trait = {}; run.cls.inst = null; }
  p.stats.removeBySource(`weapon:${p.weapons[0].instanceId}:`);
  p.weapons.length = 0;
  run.ore = 1e9;
  for (const id of b.weapons) {
    const w = addWeapon(run, id);
    while (w.level < 5 && canLevelUp(w)) levelUpWeapon(run, w);
    while (w.enhance < 4 && canEnhance(run, w)) enhance(run, w);   // a mid-run forge visit or two
  }
  run.ore = 0;
  p.level = 12;                                                     // trait damage that scales with level (souls, nova) sees a mid-run level
  const move = { x: 0, y: 0 };
  let acc = 0;
  for (let i = 0; i < 40 / STEP; i++) {
    const t = i * STEP;
    acc += 30 * STEP;                                               // 30 tough enemies a second from the edge: more than any build can kill, so damage is not capped by supply
    while (acc >= 1) {
      acc -= 1;
      const a = run.rng.next() * Math.PI * 2;
      const brute = run.rng.next() < 0.2;
      spawnEnemy(run, brute ? 'brute' : 'goblin', p.x + Math.cos(a) * 300, p.y + Math.sin(a) * 300, 10);
    }
    move.x = Math.cos(t * 0.6) * 0.6; move.y = Math.sin(t * 0.6) * 0.6;
    run.update(STEP, move);
    p.level = 12;
    run.pendingLevelUps = 0;
  }
  return { dmg: run.stats.total, kills: run.kills };
}

if (flag('--classes')) {
  const classes = Object.keys(CLASSES);
  const seeds = [1, 2, 3];
  const avgDmg = (c, b) => seeds.reduce((a, sd) => a + classBuildDamage(c, b, sd).dmg, 0) / seeds.length;
  console.log('\nCLASS IDENTITY  (same build on every class: damage in 40 s vs a stream of 30 tough enemies/s, 3 seeds; % vs the same build with no class)');
  console.log(pad('build', 11) + pad('no class', 10) + classes.map((c) => pad(c, 11)).join(''));
  for (const b of CLASS_BUILDS) {
    const ref = avgDmg('none', b);
    const cells = classes.map((c) => { const v = avgDmg(c, b); return `${v >= ref ? '+' : ''}${Math.round((v / ref - 1) * 100)}%`; });
    console.log(pad(b.id, 11) + pad(`${Math.round(ref / 1000)}k`, 10) + cells.map((x) => pad(x, 11)).join(''));
  }
}

if (flag('--json')) console.log(JSON.stringify(out, null, 1));
