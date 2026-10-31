// The full run (M4): the whole ten-minute timeline, an elite and boss schedule, and the rig as your only build.
// It is Overforged's run underneath (waves, elites, bosses, gems, chests) with the class, its weapon and its
// forge taken away; everything you fight with comes from run.rigState (src/rig/editor.js) through applyRig.

import { createRun } from './run.js';
import { newRig } from '../rig/editor.js';
import { applyRig } from './sandbox.js';
import { PIECES } from '../rig/pieces.js';
import { initClassTrait } from './class-traits.js';
import { recentRawDps } from './run-stats.js';

// What every run starts with: a little more health than the stat default, and a trickle of regeneration (the Archer's
// numbers from Overforged: bot runs lasted a third longer with them, docs/balance-playbook.md). Tune with the bench.
export const BASE = [
  { stat: 'maxHp', op: 'flat', value: 30 },
  { stat: 'regen', op: 'flat', value: 0.5 },
  { stat: 'vsShocked', op: 'inc', value: 0.15 },          // Storm's mark: a shocked enemy takes 15% more from every source
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

  run.timeline = [];                                             // the rig every TIMELINE_STEP s, for the replay bench (tools/replaybench.mjs)
  const step = run.update;
  run.update = (dt, move) => {
    step(dt, move);
    if (run.time >= (run.timeline.length + 1) * TIMELINE_STEP) run.timeline.push(timelinePoint(run));
  };

  const base = run.summary;
  run.summary = () => ({
    ...base(),
    rig: {                                                       // for the results screen
      chains: run.rigState.chains.map((c) => ({ chassis: c.chassis, mk: c.mk, rule: c.rule, slots: c.slots.slice(), charge: c.charge || 0, cell: c.cell || 0 })),
      levels: { ...run.rigState.levels },
      bench: run.rigState.bench.slice(),
      stats: { ...run.rigState.stats },
      passives: { ...run.rigState.passives },
    },
    classId: 'smith',
    timeline: [...run.timeline, timelinePoint(run)],
  });
  return run;
}

export const TIMELINE_STEP = 60;

// One point of a run's timeline: when, how far along, how hard the rig hits (raw dps, overkill included) and the whole rig.
export function timelinePoint(run) {
  const r = run.rigState;
  return {
    t: Math.floor(run.time), lv: run.player.level, k: run.kills, hp: Math.round(run.player.hp), raw: Math.round(recentRawDps(run, 20)),
    rig: {
      chains: r.chains.map((c) => ({ chassis: c.chassis, mk: c.mk, rule: c.rule, slots: c.slots.slice(), charge: c.charge || 0, cell: c.cell || 0 })),
      levels: { ...r.levels }, passives: { ...r.passives }, stats: { ...r.stats },
    },
  };
}

export const pieceName = (id) => (PIECES[id] ? PIECES[id].name : id);
