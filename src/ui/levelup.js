// Level-up choice screen: 1-3 large vertical cards (thumb-friendly, >= 72px tall).
// Taps are ignored for a moment after it opens so a thumb still on the screen can't pick one.

import { RARITIES } from '../data/rarities.js';
import { LEVELUP } from '../data/progression.js';

const KIND_LABEL = {
  weapon_new: 'New weapon',
  weapon_up: 'Weapon',
  passive_new: 'New passive',
  passive_up: 'Passive',
  title_new: 'Title',
  heal: 'Recover',
};

export function showLevelUp(overlays, { level, offers, onPick }) {
  const cards = offers.map((o, i) => {
    const color = RARITIES[o.rarity].color;
    const badge = o.kind === 'heal' ? '' : o.isNew ? 'NEW' : `Lv ${o.toLevel - 1} → ${o.toLevel}`;
    return `<button class="card" data-act="pick:${i}" style="--c:${color}">
      <span class="card-top"><b>${o.name}</b><em>${badge}</em></span>
      <span class="card-kind">${KIND_LABEL[o.kind]}</span>
      <span class="card-desc">${o.desc}</span>
    </button>`;
  }).join('');

  const el = overlays.show(
    `<h2>Level up!</h2><p class="sub">You reached level ${level}</p><div class="cards">${cards}</div>`,
    (act) => {
      if (!act.startsWith('pick:')) return;
      const offer = offers[Number(act.slice(5))];
      if (offer) onPick(offer);
    },
    'levelup locked'
  );
  setTimeout(() => el && el.classList.remove('locked'), LEVELUP.inputLock * 1000);
}
