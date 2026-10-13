// Behavior registry: id -> behavior. A behavior is { uses, init(inst, run), update(inst, dt, run) }.
// Adding one = a new file here plus one line below; nothing else should need to change.

import projectile from './projectile.js';

export const BEHAVIORS = {
  projectile,
};
