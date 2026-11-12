// Replay your own builds (docs/plan-v08.md follow-up): the rig from each of your past runs, grown in minute by minute
// as you actually built it, put into a fresh run played by the rigbench bot's movement. Shows what a real build meets
// on this version: crowd on screen, boss lifetimes, and whether the bot-driven run survives with it.
//   node tools/replaybench.mjs --file runs.json [--runs 5] [--seed 1] [--calibrate]
// runs.json is what Past runs > "Copy run data" copies. Runs from before the timeline existed (v0.8.4) only have the
// final rig; those switch to it at 2:00 and are marked "approx".
// --calibrate also runs the plain bot and prints the damage multiplier that matches your raw dps, for pressurebench --dmg.

import fs from 'node:fs';
import { probe } from './pressurebench.mjs';
import { newRig } from '../src/rig/editor.js';
import { CHASSIS, migrateChassis } from '../src/rig/chassis.js';
import { PIECES } from '../src/rig/pieces.js';
import { START_CHAIN } from '../src/game/ovrun.js';
import { pilotOf, pilotRig } from '../src/data/pilots.js';
import { rewardChoices, takeReward } from '../src/rig/rewards.js';
import { applyRig } from '../src/game/sandbox.js';
import { pathToFileURL } from 'node:url';

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;   // imported by tools/chassisswap.mjs: no replays

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const file = arg('--file', null);
if (isMain && !file) { console.error('usage: node tools/replaybench.mjs --file runs.json [--runs 5] [--seed 1] [--calibrate]'); process.exit(1); }
export const loadRuns = (f) => { const data = JSON.parse(fs.readFileSync(f, 'utf8')); return (data.runs || data.history || []).filter((e) => e && e.rig && e.rig.chains && e.rig.chains.length); };
const runs = isMain ? loadRuns(file) : [];
const N = Number(arg('--runs', 5));
// STRIP=lv5,up2,mk1,nopass (comma list) takes those out of every replayed rig: what each source of late power is worth.
const STRIP = (process.env.STRIP || '').split(',');
const seed = Number(arg('--seed', 1));

// A stored rig (save.js cleanRig / cleanTimeline) back into a full rig state.
export function rigFrom(r) {
  const chains = r.chains.map((c) => migrateChassis({ ...c })).filter((c) => CHASSIS[c.chassis] || c.rule).map((c) => ({
    chassis: CHASSIS[c.chassis] ? c.chassis : undefined, rule: c.rule, mk: c.mk || 1, charge: c.charge || 0, cell: c.cell || 0,
    slots: c.slots.filter((id) => PIECES[id]), size: Math.max(6, c.slots.length),     // Splicer chains have up to 8
  }));
  const rig = newRig(chains);
  rig.levels = { ...(r.levels || {}) };
  if (STRIP.includes('lv5')) for (const k of Object.keys(rig.levels)) rig.levels[k] = Math.min(5, rig.levels[k]);
  if (STRIP.includes('up2')) for (const c of rig.chains) { c.charge = Math.min(2, c.charge); c.cell = Math.min(2, c.cell); }
  if (STRIP.includes('mk1')) for (const c of rig.chains) c.mk = 1;
  rig.passives = STRIP.includes('nopass') ? {} : { ...(r.passives || {}) };
  rig.stats = { ...(r.stats || {}) };
  return rig;
}

// The schedule of one past run: [{ t, rig }], oldest first.
export function scheduleOf(e) {
  if (Array.isArray(e.timeline) && e.timeline.length) return { approx: false, points: [{ t: 0, rig: newRig([START_CHAIN]) }, ...e.timeline.map((p) => ({ t: p.t, rig: rigFrom(p.rig), raw: p.raw }))] };
  const start = newRig([START_CHAIN]);
  return { approx: true, points: [{ t: 0, rig: start }, { t: 120, rig: start }, { t: 1e9, rig: rigFrom(e.rig) }] };
}

// A replayed rig under the run's pilot (`--pilot` through rigbench's PILOT): the pilot's rig rules, its chain limit (extra chains are
// dropped, the one with the fewest pieces first) and its signature passive at least at Lv1. A Rookie run is untouched.
function pilotRules(run) {
  if (run.pilot === 'rookie') return;
  const rig = run.rigState;
  const p = pilotOf(run.pilot);
  rig.pilot = pilotRig(run.pilot);
  rig.cap = Math.max(rig.cap, 6 + (p.rules.slotsMax || 0));
  while (p.rules.maxChains && rig.chains.length > p.rules.maxChains) {                       // the chain holding the fewest pieces goes (the last, on a tie)
    let weakest = 0;
    rig.chains.forEach((c, i) => { if (c.slots.filter(Boolean).length <= rig.chains[weakest].slots.filter(Boolean).length) weakest = i; });
    rig.chains.splice(weakest, 1);
  }
  if (p.sig && !(rig.passives[p.sig.id] > 0)) rig.passives[p.sig.id] = 1;
}

// `--reward overcharge[:piece,piece]` (or REWARD=...): Overclocker's boss rewards on the replayed rig, one after the Warlord (240 s)
// and one after the Seer (480 s). Pieces named are used in order; with none, the first takes the most levelled weapon and the second a
// Scatter, a trigger, then the next weapon. Reported against the same replay without it.
const rewardArg = arg('--reward', process.env.REWARD || '');
function rewardRules(run) {
  if (!rewardArg) return;
  const [id, list = ''] = rewardArg.split(':');
  const named = list.split(',').filter(Boolean);
  let rig = run.rigState;
  const times = [240, 480];
  for (let n = 0; n < 2 && run.time >= times[n]; n++) {
    const ch = rewardChoices(rig, id);
    if (!ch.length) break;
    const lv = (p) => (rig.levels && rig.levels[p]) || 1;
    const byType = (t) => ch.filter((p) => PIECES[p].type === t).sort((a, b) => lv(b) - lv(a));
    const auto = n === 0 ? byType('weapon')[0] : ch.includes('scatter') ? 'scatter' : byType('trigger')[0] || byType('weapon')[0];
    const piece = named[n] && ch.includes(named[n]) ? named[n] : auto || ch[0];
    rig = takeReward(rig, { id, piece, n: n + 1 }) || rig;
  }
  run.rigState = rig;
}

export function replayOf(points) {
  let next = 1;
  return (run) => {
    // apply the rig of the minute you are in: the point recorded at the end of it
    while (next < points.length && run.time >= points[next - 1].t) {
      run.rigState = points[next].rig;
      pilotRules(run);
      rewardRules(run);
      applyRig(run);
      next++;
    }
  };
}

const fmt = (x) => (x === undefined ? '-' : Math.round(x));
if (isMain) main();

function main() {
const pick = runs.slice(-N).reverse();
console.log(`${pick.length} of your runs (newest first), seed ${seed}. Your result vs. the replay on this build.`);
const rawMine = [];
for (const e of pick) {
  const sch = scheduleOf(e);
  const god = probe(seed, { replay: replayOf(sch.points) });
  const real = probe(seed, { replay: replayOf(sch.points), god: false });
  const on = (a, b) => { const xs = Object.entries(god.mins).filter(([m]) => m >= a && m <= b).map(([, s]) => s.onscr / s.ticks); return xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 0; };
  console.log(`\n${new Date(e.t).toISOString().slice(0, 16)} ${sch.approx ? '(approx: final rig from 2:00)' : ''}`);
  console.log(`  you:    ${e.won ? 'won' : `died at ${e.time} s`}, level ${e.level}, ${e.kills} kills`);
  console.log(`  replay: ${real.res.won ? 'won' : `died at ${real.res.time} s`}, ${real.res.kills} kills (bot movement, your rig)`);
  console.log(`  on screen: min 3 ${fmt(on(3, 3))}, min 6-9 ${fmt(on(6, 9))}; gold ${fmt(god.gold)}; raw dps at 5/8/10 min ${[4, 7, 9].map((m) => fmt(god.mins[m] && god.mins[m].raw)).join(' / ')}`);
  for (const b of god.boss) console.log(`  boss ${b}`);
  for (const p of sch.points) if (p.raw) rawMine.push([p.t, p.raw]);
}

if (process.argv.includes('--calibrate')) {
  if (!rawMine.length) console.log('\nNo timeline in these runs yet: play a run on v0.8.4 or later, then copy again.');
  else {
    const base = probe(seed);
    const ratios = rawMine.map(([t, raw]) => { const s = base.mins[Math.max(0, Math.floor(t / 60) - 1)]; return s && s.raw > 0 ? raw / s.raw : null; }).filter(Boolean).sort((a, b) => a - b);
    const med = ratios[Math.floor(ratios.length / 2)];
    console.log(`\nYour raw dps is about ${med.toFixed(1)}x the plain bot's (median of ${ratios.length} minutes). Damage scales raw dps about linearly, so: node tools/pressurebench.mjs --dmg ${Math.max(0, med - 1).toFixed(1)}`);
  }
}
}
