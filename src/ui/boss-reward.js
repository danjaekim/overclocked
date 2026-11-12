// The boss reward screen (docs/plan-v13-boss-rewards.md): after the Warlord and the Seer, the pilot picks its reward.
// Overcharge asks for a piece you own: tap one to select it, tap it again (or the button) to confirm.

import { PIECES } from '../rig/pieces.js';
import { REWARDS } from '../data/boss-rewards.js';
import { OVERCHARGE } from '../rig/pieces.js';
import { icon } from './rig-editor.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// opts: { reward: id, n: 1 | 2, choices: [piece ids], onPick(piece id) }
export function showBossReward(overlays, { reward, n = 1, choices, onPick }) {
  const def = REWARDS[reward];
  let sel = null;
  const card = (id) => {
    const p = PIECES[id];
    return `<button class="rcard ${p.type} rwcard${id === sel ? ' sel' : ''}" data-act="pick:${id}" data-id="${id}">${icon(p, 30)}<b>${esc(p.name)}</b><span>${esc(p.type)}</span><em>${esc(OVERCHARGE[id].text)}</em></button>`;
  };
  const el = overlays.show(
    `<h2 class="ribbon">${esc(def.name)}</h2>
     <p class="rwdesc">${n === 1 ? 'The Warlord is down.' : 'The Seer is down.'} ${esc(def.desc)}</p>
     <div class="rwlist">${choices.map(card).join('')}</div>
     <div class="pbar"><button class="btn primary" data-act="go" disabled>Pick a piece</button></div>`,
    (act) => {
      if (act === 'go') { if (sel) onPick(sel); return; }
      if (!act.startsWith('pick:')) return;
      const id = act.slice(5);
      if (!choices.includes(id)) return;
      if (id === sel) { onPick(id); return; }
      sel = id;
      for (const c of el.querySelectorAll('.rwcard')) c.classList.toggle('sel', c.dataset.id === sel);
      const b = el.querySelector('[data-act="go"]');
      b.disabled = false;
      b.textContent = `${def.name} ${PIECES[sel].name}`;
    },
    'reward'
  );
  return el;
}
