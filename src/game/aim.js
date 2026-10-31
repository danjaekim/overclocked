// Aiming limits. In a rig run (Overclocked) a weapon only picks a target that is on screen, plus AIM_MARGIN, so
// kills happen where the player can see them. Shots keep flying and hit whatever they meet past the edge.
// Overforged classes (not a rig run) aim at anything in range, as before.

export const AIM_MARGIN = 20;

export function onScreen(run, o, margin = AIM_MARGIN) {
  return Math.abs(o.x - run.cam.x) <= run.view.w / 2 + margin && Math.abs(o.y - run.cam.y) <= run.view.h / 2 + margin;
}

export const canAim = (run, o) => !run.rigRun || onScreen(run, o);
