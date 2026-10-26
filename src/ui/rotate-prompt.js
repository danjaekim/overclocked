// Portrait only. On a touch device held in landscape, cover the screen and report
// "blocked" so the game pauses simulation until the phone is rotated back.

export function createRotatePrompt(view) {
  const el = document.createElement('div');
  el.id = 'rotate';
  el.innerHTML = '<div><div class="phone"></div><p>Rotate your phone to portrait</p></div>';
  document.body.appendChild(el);

  let blocked = false;
  function check() {
    blocked = view.isTouch && window.innerWidth > window.innerHeight;
    el.style.display = blocked ? 'flex' : 'none';
  }
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', check);
  check();

  return { get blocked() { return blocked; }, check };
}
