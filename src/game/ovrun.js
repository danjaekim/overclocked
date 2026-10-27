// The full run (M4): the whole ten-minute timeline, an elite and boss schedule, and the rig as your only build.
// It is Overforged's run underneath (waves, elites, bosses, gems, chests) with the class, its weapon and its
// forge taken away; everything you fight with comes from run.rigState (src/rig/editor.js) through applyRig.

import { createRun } from './run.js';
import { newRig } from '../rig/editor.js';
import { applyRig } from './sandbox.js';
import { PIECES } from '../rig/pieces.js';
import { initClassTrait } from './class-traits.js';

// What every run starts with: a little more health than the stat default, and a trickle of regeneration (the Archer's
// numbers from Overforged: bot runs lasted a third longer with them, docs/balance-playbook.md). Tune with the bench.
export const BASE = [
  { stat: 'maxHp', op: 'flat', value: 30 },
  { stat: 'regen', op: 'flat', value: 0.5 },
];

export const START_CHAIN = { rule: 'pulse', slots: ['blaster'], size: 3 };

export function createOverclockedRun({ seed, view, debug, sfx }) {
  const run = createRun({ seed, view, debug, sfx, classId: 'smith' });
  run.rigRun = true;
  run.player.weapons.length = 0;                                 // no class weapon: chains are the only attacks
  run.player.stats.removeBySource('weapon:');
  run.player.stats.removeBySource('class:');                     // and no class bonuses or trait
  initClassTrait(run, 'none');
  for (const m of BASE) run.player.stats.add({ ...m, source: 'rigger:' });
  run.player.maxHp = run.player.hp = run.player.stats.get('maxHp');
  run.rigState = newRig([START_CHAIN]);
  applyRig(run);

  const base = run.summary;
  run.summary = () => ({
    ...base(),
    rig: {                                                       // for the results screen
      chains: run.rigState.chains.map((c) => ({ rule: c.rule, slots: c.slots.slice(), bonus: c.bonus || 0 })),
      levels: { ...run.rigState.levels },
      bench: run.rigState.bench.slice(),
      stats: { ...run.rigState.stats },
    },
    classId: 'smith',
  });
  return run;
}

export const pieceName = (id) => (PIECES[id] ? PIECES[id].name : id);
