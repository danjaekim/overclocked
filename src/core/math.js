// Small math helpers. Anything that returns a vector writes into an out-param
// so hot loops never allocate.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Point on the perimeter of a rectangle centred at (cx, cy) with half-sizes (hw, hh).
// t in [0, 1) walks the perimeter, so side probability is proportional to side length.
export function perimeterPoint(cx, cy, hw, hh, t, out) {
  const w = hw * 2;
  const h = hh * 2;
  let d = t * 2 * (w + h);
  if (d < w) {                    // top
    out.x = cx - hw + d;
    out.y = cy - hh;
    return out;
  }
  d -= w;
  if (d < h) {                    // right
    out.x = cx + hw;
    out.y = cy - hh + d;
    return out;
  }
  d -= h;
  if (d < w) {                    // bottom
    out.x = cx + hw - d;
    out.y = cy + hh;
    return out;
  }
  d -= w;                         // left
  out.x = cx - hw;
  out.y = cy + hh - d;
  return out;
}

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
