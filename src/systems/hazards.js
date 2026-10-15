// Hazards (docs/design-m26-m28.md §2): things the weapons leave in the world for a while.
//   patch   burning ground: ticks damage and burn on anything standing in it
//   vortex  pulls enemies toward a point, then bursts
//   pillar  a telegraphed column of light that hits everything in its radius once
//   wave    a slow ground shockwave that travels along a line and hits each enemy once
// One flat array on the run, capped. Damage is queued as PROC damage attributed to the weapon
// instance that made the hazard, so every perk, status and trigger applies as usual.

import { queueDamage, KIND_PROC } from './damage-queue.js';
import { applyBurn, applyChill, applyShock } from './status.js';
import { MAX_ENEMY_RADIUS } from '../data/enemies.js';
import { addPuff } from '../render/fx.js';

export const HAZARD_CAP = 90;
const PATCH = 0, VORTEX = 1, PILLAR = 2, WAVE = 3, BLAST = 4, SPIN = 5, RING = 6;
const TAU = Math.PI * 2;

function add(run, h) {
  const list = run.hazards;
  if (list.length >= HAZARD_CAP) {
    if (h.kind !== PATCH) {                 // a patch is the cheapest thing to lose: drop the oldest one
      const i = list.findIndex((o) => o.kind === PATCH);
      if (i < 0) return null;
      list.splice(i, 1);
    } else return null;
  }
  list.push(h);
  return h;
}

// status: what standing in it does besides damage: 'burn' (the default, null), 'chill', 'shock', 'bless'
// (marks the enemy and mends you a little) or 'none'. cause: the damage cause to credit (run stats).
export function addPatch(run, src, x, y, radius, ttl, tick, dmg, depth, shock = false, status = null, cause) {
  return add(run, { kind: PATCH, src, x, y, r: radius, ttl, life: ttl, tick, t: tick * 0.5, dmg, depth, shock, status, cause });
}

// Blades that circle an enemy and hit whatever is near it (graft payload "Whirling Blades"). They
// follow the enemy while it lives and stay where it died after that.
export function addSpin(run, src, target, radius, ttl, tick, dmg, depth, cause) {
  return add(run, { kind: SPIN, src, e: target, x: target.x, y: target.y, r: radius, ttl, life: ttl, tick, t: tick * 0.5, dmg, depth, cause });
}

// A ring that grows from (x, y) (or from the player, follow) to rMax, hitting each enemy once as its
// edge reaches it. status 'bless' marks what it hits and heals you `heal` per enemy (capped per ring).
export function addRing(run, src, x, y, rMax, speed, dmg, depth, opts = {}) {
  const life = rMax / speed + 0.25;
  return add(run, { kind: RING, src, x, y, rr: 0, rMax, speed, ttl: life, life, dmg, depth, hit: new Set(), follow: !!opts.follow, status: opts.status || null, heal: opts.heal || 0, healed: 0, color: opts.color || '#fff3b0', cause: opts.cause, kb: opts.kb === undefined ? 60 : opts.kb });
}
export function addVortex(run, src, x, y, radius, ttl, pull, dmg, depth) {
  return add(run, { kind: VORTEX, src, x, y, r: radius, ttl, life: ttl, pull, dmg, depth });
}
export function addPillar(run, src, x, y, radius, tele, dmg, depth, cause) {
  const wr = src && src.graft && src.graft.hooks.wrath;          // Wrath: the pillar stays and joins the lightning net
  const life = tele + 0.3 + (wr ? wr.stay : 0);
  return add(run, { kind: PILLAR, src, x, y, r: radius, ttl: life, tele, life, dmg, depth, done: false, net: !!wr, cause });
}
export function addWave(run, src, x, y, dx, dy, speed, range, width, dmg, depth) {
  return add(run, { kind: WAVE, src, x, y, dx, dy, speed, left: range, r: width, ttl: range / speed + 0.2, life: range / speed + 0.2, dmg, depth, hit: new Set() });
}

// A telegraphed burst that also lays statuses on everything it hits (Thunderscythe's storm shells).
// flags: { burn, shock, chill }
export function addBlast(run, src, x, y, radius, tele, dmg, depth, flags, cause) {
  return add(run, { kind: BLAST, src, x, y, r: radius, ttl: tele + 0.15, tele, life: tele + 0.15, dmg, depth, flags, done: false, cause });
}

// The nearest vortex within `range` of a point, or null (Eventide Volley's arrows bend toward it).
export function nearestVortex(run, x, y, range) {
  let best = null;
  let bd = range * range;
  const list = run.hazards;
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    if (h.kind !== VORTEX) continue;
    const d = (h.x - x) * (h.x - x) + (h.y - y) * (h.y - y);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

function hitCircle(run, h, x, y, r, dmg, kb, burn = false) {
  const w = run.world;
  const n = w.hash.queryRadius(x, y, r + MAX_ENEMY_RADIUS, w.scratch);
  for (let i = 0; i < n; i++) {
    const e = w.scratch[i];
    if (!e.alive) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const rr = r + e.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    const d = Math.hypot(dx, dy) || 1;
    queueDamage(run, e, dmg, false, (dx / d) * kb, (dy / d) * kb, h.depth + 1, h.src, KIND_PROC, h.cause);
    if (burn) applyBurn(run, e, h.src, dmg, h.depth + 1);
  }
}

export function updateHazards(run, dt) {
  const list = run.hazards;
  if (list.length === 0) return;
  const w = run.world;
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i];
    h.ttl -= dt;
    if (h.kind === PATCH) {
      h.t -= dt;
      if (h.t <= 0) {
        let healed = 0;
        h.t += h.tick;
        const n = w.hash.queryRadius(h.x, h.y, h.r + MAX_ENEMY_RADIUS, w.scratch);
        for (let k = 0; k < n; k++) {
          const e = w.scratch[k];
          if (!e.alive) continue;
          const dx = e.x - h.x;
          const dy = e.y - h.y;
          const rr = h.r + e.r;
          if (dx * dx + dy * dy > rr * rr) continue;
          queueDamage(run, e, h.dmg, false, 0, 0, h.depth + 1, h.src, KIND_PROC, h.cause);
          const st = h.status;
          if (!st || st === 'burn') applyBurn(run, e, h.src, h.dmg, h.depth + 1);
          if (h.shock || st === 'shock') applyShock(run, e, h.src);
          if (st === 'chill') applyChill(run, e, h.src, h.depth + 1);
          if (st === 'bless') {
            e.blessT = 2;
            if (healed < 4) { healed++; run.player.hp = Math.min(run.player.maxHp, run.player.hp + 0.5); }
          }
        }
      }
    } else if (h.kind === SPIN) {
      if (h.e && h.e.alive && h.e.uid !== undefined) { h.x = h.e.x; h.y = h.e.y; }
      h.t -= dt;
      if (h.t <= 0) {
        h.t += h.tick;
        hitCircle(run, h, h.x, h.y, h.r, h.dmg, 25);
      }
    } else if (h.kind === RING) {
      if (h.follow) { h.x = run.player.x; h.y = run.player.y; }
      h.rr = Math.min(h.rMax, h.rr + h.speed * dt);
      const n = w.hash.queryRadius(h.x, h.y, h.rr + MAX_ENEMY_RADIUS, w.scratch);
      for (let k = 0; k < n; k++) {
        const e = w.scratch[k];
        if (!e.alive || h.hit.has(e.uid)) continue;
        const dx = e.x - h.x;
        const dy = e.y - h.y;
        const rr = h.rr + e.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        h.hit.add(e.uid);
        const d = Math.hypot(dx, dy) || 1;
        queueDamage(run, e, h.dmg, false, (dx / d) * h.kb, (dy / d) * h.kb, h.depth + 1, h.src, KIND_PROC, h.cause);
        if (h.status === 'bless') {
          e.blessT = 2;
          if (h.healed < 6) { h.healed++; run.player.hp = Math.min(run.player.maxHp, run.player.hp + h.heal); }
        }
      }
      if (h.rr >= h.rMax) h.ttl = Math.min(h.ttl, 0.12);
    } else if (h.kind === VORTEX) {
      const reach = h.r * 1.4;
      const star = h.src && h.src.graft && h.src.graft.hooks.burnVortex;     // Black Sun: a burning star
      let burnNow = false;
      if (star && (h.bt = (h.bt || 0) - dt) <= 0) { h.bt += 0.3; burnNow = true; }
      const n = w.hash.queryRadius(h.x, h.y, reach + MAX_ENEMY_RADIUS, w.scratch);
      for (let k = 0; k < n; k++) {
        const e = w.scratch[k];
        if (!e.alive) continue;
        const dx = h.x - e.x;
        const dy = h.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d > reach || d < 6) continue;
        const step = Math.min(d, h.pull * (e.def.boss ? 0.15 : 1) * dt);
        e.x += (dx / d) * step;
        e.y += (dy / d) * step;
        if (burnNow) applyBurn(run, e, h.src, h.dmg * 0.2, h.depth + 1);
      }
      if (h.ttl <= 0) {                                      // the collapse
        hitCircle(run, h, h.x, h.y, h.r, h.dmg, 120, !!star);
        addPuff(run, h.x, h.y, h.r / 2.2, star ? '#ff9a3c' : '#c58bff');
        if (star) addPatch(run, h.src, h.x, h.y, h.r * 0.7, star.patchTtl, 0.5, h.dmg * 0.1, h.depth);
      }
    } else if (h.kind === BLAST) {
      if (!h.done && h.life - h.ttl >= h.tele) {
        h.done = true;
        const n = w.hash.queryRadius(h.x, h.y, h.r + MAX_ENEMY_RADIUS, w.scratch);
        for (let k = 0; k < n; k++) {
          const e = w.scratch[k];
          if (!e.alive) continue;
          const dx = e.x - h.x;
          const dy = e.y - h.y;
          const rr = h.r + e.r;
          if (dx * dx + dy * dy > rr * rr) continue;
          const d = Math.hypot(dx, dy) || 1;
          queueDamage(run, e, h.dmg, false, (dx / d) * 50, (dy / d) * 50, h.depth + 1, h.src, KIND_PROC, h.cause);
          if (h.flags.burn) applyBurn(run, e, h.src, h.dmg, h.depth + 1);
          if (h.flags.shock) applyShock(run, e, h.src);
          if (h.flags.chill) applyChill(run, e, h.src, h.depth + 1);
        }
        addPuff(run, h.x, h.y, h.r / 1.8, h.flags.shock ? '#ffe066' : '#ff9a3c');
      }
    } else if (h.kind === PILLAR) {
      if (!h.done && h.life - h.ttl >= h.tele) {
        h.done = true;
        hitCircle(run, h, h.x, h.y, h.r, h.dmg, 40);
        addPuff(run, h.x, h.y, h.r / 1.6, '#fff3b0');
      }
    } else {                                                 // WAVE
      const step = Math.min(h.left, h.speed * dt);
      h.x += h.dx * step;
      h.y += h.dy * step;
      h.left -= step;
      const ck = h.src && h.src.graft && h.src.graft.hooks.crack;           // Fault Line: the wave leaves a burning, shocking crack
      if (ck) {
        h.cd = (h.cd || 0) + step;
        while (h.cd >= ck.every) {
          h.cd -= ck.every;
          addPatch(run, h.src, h.x - h.dx * h.cd, h.y - h.dy * h.cd, ck.radius, ck.ttl, ck.tick, h.dmg * ck.damageFrac, h.depth, true);
        }
      }
      const n = w.hash.queryRadius(h.x, h.y, h.r + MAX_ENEMY_RADIUS, w.scratch);
      for (let k = 0; k < n; k++) {
        const e = w.scratch[k];
        if (!e.alive || h.hit.has(e.uid)) continue;
        const dx = e.x - h.x;
        const dy = e.y - h.y;
        const rr = h.r + e.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        h.hit.add(e.uid);
        queueDamage(run, e, h.dmg, false, h.dx * 90, h.dy * 90, h.depth + 1, h.src, KIND_PROC);
      }
      if (h.left <= 0) h.ttl = Math.min(h.ttl, 0.15);
    }
    if (h.ttl <= 0) {
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
  netStep(run, dt);
}

// Wrath: every live pillar of a Wrath weapon is joined to the next by lightning. Anything standing
// on a link takes a share of the pillar's damage and is shocked, every 0.35 s.
const NET_TICK = 0.35;
function netStep(run, dt) {
  const list = run.hazards;
  const nodes = [];
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    if (h.kind === PILLAR && h.net && h.done) nodes.push(h);
  }
  if (nodes.length < 2) { run.netT = 0; run.netLinks = null; return; }
  run.netLinks = nodes;
  run.netT = (run.netT || 0) - dt;
  if (run.netT > 0) return;
  run.netT += NET_TICK;
  const w = run.world;
  const seen = new Set();
  for (let a = 0; a < nodes.length - 1; a++) {
    const p = nodes[a];
    const q = nodes[a + 1];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const steps = Math.max(1, Math.ceil(len / 36));
    for (let s = 0; s <= steps; s++) {
      const x = p.x + ((q.x - p.x) * s) / steps;
      const y = p.y + ((q.y - p.y) * s) / steps;
      const n = w.hash.queryRadius(x, y, 26 + MAX_ENEMY_RADIUS, w.scratch);
      for (let k = 0; k < n; k++) {
        const e = w.scratch[k];
        if (!e.alive || seen.has(e.uid)) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        const rr = 26 + e.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        seen.add(e.uid);
        queueDamage(run, e, p.dmg * p.src.graft.hooks.wrath.linkFrac, false, 0, 0, p.depth + 1, p.src, KIND_PROC);
        applyShock(run, e, p.src);
      }
    }
  }
}

const PATCH_COLORS = { burn: ['#ff6a2e', '#ffb45e'], chill: ['#6ec8ff', '#d6f1ff'], shock: ['#ffd23a', '#fff3a8'], bless: ['#ffc83a', '#fff3b0'], none: ['#b9a7ff', '#e4dcff'] };

// Drawn under the enemies. Everything here is cheap strokes and fills.
export function drawHazards(ctx, run) {
  const list = run.hazards;
  if (list.length === 0) return;
  const t = run.time;
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    const k = h.ttl / h.life;                                // 1 -> 0
    if (h.kind === SPIN) {
      ctx.strokeStyle = '#fff1c4';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.globalAlpha = Math.min(1, k * 3) * 0.95;
      ctx.beginPath();
      const a0 = t * 11;
      for (let b = 0; b < 3; b++) {
        const a = a0 + (b * TAU) / 3;
        ctx.moveTo(h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r);
        ctx.arc(h.x, h.y, h.r, a, a + 0.7);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    } else if (h.kind === RING) {
      ctx.strokeStyle = h.color;
      ctx.lineWidth = 4 * (1 - 0.6 * (h.rr / h.rMax));
      ctx.globalAlpha = 0.75 * (1 - 0.7 * (h.rr / h.rMax));
      ctx.beginPath();
      ctx.arc(h.x, h.y, Math.max(1, h.rr), 0, TAU);
      ctx.stroke();
    } else if (h.kind === PATCH) {
      const col = PATCH_COLORS[h.status || 'burn'] || PATCH_COLORS.burn;
      ctx.globalAlpha = Math.min(1, k * 2) * 0.28;
      ctx.fillStyle = h.shock && !h.status ? '#ff6a2e' : col[0];
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r * (0.9 + 0.1 * Math.sin(t * 9 + h.x)), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = Math.min(1, k * 2) * 0.5;
      ctx.strokeStyle = col[1];
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (h.kind === VORTEX) {
      const spin = t * 5;
      ctx.strokeStyle = h.src && h.src.graft && h.src.graft.hooks.burnVortex ? '#ff8a3c' : '#c58bff';
      ctx.lineWidth = 2.5;
      for (let r = 0; r < 3; r++) {
        const rad = h.r * (0.35 + r * 0.3) * (1.05 - 0.25 * (1 - k));
        ctx.globalAlpha = 0.35 + 0.15 * r;
        ctx.beginPath();
        ctx.arc(h.x, h.y, rad, spin + r, spin + r + 4.2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#2a1646';
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r * 0.28, 0, TAU);
      ctx.fill();
    } else if (h.kind === BLAST) {
      const age = h.life - h.ttl;
      if (age < h.tele) {                                    // a ring closing on the shell
        ctx.globalAlpha = 0.3 + 0.5 * (age / h.tele);
        ctx.strokeStyle = h.flags.shock ? '#ffe066' : '#ff9a3c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r * (1.2 - 0.2 * (age / h.tele)), 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#ffb347';
        ctx.beginPath();
        ctx.arc(h.x, h.y, 4, 0, TAU);
        ctx.fill();
      }
    } else if (h.kind === PILLAR) {
      const age = h.life - h.ttl;
      if (age < h.tele) {                                    // telegraph: a ring closing in
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#fff3b0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r * (1.4 - 0.4 * (age / h.tele)), 0, TAU);
        ctx.stroke();
      } else {
        const f = h.net ? Math.max(0.3, 1 - (age - h.tele) / 0.3) * Math.min(1, h.ttl * 2) : 1 - (age - h.tele) / 0.3;
        ctx.globalAlpha = 0.75 * f;
        ctx.fillStyle = '#fff3b0';
        ctx.fillRect(h.x - h.r * 0.5, h.y - 260, h.r, 260);
        ctx.globalAlpha = 0.45 * f;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.globalAlpha = Math.min(1, k * 3) * 0.55;
      ctx.strokeStyle = '#ffe3a3';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const nx = -h.dy * h.r * 0.9;
      const ny = h.dx * h.r * 0.9;
      ctx.moveTo(h.x + nx - h.dx * 14, h.y + ny - h.dy * 14);
      ctx.lineTo(h.x - nx - h.dx * 14, h.y - ny - h.dy * 14);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }
  const links = run.netLinks;
  if (links && links.length > 1) {                           // Wrath's lightning between pillars
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let i = 0; i < links.length - 1; i++) {
      const a = links[i];
      const b = links[i + 1];
      ctx.moveTo(a.x, a.y);
      const mx = (a.x + b.x) / 2 + Math.sin(t * 40 + i) * 8;
      const my = (a.y + b.y) / 2 + Math.cos(t * 37 + i) * 8;
      ctx.lineTo(mx, my);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
