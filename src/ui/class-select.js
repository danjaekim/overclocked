// Class select: one big card per unlocked class (thumb-friendly), plus a back button.

import { CLASSES } from '../data/classes.js';
import { WEAPONS } from '../data/weapons.js';

export function showClassSelect(overlays, { last, onPick, onBack }) {
  const ids = Object.keys(CLASSES).filter((id) => CLASSES[id].unlocked);
  const cards = ids.map((id) => {
    const c = CLASSES[id];
    const w = WEAPONS[c.startWeapon];
    return `<button class="card" data-act="class:${id}" style="--c:#e8a33d">
      <span class="card-top"><b>${c.name}${id === last ? ' ·' : ''}</b><em>${w.name}</em></span>
      <span class="card-desc">${c.blurb}</span>
    </button>`;
  }).join('');
  overlays.show(
    `<h2>Choose your class</h2><div class="cards">${cards}</div>
     <button class="btn" data-act="back">Back</button>`,
    (act) => {
      if (act === 'back') onBack();
      else if (act.startsWith('class:')) onPick(act.slice(6));
    },
    'levelup'
  );
}
