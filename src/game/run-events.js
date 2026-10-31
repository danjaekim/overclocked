// Handlers for one-off timeline events (data/waves.js EVENTS). The director calls these.

import { spawnShrine } from '../systems/shrines.js';
import { spawnCrate } from '../systems/crates.js';
import { spawnEnemy, spawnElite, randomPerimeterPoint, pickTopUp } from './director.js';
import { ELITE } from '../data/elites.js';
import { RUN } from '../data/waves.js';
import { recentRawDps } from './run-stats.js';

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

  // A ring of enemies just off screen on every side, closing in together (data/waves.js EVENTS `horde`): `count` from the
  // current wave mix, plus `elites` brute or shieldbearer elites. Ignores MIN_ALIVE; ends quietly when the pool is full.
  horde(run, ev) {
    const t = run.time / (RUN.length / RUN.designLength);
    const r = Math.hypot(run.view.w, run.view.h) / 2 + 30;
    const total = ev.count + (ev.elites || 0);
    let made = 0;
    for (let k = 0; k < ev.count; k++) {
      const id = pickTopUp(run, t);
      if (!id) break;
      const a = (k / total) * Math.PI * 2;
      const f = spawnEnemy(run, id, run.player.x + Math.cos(a) * r, run.player.y + Math.sin(a) * r, run.director.hpScale);
      if (!f) break;
      f.fodder = 1;
      made++;
    }
    const ids = Object.keys(ELITE.affixes);
    for (let k = 0; k < (ev.elites || 0); k++) {
      const a = ((ev.count + k) / total) * Math.PI * 2;
      const kind = run.rng.next() < 0.5 ? 'brute' : 'shieldbearer';
      const affix = ids[Math.floor(run.rng.next() * ids.length)];
      if (spawnElite(run, kind, run.player.x + Math.cos(a) * r, run.player.y + Math.sin(a) * r, run.director.hpScale, affix)) made++;
    }
    if (made) { run.sfx('boss'); run.toast = { text: 'A horde closes in!', ttl: 3 }; }
  },

  // A boss enters from the view edge. Its hp is not scaled by the wave hpScale.
  boss(run, ev) {
    randomPerimeterPoint(run, tmp);
    const e = spawnEnemy(run, ev.enemy, tmp.x, tmp.y);
    if (!e) return;
    if (e.def.fight) {                                          // hp from the build: your damage per second over the last 20 s x the fight length, 1x to hpMaxMult x
      const hp = Math.min(e.def.hp * e.def.hpMaxMult, Math.max(e.def.hp, recentRawDps(run, 20) * e.def.rawShare * e.def.fight));
      e.maxHp = e.hp = hp;
      e.hpMult = hp / e.def.hp;
      run.stats.bossHpMult = run.stats.bossHpMult || {};
      run.stats.bossHpMult[e.defId] = Math.round(e.hpMult * 100) / 100;
    }
    run.boss = e;
    run.bossAlive = true;
    run.sfx('boss');
    run.toast = { text: `${e.def.name} approaches!`, ttl: 3 };
  },
};
