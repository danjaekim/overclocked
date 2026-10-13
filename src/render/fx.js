// Visual effects: floating damage numbers and death puffs. Pure visuals, pooled, and
// droppable: if the pool is full or too many numbers are on screen, new ones are skipped.

const TAU = Math.PI * 2;
const MAX_NUMBERS = 60;      // text is the expensive part, so cap how many are live
const MAX_PUFFS_POOL = 300;  // keep room for numbers
const KIND_NUMBER = 0;
const KIND_PUFF = 1;

const numStr = [];
function numberText(n) {
  if (n > 999) return String(n);
  return numStr[n] || (numStr[n] = String(n));
}

export function addDamageNumber(run, x, y, amount, crit) {
  const w = run.world;
  if (w.fxNumbers >= MAX_NUMBERS) return;
  const f = w.fx.acquire();
  if (!f) return;
  const r = run.fxRng;
  f.kind = KIND_NUMBER;
  f.x = x + (r.next() - 0.5) * 14;
  f.y = y;
  f.vx = (r.next() - 0.5) * 24;
  f.vy = -70;
  f.ttl = f.maxTtl = crit ? 0.8 : 0.55;
  f.crit = crit;
  f.text = numberText(Math.max(1, Math.round(amount)));
  w.fxNumbers++;
}

export function addPuff(run, x, y, radius, color) {
  const w = run.world;
  if (w.fx.count >= MAX_PUFFS_POOL) return;
  const f = w.fx.acquire();
  if (!f) return;
  f.kind = KIND_PUFF;
  f.x = x;
  f.y = y;
  f.vx = f.vy = 0;
  f.r = radius;
  f.ttl = f.maxTtl = 0.22;
  f.text = color;
}

export function updateFx(run, dt) {
  const w = run.world;
  const list = w.fx.active;
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    f.ttl -= dt;
    if (f.ttl <= 0) {
      if (f.kind === KIND_NUMBER) w.fxNumbers--;
      w.fx.release(f);
      continue;
    }
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.kind === KIND_NUMBER) f.vy += 90 * dt;     // slow the rise
  }
}

export function drawFx(ctx, view, run) {
  const list = run.world.fx.active;
  const cam = run.cam;
  const x0 = cam.x - view.w / 2 - 30;
  const x1 = cam.x + view.w / 2 + 30;
  const y0 = cam.y - view.h / 2 - 30;
  const y1 = cam.y + view.h / 2 + 30;

  // puffs: expanding fading ring
  ctx.lineWidth = 2;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f.kind !== KIND_PUFF) continue;
    if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
    const u = 1 - f.ttl / f.maxTtl;
    ctx.globalAlpha = 0.8 * (1 - u);
    ctx.strokeStyle = f.text;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * (1 + 1.4 * u), 0, TAU);
    ctx.stroke();
  }

  // numbers: normal first, then crits on top
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    const wantCrit = pass === 1;
    ctx.font = wantCrit ? '700 20px system-ui, sans-serif' : '600 14px system-ui, sans-serif';
    ctx.fillStyle = wantCrit ? '#ffd34d' : '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = wantCrit ? 4 : 3;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.kind !== KIND_NUMBER || f.crit !== wantCrit) continue;
      if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
      ctx.globalAlpha = Math.min(1, (f.ttl / f.maxTtl) * 2.2);
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
    }
  }
  ctx.globalAlpha = 1;
}
