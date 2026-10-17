// Spawn director: reads data/waves.js and spawns enemies on the perimeter just outside
// the view. At the soft cap it stops spawning and buffs enemy hp so pressure keeps rising.

import { ELITE, affixDefs } from '../data/elites.js';
import { ENEMIES, PROPS } from '../data/enemies.js';
import { RUN, WAVES, EVENTS, ENEMY_SOFT_CAP, RATE_RAMP } from '../data/waves.js';
import { RUN_EVENTS } from './run-events.js';
import { perimeterPoint, lerp } from '../core/math.js';

const SPAWN_MARGIN = 40;
const CAP_BUFF_PER_SEC = 0.01;
const tmp = { x: 0, y: 0 };

// speedScale defaults to the director's current ramp (data/waves.js `speedScale`), so every spawn path
// (waves, elites, the boss) gets the same time-based pressure.
export function spawnEnemy(run, defId, x, y, hpScale = 1, speedScale) {
  const w = run.world;
  const e = w.enemies.acquire();
  if (!e) return null;
  const def = ENEMIES[defId] || PROPS[defId];
  e.uid = w.nextUid++;
  e.defId = defId;
  e.def = def;
  e.x = x;
  e.y = y;
  e.r = def.radius;
  e.maxHp = e.hp = def.hp * hpScale;
  e.speed = def.speed * run.rng.range(0.9, 1.1) * (speedScale !== undefined ? speedScale : (run.director ? run.director.speedScale : 1));
  e.damage = def.damage * (run.director ? run.director.damageScale : 1);
  e.sx = e.sy = e.kx = e.ky = 0;
  e.flash = 0;
  e.ai = 0;
  e.aiT = 0;
  e.aiCd = def.charge ? def.charge.every : def.caster ? 2.5 : def.slam ? def.slam.every * 0.5 : def.ranged ? def.ranged.cooldown * run.rng.range(0.3, 1) : 0;
  e.armor = def.armor ? def.armor * Math.sqrt(hpScale) : 0;
  e.elite = 0;
  e.affix = '';
  e.affix2 = '';
  e.wardT = 0;
  e.lastHitT = -1e9;
  e.status = 0;
  e.burnDps = e.burnT = e.burnAcc = 0;
  e.burnSrc = null;
  e.chill = 0;
  e.chillT = e.freezeT = e.freezeImm = e.shockT = 0;
  e.slowMul = 1;
  e.sunderT = e.blessT = 0;
  e.stunT = 0;
  e.prop = def.prop ? 1 : 0;
  if (e.prop) e.aiCd = def.ttl;                    // a prop's aiCd counts down its life
  return e;
}

// An elite: the same def with a bigger body, more hp and damage, and one affix.
export function spawnElite(run, defId, x, y, hpScale, affixId, affix2Id = '') {
  const e = spawnEnemy(run, defId, x, y, hpScale);
  if (!e) return null;
  e.elite = 1;
  e.affix = affixId;
  e.affix2 = affix2Id;
  e.maxHp = e.hp = e.maxHp * ELITE.hpMult;
  e.r *= ELITE.radiusMult;
  e.damage *= ELITE.damageMult;
  for (const a of affixDefs(e)) {
    if (a.speedMult) e.speed *= a.speedMult;
    if (a.armor) e.armor += a.armor;
  }
  return e;
}

// A random point just outside the visible area, centred on the camera.
export function randomPerimeterPoint(run, out) {
  const v = run.view;
  return perimeterPoint(
    run.cam.x, run.cam.y,
    v.w / 2 + SPAWN_MARGIN, v.h / 2 + SPAWN_MARGIN,
    run.rng.next(), out
  );
}

export function createDirector(run) {
  const timeScale = RUN.length / RUN.designLength;
  // one accumulator per spawn entry, per segment
  const acc = WAVES.map((seg) => seg.spawns.map(() => 0));
  let capBuff = 0;
  let hpScale = 1;
  let speedScale = 1;
  let damageScale = 1;
  let nextEvent = 0;                                // EVENTS is sorted by `at`

  return {
    get hpScale() { return hpScale * (1 + capBuff); },
    get speedScale() { return speedScale; },
    get damageScale() { return damageScale; },
    get capBuff() { return capBuff; },

    // The closure state, for run snapshots (game/run-snapshot.js).
    getState() { return { acc: acc.map((a) => a.slice()), capBuff, hpScale, speedScale, damageScale, nextEvent }; },
    setState(st) {
      st.acc.forEach((a, i) => a.forEach((v, j) => { acc[i][j] = v; }));
      capBuff = st.capBuff; hpScale = st.hpScale; speedScale = st.speedScale; damageScale = st.damageScale; nextEvent = st.nextEvent;
    },

    update(dt) {
      const t = run.time / timeScale;                 // time on the authored timeline
      const atCap = run.world.enemies.count >= ENEMY_SOFT_CAP;
      if (atCap) capBuff += CAP_BUFF_PER_SEC * dt;

      const ramp = t <= RATE_RAMP.from ? 1 : lerp(1, RATE_RAMP.end, Math.min(1, (t - RATE_RAMP.from) / (RATE_RAMP.to - RATE_RAMP.from)));

      while (nextEvent < EVENTS.length && t >= EVENTS[nextEvent].at) {
        RUN_EVENTS[EVENTS[nextEvent].event](run, EVENTS[nextEvent]);
        nextEvent++;
      }

      for (let i = 0; i < WAVES.length; i++) {
        const seg = WAVES[i];
        if (t < seg.from || t >= seg.to) continue;
        hpScale = seg.hpScale;
        speedScale = seg.speedScale === undefined ? 1 : seg.speedScale;
        damageScale = seg.damageScale === undefined ? 1 : seg.damageScale;
        const u = (t - seg.from) / (seg.to - seg.from);
        for (let j = 0; j < seg.spawns.length; j++) {
          const s = seg.spawns[j];
          const rate = lerp(s.perSec, s.perSecEnd === undefined ? s.perSec : s.perSecEnd, u) * ramp;
          acc[i][j] += rate * dt;
          if (atCap) {
            if (acc[i][j] > 1) acc[i][j] = 1;         // no burst when room frees up
            continue;
          }
          while (acc[i][j] >= 1) {
            acc[i][j] -= 1;
            randomPerimeterPoint(run, tmp);
            if (!spawnEnemy(run, s.enemy, tmp.x, tmp.y, hpScale * (1 + capBuff))) {
              acc[i][j] = 0;                          // pool exhausted
              break;
            }
          }
        }
      }
    },
  };
}
