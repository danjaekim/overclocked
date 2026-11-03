// Chassis bench on real chains: every chain from your past runs (Past runs > "Copy run data"), with your piece levels,
// put on each chassis at Mk I with no charge/cell upgrades, against a standing crowd and a single tanky target, under
// three movement patterns. Prints each chassis's dps relative to Standard on the same chain (geometric mean over chains).
//   node tools/chassisbench.mjs --file runs.json [--runs 8] [--secs 12] [--hp 400] [--mk 1] [--lv1] [--only a,b] [--each]
// CH="overdrive.recharge=10,rules.stride.dist=60,echo.mult=0.5" tries numbers first. Reaper reads low: the bench has few kills.
// Movement: walk = always moving; mixed = 0.5 s moving, 0.5 s still (a crowded screen); still = never moving.
import { createOverclockedRun } from '../src/game/ovrun.js';
import { installRig } from '../src/rig/rig.js';
import { newRig, chainDefOf } from '../src/rig/editor.js';
import { CHASSIS } from '../src/rig/chassis.js';
import { PIECES, RULES } from '../src/rig/pieces.js';
import { RELAY_ECHO } from '../src/rig/chassis.js';
import { spawnEnemy } from '../src/game/director.js';
import { statsSnapshot } from '../src/game/run-stats.js';
import { loadRuns } from './replaybench.mjs';
import { analyzeChain } from '../src/rig/chain.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const SECS = Number(arg('--secs', 12));
const HP = Number(arg('--hp', 400));
const MK = Number(arg('--mk', 1));
const STEP = 1 / 60;
const VIEW = { w: 390, h: 844, insetTop: 0 };
// CH="overdrive.recharge=10,overdrive.quirk.costAdd=0" tries chassis numbers without editing chassis.js.
for (const kv of (process.env.CH || '').split(',').filter(Boolean)) {
  const [path, v] = kv.split('=');
  const keys = path.split('.');
  let o = keys[0] === 'rules' ? (keys.shift(), RULES) : keys[0] === 'echo' ? (keys.shift(), RELAY_ECHO) : CHASSIS;   // rules.stride.dist=60, echo.mult=0.5
  for (const k of keys.slice(0, -1)) o = o[k] = o[k] || {};
  o[keys[keys.length - 1]] = isNaN(Number(v)) ? v : Number(v);
}
const LV1 = process.argv.includes('--lv1');                       // every piece at level 1 (early run)
const ONLY = arg('--only', null);
const runs = loadRuns(arg('--file', null)).slice(-Number(arg('--runs', 8)));
const MOVES = { walk: () => 1, mixed: (t) => (Math.floor(t * 2) % 2 ? 0 : 1), still: () => 0 };

function measure(chassis, slots, levels, crowd, mv) {
  const run = createOverclockedRun({ seed: 5, view: VIEW, debug: { god: true }, sfx: () => {} });
  run.director.update = () => {};
  const rig = newRig([{ chassis, mk: MK, slots, size: 6 }]);
  rig.levels = levels;
  installRig(run, [chainDefOf(rig, 0)]);
  const spots = [];
  if (crowd) for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2 * 2.3; const d = 70 + (i % 5) * 22; spots.push([Math.cos(a) * d, Math.sin(a) * d]); }
  else spots.push([110, 0]);
  const live = spots.map(() => null);
  const move = { x: 0, y: 0 };
  let dir = 1;
  for (let t = 0; t < SECS / STEP; t++) {
    const time = t * STEP;
    spots.forEach(([x, y], i) => {
      if (live[i] && live[i].alive) { live[i].x = run.player.x + x; live[i].y = run.player.y + y; return; }
      const e = spawnEnemy(run, 'goblin', run.player.x + x, run.player.y + y);
      e.speed = 0; e.hp = e.maxHp = crowd ? HP : HP * 50;
      live[i] = e;
    });
    if (Math.floor(time * 4) % 2) dir = 1; else dir = -1;
    move.x = MOVES[mv](time) ? dir : 0;
    run.update(STEP, move);
    run.player.hp = run.player.maxHp;
  }
  return statsSnapshot(run).total / SECS;
}

const chains = [];
for (const r of runs) for (const c of r.rig.chains) {
  const slots = c.slots.filter((id) => PIECES[id]);
  if (slots.length) chains.push({ slots, levels: LV1 ? {} : { ...(r.rig.levels || {}) }, from: c.chassis || c.rule });
}
console.log(`${chains.length} chains from ${runs.length} runs, Mk ${MK}, crowd hp ${HP}, ${SECS} s; dps vs Standard (geomean)`);
const ids = ONLY ? ['standard', ...ONLY.split(',')] : Object.keys(CHASSIS);
for (const target of ['crowd', 'one']) for (const mv of Object.keys(MOVES)) {
  const base = chains.map((c) => measure('standard', c.slots.slice(0, 6), c.levels, target === 'crowd', mv));
  const cells = ids.map((id) => {
    const rel = chains.map((c, i) => measure(id, c.slots.slice(0, CHASSIS[id].max), c.levels, target === 'crowd', mv) / Math.max(1, base[i]));
    const g = Math.exp(rel.reduce((s, x) => s + Math.log(Math.max(0.01, x)), 0) / rel.length);
    return `${id.slice(0, 9).padEnd(9)} ${g.toFixed(2)}`;
  });
  if (process.argv.includes('--each') && target === 'crowd' && mv === 'mixed') chains.forEach((c, i) => {
    const rig = newRig([{ chassis: 'standard', mk: 1, slots: c.slots, size: 6 }]); rig.levels = c.levels;
    const cost = analyzeChain({ ...chainDefOf(rig, 0), energy: 1000 }).cost;
    console.log(`  ${c.from.padEnd(9)} cost ${String(cost).padStart(2)} ${c.slots.join(' ').padEnd(44)} std ${String(Math.round(base[i])).padStart(5)} ` + ids.slice(1).map((id) => `${id.slice(0, 4)} ${(measure(id, c.slots.slice(0, CHASSIS[id].max), c.levels, true, mv) / Math.max(1, base[i])).toFixed(2)}`).join(' '));
  });
  const med = base.slice().sort((a, b) => a - b)[base.length >> 1];
  console.log(`${target.padEnd(5)} ${mv.padEnd(5)} std ${String(Math.round(med)).padStart(6)}  ${cells.join('  ')}`);
}
