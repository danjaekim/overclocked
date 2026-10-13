// Small math helpers. Anything that returns a vector writes into an out-param
// so hot loops never allocate.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Writes a unit vector from (ax, ay) toward (bx, by) into out; returns the distance.
export function dirTo(ax, ay, bx, by, out) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  if (d > 1e-6) {
    out.x = dx / d;
    out.y = dy / d;
  } else {
    out.x = 0;
    out.y = 0;
  }
  return d;
}
