// Treasure screen: shows how many rolls the chest gave, then reveals each result as a card.
// The rolls are already applied to the rig (rig/chests.js#openRigChest); this is only the reveal.

const STEP = 0.32;   // seconds between reveals
const COLOR = { piece: '#e8a33d', level: '#6cc8ff', cap: '#ffd34d' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function showTreasure(overlays, { count, rolls, boss = false, sfx = () => {}, onDone }) {
  const cards = rolls.map((r, i) => `<div class="card reveal" style="--c:${COLOR[r.kind]}; animation-delay:${(0.45 + i * STEP).toFixed(2)}s">
      <span class="card-top"><b>${esc(r.title)}</b><em>${esc(r.tag)}</em></span>
      <span class="card-desc">${esc(r.desc)}${r.placed ? (r.placed.kind === 'bench' ? '. It is on your bench.' : `. It went into chain ${'ABCD'[r.placed.c]}.`) : ''}</span>
    </div>`).join('');
  const total = 0.45 + rolls.length * STEP + 0.2;
  const el = overlays.show(
    `<h2>${boss ? 'Warlord\'s hoard' : 'Treasure!'}</h2>
     <p class="sub chest-count">×${count}</p>
     <div class="cards">${cards}</div>
     <button class="btn primary reveal" style="animation-delay:${total.toFixed(2)}s" data-act="done" disabled>${rolls.some((r) => r.placed) ? 'Collect and edit' : 'Collect'}</button>`,
    (act) => { if (act === 'done') onDone(); },
    'levelup'
  );
  rolls.forEach((_, i) => setTimeout(() => sfx('chest'), (0.45 + i * STEP) * 1000));
  setTimeout(() => {
    const b = el && el.querySelector('button[data-act="done"]');
    if (b) b.disabled = false;
  }, total * 1000);
}
