// rod: a javelin that pierces a line like a projectile, then plants in the ground where it stops
// (pierce spent or flight over) and zaps what is near it for a few seconds (Lightning Rod). The
// planting is done where a projectile ends (systems/movement.js, systems/collision.js -> plantRod in
// systems/hazards.js), driven by the weapon's `rod` params. docs/design-m30-m33.md §5.3.

import projectile from './projectile.js';

export default { ...projectile };
