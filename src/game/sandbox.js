// The sandbox (M2): an endless arena for trying chains. Steady waves, no level-ups, no death, no run end.
// It is the default boot of the game until the full run returns in M4. Overforged's own run flow is
// untouched underneath and still reachable from the title screen (?title=1).

import { createRun } from './run.js';
import { spawnEnemy } from './director.js';
import { installRig } from '../rig/rig.js';
import { TEST_CHAINS } from '../rig/presets.js';

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

export function chainDefs(keys) {
  return keys.map((k) => ({ rule: TEST_CHAINS[k].rule, slots: TEST_CHAINS[k].slots, key: k }));
}

export function createSandboxRun({ seed, view, debug, sfx }) {
  const run = createRun({ seed, view, debug: { ...debug, god: true }, sfx });
  run.sandbox = true;
  run.player.weapons.length = 0;                                 // the class weapon: chains are the only attacks here
  run.player.stats.removeBySource('weapon:');                    // and what it added to the stats
  run.director = sandboxDirector(run);
  run.chainKeys = START_CHAINS.slice();
  installRig(run, chainDefs(run.chainKeys));
  return run;
}

// Puts a test chain in slot `index` (0 or 1), keeping the other chain as it is.
export function loadChain(run, index, key) {
  run.chainKeys[index] = key;
  installRig(run, chainDefs(run.chainKeys));
}
