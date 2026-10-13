// Portrait-only view. The camera always shows VIEW_W world units of width on every
// device; height follows the screen aspect, capped at MAX_VIEW_H (about 19.5:9).
// On a window wider than 9:16 (desktop) the game is drawn as a centered portrait column.

export const VIEW_W = 480;
export const MAX_VIEW_H = 1040;
const MIN_ASPECT = 16 / 9;             // height / width of the narrowest column we draw
const MAX_ASPECT = MAX_VIEW_H / VIEW_W;

export function isTouchDevice() {
  try {
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  } catch {
    return false;
  }
}

export function createView(stage, canvas) {
  const view = {
    w: VIEW_W,
    h: 800,
    scale: 1,        // canvas pixels per world unit
    cssScale: 1,     // CSS pixels per world unit
    dpr: 1,
    cssW: 0,
    cssH: 0,
    insetTop: 0,     // safe-area top inset in world units (notch / dynamic island)
    isTouch: isTouchDevice(),
    layout,
  };

  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top)';
  document.body.appendChild(probe);

  function layout() {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const aspect = winH / winW;

    let cssW = winW;
    let cssH = winH;
    if (aspect < MIN_ASPECT) {
      cssH = winH;
      cssW = winH / MIN_ASPECT;
    } else if (aspect > MAX_ASPECT) {
      cssW = winW;
      cssH = winW * MAX_ASPECT;
    }
    const left = Math.round((winW - cssW) / 2);
    const top = Math.round((winH - cssH) / 2);

    stage.style.left = left + 'px';
    stage.style.top = top + 'px';
    stage.style.width = Math.round(cssW) + 'px';
    stage.style.height = Math.round(cssH) + 'px';

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    view.dpr = dpr;
    view.cssW = cssW;
    view.cssH = cssH;
    view.cssScale = cssW / VIEW_W;
    view.scale = canvas.width / VIEW_W;
    view.h = canvas.height / view.scale;

    const insetPx = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    view.insetTop = Math.max(0, insetPx - top) / view.cssScale;
  }

  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  layout();
  return view;
}
