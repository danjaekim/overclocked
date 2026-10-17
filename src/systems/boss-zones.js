// Ashen Seer's Meteor Fall: it stops, flashes, and marks several circles on the ground, one on
// the player and the rest scattered around. Each circle fills over `fuse` seconds, then blasts
// everything standing in it. Standing still is what gets you hit; so does running into the others.

import { damagePlayer } from './damage.js';
import { addBurst, addPuff, BURST_SLAM } from '../render/fx.js';

const TAU = Math.PI * 2;

export function castMeteors(run, e) {
  const c = e.def.caster;
  const p = run.player;
  const rage = e.hp <= e.maxHp * c.rageAt;
  const n = rage ? c.countRage : c.count;
  const scale = run.director ? run.director.damageScale : 1;
  for (let k = 0; k < n; k++) {
    let x = p.x;
    let y = p.y;
    if (k > 0) {                                      // the rest fall around the player, not on top of each other
      const a = run.rng.next() * TAU;
      const d = c.radius * 1.6 + run.rng.next() * c.spread;
      x += Math.cos(a) * d;
      y += Math.sin(a) * d;
    } else {                                          // the first is aimed a little ahead of a running player
      if (p.moving) {
        x += p.facingX * p.speed * c.lead;
        y += p.facingY * p.speed * c.lead;
      }
    }
    run.bossZones.push({ x, y, r: c.radius, t: 0, fuse: c.fuse + k * c.stagger, dmg: c.damage * scale });
  }
}

export function updateBossZones(run, dt) {
  const list = run.bossZones;
  if (list.length === 0) return;
  const p = run.player;
  for (let i = list.length - 1; i >= 0; i--) {
    const z = list[i];
    z.t += dt;
    if (z.t < z.fuse) continue;
    const dx = p.x - z.x;
    const dy = p.y - z.y;
    const rr = p.r + z.r;
    if (dx * dx + dy * dy <= rr * rr && p.iframes <= 0) damagePlayer(run, z.dmg);
    addBurst(run, z.x, z.y, z.r * 1.25, '#e8531e', BURST_SLAM, '#ffd34d');
    for (let k = 0; k < 6; k++) addPuff(run, z.x + (run.fxRng.next() - 0.5) * z.r, z.y + (run.fxRng.next() - 0.5) * z.r, 14, '#ffb347');
    list[i] = list[list.length - 1];
    list.pop();
  }
}

// Under the enemies: a dark disc with an ember rim that fills inward-out as the fuse burns.
export function drawBossZones(ctx, run) {
  const list = run.bossZones;
  for (let i = 0; i < list.length; i++) {
    const z = list[i];
    const f = Math.min(1, z.t / z.fuse);
    ctx.fillStyle = `rgba(232,83,30,${0.10 + 0.14 * f})`;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,211,77,${0.18 + 0.3 * f})`;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r * f, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = f > 0.7 && ((z.t * 12) | 0) % 2 ? '#fff3c4' : '#e8531e';
    ctx.lineWidth = 3;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
