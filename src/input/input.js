// Input: floating virtual joystick (touch/pointer) plus WASD/arrows for desktop.
// Exposes a normalized movement vector via getMove().
//
// Touches that begin in the top zone (HUD area) never start the joystick; a tap on the
// pause button there calls onPause and any other HUD tap calls onBuild. Stick coordinates are CSS pixels relative to the canvas.

const MAX_RADIUS = 60;      // CSS px of finger travel for full speed
const DEAD_ZONE = 6;        // CSS px
const TOP_ZONE = 0.12;      // fraction of canvas height reserved for the HUD
const PAUSE_BTN = 64;       // CSS px square in the top-right corner

export function createInput(canvas, { onPause = () => {}, onBuild = () => {} } = {}) {
  const keys = new Set();
  const stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, maxRadius: MAX_RADIUS };
  const out = { x: 0, y: 0 };

  const KEY_BLOCK = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') {
      if (!e.repeat) onPause();
      return;
    }
    if (KEY_BLOCK.has(k)) e.preventDefault();
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', reset);

  // Block page zoom / long-press menus on iOS.
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(g, (e) => e.preventDefault());
  // Safari ignores the viewport's user-scalable=no; a two-finger touchmove is the pinch itself.
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    if (stick.active) return;
    const r = canvas.getBoundingClientRect();
    const lx = e.clientX - r.left;
    const ly = e.clientY - r.top;
    if (ly < r.height * TOP_ZONE) {
      if (lx > r.width - PAUSE_BTN && ly < PAUSE_BTN + 24) onPause();
      else onBuild();                 // a tap on the rest of the HUD opens the build view
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    stick.active = true;
    stick.id = e.pointerId;
    stick.ox = stick.x = lx;
    stick.oy = stick.y = ly;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!stick.active || e.pointerId !== stick.id) return;
    const r = canvas.getBoundingClientRect();
    stick.x = e.clientX - r.left;
    stick.y = e.clientY - r.top;
  });

  const end = (e) => {
    if (e.pointerId !== stick.id) return;
    stick.active = false;
    stick.id = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  function reset() {
    keys.clear();
    stick.active = false;
    stick.id = null;
  }

  function getMove() {
    let x = 0;
    let y = 0;
    if (stick.active) {
      const dx = stick.x - stick.ox;
      const dy = stick.y - stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > DEAD_ZONE) {
        const mag = Math.min((len - DEAD_ZONE) / (MAX_RADIUS - DEAD_ZONE), 1);
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
    out.x = x;
    out.y = y;
    return out;
  }

  return { getMove, getStick: () => stick, reset, isKeyDown: (k) => keys.has(k) };
}
