// Handlers for one-off timeline events (data/waves.js EVENTS). The director calls these.

import { spawnShrine } from '../systems/shrines.js';
import { spawnCrate } from '../systems/crates.js';
import { spawnEnemy, spawnElite, randomPerimeterPoint } from './director.js';
import { ELITE } from '../data/elites.js';
import { RUN } from '../data/waves.js';

const tmp = { x: 0, y: 0 };

export const RUN_EVENTS = {
  shrine(run) {
    spawnShrine(run);
  },

  // A supply crate just past the view edge (data/crates.js); skipped if two are already out there.
  crate(run) {
    spawnCrate(run);
  },

  // An elite enters from the view edge with a random affix; it drops a chest.
  elite(run, ev) {
    randomPerimeterPoint(run, tmp);
    const ids = Object.keys(ELITE.affixes);
    const affix = ids[Math.floor(run.rng.next() * ids.length)];
    let affix2 = '';                                           // late elites carry a second, different affix
    if (run.time >= ELITE.secondAffixAfter * (RUN.length / RUN.designLength)) {
      const rest = ids.filter((id) => id !== affix);
      affix2 = rest[Math.floor(run.rng.next() * rest.length)];
    }
    const e = spawnElite(run, ev.enemy, tmp.x, tmp.y, run.director.hpScale, affix, affix2);
    if (!e) return;
    run.sfx('boss');
    const names = [affix, affix2].filter(Boolean).map((id) => ELITE.affixes[id].name).join(' ');
    run.toast = { text: `${names} ${e.def.name} approaches!`, ttl: 3 };
  },

  // A mid-boss without a new sprite: two Shieldbearer elites march in with a pack of Slingers.
  warparty(run) {
    const ids = ['armoured', 'swift', 'volatile', 'warded'];
    for (let k = 0; k < 2; k++) {
      randomPerimeterPoint(run, tmp);
      spawnElite(run, 'shieldbearer', tmp.x, tmp.y, run.director.hpScale, ids[Math.floor(run.rng.next() * ids.length)]);
    }
    for (let k = 0; k < 6; k++) {
      randomPerimeterPoint(run, tmp);
      spawnEnemy(run, 'slinger', tmp.x, tmp.y, run.director.hpScale);
    }
    run.sfx('boss');
    run.toast = { text: 'A war party approaches!', ttl: 3.5 };
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
