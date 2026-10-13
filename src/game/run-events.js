// Handlers for one-off timeline events (data/waves.js EVENTS). The director calls these.

import { spawnShrine } from '../systems/shrines.js';
import { spawnEnemy, randomPerimeterPoint } from './director.js';

const tmp = { x: 0, y: 0 };

export const RUN_EVENTS = {
  shrine(run) {
    spawnShrine(run);
  },

  // The boss enters from the view edge. Its hp is not scaled by the wave hpScale.
  boss(run, ev) {
    randomPerimeterPoint(run, tmp);
    const e = spawnEnemy(run, ev.enemy, tmp.x, tmp.y);
    if (!e) return;
    run.boss = e;
    run.bossAlive = true;
    run.toast = { text: `${e.def.name} approaches!`, ttl: 3 };
  },
};
