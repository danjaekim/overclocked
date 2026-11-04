// The pilot picker (docs/plan-v12-pilots.md, M2): shown before each run. One card per pilot with its sprite, rule and cost; tap a
// card to select it, tap the selected card (or Start) to begin. `locked` maps a pilot id to its unlock hint (M6): a locked card
// shows a dark silhouette and the hint and cannot be picked.

import { PILOTS, PILOT_IDS, isPilot, DEFAULT_PILOT } from '../data/pilots.js';
import { CHASSIS } from '../rig/chassis.js';
import { PIECES } from '../rig/pieces.js';
import { getSprite } from '../render/sprites.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const startLine = (p) => `${CHASSIS[p.start.chassis].name} · ${p.start.slots.map((id) => (PIECES[id] ? PIECES[id].name : id)).join(', ')}`;

function cardHtml(id, selected, hint, won) {
  const p = PILOTS[id];
  const lock = hint != null;
  return `<button class="pcard${id === selected ? ' sel' : ''}${lock ? ' locked' : ''}" data-act="pick:${id}" data-id="${id}">
    <canvas width="76" height="76" data-sprite="${id}"></canvas>
    <span class="pbody"><b>${esc(p.name)}${won ? ' <i class="pwon">won</i>' : ''}</b><small>${lock ? 'Locked' : esc(startLine(p))}</small>
      <span class="prule">${esc(lock ? hint : p.desc)}</span>${lock ? '' : `<em class="pcost">${esc(p.cost)}</em>`}</span>
  </button>`;
}

// Sprites rasterize in the background after boot, so a picker shown at once may find some not ready: try again briefly.
export function drawSprites(root, tries = 40) {
  let missing = 0;
  for (const cv of root.querySelectorAll('canvas[data-sprite]')) {
    const spr = getSprite(cv.dataset.sprite);
    const x = cv.getContext && cv.getContext('2d');
    if (!x) continue;
    if (spr) { x.clearRect(0, 0, cv.width, cv.height); x.drawImage(spr, 0, 0, cv.width, cv.height); } else missing++;
  }
  if (missing && tries > 0 && typeof setTimeout === 'function') setTimeout(() => { if (root.isConnected) drawSprites(root, tries - 1); }, 100);
}

// opts: { selected: pilot id, locked: { id: hint }, won: [pilot ids with a win], onStart(id) }
export function showPilotSelect(overlays, { selected = DEFAULT_PILOT, locked = {}, won = [], onStart }) {
  let sel = isPilot(selected) && locked[selected] == null ? selected : DEFAULT_PILOT;
  const startLabel = () => `Start as ${PILOTS[sel].name}`;
  const el = overlays.show(
    `<h2>Choose a pilot</h2>
     <div class="plist">${PILOT_IDS.map((id) => cardHtml(id, sel, locked[id] != null ? locked[id] : null, won.includes(id))).join('')}</div>
     <div class="pbar"><button class="btn primary" data-act="start">${esc(startLabel())}</button></div>`,
    (act) => {
      if (act === 'start') { onStart(sel); return; }
      if (!act.startsWith('pick:')) return;
      const id = act.slice(5);
      if (!isPilot(id) || locked[id] != null) return;
      if (id === sel) { onStart(id); return; }                  // a second tap on the selected card starts
      sel = id;
      for (const c of el.querySelectorAll('.pcard')) c.classList.toggle('sel', c.dataset.id === sel);
      el.querySelector('[data-act="start"]').textContent = startLabel();
    },
    'pilots'
  );
  drawSprites(el);
  return el;
}
