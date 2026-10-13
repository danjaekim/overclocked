// Treasure screen: shows how many rolls the chest gave, then reveals each result as a card.
// The rolls are already applied (game/chests.js#openChest); this is only the reveal.

import { RARITIES } from '../data/rarities.js';

const STEP = 0.32;   // seconds between reveals

export function showTreasure(overlays, { count, rolls, boss = false, sfx = () => {}, onDone }) {
  const cards = rolls.map((r, i) => {
    const color = RARITIES[r.rarity].color;
    const badge = r.kind === 'ore' ? '' : r.kind === 'evolve' ? 'EVOLVED' : r.isNew ? 'NEW' : `Lv ${r.toLevel - 1} → ${r.toLevel}`;
    return `<div class="card reveal" style="--c:${color}; animation-delay:${(0.45 + i * STEP).toFixed(2)}s">
      <span class="card-top"><b>${r.name}</b><em>${badge}</em></span>
      <span class="card-desc">${r.desc}</span>
    </div>`;
  }).join('');
  const total = 0.45 + rolls.length * STEP + 0.2;
  const el = overlays.show(
    `<h2>${boss ? 'Warlord\'s hoard' : 'Treasure!'}</h2>
     <p class="sub chest-count">×${count}</p>
     <div class="cards">${cards}</div>
     <button class="btn primary reveal" style="animation-delay:${total.toFixed(2)}s" data-act="done" disabled>Collect</button>`,
    (act) => { if (act === 'done') onDone(); },
    'levelup'
  );
  rolls.forEach((_, i) => setTimeout(() => sfx('chest'), (0.45 + i * STEP) * 1000));
  setTimeout(() => {
    const b = el && el.querySelector('button[data-act="done"]');
    if (b) b.disabled = false;
  }, total * 1000);
}
