// Handlers for one-off timeline events (data/waves.js EVENTS). The director calls these.

import { spawnShrine } from '../systems/shrines.js';

export const RUN_EVENTS = {
  shrine(run) {
    spawnShrine(run);
  },
};
