// Aura-style visuals: the ember ward (Cinder Ward, Pyre Crown), the Halo hovering over the player, and the expanding light ring
// (Halo's pulse, Shockwave, Pulse Wake). Drawing only; hit detection lives in behaviors/aura.js, behaviors/pulse.js and
// systems/hazards.js and never reads any of this. Everything is a pure function of time, so nothing is stored per frame.

const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
const FIRE = { main: '#ff8a2e', light: '#ffe3a3', dark: '#4a1a08' };

// A ring of fire around the player: a shimmering heat field, two counter-turning rune rings, embers rising through it,
// and (big: Pyre Crown) a crown of flame tongues round the rim. `u` is the pulse, 0..1 while a burn tick is landing (-1 idle).
export function drawEmberWard(ctx, p, R, t, u, big, el) {
  const col = el || FIRE;
  const flick = 1 + 0.02 * Math.sin(t * 9);
  const r = R * flick;
  const g = ctx.createRadialGradient(p.x, p.y, r * 0.25, p.x, p.y, r);
  g.addColorStop(0, 'rgba(255,120,40,0)');
  g.addColorStop(0.7, big ? 'rgba(255,120,40,0.05)' : 'rgba(255,120,40,0.08)');
  g.addColorStop(1, big ? 'rgba(255,150,60,0.18)' : 'rgba(255,150,60,0.24)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TAU);
  ctx.fill();

  ctx.lineCap = 'round';
  ctx.strokeStyle = col.main;                           // outer rune ring: long dashes turning one way
  ctx.lineWidth = big ? 3 : 2.4;
  ctx.globalAlpha = 0.7;
  const dashes = big ? 10 : 7;
  ctx.beginPath();
  for (let k = 0; k < dashes; k++) {
    const a = t * 0.7 + (k * TAU) / dashes;
    ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
    ctx.arc(p.x, p.y, r, a, a + (TAU / dashes) * 0.55);
  }
  ctx.stroke();
  ctx.strokeStyle = col.light;                          // inner ring: short bright ticks turning the other way
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  const ticks = dashes * 2;
  for (let k = 0; k < ticks; k++) {
    const a = -t * 1.1 + (k * TAU) / ticks;
    ctx.moveTo(p.x + Math.cos(a) * r * 0.86, p.y + Math.sin(a) * r * 0.86);
    ctx.arc(p.x, p.y, r * 0.86, a, a + 0.07);
  }
  ctx.stroke();

  if (big) {                                            // the crown: flame tongues licking out of the rim
    const n = 18;
    for (let k = 0; k < n; k++) {
      const a = t * 0.35 + (k * TAU) / n;
      const h = R * (0.075 + 0.04 * Math.sin(t * 7 + k * 2.3) + 0.02 * Math.sin(t * 13 + k));
      const w = TAU / n * 0.3;
      const bx0 = Math.cos(a - w), by0 = Math.sin(a - w), bx1 = Math.cos(a + w), by1 = Math.sin(a + w);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = col.main;
      ctx.beginPath();
      ctx.moveTo(p.x + bx0 * r, p.y + by0 * r);
      ctx.quadraticCurveTo(p.x + Math.cos(a - w * 0.2) * (r + h * 0.6), p.y + Math.sin(a - w * 0.2) * (r + h * 0.6), p.x + Math.cos(a + w * 0.25) * (r + h), p.y + Math.sin(a + w * 0.25) * (r + h));
      ctx.quadraticCurveTo(p.x + Math.cos(a + w * 0.9) * (r + h * 0.4), p.y + Math.sin(a + w * 0.9) * (r + h * 0.4), p.x + bx1 * r, p.y + by1 * r);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.9;                            // a pale core
      ctx.fillStyle = col.light;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a - w * 0.5) * r, p.y + Math.sin(a - w * 0.5) * r);
      ctx.lineTo(p.x + Math.cos(a + w * 0.1) * (r + h * 0.62), p.y + Math.sin(a + w * 0.1) * (r + h * 0.62));
      ctx.lineTo(p.x + Math.cos(a + w * 0.5) * r, p.y + Math.sin(a + w * 0.5) * r);
      ctx.closePath();
      ctx.fill();
    }
  }

  const embers = big ? 26 : 16;                         // embers drifting up through the heat and winking out
  for (let k = 0; k < embers; k++) {
    const seed = frac(Math.sin(k * 91.7) * 437.5);
    const life = frac(t * (0.35 + 0.25 * seed) + seed * 7);
    const a = seed * TAU + t * 0.25 * (k % 2 ? 1 : -1);
    const rad = r * (0.25 + 0.7 * frac(seed * 13.1));
    const x = p.x + Math.cos(a) * rad;
    const y = p.y + Math.sin(a) * rad * 0.9 - life * r * 0.35;
    ctx.globalAlpha = Math.sin(life * Math.PI) * 0.95;
    ctx.fillStyle = k % 3 ? col.main : col.light;
    const s = (big ? 2.4 : 2) * (1 - life * 0.5);
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }

  if (u >= 0) {                                         // a burn tick: the heat snaps outward with sparks
    const e = 1 - (1 - u) * (1 - u);
    ctx.globalAlpha = 0.9 * (1 - u);
    ctx.strokeStyle = col.light;
    ctx.lineWidth = 2 + 4 * (1 - u);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * (0.55 + 0.45 * e), 0, TAU);
    ctx.stroke();
    ctx.fillStyle = col.light;
    ctx.beginPath();
    for (let k = 0; k < 12; k++) {
      const a = (k * TAU) / 12 + 0.3;
      const d = r * (0.75 + 0.35 * e);
      ctx.moveTo(p.x + Math.cos(a) * d + 2, p.y + Math.sin(a) * d);
      ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 2.2 * (1 - u) + 0.6, 0, TAU);
    }
    ctx.fill();
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
}

// The glow gathering round the saint as the next light ring charges (`charge` 0..1 up to the moment it is sent). The halo
// over the saint's head is part of the sprite, so only the build-up is drawn here.
export function drawHaloCharm(ctx, p, t, charge, color) {
  if (charge < 0.15) return;
  const k = (charge - 0.15) / 0.85;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 + 3 * k;
  ctx.globalAlpha = 0.12 + 0.28 * k;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * (2.6 - 0.9 * k), 0, TAU);
  ctx.stroke();
  ctx.fillStyle = color;
  for (let i = 0; i < 8; i++) {                         // motes drawn in towards the saint
    const ang = (i * TAU) / 8 + t * 0.9;
    const d = p.r * (4.2 - 2.4 * k);
    ctx.globalAlpha = 0.2 + 0.7 * k;
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, 1.6 + k, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// An expanding ring of light: a soft glow band, the bright ring, a fading wake behind it and rays that flick off the edge.
export function drawLightRing(ctx, x, y, r, rMax, thick, color, t) {
  const k = Math.min(1, r / rMax);
  const fade = 1 - 0.7 * k;
  const R = Math.max(1, r);
  const th = thick * (1 - 0.5 * k);
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.18 * fade;                        // glow
  ctx.lineWidth = th * 3.2;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.stroke();
  const wake = Math.min(R * 0.5, 22);                   // wake: the light it leaves behind
  if (R > 6) {
    const g = ctx.createRadialGradient(x, y, Math.max(0, R - wake), x, y, R);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, color);
    ctx.globalAlpha = 0.28 * fade;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 0.9 * fade;                         // the ring
  ctx.lineWidth = th;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';                          // its hot edge
  ctx.globalAlpha = 0.7 * fade;
  ctx.lineWidth = Math.max(1, th * 0.35);
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.stroke();
  const rays = 14;                                      // rays flicking off the rim
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8 * fade;
  ctx.beginPath();
  for (let i = 0; i < rays; i++) {
    const a = t * 0.8 + (i * TAU) / rays;
    const len = (i % 2 ? 7 : 12) * (1 - 0.5 * k);
    ctx.moveTo(x + Math.cos(a) * (R + th * 0.5 + 2), y + Math.sin(a) * (R + th * 0.5 + 2));
    ctx.lineTo(x + Math.cos(a) * (R + th * 0.5 + 2 + len), y + Math.sin(a) * (R + th * 0.5 + 2 + len));
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
}

// ---- ground patches (trail, burning ground, shock pools) ----
const seedOf = (x, y) => frac(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);

// Decoration over a patch's soft disc, by look: frost flecks, steam wisps, flames, crackle. Cheap fills and short strokes only.
export function drawPatchMarks(ctx, h, look, k, t) {
  const R = h.r;
  const s0 = seedOf(h.x, h.y);
  const a = Math.min(1, k * 2);
  if (look === 'chill') {                               // frost: crystals scattered over the ground, winking
    ctx.fillStyle = '#e8f8ff';
    for (let i = 0; i < 6; i++) {
      const ang = s0 * TAU + i * 1.9;
      const d = R * (0.25 + 0.6 * frac(s0 * 7 + i * 0.37));
      const x = h.x + Math.cos(ang) * d, y = h.y + Math.sin(ang) * d;
      const sz = (2 + 3 * frac(s0 * 3 + i)) * (0.7 + 0.3 * Math.sin(t * 4 + i * 2 + s0 * 9));
      ctx.globalAlpha = a * 0.85;
      ctx.beginPath();
      ctx.moveTo(x, y - sz * 1.5); ctx.lineTo(x + sz * 0.8, y); ctx.lineTo(x, y + sz * 1.5); ctx.lineTo(x - sz * 0.8, y);
      ctx.closePath();
      ctx.fill();
    }
  } else if (look === 'steam') {                        // steam: wisps climbing off the ground
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const life = frac(t * 0.6 + s0 * 5 + i * 0.25);
      const ang = s0 * TAU + i * 1.7;
      const x = h.x + Math.cos(ang) * R * 0.5 + Math.sin(t * 2 + i) * 3;
      const y = h.y + Math.sin(ang) * R * 0.3 - life * R * 0.9;
      ctx.globalAlpha = a * 0.32 * Math.sin(life * Math.PI);
      ctx.beginPath();
      ctx.arc(x, y, R * (0.14 + 0.12 * life), 0, TAU);
      ctx.fill();
    }
  } else if (look === 'burn') {                         // burning ground: small flames flickering
    for (let i = 0; i < 4; i++) {
      const ang = s0 * TAU + i * 1.6;
      const d = R * (0.2 + 0.55 * frac(s0 * 5 + i * 0.31));
      const x = h.x + Math.cos(ang) * d, y = h.y + Math.sin(ang) * d * 0.8;
      const fl = 5 + 4 * Math.abs(Math.sin(t * 8 + i * 2 + s0 * 11));
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = '#ff9a3c';
      ctx.beginPath();
      ctx.moveTo(x - 3, y); ctx.quadraticCurveTo(x - 1, y - fl * 0.6, x + 0.5, y - fl); ctx.quadraticCurveTo(x + 1.5, y - fl * 0.4, x + 3, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffe3a3';
      ctx.globalAlpha = a * 0.8;
      ctx.beginPath();
      ctx.moveTo(x - 1.2, y); ctx.lineTo(x, y - fl * 0.55); ctx.lineTo(x + 1.2, y);
      ctx.closePath();
      ctx.fill();
    }
  } else if (look === 'shock') {                        // shock: a crackle of short bolts
    ctx.strokeStyle = '#fff3a8';
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = a * (0.4 + 0.5 * frac(t * 9 + s0 * 13));
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const ang = s0 * TAU + i * 2.1 + Math.floor(t * 9) * 0.5;
      const cx = Math.cos(ang), cy = Math.sin(ang);
      ctx.moveTo(h.x, h.y);
      ctx.lineTo(h.x + cx * R * 0.4 - cy * 4, h.y + cy * R * 0.4 + cx * 4);
      ctx.lineTo(h.x + cx * R * 0.7 + cy * 4, h.y + cy * R * 0.7 - cx * 4);
      ctx.lineTo(h.x + cx * R * 0.95, h.y + cy * R * 0.95);
    }
    ctx.stroke();
  } else {                                              // blessed / plain: motes rising
    ctx.fillStyle = '#fff3b0';
    for (let i = 0; i < 4; i++) {
      const life = frac(t * 0.5 + s0 * 3 + i * 0.25);
      const ang = s0 * TAU + i * 1.6;
      ctx.globalAlpha = a * Math.sin(life * Math.PI) * 0.8;
      ctx.fillRect(h.x + Math.cos(ang) * R * 0.5 - 1, h.y + Math.sin(ang) * R * 0.4 - life * R * 0.6 - 1, 2.2, 2.2);
    }
  }
  ctx.globalAlpha = 1;
}

// ---- Judgement's pillar ----
// age < tele: a sigil closes on the target (ring + turning hexagram). After: a column of light with a white core, an impact
// ring and motes rising. `star` swaps gold for the Starforge cyan; `net` keeps the column up (Thunder Lance-style link nodes).
export function drawPillar(ctx, h, age, t, net) {
  const gold = h.star ? '#7fe9ff' : '#ffe38a';
  const pale = h.star ? '#d6fbff' : '#fffbe0';
  if (age < h.tele) {
    const u = age / h.tele;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.35 + 0.45 * u;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r * (1.3 - 0.3 * u), 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.3 + 0.5 * u;
    const rot = t * 2.2;
    ctx.beginPath();
    for (let tri = 0; tri < 2; tri++) {                 // a hexagram: two triangles
      for (let i = 0; i < 3; i++) {
        const a = rot + tri * Math.PI / 3 + (i * TAU) / 3;
        const x = h.x + Math.cos(a) * h.r * 0.95, y = h.y + Math.sin(a) * h.r * 0.95;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    }
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.globalAlpha = 0.1 + 0.2 * u;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.5 + 0.5 * u;                    // a spark gathering overhead
    ctx.fillStyle = pale;
    ctx.beginPath();
    ctx.arc(h.x, h.y - 40 - 90 * (1 - u), 2 + 3 * u, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  const a = age - h.tele;
  const f = net ? Math.max(0.3, 1 - a / 0.3) * Math.min(1, h.ttl * 2) : Math.max(0, 1 - a / 0.3);
  const H = 300;
  const layers = [[h.r * 1.15, gold, 0.38], [h.r * 0.7, pale, 0.65], [h.r * 0.3 * (0.6 + 0.4 * f), '#ffffff', 0.95]];
  for (const [w, c, al] of layers) {
    const g = ctx.createLinearGradient(0, h.y - H, 0, h.y);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, c);
    g.addColorStop(1, c);
    ctx.fillStyle = g;
    ctx.globalAlpha = al * f;
    ctx.fillRect(h.x - w / 2, h.y - H, w, H);
  }
  ctx.fillStyle = gold;                                 // the pool of light where it lands
  ctx.globalAlpha = 0.4 * f;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = pale;                               // impact ring flying out
  ctx.lineWidth = 3 * f + 1;
  ctx.globalAlpha = 0.9 * f;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r * (0.5 + 0.9 * Math.min(1, a / 0.3)), 0, TAU);
  ctx.stroke();
  ctx.fillStyle = pale;                                 // motes of light rising off it
  ctx.globalAlpha = 0.9 * f;
  for (let i = 0; i < 9; i++) {
    const sd = frac(Math.sin((h.x + i * 31.7) * 12.9898) * 43758.5);
    ctx.fillRect(h.x + (sd - 0.5) * h.r * 1.5 - 1, h.y - a * (60 + 160 * frac(sd * 9.1)) - 1, 2.4, 2.4);
  }
  ctx.globalAlpha = 1;
}

// ---- mortar ----
// A shell lobbed from the player to the spot, drawn mid-flight: shadow on the ground, the iron shell lifted on a lob with a
// fading trail and a fizzing fuse. u 0..1 along the flight; (ox, oy) the muzzle, (x, y) where it lands.
export function drawShell(ctx, ox, oy, x, y, u, col, t) {
  const dist = Math.hypot(x - ox, y - oy);
  const H = Math.min(120, Math.max(36, dist * 0.45));
  const at = (v) => [ox + (x - ox) * v, oy + (y - oy) * v, 4 * v * (1 - v) * H];
  const [gx, gy, lift] = at(u);
  ctx.fillStyle = '#000';                               // shadow, smaller the higher it is
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  ctx.ellipse(gx, gy, 8 * (1 - lift / 220), 4 * (1 - lift / 220), 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = col.main;
  for (let j = 5; j >= 1; j--) {                        // the trail: where it has just been
    const [tx, ty, tl] = at(Math.max(0, u - j * 0.035));
    ctx.globalAlpha = 0.5 * (1 - j / 6);
    ctx.beginPath();
    ctx.arc(tx, ty - tl, 6.5 - j * 0.8, 0, TAU);
    ctx.fill();
  }
  const sy = gy - lift;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#2b2733';
  ctx.strokeStyle = col.main;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(gx, sy, 7, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col.light;                            // the fuse spark
  const f = 1.4 + Math.sin(t * 40) * 0.6;
  ctx.beginPath();
  ctx.arc(gx + 2, sy - 8.5, f + 0.8, 0, TAU);
  ctx.fill();
}

// Where a shell will land: a ring closing on the spot with four ticks turning round it and a hot centre.
export function drawShellMark(ctx, x, y, blast, u, col, t) {
  ctx.strokeStyle = col.main;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.25 + 0.4 * u;
  ctx.beginPath();
  ctx.arc(x, y, blast * (1.15 - 0.15 * u), 0, TAU);
  ctx.stroke();
  ctx.fillStyle = col.main;
  ctx.globalAlpha = 0.05 + 0.1 * u;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.globalAlpha = 0.35 + 0.5 * u;
  ctx.beginPath();
  const r1 = blast * (0.8 - 0.2 * u);
  for (let i = 0; i < 4; i++) {
    const a = t * 2 + (i * TAU) / 4;
    ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    ctx.lineTo(x + Math.cos(a) * (r1 + 7), y + Math.sin(a) * (r1 + 7));
  }
  ctx.stroke();
  ctx.fillStyle = col.light;
  ctx.globalAlpha = 0.5 + 0.5 * u;
  ctx.beginPath();
  ctx.arc(x, y, 3 + 3 * u, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Trail patches that share a chain are drawn as ONE soft ribbon: a smooth outline through the patch centres, wider where the
// ground is fresh, tapering to nothing where it is about to fade, with a gentle wobble. Filled once, so overlapping patches do
// not stack into a string of discs. A lone patch is a blob.
const chains = new Map();
const pool = [];
export function drawPatchChains(ctx, list, t, PATCH, COLORS) {
  let any = false;
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    if (h.kind !== PATCH || !h.chain) continue;
    let c = chains.get(h.chain);
    if (!c) { c = pool.pop() || []; c.length = 0; chains.set(h.chain, c); }
    c.push(h);
    any = true;
  }
  if (!any) return;
  for (const [id, c] of chains) {
    chains.delete(id);
    if (c.length > 1) c.sort((a, b) => a.ci - b.ci);
    const look = c[0].look || c[0].status || 'burn';
    const col = COLORS[look] || COLORS.burn;
    const n = c.length;
    const px = [], py = [], pw = [];
    for (let i = 0; i < n; i++) {
      const h = c[i];
      const k = h.ttl / h.life;
      const sd = seedOf(h.x, h.y);
      const w = h.r * (0.25 + 0.75 * Math.min(1, k * 1.7)) * (0.9 + 0.1 * Math.sin(t * 3 + sd * 20));
      pw.push(w);
      px.push(h.x); py.push(h.y);
    }
    for (let i = 0; i < n; i++) {                       // sideways drift, so a straight run is not a straight band
      const a = c[Math.max(0, i - 1)], b = c[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1;
      dx /= L; dy /= L;
      const sw = Math.sin(c[i].ci * 0.9 + t * 0.6) * c[i].r * 0.16;
      px[i] += -dy * sw; py[i] += dx * sw;
    }
    for (let pass = 0; pass < 2; pass++) {
      const scale = pass ? 0.5 : 1;
      ctx.fillStyle = pass ? col[1] : col[0];
      ctx.globalAlpha = pass ? 0.16 : (look === 'burn' ? 0.3 : 0.26);
      ribbon(ctx, px, py, pw, scale);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function ribbon(ctx, px, py, pw, scale) {
  const n = px.length;
  ctx.beginPath();
  if (n === 1) { ctx.arc(px[0], py[0], pw[0] * scale, 0, TAU); return; }
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let dx = px[b] - px[a], dy = py[b] - py[a];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const w = pw[i] * scale;
    L.push(px[i] - dy * w, py[i] + dx * w);
    R.push(px[i] + dy * w, py[i] - dx * w);
  }
  ctx.moveTo(L[0], L[1]);
  for (let i = 1; i < n; i++) {
    const mx = (L[i * 2 - 2] + L[i * 2]) / 2, my = (L[i * 2 - 1] + L[i * 2 + 1]) / 2;
    ctx.quadraticCurveTo(L[i * 2 - 2], L[i * 2 - 1], mx, my);
  }
  ctx.lineTo(L[n * 2 - 2], L[n * 2 - 1]);
  ctx.arc(px[n - 1], py[n - 1], pw[n - 1] * scale, Math.atan2(L[n * 2 - 1] - py[n - 1], L[n * 2 - 2] - px[n - 1]), Math.atan2(R[n * 2 - 1] - py[n - 1], R[n * 2 - 2] - px[n - 1]), true);
  for (let i = n - 1; i >= 1; i--) {
    const mx = (R[i * 2] + R[i * 2 - 2]) / 2, my = (R[i * 2 + 1] + R[i * 2 - 1]) / 2;
    ctx.quadraticCurveTo(R[i * 2], R[i * 2 + 1], mx, my);
  }
  ctx.lineTo(R[0], R[1]);
  ctx.arc(px[0], py[0], pw[0] * scale, Math.atan2(R[1] - py[0], R[0] - px[0]), Math.atan2(L[1] - py[0], L[0] - px[0]), true);
  ctx.closePath();
}

// ---- ground shockwave (Quakebreaker's cross, Fault Line, any wave) ----
// A curved crest ploughing along the ground: a crescent with a bright lip,
// rubble thrown up behind the crest, and dust at its shoulders. (x0, y0) is where it started; (x, y) the crest; `r` its half-width.
export function drawWave(ctx, h, k) {
  const dx = h.dx, dy = h.dy;
  const nx = -dy, ny = dx;
  const fade = Math.min(1, k * 3);
  const s0 = seedOf(h.x0, h.y0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const R = h.r * 1.7;                                  // the crest: a crescent bulging forward
  const half = Math.asin(Math.min(1, h.r / R));
  const ang = Math.atan2(dy, dx);
  const cx = h.x - dx * (R - h.r * 0.45), cy = h.y - dy * (R - h.r * 0.45);
  ctx.globalAlpha = 0.5 * fade;
  ctx.fillStyle = '#d9b888';
  ctx.beginPath();
  ctx.arc(cx, cy, R, ang - half, ang + half);
  ctx.arc(cx - dx * h.r * 0.5, cy - dy * h.r * 0.5, R * 0.98, ang + half, ang - half, true);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff1d6';                          // the lip catching light
  ctx.lineWidth = 3.2;
  ctx.globalAlpha = 0.95 * fade;
  ctx.beginPath();
  ctx.arc(cx, cy, R, ang - half * 0.92, ang + half * 0.92);
  ctx.stroke();
  ctx.strokeStyle = '#e8c690';
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.7 * fade;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.9, ang - half * 0.8, ang + half * 0.8);
  ctx.stroke();
  ctx.fillStyle = '#e8d2ab';                            // rubble thrown up behind the crest, falling back
  ctx.globalAlpha = 0.9 * fade;
  for (let i = 0; i < 12; i++) {
    const sd = frac(Math.sin(i * 17.31 + s0 * 91) * 43758.5);
    const back = h.r * (0.15 + 1.6 * frac(sd * 7.7));
    const side = (sd - 0.5) * 2 * h.r * 0.9;
    const arcLift = Math.sin(Math.min(1, back / (h.r * 1.75)) * Math.PI) * h.r * (0.35 + 0.3 * frac(sd * 3.1));
    const px = h.x - dx * back + nx * side, py = h.y - dy * back + ny * side - arcLift;
    const sz = 2 + 2.4 * frac(sd * 5.3);
    ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
  }
  ctx.fillStyle = '#cdb690';                            // dust at the shoulders
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const back = i * h.r * 0.5;
      ctx.globalAlpha = (0.18 - i * 0.05) * fade;
      ctx.beginPath();
      ctx.arc(h.x - dx * back + nx * side * h.r * 0.95, h.y - dy * back + ny * side * h.r * 0.95, h.r * (0.16 + i * 0.07), 0, TAU);
      ctx.fill();
    }
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
}
