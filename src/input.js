// Input: virtual joystick (touch/pointer) plus WASD/arrow keys for desktop testing.
// Exposes a normalized movement vector via getMove().

const MAX_RADIUS = 60; // px of finger travel for full speed

export function createInput(canvas) {
  const keys = new Set();
  const stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };

  window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  canvas.addEventListener('pointerdown', (e) => {
    if (stick.active) return;
    canvas.setPointerCapture(e.pointerId);
    stick.active = true;
    stick.id = e.pointerId;
    stick.ox = stick.x = e.clientX;
    stick.oy = stick.y = e.clientY;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!stick.active || e.pointerId !== stick.id) return;
    stick.x = e.clientX;
    stick.y = e.clientY;
  });

  const end = (e) => {
    if (e.pointerId !== stick.id) return;
    stick.active = false;
    stick.id = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  function getMove() {
    let x = 0;
    let y = 0;
    if (stick.active) {
      const dx = stick.x - stick.ox;
      const dy = stick.y - stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        const mag = Math.min(len / MAX_RADIUS, 1);
        x = (dx / len) * mag;
        y = (dy / len) * mag;
      }
    }
    if (keys.has('a') || keys.has('arrowleft')) x -= 1;
    if (keys.has('d') || keys.has('arrowright')) x += 1;
    if (keys.has('w') || keys.has('arrowup')) y -= 1;
    if (keys.has('s') || keys.has('arrowdown')) y += 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  // For the renderer to draw the joystick overlay.
  function getStick() {
    return { ...stick, maxRadius: MAX_RADIUS };
  }

  return { getMove, getStick };
}
