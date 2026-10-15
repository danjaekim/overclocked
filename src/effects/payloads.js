// Graft payloads (docs/design-m30-m33.md §3): what a generic graft adds to every attack of its host.
// The host's first hit of an attack calls firePayload (game/triggers.js), which runs the payload the
// donor's shape picked (data/grafts.js SHAPE_PAYLOAD). Every payload hit is PROC damage at depth + 1
// credited to the cause "Graft", and its projectiles resolve at depth 1, so a payload never fires a
// payload. Damage is the payload's frac x the host's own current damage.

import { param } from '../game/weapon-params.js';
import { PAYLOADS, GRAFT } from '../data/grafts.js';
import { queueDamage, KIND_PROC, CAUSE } from '../systems/damage-queue.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { addPuff, addArc } from '../render/fx.js';
import { addPatch, addSpin, addRing, addPillar, addBlast } from '../systems/hazards.js';
import { spawnProjectile, markHit } from '../game/projectiles.js';
import { chainArc, stagger } from '../systems/status.js';
import { MAX_TRIGGER_DEPTH } from './index.js';

const SAW_HOPS = 3;
const area = (run, src) => run.player.stats.getFor('area', src.tags);

// Direction from the player through the target (the way an attack was travelling).
function dirAway(run, e) {
  const p = run.player;
  let dx = e.x - p.x;
  let dy = e.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) { const a = run.fxRng.next() * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; }
  dx /= d; dy /= d;
  return [dx, dy];
}

// A small shot that cannot start another payload and does not hit the enemy that spawned it.
function shot(run, src, e, a, speed, dmg, ttl, r, pierce, look = 0) {
  const pr = spawnProjectile(run, src, e.x, e.y, Math.cos(a), Math.sin(a), speed, dmg, ttl, r, pierce);
  if (!pr) return null;
  pr.look = look;
  pr.sub = true;
  pr.depth = 1;
  markHit(pr, e.uid);
  return pr;
}

function circleHits(run, src, x, y, radius, dmg, depth, kb, filter) {
  const w = run.world;
  const n = w.hash.queryRadius(x, y, radius + MAX_ENEMY_RADIUS, w.scratch);
  for (let i = 0; i < n; i++) {
    const o = w.scratch[i];
    if (!o.alive) continue;
    const dx = o.x - x;
    const dy = o.y - y;
    const rr = radius + o.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    if (filter && !filter(dx, dy)) continue;
    const d = Math.hypot(dx, dy) || 1;
    queueDamage(run, o, dmg, false, (dx / d) * kb, (dy / d) * kb, depth + 1, src, KIND_PROC, CAUSE.GRAFT);
  }
}

// flags: the donor's elements as status flags for blasts and patches
function statusOf(g) {
  if (g.elements.includes('frost')) return 'chill';
  if (g.elements.includes('storm')) return 'shock';
  if (g.elements.includes('fire')) return 'burn';
  if (g.light) return 'bless';
  return 'none';
}

const FX = {
  shrapnel(run, src, e, dmg) {
    const near = nearestOthers(run, e, 3, 220);
    if (near.length) {                                       // at the nearest other enemies, so it works in a crowd
      for (const o of near) shot(run, src, e, Math.atan2(o.y - e.y, o.x - e.x), 520, dmg, 0.5, 5, 1);
      return;
    }
    const [dx, dy] = dirAway(run, e);                        // nothing near: a fan onward
    const a0 = Math.atan2(dy, dx);
    for (let i = -1; i <= 1; i++) shot(run, src, e, a0 + i * 0.43, 520, dmg, 0.5, 5, 1);
  },

  cleave(run, src, e, dmg, depth) {
    const [dx, dy] = dirAway(run, e);
    const r = 55 * area(run, src);
    circleHits(run, src, e.x, e.y, r, dmg, depth, 60, (ox, oy) => ox * dx + oy * dy > -4);     // the half beyond the target
    addPuff(run, e.x + dx * r * 0.35, e.y + dy * r * 0.35, r / 2.2, '#f4ecd8');
  },

  spin(run, src, e, dmg, depth) {
    addSpin(run, src, e, 34 * area(run, src), 1.2, 0.2, dmg, depth, CAUSE.GRAFT);
  },

  imprint(run, src, e, dmg, depth) {
    const g = src.graft;
    addPatch(run, src, e.x, e.y, 42 * area(run, src), 2, 0.4, dmg, depth, false, statusOf(g), CAUSE.GRAFT);
  },

  arc(run, src, e, dmg, depth, hops) {
    chainArc(run, e, src, dmg, depth, hops, 1, CAUSE.GRAFT, src.graft.elements.includes('storm'));
  },

  burst(run, src, e, dmg) {
    const a0 = run.fxRng.next() * Math.PI * 2;
    for (let i = 0; i < 6; i++) shot(run, src, e, a0 + (i * Math.PI * 2) / 6, 320, dmg, 0.5, 6, 1, 2);
    addPuff(run, e.x, e.y, 18, '#cfeaff');
  },

  blast(run, src, e, dmg, depth) {
    const st = statusOf(src.graft);
    addBlast(run, src, e.x, e.y, 55 * area(run, src), 0.3, dmg, depth, { burn: st === 'burn', shock: st === 'shock', chill: st === 'chill' }, CAUSE.GRAFT);
  },

  pounce(run, src, e, dmg, depth) {
    const p = run.player;
    addArc(run, p.x, p.y, e.x, e.y);
    circleHits(run, src, e.x, e.y, 40 * area(run, src), dmg, depth, 90);
    addPuff(run, e.x, e.y, 20, '#d9c9ff');
  },

  smite(run, src, e, dmg, depth) {
    addPillar(run, src, e.x, e.y, 45 * area(run, src), 0.25, dmg, depth, CAUSE.GRAFT);
  },

  // Two saw discs leave the target for the nearest other enemies and keep hopping (never to one they
  // have cut), the way a Ricochet Saw does. Alone in the world they cut out and back through it.
  saw(run, src, e, dmg) {
    const near = nearestOthers(run, e, 2, 260);
    const aims = near.map((o) => Math.atan2(o.y - e.y, o.x - e.x));
    if (aims.length < 2) {
      const [dx, dy] = dirAway(run, e);
      const a = Math.atan2(dy, dx);
      if (aims.length === 0) aims.push(a);
      aims.push(aims[0] + Math.PI);
    }
    for (const a of aims) {
      const pr = shot(run, src, e, a, 380, dmg, 0.9, 11, 0, 1);
      if (pr) pr.bounce += SAW_HOPS;                       // on top of any Ricochet perk
    }
  },

  frost_step(run, src, e, dmg, depth) {
    addPatch(run, src, e.x, e.y, 30 * area(run, src), 1.5, 0.4, dmg, depth, false, 'chill', CAUSE.GRAFT);
  },

  ripple(run, src, e, dmg, depth) {
    const st = src.graft.light ? 'bless' : null;
    addRing(run, src, e.x, e.y, 70 * area(run, src), 220, dmg, depth, { status: st, heal: 0.5, cause: CAUSE.GRAFT, color: '#fff3b0' });
  },

  quake(run, src, e, dmg, depth) {
    circleHits(run, src, e.x, e.y, 45 * area(run, src), dmg, depth, 140);
    for (const o of nearStun(run, e, 45 * area(run, src))) stagger(o, 0.25);
    addPuff(run, e.x, e.y, 22, '#c9b79a');
  },

  spark(run, src, e, dmg, depth) {
    addPatch(run, src, e.x, e.y, 40 * area(run, src), 1.2, 0.4, dmg, depth, true, 'shock', CAUSE.GRAFT);
  },
};

// The `count` living enemies nearest to e (not e itself) within range.
function nearestOthers(run, e, count, range) {
  const w = run.world;
  const n = w.hash.queryRadius(e.x, e.y, range + MAX_ENEMY_RADIUS, w.scratch);
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = w.scratch[i];
    if (!o.alive || o === e) continue;
    const d = (o.x - e.x) * (o.x - e.x) + (o.y - e.y) * (o.y - e.y);
    if (d > range * range) continue;
    let k = out.length;
    while (k > 0 && out[k - 1].d > d) k--;
    if (k < count) { out.splice(k, 0, { o, d }); if (out.length > count) out.pop(); }
  }
  return out.map((x) => x.o);
}

// Enemies inside the circle that can be staggered.
function nearStun(run, e, r) {
  const w = run.world;
  const out = [];
  const n = w.hash.queryRadius(e.x, e.y, r + MAX_ENEMY_RADIUS, w.scratch);
  for (let i = 0; i < n; i++) {
    const o = w.scratch[i];
    if (!o.alive) continue;
    const dx = o.x - e.x;
    const dy = o.y - e.y;
    const rr = r + o.r;
    if (dx * dx + dy * dy <= rr * rr) out.push(o);
  }
  return out;
}

// Called by game/triggers.js for the first hit of an armed attack. Returns true if it fired.
export function firePayload(run, src, target, depth) {
  const g = src.graft;
  if (!g || !g.payload || depth + 1 > MAX_TRIGGER_DEPTH) return false;
  const spec = PAYLOADS[g.payload];
  const gap = spec.gap !== undefined ? spec.gap : 0;
  if (run.time - (src.payloadAt === undefined ? -1e9 : src.payloadAt) < Math.max(gap, GRAFT.payloadMinGap)) return false;
  src.payloadAt = run.time;
  const dmg = param(run, src, 'damage') * spec.frac;
  if (g.payload === 'arc') FX.arc(run, src, target, dmg, depth, 1);
  else if (g.payload === 'arc2') FX.arc(run, src, target, dmg, depth, 2);
  else FX[g.payload](run, src, target, dmg, depth);
  return true;
}

export const PAYLOAD_FX = FX;
