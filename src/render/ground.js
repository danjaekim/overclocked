// Ground themes (prototype): procedural floors drawn per 64-unit cell from a hash of the cell, so the floor is infinite,
// stable under scrolling and costs nothing to store. Pick one with ?ground=forge|frost|cinder|ruins|crystal|catacomb.

import { PALETTE, PUDDLE_COLORS, PUDDLE_CHANCE, MARKING_CHANCE } from '../data/palette.js';

const CELL = 64;
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return (h ^ (h >>> 16)) >>> 0; };
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function crack(ctx, r, x, y, len, col, w, glow) {
  let a = r() * Math.PI * 2, px = x, py = y;
  const pts = [[px, py]];
  for (let i = 0; i < 5; i++) { a += (r() - 0.5) * 1.4; px += Math.cos(a) * len / 5; py += Math.sin(a) * len / 5; pts.push([px, py]); }
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (glow) { ctx.strokeStyle = glow; ctx.lineWidth = w * 3.2; path(); }
  ctx.strokeStyle = col; ctx.lineWidth = w; path();
}
const blob = (ctx, x, y, rx, ry, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.283); ctx.fill(); };
const slab = (ctx, x, y, col, seam) => { ctx.fillStyle = col; ctx.fillRect(x, y, CELL, CELL); ctx.strokeStyle = seam; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.75, y + 0.75, CELL - 1.5, CELL - 1.5); };
const tint = (r, base, v) => { const k = 1 + (r() - 0.5) * v; return `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)})`; };

const THEMES = {
  // Slag-black flagstones, ember seams that breathe.
  forge: { bg: '#15110f', cell(ctx, x, y, r, t) {
    slab(ctx, x, y, tint(r, [30, 25, 23], 0.35), '#0c0908');
    if (r() < 0.45) blob(ctx, x + r() * CELL, y + r() * CELL, 10 + r() * 14, 6 + r() * 8, 'rgba(0,0,0,.25)');
    if (r() < 0.3) { const p = 0.55 + 0.45 * Math.sin(t * 1.6 + x * 0.05 + y * 0.03); ctx.globalAlpha = p; crack(ctx, r, x + r() * CELL, y + r() * CELL, 26 + r() * 26, '#ff8a2a', 1.4, 'rgba(255,90,20,.22)'); ctx.globalAlpha = 1; }
    else if (r() < 0.25) crack(ctx, r, x + r() * CELL, y + r() * CELL, 20 + r() * 20, '#0a0706', 1.2);
    if (r() < 0.12) { ctx.fillStyle = 'rgba(255,170,80,.7)'; ctx.fillRect(x + r() * CELL, y + r() * CELL, 1.6, 1.6); }
  } },
  // Wind-scoured ice sheets, drifts and hairline fractures.
  frost: { bg: '#18222d', cell(ctx, x, y, r, t) {
    slab(ctx, x, y, tint(r, [34, 50, 64], 0.3), 'rgba(10,18,28,.6)');
    if (r() < 0.5) blob(ctx, x + r() * CELL, y + r() * CELL, 14 + r() * 18, 7 + r() * 9, 'rgba(225,240,255,.10)');
    if (r() < 0.3) crack(ctx, r, x + r() * CELL, y + r() * CELL, 28 + r() * 30, 'rgba(210,235,255,.55)', 1);
    if (r() < 0.12) { const cx = x + 14 + r() * 36, cy = y + 14 + r() * 36; blob(ctx, cx, cy, 15, 9, 'rgba(120,190,235,.22)'); blob(ctx, cx - 3, cy - 2, 7, 3, 'rgba(255,255,255,.18)'); }
    if (r() < 0.35) { ctx.fillStyle = 'rgba(255,255,255,.55)'; const sx = x + r() * CELL, sy = y + r() * CELL; ctx.fillRect(sx, sy, 1.5, 1.5); }
  } },
  // Black basalt with lava veins; ash drifts across it.
  cinder: { bg: '#100c0b', cell(ctx, x, y, r, t) {
    slab(ctx, x, y, tint(r, [24, 19, 18], 0.4), '#070505');
    if (r() < 0.55) crack(ctx, r, x + r() * CELL, y + r() * CELL, 30 + r() * 34, `rgba(255,${100 + (r() * 80 | 0)},20,${0.65 + 0.3 * Math.sin(t * 2 + x)})`, 1.8, 'rgba(255,70,10,.28)');
    if (r() < 0.25) blob(ctx, x + r() * CELL, y + r() * CELL, 12 + r() * 10, 5 + r() * 5, 'rgba(160,140,130,.07)');
    for (let i = 0; i < 3; i++) if (r() < 0.5) { ctx.fillStyle = 'rgba(255,150,60,.6)'; ctx.fillRect(x + r() * CELL, y + r() * CELL, 1.5, 1.5); }
  } },
  // Mossy overgrown paving, grass pushing through the seams.
  ruins: { bg: '#141a12', cell(ctx, x, y, r, t) {
    slab(ctx, x, y, tint(r, [34, 42, 32], 0.3), 'rgba(8,12,7,.7)');
    if (r() < 0.55) blob(ctx, x + r() * CELL, y + r() * CELL, 12 + r() * 18, 7 + r() * 10, 'rgba(70,110,50,.22)');
    if (r() < 0.25) crack(ctx, r, x + r() * CELL, y + r() * CELL, 22 + r() * 22, 'rgba(6,10,5,.8)', 1.2);
    const tufts = r() < 0.5 ? 1 + (r() * 3 | 0) : 0;
    for (let i = 0; i < tufts; i++) {
      const gx = x + r() * CELL, gy = y + r() * CELL; ctx.strokeStyle = `rgb(${70 + (r() * 30 | 0)},${120 + (r() * 40 | 0)},60)`; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      const sway = Math.sin(t * 1.4 + gx * 0.07) * 1.2;
      ctx.beginPath(); for (let k = -1; k <= 1; k++) { ctx.moveTo(gx + k * 2.5, gy); ctx.lineTo(gx + k * 4 + sway, gy - 6 - r() * 4); } ctx.stroke();
    }
    if (r() < 0.07) { blob(ctx, x + r() * CELL, y + r() * CELL, 2.2, 2.2, '#e8d86a'); }
  } },
  // Dark geode floor: violet rock with glowing crystal shards.
  crystal: { bg: '#110e20', cell(ctx, x, y, r, t) {
    slab(ctx, x, y, tint(r, [28, 22, 48], 0.35), 'rgba(8,5,18,.7)');
    if (r() < 0.5) blob(ctx, x + r() * CELL, y + r() * CELL, 16 + r() * 18, 8 + r() * 10, 'rgba(120,70,200,.12)');
    if (r() < 0.28) {
      const cx = x + 10 + r() * 44, cy = y + 14 + r() * 40, hue = r() < 0.5 ? [120, 230, 255] : [220, 120, 255];
      blob(ctx, cx, cy + 2, 14, 6, `rgba(${hue},.14)`);
      const n = 2 + (r() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const bx = cx + (i - n / 2) * 5 + r() * 3, h = 8 + r() * 14, w = 3 + r() * 2;
        ctx.fillStyle = `rgba(${hue},.78)`; ctx.beginPath(); ctx.moveTo(bx - w, cy); ctx.lineTo(bx, cy - h); ctx.lineTo(bx + w, cy); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.moveTo(bx - w * 0.2, cy); ctx.lineTo(bx, cy - h); ctx.lineTo(bx - w, cy); ctx.closePath(); ctx.fill();
      }
    }
    if (r() < 0.35) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + x * 0.1 + y)); ctx.fillStyle = '#d6c8ff'; ctx.fillRect(x + r() * CELL, y + r() * CELL, 1.6, 1.6); ctx.globalAlpha = 1; }
  } },
  // Bone-dust crypt tiles with scattered remains and guttered candles.
  catacomb: { bg: '#181615', cell(ctx, x, y, r, t) {
    slab(ctx, x, y, tint(r, [44, 40, 36], 0.3), 'rgba(10,8,7,.75)');
    if (r() < 0.4) blob(ctx, x + r() * CELL, y + r() * CELL, 14 + r() * 14, 6 + r() * 8, 'rgba(0,0,0,.22)');
    if (r() < 0.22) crack(ctx, r, x + r() * CELL, y + r() * CELL, 22 + r() * 24, 'rgba(8,6,5,.85)', 1.2);
    if (r() < 0.3) { const bx = x + 8 + r() * 48, by = y + 8 + r() * 48, a = r() * 3.14;
      ctx.strokeStyle = 'rgba(224,216,196,.75)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx - Math.cos(a) * 6, by - Math.sin(a) * 6); ctx.lineTo(bx + Math.cos(a) * 6, by + Math.sin(a) * 6); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx + Math.cos(a) * 6, by + Math.sin(a) * 6, 1.6, 0, 6.283); ctx.stroke(); }
    if (r() < 0.05) { const cx = x + r() * CELL, cy = y + r() * CELL; blob(ctx, cx, cy, 14, 9, 'rgba(255,170,70,.08)'); blob(ctx, cx, cy, 3, 2, 'rgba(235,225,200,.8)'); ctx.fillStyle = `rgba(255,${180 + (Math.sin(t * 9 + cx) * 40 | 0)},80,.95)`; ctx.fillRect(cx - 0.8, cy - 5, 1.6, 4); }
  } },
};


// Gridless woodland floor: soft overlapping tones, dirt paths, fallen logs, leaf litter, ferns and grass. Nothing is clipped to a
// cell, so no seams show. Greens are kept dark and muted (and shifted toward olive) so the bright green goblins stay readable.
const LEAF = ['#7a4a26', '#8f6226', '#5e3a1e', '#9a7a30', '#524420'];
const PATH_W = 44;
// Paths are wavy bands running across the world: horizontal ones every 1100 units, vertical ones every 1300, each present
// with some probability. pathY / pathX give the centre line at a coordinate.
const hasH = (k) => hash(k, 71) % 100 < 55, hasV = (k) => hash(k, 313) % 100 < 45;
const pathY = (k, x) => k * 1100 + 220 * Math.sin(x / 520 + k * 2.3) + 90 * Math.sin(x / 190 + k);
const pathX = (k, y) => k * 1300 + 240 * Math.sin(y / 480 + k * 1.7) + 80 * Math.sin(y / 170 + k * 3);
function pathDist(x, y) {
  let d = 1e9;
  for (let k = Math.round(y / 1100) - 1; k <= Math.round(y / 1100) + 1; k++) if (hasH(k)) d = Math.min(d, Math.abs(y - pathY(k, x)));
  for (let k = Math.round(x / 1300) - 1; k <= Math.round(x / 1300) + 1; k++) if (hasV(k)) d = Math.min(d, Math.abs(x - pathX(k, y)));
  return d;
}
function strokePath(ctx, pts, w, col) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
}
function drawPaths(ctx, x0, y0, x1, y1) {
  const lines = [];
  for (let k = Math.floor(y0 / 1100) - 1; k <= Math.ceil(y1 / 1100) + 1; k++) if (hasH(k)) { const p = []; for (let x = x0 - 30; x <= x1 + 30; x += 24) p.push([x, pathY(k, x)]); lines.push(p); }
  for (let k = Math.floor(x0 / 1300) - 1; k <= Math.ceil(x1 / 1300) + 1; k++) if (hasV(k)) { const p = []; for (let y = y0 - 30; y <= y1 + 30; y += 24) p.push([pathX(k, y), y]); lines.push(p); }
  for (const p of lines) {
    strokePath(ctx, p, PATH_W + 26, 'rgba(70,56,34,.28)');       // worn verge
    strokePath(ctx, p, PATH_W + 8, 'rgba(92,72,46,.55)');        // packed earth
    strokePath(ctx, p, PATH_W - 12, 'rgba(112,90,58,.40)');      // lighter trodden middle
    const off = (d) => p.map(([x, y], i) => { const n = i ? [x - p[i - 1][0], y - p[i - 1][1]] : [p[1][0] - x, p[1][1] - y], m = Math.hypot(n[0], n[1]) || 1; return [x - n[1] / m * d, y + n[0] / m * d]; });
    strokePath(ctx, off(7), 2.2, 'rgba(50,38,24,.35)'); strokePath(ctx, off(-7), 2.2, 'rgba(50,38,24,.35)');   // wheel ruts
  }
}
function drawLog(ctx, x, y, ang, len, w) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  blob(ctx, 2, w * 0.55, len / 2 + 4, w * 0.5, 'rgba(0,0,0,.28)');                                          // shadow
  ctx.fillStyle = '#4a3622'; ctx.beginPath(); ctx.roundRect(-len / 2, -w / 2, len, w, w / 2); ctx.fill();   // trunk
  ctx.fillStyle = '#5d452c'; ctx.beginPath(); ctx.roundRect(-len / 2 + 3, -w / 2 + 2, len - 6, w * 0.42, w / 4); ctx.fill();   // lit top
  ctx.strokeStyle = 'rgba(25,16,8,.7)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i < 5; i++) { const px = -len / 2 + 10 + i * (len - 20) / 4; ctx.moveTo(px, -w / 2 + 3); ctx.lineTo(px + 6, w / 2 - 3); }
  ctx.stroke();
  ctx.fillStyle = '#b08a58'; ctx.beginPath(); ctx.ellipse(len / 2 - 2, 0, w * 0.28, w / 2 - 1, 0, 0, 6.283); ctx.fill();   // cut end
  ctx.strokeStyle = '#6e4e2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(len / 2 - 2, 0, w * 0.15, w * 0.3, 0, 0, 6.283); ctx.stroke();
  ctx.fillStyle = 'rgba(78,98,52,.75)'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(-len / 4 + i * len / 5, -w * 0.15, 8 + i * 2, 3.5, 0, 0, 6.283); ctx.fill(); }   // moss
  ctx.restore();
}
THEMES.forest = { free: true, bg: '#1b2416',
  base(ctx, x0, y0, x1, y1) {
    const S = 96;
    for (let cy = Math.floor(y0 / S) - 1; cy * S < y1 + S; cy++) for (let cx = Math.floor(x0 / S) - 1; cx * S < x1 + S; cx++) {
      const r = rng(hash(cx + 9000, cy - 9000)), px = cx * S + r() * S, py = cy * S + r() * S, rad = 90 + r() * 70, k = r();
      const col = k < 0.35 ? '48,70,36' : k < 0.6 ? '26,40,24' : k < 0.8 ? '66,82,42' : '84,66,40';
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, `rgba(${col},${k < 0.8 ? 0.3 : 0.24})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    drawPaths(ctx, x0, y0, x1, y1);
  },
  cell(ctx, x, y, r, t) {
    const at = () => [x + r() * CELL, y + r() * CELL];
    const onPath = (px, py) => pathDist(px, py) < PATH_W / 2 + 6;
    if (r() < 0.16) { const [px, py] = at(); ctx.save(); ctx.translate(px, py); ctx.rotate(r() * 3); ctx.scale(1, 0.6); blob(ctx, 0, 0, 14 + r() * 14, 10 + r() * 10, 'rgba(86,64,40,.34)'); blob(ctx, 3, 2, 8 + r() * 8, 6 + r() * 6, 'rgba(64,46,28,.3)'); ctx.restore(); }
    const leaves = r() < 0.5 ? 2 + (r() * 5 | 0) : 0;
    for (let i = 0; i < leaves; i++) { const [px, py] = at(); ctx.save(); ctx.translate(px, py); ctx.rotate(r() * 6.28); ctx.fillStyle = LEAF[r() * LEAF.length | 0]; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(0, 0, 3.2, 1.8, 0, 0, 6.283); ctx.fill(); ctx.restore(); }
    const tufts = r() < 0.55 ? 1 + (r() * 2 | 0) : 0;
    for (let i = 0; i < tufts; i++) {
      const [gx, gy] = at(), sway = Math.sin(t * 1.3 + gx * 0.05 + gy * 0.02) * 1.2, shade = 52 + (r() * 24 | 0), keep = !onPath(gx, gy);
      if (!keep) { r(); r(); r(); continue; }
      ctx.strokeStyle = `rgb(${shade},${shade + 28},${shade - 10})`; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath();
      for (let k = -2; k <= 2; k++) { ctx.moveTo(gx + k * 2, gy); ctx.quadraticCurveTo(gx + k * 3.2, gy - 5, gx + k * 4.4 + sway, gy - 7 - r() * 4); }
      ctx.stroke();
    }
    if (r() < 0.06) { const [fx, fy] = at(); if (!onPath(fx, fy)) { ctx.strokeStyle = 'rgba(40,64,34,.85)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath(); for (let k = -3; k <= 3; k++) { const a = -1.57 + k * 0.38; ctx.moveTo(fx, fy); ctx.quadraticCurveTo(fx + Math.cos(a) * 8, fy + Math.sin(a) * 8 - 3, fx + Math.cos(a) * 15, fy + Math.sin(a) * 12); } ctx.stroke(); } }
    if (r() < 0.09) { const [rx, ry] = at(); blob(ctx, rx + 1, ry + 2, 7, 3.5, 'rgba(0,0,0,.3)'); blob(ctx, rx, ry, 6, 4, '#6a6e62'); blob(ctx, rx - 1.5, ry - 1.5, 3, 1.8, 'rgba(210,220,200,.3)'); }
    if (r() < 0.04) { const [fx, fy] = at(), c = ['#d8cf8e', '#e4e4e4', '#d6849f'][r() * 3 | 0]; if (!onPath(fx, fy)) { blob(ctx, fx, fy, 2, 2, c); blob(ctx, fx, fy, 0.8, 0.8, '#b8862a'); } }
  },
  after(ctx, x0, y0, x1, y1) {
    const S = 220;
    for (let cy = Math.floor(y0 / S) - 1; cy * S < y1 + S; cy++) for (let cx = Math.floor(x0 / S) - 1; cx * S < x1 + S; cx++) {
      const r = rng(hash(cx + 500, cy + 500));
      if (r() > 0.2) continue;
      const px = cx * S + r() * S, py = cy * S + r() * S, ang = (r() - 0.5) * 1.2 + (r() < 0.4 ? 1.57 : 0);
      if (pathDist(px, py) < PATH_W + 40) continue;
      drawLog(ctx, px, py, ang, 76 + r() * 44, 15 + r() * 5);
    }
  } };

// Neon Noir (v0.10): near-black asphalt, a faint violet grid, soft pools of pink, cyan and violet light like puddle reflections, and the odd
// road marking. Painted once per chunk like every theme, so it costs nothing per frame.
THEMES.neon = { free: true, res: 1, bg: PALETTE.floor,
  cell(ctx, x, y, r) {
    ctx.strokeStyle = PALETTE.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + CELL, y + 0.5); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + CELL); ctx.stroke();
    if (r() < PUDDLE_CHANCE) {
      const px = x + r() * CELL, py = y + r() * CELL, rad = 40 + r() * 50, col = PUDDLE_COLORS[r() * PUDDLE_COLORS.length | 0], a = 0.1 + r() * 0.06;
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    } else { r(); r(); r(); r(); }
    if (r() < MARKING_CHANCE) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
      const horiz = r() < 0.5, o = 12 + r() * (CELL - 24);
      ctx.beginPath(); if (horiz) { ctx.moveTo(x, y + o); ctx.lineTo(x + CELL, y + o); } else { ctx.moveTo(x + o, y); ctx.lineTo(x + o, y + CELL); }
      ctx.stroke(); ctx.setLineDash([]);
    }
  } };

export const GROUND_IDS = Object.keys(THEMES);

// One region of floor, drawn with the theme: base tones, per-cell detail, then the big props (logs).
function paint(ctx, th, x0, y0, x1, y1, t) {
  ctx.fillStyle = th.bg; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (th.base) th.base(ctx, x0, y0, x1, y1, t);
  for (let cy = Math.floor(y0 / CELL); cy * CELL < y1; cy++) for (let cx = Math.floor(x0 / CELL); cx * CELL < x1; cx++) {
    if (th.free) { th.cell(ctx, cx * CELL, cy * CELL, rng(hash(cx, cy)), t); continue; }
    ctx.save(); ctx.beginPath(); ctx.rect(cx * CELL, cy * CELL, CELL, CELL); ctx.clip();
    th.cell(ctx, cx * CELL, cy * CELL, rng(hash(cx, cy)), t);
    ctx.restore();
  }
  if (th.after) th.after(ctx, x0, y0, x1, y1, t);
}

// The floor never changes, so it is painted once into 256-unit chunks (at most 2 px per unit; the neon floor is dark and soft, so 1)
// and the frame just blits the visible ones. Every chunk paints whatever overlaps it from the same hash, so neighbours join without
// a seam. Painting is a long job (about 25 ms a chunk on a laptop), so a frame paints at most one: a visible chunk that is not ready
// shows the flat floor colour for a frame or two, and when nothing visible is missing the spare time paints the ring just off screen
// that the camera is heading for (v0.11.4).
const CH = 256, MAX_CHUNKS = 48;
const chunks = new Map();
const keyOf = (id, res, cx, cy) => `${id}|${res}|${cx}|${cy}`;
function paintChunk(th, id, cx, cy, res) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = Math.ceil(CH * res);
  const g = canvas.getContext('2d'); g.scale(res, res); g.translate(-cx * CH, -cy * CH);
  const pad = th.free ? 90 : 0;
  paint(g, th, cx * CH - pad, cy * CH - pad, (cx + 1) * CH + pad, (cy + 1) * CH + pad, 0);
  const c = { canvas, used: ++tick };
  chunks.set(keyOf(id, res, cx, cy), c);
  return c;
}
let tick = 0;
let lastX = 0, lastY = 0;

export function drawGround(ctx, cam, view, id, t) {
  const th = THEMES[id]; if (!th) return false;
  const res = th.res || Math.min(2, Math.max(1, view.scale || 1));
  const x0 = cam.x - view.w / 2, y0 = cam.y - view.h / 2, x1 = cam.x + view.w / 2, y1 = cam.y + view.h / 2;
  const e = 1 / res;                                   // a device pixel of overlap hides hairlines between chunks
  let painted = false;
  for (let cy = Math.floor(y0 / CH); cy * CH < y1; cy++) for (let cx = Math.floor(x0 / CH); cx * CH < x1; cx++) {
    let c = chunks.get(keyOf(id, res, cx, cy));
    if (!c && !painted) { c = paintChunk(th, id, cx, cy, res); painted = true; }
    if (c) { c.used = ++tick; ctx.drawImage(c.canvas, cx * CH, cy * CH, CH + e, CH + e); }
    else { ctx.fillStyle = th.bg; ctx.fillRect(cx * CH, cy * CH, CH + e, CH + e); }
  }
  if (!painted) {                                      // spare time: the missing chunk just off screen nearest where the camera is heading
    const px = cam.x + (cam.x - lastX) * 40, py = cam.y + (cam.y - lastY) * 40;
    let best = null, bd = 1e18;
    for (let cy = Math.floor((y0 - CH) / CH); cy * CH < y1 + CH; cy++) for (let cx = Math.floor((x0 - CH) / CH); cx * CH < x1 + CH; cx++) {
      if (chunks.has(keyOf(id, res, cx, cy))) continue;
      const d = (cx * CH + CH / 2 - px) ** 2 + (cy * CH + CH / 2 - py) ** 2;
      if (d < bd) { bd = d; best = [cx, cy]; }
    }
    if (best) paintChunk(th, id, best[0], best[1], res);
  }
  lastX = cam.x; lastY = cam.y;
  while (chunks.size > MAX_CHUNKS) {                   // drop the least recently used
    let oldK = null, oldU = Infinity;
    for (const [k, c] of chunks) if (c.used < oldU) { oldU = c.used; oldK = k; }
    chunks.delete(oldK);
  }
  return true;
}
