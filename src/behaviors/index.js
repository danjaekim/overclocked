// Behavior registry: id -> behavior. A behavior is
//   { uses, init(inst, run), update(inst, dt, run), draw?(inst, ctx, run) }.
// Adding one = a new file here plus one line below; nothing else should need to change.

import projectile from './projectile.js';
import arc from './arc.js';
import orbit from './orbit.js';
import aura from './aura.js';
import nova from './nova.js';
import bolt from './bolt.js';
import boomerang from './returning-disc.js';
import mortar from './mortar.js';
import summon from './summon.js';

export const BEHAVIORS = {
  projectile,
  arc,
  orbit,
  aura,
  nova,
  bolt,
  boomerang,
  mortar,
  summon,
};
