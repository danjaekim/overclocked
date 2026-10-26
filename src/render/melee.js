// Axe-swing visuals shared by the sweeping melee weapons (Rending Axe, Reaper Axe) and the spinning Whirlwind Cleaver:
// a tapered motion-smear crescent behind a visible axe on a haft, with a hot streak along the cutting edge.
// Drawing only; the swing's hit cone is resolved in behaviors/arc.js and never reads any of this.

const TAU = Math.PI * 2;
const STEEL = '#d5dbe8';
const STEEL_DARK = '#556078';
const HAFT = '#7a5334';
const WARM = { main: '#ffcf8a', light: '#fff4dc' };

export const swingColors = (el) => (el ? { main: el.main, light: el.light } : WARM);

// A tapered crescent hugging the arc: thin at the tail, full at the head. `len` is the swept angle behind the head,
// `dir` +1/-1 the direction the axe is travelling.
export function drawSmear(ctx, cx, cy, head, dir, len, rIn, rOut, col, alpha) {
  const N = 16;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {                         // outer edge, tail -> head
    const f = i / N;
    const a = head - dir * len * (1 - f);
    const r = rOut * (0.9 + 0.1 * f);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  for (let i = N; i >= 0; i--) {                         // inner edge, head -> tail, pulled out to the outer edge at the tail
    const f = i / N;
    const a = head - dir * len * (1 - f);
    const r = rOut * (0.9 + 0.1 * f) - (rOut - rIn) * Math.pow(f, 1.4);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = col.main;
  ctx.fill();
  // hot streak along the cutting edge
  ctx.globalAlpha = alpha * 0.95;
  ctx.strokeStyle = col.light;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    if (f < 0.35) continue;
    const a = head - dir * len * (1 - f);
    const r = rOut * (0.9 + 0.1 * f);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (f <= 0.35 + 1 / N) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
}

// The axe itself at angle `a` from the pivot: haft from the hand out to `reach`, bearded head at the end whose edge faces `dir`.
export function drawAxe(ctx, cx, cy, a, dir, reach, size, col, alpha) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.strokeStyle = HAFT;
  ctx.lineWidth = Math.max(3.5, size * 0.3);
  ctx.beginPath();
  ctx.moveTo(reach * 0.12, 0);
  ctx.lineTo(reach, 0);
  ctx.stroke();
  // head: x is along the haft, y across it; the cutting edge bulges toward +dir
  const s = size;
  const hx = reach;
  ctx.fillStyle = STEEL;
  ctx.strokeStyle = STEEL_DARK;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.55, -dir * s * 0.12);            // socket, behind the edge
  ctx.lineTo(hx - s * 0.75, dir * s * 0.55);             // beard (heel) sweeping back
  ctx.quadraticCurveTo(hx - s * 0.2, dir * s * 1.45, hx + s * 0.55, dir * s * 1.05);   // the cutting edge, belly out
  ctx.lineTo(hx + s * 0.5, dir * s * 0.15);              // toe
  ctx.lineTo(hx + s * 0.1, -dir * s * 0.28);             // back of the poll
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = col.light;                           // the edge catches the light
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.75, dir * s * 0.55);
  ctx.quadraticCurveTo(hx - s * 0.2, dir * s * 1.45, hx + s * 0.55, dir * s * 1.05);
  ctx.stroke();
  ctx.restore();
  ctx.lineCap = 'butt';
}

// Eased angle: the axe winds up a touch, then whips through and settles.
export const swingEase = (u) => {
  const v = Math.min(1, Math.max(0, u));
  return 1 - Math.pow(1 - v, 3);
};

// One full sweeping axe swing. u 0..1 across the visual; `swings` copies spread around the player.
export function drawAxeSwing(ctx, p, angle, width, range, swings, dir, u, el) {
  const col = swingColors(el);
  const e = swingEase(u * 1.15);
  const fade = u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45;
  for (let s = 0; s < swings; s++) {
    const base = angle + (s * TAU) / swings;
    const head = base - dir * (width / 2) + dir * width * e;
    const len = width * (0.25 + 0.5 * Math.min(1, u * 2.2));
    const reach = range * 0.84;
    drawSmear(ctx, p.x, p.y, head, dir, Math.min(len, width * e + 0.05), range * 0.5, range * 0.98, col, 0.8 * fade);
    drawAxe(ctx, p.x, p.y, head, dir, reach, Math.max(11, range * 0.19), col, Math.min(1, fade * 1.4));
    if (u > 0.55) {                                      // the follow-through: sparks thrown off the edge
      const k = (u - 0.55) / 0.45;
      ctx.strokeStyle = col.light;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = head + dir * (0.1 + i * 0.12);
        const r0 = range * (0.96 + k * 0.1 + i * 0.01), r1 = r0 + 6 + 8 * k;
        ctx.moveTo(p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0);
        ctx.lineTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// Whirlwind Cleaver: `n` cleavers circling on hafts, each dragging a smear; brighter while a pulse lands.
export function drawAxeSpin(ctx, p, a0, radius, n, hot, el) {
  const col = swingColors(el);
  for (let k = 0; k < n; k++) {
    const a = a0 + (k * TAU) / n;
    drawSmear(ctx, p.x, p.y, a, 1, 1.5, radius * 0.45, radius * 0.95, col, hot ? 0.75 : 0.5);
    drawAxe(ctx, p.x, p.y, a, 1, radius * 0.8, Math.max(11, radius * 0.17), col, hot ? 1 : 0.9);
  }
  ctx.globalAlpha = 1;
}

// A maul coming down onto (x, y): `u` 0..1 over the telegraph. The head falls from above on a haft tilted back, and levels as it lands.
export function drawHammer(ctx, x, y, r, u, el) {
  const col = swingColors(el);
  const fall = (1 - u) * (1 - u);
  const tilt = 0.55 * (1 - u);
  const hw = Math.max(14, r * 0.5), hh = hw * 0.62;
  ctx.save();
  ctx.translate(x, y - fall * r * 1.7 - hh * 0.4);
  ctx.rotate(-tilt);
  ctx.globalAlpha = Math.min(1, 0.35 + u * 1.2);
  ctx.lineCap = 'round';
  ctx.strokeStyle = HAFT;                               // the haft climbs away behind the head
  ctx.lineWidth = Math.max(4, hw * 0.2);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -hw * 2.1);
  ctx.stroke();
  ctx.fillStyle = STEEL;
  ctx.strokeStyle = STEEL_DARK;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.rect(-hw / 2, -hh / 2, hw, hh);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = STEEL_DARK;                           // the striking face, banded
  ctx.fillRect(-hw / 2, hh * 0.18, hw, hh * 0.32);
  ctx.strokeStyle = col.light;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-hw / 2 + 2, -hh / 2 + 2);
  ctx.lineTo(hw / 2 - 2, -hh / 2 + 2);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

// One orbiting light blade: a glowing dagger at (x, y) pointing along `ang`. `len` is its length, `wid` its width.
export function drawBlade(ctx, x, y, ang, len, wid, col, alpha) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (u, v) => [x + c * u - s * v, y + s * u + c * v];
  const pt = P(len * 0.6, 0);
  const sh1 = P(-len * 0.02, -wid * 0.5), sh2 = P(-len * 0.02, wid * 0.5);
  const tl = P(-len * 0.38, 0);
  const g1 = P(-len * 0.12, -wid * 0.28), g2 = P(-len * 0.12, wid * 0.28);
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha * 0.16;                       // glow
  ctx.fillStyle = col.main;
  ctx.beginPath();
  ctx.arc(x, y, len * 0.38, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = col.main;
  ctx.strokeStyle = col.dark || '#5a3d0c';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(pt[0], pt[1]);
  ctx.lineTo(sh1[0], sh1[1]);
  ctx.lineTo(g1[0], g1[1]);
  ctx.lineTo(tl[0], tl[1]);
  ctx.lineTo(g2[0], g2[1]);
  ctx.lineTo(sh2[0], sh2[1]);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = col.light;                           // the fuller: a bright line down the blade
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  const f0 = P(-len * 0.1, 0), f1 = P(len * 0.5, 0);
  ctx.moveTo(f0[0], f0[1]);
  ctx.lineTo(f1[0], f1[1]);
  ctx.stroke();
}

// Orbiting blades (Spirit/Seraph Blades): each blade points the way it is travelling and drags a tapered smear along its
// orbit. `launch` 0..1 turns them outward as Spear Wheel throws them. `angle` is the wheel's turn.
export function drawOrbit(ctx, p, angle, out, bladeR, n, launch, el, grand, spinDir = 1) {
  const col = el ? { main: el.main, light: el.light, dark: el.dark } : grand ? { main: '#fff0a8', light: '#ffffff' } : { main: '#ffe28a', light: '#fffbe0' };
  const len = bladeR * (grand ? 4.0 : 3.6);
  const wid = bladeR * (grand ? 0.95 : 0.85);
  if (grand) {                                          // Seraph: a faint wheel of light the blades ride on
    ctx.strokeStyle = col.main;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, out, 0, TAU);
    ctx.stroke();
  }
  for (let b = 0; b < n; b++) {
    const a = angle + (b * TAU) / n;
    drawSmear(ctx, p.x, p.y, a, spinDir, 0.55 + 0.2 * (n < 3 ? 1 : 0), out - bladeR * 0.4, out + bladeR * 0.4, col, 0.55);
  }
  for (let b = 0; b < n; b++) {
    const a = angle + (b * TAU) / n;
    const dirAng = a + spinDir * (Math.PI / 2) * (1 - launch);
    drawBlade(ctx, p.x + Math.cos(a) * out, p.y + Math.sin(a) * out, dirAng, len, wid, col, 1);
  }
  ctx.globalAlpha = 1;
}
