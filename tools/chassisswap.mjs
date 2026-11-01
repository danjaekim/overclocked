// Chassis swap test (docs/plan-v09.md): replay one of your real runs (tools/replaybench.mjs) and, from --from seconds on,
// put ONE chain's pieces on each chassis in turn (Mk I, the chain's own charge and cell upgrades kept). Prints the rig's
// raw dps at 7, 9 and 10 min and the kills. Shows what the chassis choice is worth on a real, upgraded build.
//   node tools/chassisswap.mjs [--file tools/data/dan-runs-v084.json] [--run 0] [--chain 1] [--from 240] [--only a,b] [--seed 1]
// --run counts from the newest run (0). --chain is the chain's index in that run's rig. EMPTY=1 also prints the chain removed.

import { loadRuns, scheduleOf, replayOf } from './replaybench.mjs';
import { probe } from './pressurebench.mjs';
import { CHASSIS } from '../src/rig/chassis.js';
import { cloneRig } from '../src/rig/editor.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const runs = loadRuns(arg('--file', 'tools/data/dan-runs-v084.json')).reverse();     // newest first
const ri = Number(arg('--run', 0));
const ci = Number(arg('--chain', 1));
const from = Number(arg('--from', 240));
const seed = Number(arg('--seed', 1));
const only = arg('--only', null);
const sch = scheduleOf(runs[ri]);
const last = sch.points[sch.points.length - 1].rig.chains[ci];
if (!last) { console.error(`run ${ri} has no chain ${ci}`); process.exit(1); }
console.log(`run ${ri} chain ${ci}: ${last.chassis} [${last.slots.filter(Boolean).join(' ')}], swapped from ${from} s, seed ${seed}`);

function swapped(id, empty) {
  return sch.points.map((p) => {
    if (p.t < from || !p.rig.chains[ci]) return p;
    const r = cloneRig(p.rig);
    const c = r.chains[ci];
    if (!empty) { c.chassis = id; c.rule = CHASSIS[id].rule; c.mk = 1; }
    c.slots = empty ? [] : c.slots.filter(Boolean).slice(0, CHASSIS[id].max);
    while (c.slots.length < 6) c.slots.push(null);
    return { ...p, rig: r };
  });
}

const ids = only ? only.split(',') : Object.keys(CHASSIS);
const rows = ids.map((id) => [id, false]);
if (process.env.EMPTY) rows.push(['(empty)', true]);
for (const [id, empty] of rows) {
  const g = probe(seed, { replay: replayOf(swapped(id, empty)) });
  const raw = [6, 8, 9].map((m) => Math.round(g.mins[m] ? g.mins[m].raw : 0));
  console.log(`${id.padEnd(10)} raw dps 7/9/10 min ${raw.map((x) => String(x).padStart(6)).join(' /')}   kills ${g.mins[9] ? g.mins[9].kills : 0}`);
}
