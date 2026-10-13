// Balance benchmark (docs/roadmap.md M9). Headless, deterministic, no dependencies.
//
//   node tools/bench.mjs                 everything (a few minutes)
//   node tools/bench.mjs --weapons       per-weapon damage tests only
//   node tools/bench.mjs --bots          bot runs only
//   node tools/bench.mjs --quick         fewer bot seeds
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
import { CLASSES } from '../src/data/classes.js';
import { generateOffers } from '../src/game/upgrades.js';
import { offerState, applyOffer } from '../src/game/apply-offer.js';
import { recipesFor, canEvolve, evolve } from '../src/game/evolution.js';
import { enhance, canEnhance } from '../src/game/forge.js';

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
const engageDist = (id) => (WEAPONS[id].behavior === 'projectile' ? 170 : 60);

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

// ---- bot -------------------------------------------------------------------------------------

function scoreOffer(o, run) {
  // greedy depth: finish owned weapons, then take evolution partners, then strong passives
  if (o.kind === 'weapon_up') return 100 + o.toLevel;
  if (o.kind === 'passive_up') return 60 + o.toLevel;
  if (o.kind === 'passive_new') return o.id === 'wind_sigil' || o.id === 'tempered_core' ? 70 : 40;
  if (o.kind === 'weapon_new') return 50;
  if (o.kind === 'title_new') return 80;
  return 0;
}

// Classes whose kit is short range: the bot engages instead of kiting (a fair fight for each role)
const MELEE = new Set(['smith', 'berserker']);

function playBot(classId, seed) {
  const run = createRun({ seed, view: VIEW, debug: { god: false }, classId });
  const move = { x: 0, y: 0 };
  let evolved = 0;
  let bossSeen = false;
  const at = { 300: null };
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
    const hurt = p.hp < p.maxHp * 0.45;
    if (melee && !hurt && near) {                 // melee classes wade in while healthy
      const dx = near.x - p.x; const dy = near.y - p.y; const d = Math.hypot(dx, dy) || 1;
      move.x = dx / d; move.y = dy / d;
    } else if (l > 0) {                           // back off the crowd, with a sideways bias so enemies stay in range
      const fx = sx / l; const fy = sy / l; const a = 0.6;
      move.x = fx * Math.cos(a) - fy * Math.sin(a);
      move.y = fx * Math.sin(a) + fy * Math.cos(a);
    } else if (run.shrines[0]) {
      const s = run.shrines[0];
      const dx = s.x - p.x; const dy = s.y - p.y; const d = Math.hypot(dx, dy) || 1;
      move.x = dx / d; move.y = dy / d;
    } else if (near) {
      const dx = near.x - p.x; const dy = near.y - p.y; const d = Math.hypot(dx, dy) || 1;
      move.x = dx / d; move.y = dy / d;
    } else { move.x = 0; move.y = 0; }

    run.update(STEP, move);
    if (run.bossAlive) bossSeen = true;
    if (at[300] === null && run.time >= 300) at[300] = { level: p.level, kills: run.kills, hp: Math.round(p.hp) };

    while (run.pendingLevelUps > 0) {
      const offers = generateOffers(offerState(run), run.rng);
      offers.sort((a, b) => scoreOffer(b, run) - scoreOffer(a, run));
      applyOffer(run, offers[0]);
      run.pendingLevelUps--;
    }
    if (run.forgeReady) {
      run.forgeReady = false;
      for (const w of p.weapons) for (const r of recipesFor(w)) if (canEvolve(run, w, r)) { evolve(run, w, r); evolved++; }
      for (let i = 0; i < 30; i++) { const w = p.weapons[0]; if (w && canEnhance(run, w)) enhance(run, w); else break; }
    }
  }
  return {
    won: run.won, time: Math.round(run.time), level: run.player.level, kills: run.kills,
    bossSeen, bossKilled: run.bossKilled, evolved, titles: run.titles.length,
    at300: at[300],
  };
}

// ---- report ----------------------------------------------------------------------------------

const out = { weapons: {}, bots: {} };
const pad = (v, n) => String(v).padEnd(n);
const num = (v, d = 0) => (typeof v === 'number' ? v.toFixed(d) : '-');

if (!flag('--bots')) {
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

if (!flag('--weapons')) {
  const seeds = flag('--quick') ? [1, 2, 3] : [1, 2, 3, 4, 5, 6];
  const classes = Object.keys(CLASSES);
  if (!flag('--json')) {
    console.log(`\nBOT RUNS  (${seeds.length} seeds per class; crude bot, compare classes against each other)`);
    console.log(pad('class', 11) + pad('won', 6) + pad('avg time', 10) + pad('avg lvl', 9) + pad('avg kills', 11) + pad('lvl@5:00', 10) + pad('boss kills', 11));
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
      );
    }
  }
}

if (flag('--json')) console.log(JSON.stringify(out, null, 1));
