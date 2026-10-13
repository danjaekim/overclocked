// Level-up choice screen: 1-3 large vertical cards (thumb-friendly, >= 72px tall).
// Taps are ignored for a moment after it opens so a thumb still on the screen can't pick one.
// Reroll redraws all offers; Banish removes one offered item for the rest of the run.

import { RARITIES } from '../data/rarities.js';
import { LEVELUP } from '../data/progression.js';

const KIND_LABEL = {
  weapon_new: 'New weapon',
  weapon_up: 'Weapon',
  passive_new: 'New passive',
  passive_up: 'Passive',
  perk_new: 'New technique',
  perk_up: 'Technique',
  title_new: 'Title',
  heal: 'Recover',
};

export function showLevelUp(overlays, { level, offers, rerolls = 0, banishes = 0, onPick, onReroll, onBanish }) {
  let banishMode = false;

  function render(locked) {
    const cards = offers.map((o, i) => {
      const color = RARITIES[o.rarity].color;
      const badge = o.kind === 'heal' ? '' : o.isNew ? 'NEW' : `Lv ${o.toLevel - 1} → ${o.toLevel}`;
      const canBanish = banishMode && o.kind !== 'heal';
      return `<button class="card${canBanish ? ' banish' : ''}" data-act="pick:${i}" style="--c:${color}">
        <span class="card-top"><b>${o.name}</b><em>${canBanish ? 'tap to banish' : badge}</em></span>
        <span class="card-kind">${KIND_LABEL[o.kind]}</span>
        <span class="card-desc">${o.desc}</span>
      </button>`;
    }).join('');

    const tools = (onReroll || onBanish)
      ? `<div class="lu-tools">
           <button class="btn small" data-act="reroll" ${rerolls > 0 ? '' : 'disabled'}>Reroll (${rerolls})</button>
           <button class="btn small${banishMode ? ' on' : ''}" data-act="banish" ${banishes > 0 ? '' : 'disabled'}>${banishMode ? 'Cancel' : 'Banish'} (${banishes})</button>
         </div>`
      : '';

    const el = overlays.show(
      `<h2>Level up!</h2><p class="sub">You reached level ${level}</p><div class="cards">${cards}</div>${tools}`,
      (act) => {
        if (act === 'reroll') return onReroll && onReroll();
        if (act === 'banish') { banishMode = !banishMode; return render(false); }
        if (!act.startsWith('pick:')) return;
        const offer = offers[Number(act.slice(5))];
        if (!offer) return;
        if (banishMode && offer.kind !== 'heal') return onBanish && onBanish(offer);
        onPick(offer);
      },
      locked ? 'levelup locked' : 'levelup'
    );
    if (locked) setTimeout(() => el && el.classList.remove('locked'), LEVELUP.inputLock * 1000);
  }

  render(true);
}
