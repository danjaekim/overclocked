// The sandbox (M2): an endless arena for trying chains. Steady waves, no level-ups, no death, no run end.
// It is the default boot of the game until the full run returns in M4. Overforged's own run flow is
// untouched underneath and still reachable from the title screen (?title=1).

import { createRun } from './run.js';
import { spawnEnemy } from './director.js';
import { installRig } from '../rig/rig.js';
import { newRig, padSlots, chainDefsOf } from '../rig/editor.js';
import { TEST_CHAINS } from '../rig/presets.js';
import { RIG_STATS } from '../rig/pieces.js';
import { PASSIVES } from '../rig/passives.js';
import { chassisForRule } from '../rig/chassis.js';

export const SANDBOX = {
  target: 45,            // enemies kept alive
  every: 0.25,           // seconds between spawn checks
  ring: 540,             // spawn distance from the player: just outside the view
  bruteShare: 0.12,
};

export const START_CHAINS = ['cluster_mortar', 'blaster'];

// A director stand-in: keeps the arena topped up and never ramps. It carries the fields the rest of the engine reads.
function sandboxDirector(run) {
  let t = 0;
  return {
    hpScale: 1,
    speedScale: 1,
    damageScale: 1,
    getState: () => ({}),
    setState: () => {},
    update(dt) {
      t -= dt;
      if (t > 0) return;
      t += SANDBOX.every;
      const w = run.world;
      let need = SANDBOX.target - w.enemies.count;
      if (need > 6) need = 6;                                   // a refill comes in a few at a time, not a wall
      const p = run.player;
      for (let i = 0; i < need; i++) {
        const a = run.rng.next() * Math.PI * 2;
        spawnEnemy(run, run.rng.next() < SANDBOX.bruteShare ? 'brute' : 'goblin', p.x + Math.cos(a) * SANDBOX.ring, p.y + Math.sin(a) * SANDBOX.ring);
      }
    },
  };
}

const presetDef = (key) => ({ rule: TEST_CHAINS[key].rule, slots: TEST_CHAINS[key].slots, key, mk: 3 });   // the sandbox is for trying chains: top-mark chassis

export function createSandboxRun({ seed, view, debug, sfx }) {
  const run = createRun({ seed, view, debug: { ...debug, god: true }, sfx });
  run.sandbox = true;
  run.player.weapons.length = 0;                                 // the class weapon: chains are the only attacks here
  run.player.stats.removeBySource('weapon:');                    // and what it added to the stats
  run.director = sandboxDirector(run);
  run.rigState = newRig(START_CHAINS.map(presetDef));            // what the editor shows; applyRig turns it into the live rig
  applyRig(run);
  return run;
}

// Builds the live rig from run.rigState. A chain that no longer matches its test chain stops carrying its name.
export function applyRig(run) {
  for (const c of run.rigState.chains) {
    if (c.key && (c.rule !== TEST_CHAINS[c.key].rule || c.slots.join() !== padSlots(TEST_CHAINS[c.key].slots, run.rigState.cap).join())) c.key = null;
  }
  installRig(run, chainDefsOf(run.rigState));
  applyRigStats(run);
  applyPassives(run);
}

// The passive stats the rig has taken (move speed, max HP, pickup range, armor), as modifiers under their own source.
export function applyRigStats(run) {
  const st = run.player.stats;
  st.removeBySource('rigstat:');
  for (const [id, n] of Object.entries(run.rigState.stats || {})) {
    const def = RIG_STATS[id];
    if (def && n > 0) st.add({ ...def.mod, value: def.mod.value * n, source: `rigstat:${id}` });
  }
}

// The passives the rig has taken (rig/passives.js): stat mods under the source 'passive:' and the death rules the engine already has
// (Pyromaniac = Wildfire, Conductor = Thunderclap, Permafrost = Shatter). The rest are read by rig/chain.js and rig/rig.js.
export function applyPassives(run) {
  const st = run.player.stats;
  st.removeBySource('passive:');
  const has = run.rigState.passives || {};
  const n = (id) => Math.min(has[id] || 0, PASSIVES[id].max);
  if (n('ricochet') > 0) st.add({ stat: 'damage', op: 'more', value: -0.2, tags: ['projectile'], source: 'passive:ricochet' });
  if (n('ricochet') > 0) st.add({ stat: 'ricochet', op: 'flat', value: PASSIVES.ricochet.values[n('ricochet') - 1], tags: ['projectile'], source: 'passive:ricochet' });
  for (let k = 0; k < n('glass_cannon'); k++) {
    st.add({ stat: 'maxHp', op: 'more', value: -0.3, source: 'passive:glass_cannon' });
    st.add({ stat: 'damage', op: 'more', value: PASSIVES.glass_cannon.values[0], source: 'passive:glass_cannon' });
  }
  for (const [id, rule] of [['pyromaniac', 'wildfire'], ['conductor', 'thunderclap'], ['permafrost', 'shatter']]) {
    if (n(id) > 0) run.rules[rule] = PASSIVES[id].values[n(id) - 1];
    else delete run.rules[rule];
  }
}

// Puts a test chain in slot `index` (0 or 1), keeping the other chain as it is.
export function loadChain(run, index, key) {
  const c = run.rigState.chains[index];
  c.rule = TEST_CHAINS[key].rule;
  c.chassis = chassisForRule(c.rule);
  c.slots = padSlots(TEST_CHAINS[key].slots, run.rigState.cap);
  c.key = key;
  applyRig(run);
}

export const chainKeys = (run) => run.rigState.chains.map((c) => c.key);
