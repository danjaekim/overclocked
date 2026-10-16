// slam: the weapon leaps to the densest spot near the nearest enemies and craters it. A shadow marks
// the spot for 0.22 s, then everything inside `radius` takes a heavy hit, is thrown outward and is
// staggered (stunT: no moving, shooting or contact damage; bosses take half). With count > 1 the extra
// slams land on the opposite side of you. docs/design-m30-m33.md §5.1.

import { param } from '../game/weapon-params.js';
import { elementOf } from '../render/elements.js';
import { strike } from '../game/hit.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { attackTriggers } from '../game/triggers.js';
import { stagger } from '../systems/status.js';
import { addPuff, addBurst, BURST_SLAM } from '../render/fx.js';
import { drawHammer } from '../render/melee.js';
import { activeMutation } from '../game/starforge.js';
import { STARFORGE } from '../data/starforge.js';

const TELEGRAPH = 0.22;
const NEIGHBOUR = 60;          // how close counts as "in the crowd" when choosing the densest spot
const THROW = 2.6;             // knockback multiplier on top of the weapon's own knockback stat
const isAlive = (o) => o.alive;

export default {
  uses: ['damage', 'cooldown', 'area', 'projectiles', 'critChance', 'critMult', 'knockback'],

  init(inst) {
    inst.cd = 0.3;
    inst.pend = [];            // slams waiting to land: { x, y, t, r }
  },

  update(inst, dt, run) {
    const pend = inst.pend;
    for (let i = pend.length - 1; i >= 0; i--) {
      const s = pend[i];
      s.t -= dt;
      if (s.t <= 0) { pend.splice(i, 1); land(inst, run, s); }
    }
    inst.cd -= dt;
    if (inst.cd > 0) return;

    const p = run.player;
    const range = param(run, inst, 'range');
    const spot = densestSpot(run, p, range);
    if (!spot) { inst.cd = 0; return; }
    const radius = param(run, inst, 'radius');
    const count = Math.max(1, Math.round(param(run, inst, 'count')));
    pend.push({ x: spot.x, y: spot.y, t: TELEGRAPH, r: radius });
    const aim = Math.atan2(spot.y - p.y, spot.x - p.x);
    const dist = Math.max(Math.hypot(spot.x - p.x, spot.y - p.y), radius * 1.25 + 20);   // far enough that the second crater is its own
    for (let k = 1; k < count; k++) {                          // the hammer comes down behind you too (evenly round for more)
      const a = aim + (k * Math.PI * 2) / count;
      const d = dist;
      pend.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, t: TELEGRAPH, r: radius });
    }
    inst.cd += param(run, inst, 'cooldown');
    inst.aim = Math.atan2(spot.y - p.y, spot.x - p.x);
    inst.aimX = spot.x;
    inst.aimY = spot.y;
  },

  draw(inst, ctx) {
    const el = elementOf(inst);
    for (const s of inst.pend) {
      if (s.echo) {                                      // Starforge aftershock: a cyan ring that tightens onto the spot
        const k = Math.max(0, Math.min(1, s.t / activeEchoDelay(inst)));
        ctx.globalAlpha = 0.25 + 0.4 * (1 - k);
        ctx.strokeStyle = STARFORGE.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (0.6 + 0.4 * k), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      const u = 1 - s.t / TELEGRAPH;
      ctx.globalAlpha = 0.18 + 0.3 * u;
      ctx.fillStyle = el ? el.dark : '#1a1208';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (0.55 + 0.45 * u), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5 * u + 0.2;
      ctx.strokeStyle = el ? el.main : '#ffd9a0';
      ctx.lineWidth = el ? 3 : 2;
      ctx.stroke();
      drawHammer(ctx, s.x, s.y, s.r, u, el);
    }
    ctx.globalAlpha = 1;
  },
};

// Of the (up to) three nearest enemies in range, the one with the most others around it.
function densestSpot(run, p, range) {
  const w = run.world;
  const n = w.hash.queryRadius(p.x, p.y, range + MAX_ENEMY_RADIUS, w.scratch);
  let a = null, b = null, c = null, da = Infinity, db = Infinity, dc = Infinity;
  for (let i = 0; i < n; i++) {
    const e = w.scratch[i];
    if (!e.alive || e.prop === 1) continue;
    const d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
    if (d > (range + e.r) * (range + e.r)) continue;
    if (d < da) { c = b; dc = db; b = a; db = da; a = e; da = d; }
    else if (d < db) { c = b; dc = db; b = e; db = d; }
    else if (d < dc) { c = e; dc = d; }
  }
  if (!a) return null;
  let best = a;
  let bestN = -1;
  for (const e of [a, b, c]) {
    if (!e) continue;
    const m = w.hash.queryRadius(e.x, e.y, NEIGHBOUR + MAX_ENEMY_RADIUS, w.scratch);
    let k = 0;
    for (let i = 0; i < m; i++) {
      const o = w.scratch[i];
      if (o.alive && (o.x - e.x) * (o.x - e.x) + (o.y - e.y) * (o.y - e.y) <= (NEIGHBOUR + o.r) * (NEIGHBOUR + o.r)) k++;
    }
    if (k > bestN) { bestN = k; best = e; }
  }
  return { x: best.x, y: best.y };
}

function activeEchoDelay(inst) {
  const m = activeMutation(inst);
  return m ? m.delay : 0.4;
}

function land(inst, run, s) {
  const w = run.world;
  const def = inst.def.base;
  const dmg = param(run, inst, 'damage') * (s.echo ? s.frac : 1);
  const stun = (def.stun || 0.35) * run.player.stats.getFor('statusDuration', inst.tags);
  const n = w.hash.queryRadius(s.x, s.y, s.r + MAX_ENEMY_RADIUS, w.scratch);
  for (let i = 0; i < n; i++) {
    const e = w.scratch[i];
    if (!e.alive) continue;
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    const rr = s.r + e.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    const d = Math.hypot(dx, dy) || 1;
    const k = s.echo ? -s.pull * THROW : THROW;                     // an aftershock pulls inward
    strike(run, inst, e, dmg, (dx / d) * k, (dy / d) * k, s.echo ? 1 : 0);   // an aftershock is not a direct hit: Glacier Maul's shatter and the like only answer depth 0
    stagger(e, stun);
  }
  const el = elementOf(inst);
  const star = activeMutation(inst);
  if (s.echo) {
    addPuff(run, s.x, s.y, s.r / 2, STARFORGE.color);
    addPuff(run, s.x, s.y, s.r / 3.2, STARFORGE.light);
    return;                                              // an echo is not an attack: no triggers, no further echo
  }
  addBurst(run, s.x, s.y, s.r, el ? el.main : '#e8c690', BURST_SLAM, el ? el.light : '#fff1d6');
  addPuff(run, s.x, s.y, s.r / 2.4, el ? el.main : '#d9c3a0');
  if (star) inst.pend.push({ x: s.x, y: s.y, t: star.delay, r: s.r * star.radius, echo: true, frac: star.frac, pull: star.pull });
  attackTriggers(run, inst, s.x, s.y, inst.aim || 0);
}
