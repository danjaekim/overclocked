// Spawn director: reads data/waves.js and spawns enemies on the perimeter just outside
// the view. At the soft cap it stops spawning and buffs enemy hp so pressure keeps rising.

import { ENEMIES } from '../data/enemies.js';
import { RUN, WAVES, ENEMY_SOFT_CAP } from '../data/waves.js';
import { perimeterPoint, lerp } from '../core/math.js';

const SPAWN_MARGIN = 40;
const CAP_BUFF_PER_SEC = 0.01;
const tmp = { x: 0, y: 0 };

export function spawnEnemy(run, defId, x, y, hpScale = 1) {
  const w = run.world;
  const e = w.enemies.acquire();
  if (!e) return null;
  const def = ENEMIES[defId];
  e.uid = w.nextUid++;
  e.defId = defId;
  e.def = def;
  e.x = x;
  e.y = y;
  e.r = def.radius;
  e.maxHp = e.hp = def.hp * hpScale;
  e.speed = def.speed * run.rng.range(0.9, 1.1);
  e.damage = def.damage;
  e.sx = e.sy = e.kx = e.ky = 0;
  e.flash = 0;
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

  return {
    get hpScale() { return hpScale * (1 + capBuff); },
    get capBuff() { return capBuff; },

    update(dt) {
      const t = run.time / timeScale;                 // time on the authored timeline
      const atCap = run.world.enemies.count >= ENEMY_SOFT_CAP;
      if (atCap) capBuff += CAP_BUFF_PER_SEC * dt;

      for (let i = 0; i < WAVES.length; i++) {
        const seg = WAVES[i];
        if (t < seg.from || t >= seg.to) continue;
        hpScale = seg.hpScale;
        const u = (t - seg.from) / (seg.to - seg.from);
        for (let j = 0; j < seg.spawns.length; j++) {
          const s = seg.spawns[j];
          const rate = lerp(s.perSec, s.perSecEnd === undefined ? s.perSec : s.perSecEnd, u);
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
