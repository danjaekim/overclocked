// Handlers for one-off timeline events (data/waves.js EVENTS). The director calls these.

import { spawnShrine } from '../systems/shrines.js';
import { spawnEnemy, spawnElite, randomPerimeterPoint } from './director.js';
import { ELITE } from '../data/elites.js';

const tmp = { x: 0, y: 0 };

export const RUN_EVENTS = {
  shrine(run) {
    spawnShrine(run);
  },

  // An elite enters from the view edge with a random affix; it drops a chest.
  elite(run, ev) {
    randomPerimeterPoint(run, tmp);
    const ids = Object.keys(ELITE.affixes);
    const affix = ids[Math.floor(run.rng.next() * ids.length)];
    const e = spawnElite(run, ev.enemy, tmp.x, tmp.y, run.director.hpScale, affix);
    if (!e) return;
    run.sfx('boss');
    run.toast = { text: `${ELITE.affixes[affix].name} ${e.def.name} approaches!`, ttl: 3 };
  },

  // The boss enters from the view edge. Its hp is not scaled by the wave hpScale.
  boss(run, ev) {
    randomPerimeterPoint(run, tmp);
    const e = spawnEnemy(run, ev.enemy, tmp.x, tmp.y);
    if (!e) return;
    run.boss = e;
    run.bossAlive = true;
    run.sfx('boss');
    run.toast = { text: `${e.def.name} approaches!`, ttl: 3 };
  },
};
