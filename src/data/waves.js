// Run length and the spawn timeline. All times are authored against RUN.designLength;
// the director rescales them by RUN.length / RUN.designLength (docs/architecture.md §5.8).
// Spawn RATES are not scaled. Events (shrines M6, boss M7) are added as they are built.

export const RUN = {
  length: 600,          // seconds: THE run-length knob. Win = survive until this.
  designLength: 600,    // the length the timeline below was authored for
};

// perSec may ramp to perSecEnd across the segment. hpScale multiplies enemy hp.
export const WAVES = [
  { from: 0,   to: 60,  spawns: [{ enemy: 'goblin', perSec: 1.5, perSecEnd: 3 }], hpScale: 1.0 },
  { from: 60,  to: 180, spawns: [{ enemy: 'goblin', perSec: 4 }, { enemy: 'brute', perSec: 0.2 }], hpScale: 1.2 },
  { from: 180, to: 360, spawns: [{ enemy: 'goblin', perSec: 6 }, { enemy: 'brute', perSec: 0.5 }], hpScale: 1.6 },
  { from: 360, to: 600, spawns: [{ enemy: 'goblin', perSec: 8 }, { enemy: 'brute', perSec: 1.0 }], hpScale: 2.2 },
];

export const ENEMY_SOFT_CAP = 500;   // director stops spawning here and buffs hp instead
