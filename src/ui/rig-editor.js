// The rig editor: a sheet over the lower part of the screen while the game is paused (docs/overclocked-spec.md,
// "Editing and readability"). Tap a piece, then tap a slot (they swap) or a gap between slots (it inserts).
// The line under each chain says what it does now; slots that cannot run are greyed. Undo steps back one move,
// Reset returns to how the rig was when the editor opened (or right after you took an offer).

import { PIECES, RULES, CHAIN_COLORS, CHAIN_NAMES } from '../rig/pieces.js';
import { analyzeChain } from '../rig/chain.js';
import { cloneRig, moveTo, pieceAt, placeSuggested, sameLoc, chainDefsOf, BENCH } from '../rig/editor.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const icon = (p, px) => `<svg class="ico${p.filled ? ' filled' : ''}" viewBox="0 0 24 24" width="${px}" height="${px}"><path d="${p.icon}"/></svg>`;

// opts: { rig, offers: [piece id] | null, onDone(rig) }
export function showRigEditor(overlays, { rig, offers, onDone }) {
  let st = cloneRig(rig);
  let snapshot = cloneRig(rig);
  const history = [];
  let sel = null;                 // a location, or null
  let suggest = null;             // where an offer was put, outlined until the next move
  let pending = offers;           // offers still to pick from, or null
  let note = '';

  const piece = (id) => (id ? PIECES[id] : null);

  function slotHtml(loc, act, reasons) {
    const id = pieceAt(st, loc);
    const p = piece(id);
    const cls = ['slot', p ? p.type : 'empty'];
    if (p && reasons && reasons.has(loc.i)) cls.push('dead');
    if (sel && sameLoc(sel, loc)) cls.push('sel');
    if (suggest && sameLoc(suggest, loc)) cls.push('suggest');
    return `<button class="${cls.join(' ')}" data-act="${act}">${p ? `${icon(p, 24)}<b>${esc(p.short)}</b><i>${p.cost}</i>` : ''}</button>`;
  }

  function chainHtml(c, ci) {
    const def = { rule: st.chains[ci].rule, slots: st.chains[ci].slots };
    const a = analyzeChain(def);
    let row = '';
    for (let i = 0; i < st.cap; i++) {
      if (sel) row += `<button class="gap" data-act="gap:${ci}:${i}" aria-label="insert here"></button>`;
      else row += '<span class="gapsp"></span>';
      row += slotHtml({ kind: 'slot', c: ci, i }, `slot:${ci}:${i}`, a.reasons);
    }
    row += sel ? `<button class="gap" data-act="gap:${ci}:${st.cap}" aria-label="insert at the end"></button>` : '<span class="gapsp"></span>';
    const first = [...a.reasons.entries()].sort((x, y) => x[0] - y[0])[0];
    const why = first ? ` <span class="why">Greyed: ${esc(PIECES[def.slots[first[0]]].name)} (${esc(first[1])})</span>` : '';
    return `<div class="rstrip"><span class="rbadge" style="background:${CHAIN_COLORS[ci]}">${CHAIN_NAMES[ci]}</span>
      <div class="rslots">${row}</div></div>
      <div class="rpreview"><b>${esc(RULES[def.rule].name)}</b> \u00b7 ${esc(a.text)}${why}</div>`;
  }

  function render() {
    const chains = st.chains.map(chainHtml).join('');
    let bench = '';
    for (let i = 0; i < BENCH; i++) bench += slotHtml({ kind: 'bench', i }, `bench:${i}`, null);
    let hint;
    if (sel) {
      const p = piece(pieceAt(st, sel));
      hint = `<b>${esc(p.name)}</b> (${p.type}, costs ${p.cost}): ${esc(p.desc)}. Tap a slot to swap, or a gap to insert.`;
    } else hint = note || 'Tap a piece, then tap where it goes.';
    const cards = pending
      ? `<div class="rcards">${pending.map((id, k) => {
        const p = PIECES[id];
        return `<button class="rcard ${p.type}" data-act="offer:${k}">${icon(p, 30)}<b>${esc(p.name)}</b><span>${esc(p.type)} · ${p.cost}</span><em>${esc(p.desc)}</em></button>`;
      }).join('')}</div>`
      : '';
    overlays.show(`
      <div class="rhead"><b>Rig</b>
        <button class="rbtn" data-act="undo"${history.length ? '' : ' disabled'}>Undo</button>
        <button class="rbtn" data-act="reset">Reset</button>
        <button class="rbtn primary" data-act="done"${pending ? ' disabled' : ''}>Done</button></div>
      ${cards}${chains}
      <div class="rbench">${bench}<span class="rlabel">Bench: spare pieces</span></div>
      <div class="rhint">${pending ? 'Pick one of three pieces.' : hint}</div>`, onAct, 'sheet');
  }

  function commit(next) {
    history.push(st);
    st = next;
    sel = null;
    suggest = null;
    note = '';
  }

  function onAct(act) {
    const [kind, a, b] = act.split(':');
    if (kind === 'done') {
      if (!pending) onDone(st);
    } else if (kind === 'undo') {
      if (history.length) { st = history.pop(); sel = suggest = null; render(); }
    } else if (kind === 'reset') {
      st = cloneRig(snapshot);
      history.length = 0;
      sel = suggest = null;
      note = 'Back to how it was.';
      render();
    } else if (kind === 'offer') {
      const id = pending[Number(a)];
      const placed = placeSuggested(st, id);
      if (!placed) { note = 'No room: the slots and the bench are full.'; render(); return; }
      st = placed.rig;
      snapshot = cloneRig(st);
      history.length = 0;
      suggest = placed.loc;
      pending = null;
      note = `${PIECES[id].name} went into the outlined slot. Tap Done to keep it, or move it.`;
      render();
    } else if (kind === 'slot' || kind === 'bench' || kind === 'gap') {
      const loc = kind === 'bench' ? { kind, i: Number(a) } : { kind, c: Number(a), i: Number(b) };
      if (!sel) {
        if (kind !== 'gap' && pieceAt(st, loc)) sel = loc;
      } else if (kind !== 'gap' && sameLoc(sel, loc)) {
        sel = null;
      } else {
        const next = moveTo(st, sel, loc);
        if (next) commit(next);
        else note = 'No room for that.';
      }
      render();
    }
  }

  render();
  return { rig: () => st };
}

export { chainDefsOf };
