// Run length and the spawn timeline. All times are authored against RUN.designLength;
// the director rescales them by RUN.length / RUN.designLength (docs/architecture.md §5.8).
// Spawn RATES are not scaled. EVENTS below are one-off happenings on the same timeline.

export const RUN = {
  length: 600,          // seconds: THE run-length knob. Win = survive until this.
  designLength: 600,    // the length the timeline below was authored for
};

// perSec may ramp to perSecEnd across the segment. hpScale multiplies enemy hp.
export const WAVES = [
  { from: 0,   to: 60,  spawns: [{ enemy: 'goblin', perSec: 1.2, perSecEnd: 2.2 }], hpScale: 1.0 },
  { from: 60,  to: 180, spawns: [{ enemy: 'goblin', perSec: 2.2, perSecEnd: 3.5 }, { enemy: 'brute', perSec: 0.1, perSecEnd: 0.2 }], hpScale: 1.2 },
  { from: 180, to: 360, spawns: [{ enemy: 'goblin', perSec: 3.5, perSecEnd: 4.8 }, { enemy: 'brute', perSec: 0.2, perSecEnd: 0.4 }], hpScale: 1.6 },
  { from: 360, to: 600, spawns: [{ enemy: 'goblin', perSec: 4.8, perSecEnd: 6.5 }, { enemy: 'brute', perSec: 0.4, perSecEnd: 0.8 }], hpScale: 2.2 },
];

// One-off events. `at` is authored against RUN.designLength and
// rescaled like segments. Shrines are how the player reaches the forge (docs §6.3).
export const EVENTS = [
  { at: 90,  event: 'elite', enemy: 'brute' },    // elites drop chests (data/elites.js)
  { at: 120, event: 'shrine' },
  { at: 165, event: 'elite', enemy: 'brute' },
  { at: 240, event: 'shrine' },
  { at: 240, event: 'elite', enemy: 'brute' },
  { at: 300, event: 'boss', enemy: 'warlord' },   // its death also drops a shrine and a 5-roll chest
  { at: 345, event: 'elite', enemy: 'brute' },
  { at: 390, event: 'shrine' },
  { at: 420, event: 'elite', enemy: 'brute' },
  { at: 480, event: 'elite', enemy: 'brute' },
  { at: 510, event: 'shrine' },
  { at: 540, event: 'elite', enemy: 'brute' },
];

export const ENEMY_SOFT_CAP = 500;   // director stops spawning here and buffs hp instead
