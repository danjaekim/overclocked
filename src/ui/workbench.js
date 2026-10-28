// The workbench screen (rig/workbench.js): a sheet over the lower part of the screen, like the rig editor, with the
// stock as cards and the gold you have. Buying a rule card asks which chain gets it.

import { PIECES, CHAIN_COLORS, CHAIN_NAMES, RULES } from '../rig/pieces.js';
import { GOLD_NAME, describeItem, buyItem, rerollPrice, needsChain } from '../rig/workbench.js';
import { icon } from './rig-editor.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// opts: { rig, gold, stock, restock() -> stock, onChange(rig, gold, item), onDone(placed: bool) }
export function showWorkbench(overlays, { rig, gold, stock, restock, onChange, onDone }) {
  let st = rig;
  let g = gold;
  let items = stock;
  let rerolls = 0;
  let pick = null;                     // index of an item (rule card, slot, energy) waiting for a chain
  let note = '';
  let placed = false;

  function card(it, k) {
    const d = describeItem(st, it);
    const bought = it.sold;
    const can = !bought && g >= it.price;
    const ic = d.piece;
    const type = d.piece && it.kind !== 'overclock' ? d.piece.type : 'cap';
    return `<div class="rcardw"><button class="rcard ${type}${can ? '' : ' dim'}" data-act="buy:${k}"${bought ? ' disabled' : ''}>${ic ? icon(ic, 30) : ''}<b>${esc(d.title)}</b><span>${bought ? 'bought' : esc(d.tag)}</span><em>${esc(d.desc)}</em><strong class="price">${bought ? '' : `${it.price} ${GOLD_NAME.toLowerCase()}`}</strong></button></div>`;
  }

  function render() {
    const rpr = rerollPrice(rerolls);
    const pi = pick === null ? null : items[pick];
    const what = pi === null ? '' : pi.kind === 'rule' ? RULES[pi.rule].name : pi.kind === 'slot' ? '+1 slot' : '+3 energy';
    const ok = (c) => pi.kind !== 'slot' || c.slots.length < st.cap;
    const chains = pi === null ? '' : `<div class="rfull"><span><b>${esc(what)}</b> goes on which chain?</span>${st.chains.map((c, i) => (ok(c) ? `<button class="rbtn" data-act="chain:${i}" style="border-color:${CHAIN_COLORS[i]}">${CHAIN_NAMES[i]} (${esc(RULES[c.rule].name)}, ${c.slots.length})</button>` : '')).join('')}<button class="rbtn" data-act="cancel">Back</button></div>`;
    overlays.show(`
      <div class="rhead"><b>Workbench</b><span class="gold">${g} ${GOLD_NAME.toLowerCase()}</span>
        <button class="rbtn" data-act="reroll"${g < rpr ? ' disabled' : ''}>Reroll ${rpr}</button>
        <button class="rbtn primary" data-act="done">Leave</button></div>
      ${chains}<div class="rcards wb">${items.map(card).join('')}</div>
      <div class="rhint">${esc(note || 'Spend gold on pieces, upgrades and room in your chains.')}</div>`, onAct, 'sheet');
  }

  function buy(k, chain) {
    const it = items[k];
    if (!it || it.sold || g < it.price) { note = it && !it.sold ? `You need ${it.price - g} more gold.` : ''; render(); return; }
    const res = buyItem(st, it, chain);
    if (!res) { note = it.kind === 'piece' ? 'No room for it: free up a slot first.' : 'Cannot buy that.'; render(); return; }
    st = res.rig;
    g -= it.price;
    it.sold = true;
    if (res.placed) placed = true;
    onChange(st, g, it);
    note = it.kind === 'piece' ? `${PIECES[it.id].name} bought. Arrange it in the rig editor after.` : 'Bought.';
    pick = null;
    render();
  }

  function onAct(act) {
    const [kind, a] = act.split(':');
    if (kind === 'done') onDone(placed);
    else if (kind === 'reroll') {
      const price = rerollPrice(rerolls);
      if (g < price) return;
      g -= price;
      rerolls++;
      items = restock();
      onChange(st, g);
      note = '';
      render();
    } else if (kind === 'buy') {
      const k = Number(a);
      if (items[k] && needsChain(items[k]) && !items[k].sold && g >= items[k].price) { pick = k; render(); return; }
      buy(k, 0);
    } else if (kind === 'chain') {
      buy(pick, Number(a));
    } else if (kind === 'cancel') {
      pick = null;
      render();
    }
  }

  render();
}
