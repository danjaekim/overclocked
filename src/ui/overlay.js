// DOM overlays for menus (gameplay itself is canvas). One overlay is mounted at a time
// inside #ui, which sits on top of the portrait stage. Buttons use data-act="name".

export function createOverlays(uiEl) {
  let onAct = null;

  uiEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (btn && onAct) onAct(btn.dataset.act);
  });

  return {
    show(html, handler, className = '') {
      onAct = handler;
      uiEl.innerHTML = `<div class="overlay ${className}">${html}</div>`;
      return uiEl.firstChild;
    },
    hide() {
      onAct = null;
      uiEl.innerHTML = '';
    },
    get visible() {
      return uiEl.firstChild !== null;
    },
  };
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
