// Enemy movement: chase the player, push apart from close neighbours (every other tick,
// at most 4 neighbours), decay knockback, teleport stragglers back to the spawn perimeter.

import { randomPerimeterPoint } from '../game/director.js';

const SEP_RADIUS = 2.2;       // x enemy radius
const SEP_MAX_NEIGHBOURS = 4;
const SEP_SPEED = 55;         // world units / second of push at full overlap
const KNOCK_DECAY = 8;        // per second
const tmp = { x: 0, y: 0 };

export function updateEnemies(run, dt) {
  const w = run.world;
  const p = run.player;
  const list = w.enemies.active;
  const hash = w.hash;
  const scratch = w.scratch;
  const parity = w.tick & 1;
  const farSq = (run.view.h * 1.5) * (run.view.h * 1.5);
  const decay = Math.max(0, 1 - KNOCK_DECAY * dt);

  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;

    if (d2 > farSq) {                       // too far to matter: re-enter from the edge
      randomPerimeterPoint(run, tmp);
      e.x = tmp.x;
      e.y = tmp.y;
      continue;
    }

    if ((i & 1) === parity) {               // separation, half the enemies each tick
      const rad = e.r * SEP_RADIUS;
      const n = hash.queryRadius(e.x, e.y, rad, scratch);
      let px = 0;
      let py = 0;
      let used = 0;
      for (let k = 0; k < n && used < SEP_MAX_NEIGHBOURS; k++) {
        const o = scratch[k];
        if (o === e || !o.alive) continue;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const od = Math.hypot(ox, oy);
        if (od < 1e-3) { px += 1; used++; continue; }
        const f = 1 - od / rad;
        px += (ox / od) * f;
        py += (oy / od) * f;
        used++;
      }
      e.sx = px;
      e.sy = py;
    }

    const d = Math.sqrt(d2);
    const inv = d > 1e-3 ? 1 / d : 0;
    e.x += (dx * inv * e.speed + e.sx * SEP_SPEED + e.kx) * dt;
    e.y += (dy * inv * e.speed + e.sy * SEP_SPEED + e.ky) * dt;
    e.kx *= decay;
    e.ky *= decay;
    if (e.flash > 0) e.flash -= dt;
  }
}
