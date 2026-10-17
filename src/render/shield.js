// The player's shield (the Mage's Arcane Ward and any other shield): a faint bubble with a bright rim and a moving glint.
// It reads its own strength (shield / the most it has held), flares when it soaks a hit, shatters when it breaks and
// snaps back with a contracting ring when it refills.

const TAU = Math.PI * 2;
const st = { prev: 0, peak: 0, hitT: -9, breakT: -9, refillT: -9, bx: 0, by: 0, r: 0 };

export function drawShield(ctx, p, t, lift) {
  const s = p.shield;
  if (s > st.peak) st.peak = s;
  if (s < st.prev - 0.01) { if (s <= 0) { st.breakT = t; st.bx = p.x; st.by = p.y - lift; } else st.hitT = t; }
  if (s > 0 && st.prev <= 0) st.refillT = t;
  if (s <= 0 && st.breakT < t - 1) st.peak = 0;
  st.prev = s;
  const cx = p.x, cy = p.y - lift, R = p.r + 13;

  if (s > 0) {
    const f = Math.min(1, s / (st.peak || s));
    const low = f < 0.34, flick = low ? 0.65 + 0.35 * Math.sin(t * 22) : 1;
    const hit = Math.max(0, 1 - (t - st.hitT) / 0.18);
    const ry = R * 0.92;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / R);
    const g = ctx.createRadialGradient(0, 0, R * 0.35, 0, 0, R);          // clear in the middle, glassy toward the edge
    g.addColorStop(0, 'rgba(120,205,255,0)');
    g.addColorStop(0.7, `rgba(120,205,255,${0.07 + 0.05 * f})`);
    g.addColorStop(1, `rgba(170,232,255,${0.30 + 0.12 * f + hit * 0.3})`);
    ctx.globalAlpha = flick; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.lineWidth = 1.6 + hit * 2; ctx.strokeStyle = hit > 0 ? `rgba(255,255,255,${0.55 + hit * 0.45})` : `rgba(190,238,255,${0.45 + 0.2 * Math.sin(t * 2.4)})`;
    ctx.beginPath(); ctx.arc(0, 0, R - 0.8, 0, TAU); ctx.stroke();
    // a glint that slides around the rim, and a fixed soft highlight up-left
    const a = t * 1.1;
    ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.arc(0, 0, R - 1.6, a, a + 0.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R - 4, Math.PI * 1.12, Math.PI * 1.38); ctx.stroke();
    // rune ticks: one per remaining quarter of the ward, so the bubble shows how much is left
    const ticks = Math.max(1, Math.ceil(f * 4));
    ctx.fillStyle = 'rgba(200,242,255,.8)';
    for (let i = 0; i < ticks; i++) { const ta = -t * 0.5 + i * TAU / 4; ctx.beginPath(); ctx.arc(Math.cos(ta) * (R - 0.8), Math.sin(ta) * (R - 0.8), 1.9, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  const refill = 1 - (t - st.refillT) / 0.3;                           // a ring closing in as the ward comes back
  if (refill > 0) { ctx.strokeStyle = `rgba(190,238,255,${refill * 0.8})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R + 16 * refill, 0, TAU); ctx.stroke(); }

  const brk = (t - st.breakT) / 0.42;                                  // shards flying off where it broke
  if (brk >= 0 && brk < 1) {
    const e = 1 - (1 - brk) * (1 - brk), al = 1 - brk;
    ctx.strokeStyle = `rgba(200,240,255,${al * 0.9})`; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) { const a = i * TAU / 9 + 0.3, r0 = R + e * 20, r1 = r0 + 7 * (1 - brk); ctx.beginPath(); ctx.arc(st.bx, st.by, r0, a, a + 0.24 * (1 - brk * 0.5)); ctx.stroke(); }
    ctx.strokeStyle = `rgba(255,255,255,${al * 0.5})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(st.bx, st.by, R + e * 8, 0, TAU); ctx.stroke();
  }
}
