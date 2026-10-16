// Balance benchmark (docs/roadmap.md M9). Headless, deterministic, no dependencies.
//
//   node tools/bench.mjs                 everything (a few minutes)
//   node tools/bench.mjs --weapons       per-weapon damage tests only
//   node tools/bench.mjs --bots          bot runs only
//   node tools/bench.mjs --builds        the perk build table (docs/design-m10-m13.md section 5)
//   node tools/bench.mjs --quick         fewer bot seeds
//   node tools/bench.mjs --classes       the same builds played by every class (class identity)
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
import { generateOffers } from '../src/game/upgrades.js';
import { offerState, applyOffer } from '../src/game/apply-offer.js';
import { recipesFor, canEvolve, evolve } from '../src/game/evolution.js';
import { enhance, canEnhance, chooseTemper, quench, canQuench } from '../src/game/forge.js';
import { addPerk, levelUpPerk, findPerk } from '../src/game/perks.js';
import { PERKS } from '../src/data/perks.js';
import { openChest } from '../src/game/chests.js';
import { graft } from '../src/game/graft.js';
import { MASTERWORKS } from '../src/data/grafts.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const LEVELS = [1, 4, 8];

function loneWeaponRun(weaponId, level, classId = 'archer', seed = 1) {
  const run = createRun({ seed, view: VIEW, debug: { god: true }, classId });
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

// Graft value (docs/design-m30-m33.md §3.4): crowd damage per second of an evolved host alone and with a
// donor of each shape grafted in. Tough dummies in a ring so nothing dies and the count stays constant.
function graftCrowdDps(hostId, donorId) {
  const run = createRun({ seed: 1, view: VIEW, debug: { god: true }, classId: 'archer' });
  run.player.stats.removeBySource(`weapon:${run.player.weapons[0].instanceId}:`);
  run.player.weapons.length = 0;
  run.director.update = () => {};
  run.starsteel = 3;
  const host = addWeapon(run, hostId);
  while (host.level < 6 && canLevelUp(host)) levelUpWeapon(run, host);
  if (donorId) { const d = addWeapon(run, donorId); if (!graft(run, host, d).ok) return null; }
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

// ---- bot -------------------------------------------------------------------------------------

function scoreOffer(o, run) {
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

function playBot(classId, seed) {
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
    if (at[300] === null && run.time >= 300) at[300] = { level: p.level, kills: run.kills, hp: Math.round(p.hp) };

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
      for (let i = 0; i < 30; i++) { const w = p.weapons[0]; if (w && w.pendingTemper) chooseTemper(run, w, 0); if (w && w.enhance >= 7 && !w.quench && canQuench(run, w)) quench(run, w); if (w && canEnhance(run, w)) enhance(run, w); else break; }
      iron.prev = run.ore;
    }
  }
  return {
    won: run.won, time: Math.round(run.time), level: run.player.level, kills: run.kills,
    bossSeen, bossKilled: run.bossKilled, evolved, chests, titles: run.titles.length,
    at300: at[300],
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

const BUILDS = [
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
  const N = 200;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 * 4;
    const d = 120 + (i % 8) * 30;
    const brute = i % 6 === 5;
    spawnEnemy(run, brute ? 'brute' : 'goblin', Math.cos(a) * d, Math.sin(a) * d, brute ? 3 : 3);
  }
  for (let i = 0; i < 60 / STEP; i++) {
    run.update(STEP, { x: 0, y: 0 });
    if (run.world.enemies.count === 0) return run.time;
  }
  return null;
}

function buildBoss(b) {
  const run = buildRun(b);
  const boss = spawnEnemy(run, 'warlord', 110, 0);
  boss.speed = 0;
  for (let i = 0; i < 60 / STEP; i++) {
    run.update(STEP, { x: 0, y: 0 });
    boss.x = 110; boss.y = 0; boss.kx = boss.ky = 0; boss.ai = 0; boss.aiCd = 99;
    if (!boss.alive) return run.time;
  }
  return null;
}

// ---- report ----------------------------------------------------------------------------------

const out = { weapons: {}, bots: {} };
const pad = (v, n) => String(v).padEnd(n);
const num = (v, d = 0) => (typeof v === 'number' ? v.toFixed(d) : '-');

if (!flag('--bots') && !flag('--builds') && !flag('--grafts') && !flag('--classes')) {
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

if (flag('--builds')) {
  console.log('\nBUILDS  (mid-run power: weapons L5, perks L2; crowd = seconds to clear 200 enemies at 3x hp (cap 60); boss = seconds to kill the Warlord)');
  console.log(pad('build', 22) + pad('crowd s', 10) + pad('boss s', 8));
  const rows = BUILDS.map((b) => ({ b, kills: buildCrowd(b), boss: buildBoss(b) }));
  for (const r of rows) console.log(pad(r.b.id, 22) + pad(r.kills === null ? '>60' : r.kills.toFixed(1), 10) + pad(r.boss === null ? '>60' : r.boss.toFixed(1), 8));
  const k = rows.map((r) => r.kills === null ? 60 : r.kills).sort((a, b) => a - b);
  const bs = rows.map((r) => r.boss === null ? 60 : r.boss).sort((a, b) => a - b);
  console.log(`median crowd ${k[Math.floor(k.length / 2)].toFixed(1)} s, median boss ${bs[Math.floor(bs.length / 2)].toFixed(1)} s`);
}

// Difficulty experiments without editing data: --hp 1.3 scales enemy hp, --rate 1.2 spawn rates.
const argv = process.argv;
const numArg = (n, d) => (argv.includes(n) ? Number(argv[argv.indexOf(n) + 1]) : d);
if (argv.includes('--hp') || argv.includes('--rate') || argv.includes('--speed')) {
  const hpK = numArg('--hp', 1);
  const rateK = numArg('--rate', 1);
  for (const seg of WAVES) {
    seg.hpScale *= hpK;
    if (argv.includes('--speed')) seg.speedScale = (seg.speedScale === undefined ? 1 : seg.speedScale) * Math.pow(numArg('--speed', 1), seg.from / 600 * 2);
    for (const sp of seg.spawns) { sp.perSec *= rateK; if (sp.perSecEnd !== undefined) sp.perSecEnd *= rateK; }
  }
}

if (!flag('--weapons') && !flag('--builds') && !flag('--grafts') && !flag('--classes')) {
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

if (flag('--grafts')) {
  const hosts = ['storm_volley', 'colossus_maul', 'seraph_blades', 'pyre_crown', 'prismatic_bolt', 'grave_legion'];
  const donors = ['thunder_lance', 'reaper_axe', 'seraph_blades', 'pyre_crown', 'singularity', 'glacial_bloom', 'stormshell_mortar', 'bone_colossus', 'judgement'];
  console.log('\nGRAFT VALUE  (crowd dps, host at level 6, 24 dummies; generic payload target: +35% to +60%; "m" = masterwork)');
  for (const h of hosts) {
    const base = graftCrowdDps(h, null);
    const cells = donors.filter((d) => d !== h).map((d) => {
      const v = graftCrowdDps(h, d);
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
