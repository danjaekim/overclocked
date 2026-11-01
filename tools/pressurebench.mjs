// Enemy pressure probe (docs/plan-v08.md): the rigbench bot in god mode, so every run lasts the full 10 minutes, with a
// per-minute record of enemies alive and on screen, where they die, how long they live, gold earned and boss lifetimes.
//   node tools/pressurebench.mjs [--seed 1] [--dmg 7]
// --dmg adds that much increased damage to the player (7 = +700%, about 8x), standing in for a strong human build.
// The baseline bot rig is about 1x. Compare 1x and 8x on the same seed.

import { playRig } from './rigbench.mjs';
import { recentRawDps } from '../src/game/run-stats.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const seed = Number(arg('--seed', 1));
const dmg = Number(arg('--dmg', 0));
if (dmg) process.env.MODS = JSON.stringify([{ stat: 'damage', op: 'inc', value: dmg }]);
const VIEW = { w: 390, h: 844 };
const STEP_S = 1 / 30;                              // rigbench's STEP                     // rigbench's VIEW

export function probe(seed, { replay = null, god = true } = {}) {
  const live = new Map();
  const mins = {};
  const boss = [];
  let lastT = 0;
  let lastOre = 0;
  let gold = 0;
  const minute = (t) => Math.floor(t / 60);
  const res = playRig(seed, { god, replay, onTick(run) {
    const t = run.time;
    const s = mins[minute(t)] ||= { ticks: 0, alive: 0, onscr: 0, deaths: 0, offDeaths: 0, life: 0, gold: 0, kills: 0 };
    s.ticks++;
    if (run.ore > lastOre) gold += run.ore - lastOre;
    lastOre = run.ore;
    s.gold = gold;
    s.kills = run.kills;
    s.raw = recentRawDps(run, 20);                    // raw dps over the last 20 s, read at the end of the minute
    s.rawSum = (s.rawSum || 0) + s.raw * STEP_S;
    const now = new Set();
    for (const e of run.world.enemies.active) {
      if (e.prop) continue;
      now.add(e.uid);
      const on = Math.abs(e.x - run.cam.x) < VIEW.w / 2 && Math.abs(e.y - run.cam.y) < VIEW.h / 2;
      s.alive++;
      if (on) s.onscr++;
      let r = live.get(e.uid);
      if (!r) { r = { t0: t, def: e.defId, boss: !!e.def.boss, hp: e.maxHp }; live.set(e.uid, r); }
      r.on = on;
    }
    for (const [uid, r] of live) {
      if (now.has(uid)) continue;
      const d = mins[minute(lastT)];
      d.deaths++;
      if (!r.on) d.offDeaths++;
      d.life += lastT - r.t0;
      if (r.boss) boss.push(`${r.def} at ${Math.round(r.t0)} s: lived ${(lastT - r.t0).toFixed(1)} s (hp ${Math.round(r.hp)})`);
      live.delete(uid);
    }
    lastT = t;
  } });
  for (const r of live.values()) if (r.boss) boss.push(`${r.def} at ${Math.round(r.t0)} s: still alive at the end (hp ${Math.round(r.hp)})`);
  return { mins, boss, gold, res };
}

if (process.argv[1] && process.argv[1].endsWith('pressurebench.mjs')) {
  const { mins, boss, gold } = probe(seed);
  console.log(`seed ${seed}, damage x${1 + dmg}, gold earned ${Math.round(gold)}`);
  for (const b of boss) console.log('  boss', b);
  console.log('min  alive  onscreen  deaths  off-screen%  mean life  gold so far  kills');
  for (const [k, s] of Object.entries(mins)) {
    if (!s.ticks) continue;
    const pct = (100 * s.offDeaths / Math.max(1, s.deaths)).toFixed(0);
    console.log(`${k.padStart(3)}  ${(s.alive / s.ticks).toFixed(0).padStart(5)}  ${(s.onscr / s.ticks).toFixed(0).padStart(8)}  ${String(s.deaths).padStart(6)}  ${(pct + '%').padStart(11)}  ${(s.life / Math.max(1, s.deaths)).toFixed(1).padStart(8)}s  ${String(Math.round(s.gold)).padStart(11)}  ${String(s.kills).padStart(5)}`);
  }
}
