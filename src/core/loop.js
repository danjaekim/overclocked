// Fixed-timestep loop: simulation at 60 Hz, render once per animation frame.
// The simulation never reads wall-clock time; it only ever sees STEP.

export const STEP = 1 / 60;
const MAX_FRAME = 0.1; // clamp so a backgrounded tab doesn't trigger a catch-up spiral

// isPaused(): when true, time still passes but update() is not called.
export function createLoop({ update, render, isPaused = () => false, onFrameStats }) {
  let last = 0;
  let acc = 0;
  let running = false;
  let rafId = 0;
  const loop = {};

  function frame(now) {
    if (!running) return;
    const frameStart = performance.now();
    const dtReal = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    let simMs = 0;
    if (!isPaused()) {
      acc += dtReal;
      const t0 = performance.now();
      while (acc >= STEP) {
        update(STEP);
        acc -= STEP;
      }
      simMs = performance.now() - t0;
    } else {
      acc = 0;
    }

    const r0 = performance.now();
    render(acc / STEP);
    const renderMs = performance.now() - r0;

    if (onFrameStats) onFrameStats(dtReal, simMs, renderMs, performance.now() - frameStart);
    rafId = requestAnimationFrame(frame);
  }

  loop.start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    acc = 0;
    rafId = requestAnimationFrame(frame);
  };
  loop.stop = () => {
    running = false;
    cancelAnimationFrame(rafId);
  };
  return loop;
}
