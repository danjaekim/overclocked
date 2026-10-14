// Run length and the spawn timeline. All times are authored against RUN.designLength;
// the director rescales them by RUN.length / RUN.designLength (docs/architecture.md §5.8).
// Spawn RATES are not scaled. EVENTS below are one-off happenings on the same timeline.

export const RUN = {
  length: 600,          // seconds: THE run-length knob. Win = survive until this.
  designLength: 600,    // the length the timeline below was authored for
};

// perSec may ramp to perSecEnd across the segment. hpScale multiplies enemy hp; speedScale (default 1)
// multiplies enemy speed, so late waves close in faster and kiting alone stops being a free win;
// damageScale multiplies enemy contact damage, so armor and max hp stay relevant late.
export const WAVES = [
  { from: 0,   to: 60,  spawns: [{ enemy: 'goblin', perSec: 1.2, perSecEnd: 2.2 }], hpScale: 1.0, speedScale: 1.0 },
  { from: 60,  to: 180, spawns: [{ enemy: 'goblin', perSec: 2.2, perSecEnd: 3.5 }, { enemy: 'brute', perSec: 0.1, perSecEnd: 0.2 }, { enemy: 'shieldbearer', perSec: 0.08, perSecEnd: 0.2 }, { enemy: 'slinger', perSec: 0.04, perSecEnd: 0.12 }], hpScale: 1.3, speedScale: 1.08, damageScale: 1.05 },
  { from: 180, to: 360, spawns: [{ enemy: 'goblin', perSec: 3.5, perSecEnd: 5.4 }, { enemy: 'brute', perSec: 0.2, perSecEnd: 0.4 }, { enemy: 'shieldbearer', perSec: 0.2, perSecEnd: 0.45 }, { enemy: 'slinger', perSec: 0.12, perSecEnd: 0.3 }], hpScale: 2.0, speedScale: 1.22, damageScale: 1.2 },
  { from: 360, to: 600, spawns: [{ enemy: 'goblin', perSec: 5.4, perSecEnd: 7.8 }, { enemy: 'brute', perSec: 0.4, perSecEnd: 0.9 }, { enemy: 'shieldbearer', perSec: 0.45, perSecEnd: 0.9 }, { enemy: 'slinger', perSec: 0.3, perSecEnd: 0.7 }], hpScale: 2.9, speedScale: 1.4, damageScale: 1.45 },
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
