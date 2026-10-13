// Behavior registry: id -> behavior. A behavior is
//   { uses, init(inst, run), update(inst, dt, run), draw?(inst, ctx, run) }.
// Adding one = a new file here plus one line below; nothing else should need to change.

import projectile from './projectile.js';
import arc from './arc.js';
import orbit from './orbit.js';
import aura from './aura.js';

export const BEHAVIORS = {
  projectile,
  arc,
  orbit,
  aura,
};
