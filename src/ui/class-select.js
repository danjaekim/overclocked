// Class select: one big card per class. Locked classes are shown dimmed with how to unlock
// them (the first Warlord kill unlocks the Berserker).

import { CLASSES } from '../data/classes.js';
import { WEAPONS } from '../data/weapons.js';
import { spriteUrl } from '../render/sprites.js';

const portrait = (id, locked) => `<img class="portrait${locked ? ' dim' : ''}" src="${spriteUrl(id)}" alt="" width="64" height="64">`;

export function showClassSelect(overlays, { last, isUnlocked, onPick, onBack }) {
  const cards = Object.keys(CLASSES).map((id) => {
    const c = CLASSES[id];
    const w = WEAPONS[c.startWeapon];
    if (!isUnlocked(id)) {
      return `<div class="card locked-class" style="--c:#555a6e">
        ${portrait(id, true)}<span class="card-body"><span class="card-top"><b>${c.name}</b><em>Locked</em></span>
        <span class="card-desc">${c.unlock ? c.unlock.hint : 'Coming soon'}</span></span>
      </div>`;
    }
    return `<button class="card" data-act="class:${id}" style="--c:#e8a33d">
      ${portrait(id, false)}<span class="card-body"><span class="card-top"><b>${c.name}${id === last ? ' ·' : ''}</b><em>${w.name}</em></span>
      <span class="card-desc">${c.blurb}</span></span>
    </button>`;
  }).join('');
  overlays.show(
    `<h2>Choose your class</h2><div class="cards">${cards}</div>
     <button class="btn" data-act="back">Back</button>`,
    (act) => {
      if (act === 'back') onBack();
      else if (act.startsWith('class:')) onPick(act.slice(6));
    },
    'classes'
  );
}
