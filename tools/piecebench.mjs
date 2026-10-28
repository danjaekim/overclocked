// Fixed-scenario piece bench: node tools/piecebench.mjs [--secs 15]
// Each case is one Pulse chain run for a few simulated seconds against the same standing crowd (and a single target),
// so the numbers are deterministic and comparable with no bot and no full run. Prints damage dealt, the chain's energy
// cost and damage per energy, for weapons, modifiers, reactions and triggers.

import { createOverclockedRun } from '../src/game/ovrun.js';
import { installRig } from '../src/rig/rig.js';
import { analyzeChain } from '../src/rig/chain.js';
import { spawnEnemy } from '../src/game/director.js';
import { statsSnapshot } from '../src/game/run-stats.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const SECS = Number(arg('--secs', 15));
const STEP = 1 / 60;
const VIEW = { w: 390, h: 844, insetTop: 0 };
let HP = 150;                                        // a few hits, so kills happen and On Kill has something to do

function measure(slots, { crowd, levels = {} }) {
  const run = createOverclockedRun({ seed: 5, view: VIEW, debug: { god: true }, sfx: () => {} });
  run.director.update = () => {};
  run.rigState = { ...run.rigState, chains: [{ rule: 'pulse', slots, key: null, bonus: 0 }] };
  const rig = installRig(run, [{ rule: 'pulse', slots, energy: 12, levels }]);
  const spots = [];
  if (crowd) for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2 * 2.3; const d = 70 + (i % 5) * 22; spots.push([Math.cos(a) * d, Math.sin(a) * d]); }
  else spots.push([110, 0]);
  const live = spots.map(() => null);
  for (let t = 0; t < SECS / STEP; t++) {
    spots.forEach(([x, y], i) => {
      if (live[i] && live[i].alive) return;
      const e = spawnEnemy(run, 'goblin', x, y);
      e.speed = 0; e.hp = e.maxHp = HP;
      live[i] = e;
    });
    run.update(STEP, { x: 0, y: 0 });
    run.player.hp = run.player.maxHp;
  }
  void rig;
  return Math.round(statsSnapshot(run).total / SECS);
}

const cost = (slots) => analyzeChain({ rule: 'pulse', slots, energy: 12 }).cost;
function row(label, slots, opts = {}) {
  const crowd = measure(slots, { crowd: true, ...opts });
  const one = measure(slots, { crowd: false, ...opts });
  const c = cost(slots);
  console.log(`${label.padEnd(34)} cost ${String(c).padStart(2)}   crowd ${String(crowd).padStart(5)} dps  one ${String(one).padStart(4)} dps   per energy: crowd ${(crowd / Math.max(1, c)).toFixed(0).padStart(4)}  one ${(one / Math.max(1, c)).toFixed(0).padStart(3)}`);
  return { crowd, one, c };
}

const section = (t) => console.log(`\n== ${t} ==`);
const W = ['mortar', 'nova', 'blaster', 'chain_bolt', 'slam'];
const M = ['scatter', 'flame', 'frost', 'storm', 'heavy', 'echo', 'pierce'];

section('weapons alone');
for (const w of W) row(w, [w]);

section('modifiers on Blaster and on Nova (compare with the bare weapon above)');
for (const m of M) { row(`${m} + blaster`, [m, 'blaster']); row(`${m} + nova`, [m, 'nova']); }

section('reactions on Nova (a flame/frost/storm pair), against the first element alone');
for (const [a, b] of [['flame', 'frost'], ['frost', 'flame'], ['flame', 'storm'], ['storm', 'flame'], ['frost', 'storm'], ['storm', 'frost'], ['flame', 'flame'], ['frost', 'frost'], ['storm', 'storm']]) {
  row(`${a}>${b} nova`, [a, b, 'nova']);
}
for (const e of ['flame', 'frost', 'storm']) row(`${e} nova (no reaction)`, [e, 'nova']);

section('triggers: Blaster with a Nova payload, against the two pieces run separately');
row('blaster', ['blaster']);
row('nova', ['nova']);
row('blaster + nova (no trigger)', ['blaster', 'nova']);
for (const t of ['on_impact', 'on_kill', 'on_hit', 'every_3rd']) row(`blaster ${t} nova`, ['blaster', t, 'nova']);
section('triggers: Mortar with a Nova payload');
row('mortar + nova (no trigger)', ['mortar', 'nova']);
for (const t of ['on_impact', 'on_kill', 'on_hit', 'every_3rd']) row(`mortar ${t} nova`, ['mortar', t, 'nova']);

section('On Kill needs kills: a Heavy Blaster against a weak crowd (HP 60), Nova payload');
HP = 60;
row('heavy blaster + nova (no trigger)', ['heavy', 'blaster', 'nova']);
for (const t of ['on_impact', 'on_kill', 'on_hit', 'every_3rd']) row(`heavy blaster ${t} nova`, ['heavy', 'blaster', t, 'nova']);
