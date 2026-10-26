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

  // The usable size. In an iOS home-screen app window.innerHeight can come up short of the screen
  // (the strip down to the home indicator stays black), so there we also trust the visual viewport,
  // a fixed full-screen probe and the screen height. A Safari tab keeps innerHeight: its toolbars
  // move, and taking the larger number there would hide the bottom of the game behind them.
  const fill = document.createElement('div');
  fill.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;visibility:hidden;pointer-events:none';
  document.body.appendChild(fill);
  function isStandalone() {
    try {
      return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    } catch {
      return false;
    }
  }
  function usable() {
    let w = window.innerWidth;
    let h = window.innerHeight;
    if (isStandalone()) {
      const r = fill.getBoundingClientRect();
      const vv = window.visualViewport;
      h = Math.max(h, r.height, vv ? vv.height : 0);
      if (window.screen && window.screen.height > 0 && window.screen.width > 0 && window.screen.width <= w + 1) {
        h = Math.max(h, Math.min(window.screen.height, window.screen.width * MAX_ASPECT));
      }
      w = Math.max(w, r.width);
    }
    return { w, h };
  }

  function layout() {
    const { w: winW, h: winH } = usable();
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
    // Under a notch the status bar blurs what is beneath it, so the HUD starts a little lower.
    view.insetTop = Math.max(0, insetPx - top) / view.cssScale + (insetPx > top ? 10 : 0);
  }

  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  window.addEventListener('pageshow', layout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
  layout();
  setTimeout(layout, 300);           // iOS reports the home-screen window size late
  setTimeout(layout, 1200);
  return view;
}
