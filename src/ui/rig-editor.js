// The rig editor: a sheet over the lower part of the screen while the game is paused (docs/overclocked-spec.md,
// "Editing and readability"). Two ways to move a piece:
//   tap     tap a piece, then a slot (they swap) or a gap marker between slots (it inserts)
//   drag    pick a piece up and hold it over a slot (swap) or over the edge between two pieces: the pieces
//           open up and the row previews the insert (Chain A/B update live too). Let go to drop.
// The line under each chain says what it does now; slots that cannot run are greyed. A selected piece can be
// sold. Undo steps back one move, Reset returns to how the rig was when the editor opened (or right after an
// offer). With an offer on the table and the rig full, you replace a piece (it is sold) or skip the offer.

import { PIECES, RULES, CHAIN_COLORS, CHAIN_NAMES } from '../rig/pieces.js';
import { analyzeChain } from '../rig/chain.js';
import { cloneRig, planMove, setPiece, pieceAt, placeSuggested, sameLoc, chainDefOf, BENCH } from '../rig/editor.js';
import { applyOffer, describeOffer } from '../rig/offers.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const icon = (p, px) => `<svg class="ico${p.filled ? ' filled' : ''}" viewBox="0 0 24 24" width="${px}" height="${px}"><path d="${p.icon}"/></svg>`;
const DRAG_START = 6;            // px of movement before a press becomes a drag
const EDGE = 0.28;               // the outer share of a slot, each side, that counts as "between"

const STAT_ICON = { filled: false, icon: 'M12 5v14 M5 12h14' };
const CAP_ICON = { filled: false, icon: 'M3 8l9-5 9 5-9 5z M3 13l9 5 9-5 M3 17l9 5 9-5' };

// opts: { rig, offers: [offer] | null, deal(banished) -> offers, rerolls, banishes, onDone(rig, { rerolls, banishes, banished }) }
// An offer is { kind: 'piece' | 'level' | 'stat' | 'cap', ... } (rig/offers.js). A piece goes to a slot; the others apply at once.
let active = null;             // the open editor's AbortController: a new editor closes the old one's listeners

export function showRigEditor(overlays, { rig, offers, deal = null, rerolls = 0, banishes = 0, onDone }) {
  const used = { rerolls, banishes, banished: [] };
  let st = cloneRig(rig);
  let snapshot = cloneRig(rig);
  const history = [];
  let sel = null;                 // a location, or null
  let suggest = null;             // where an offer was put, outlined until the next move
  let pending = offers;           // offers still to pick from, or null
  let incoming = null;            // an offer taken while the rig was full: a piece to swap in for one you sell
  let note = '';
  let drag = null;                // { from, to, plan, ghost, rects } while a piece is held
  let press = null;               // a pointer that went down on a piece and has not become a drag yet
  let quietUntil = 0;             // ignore the click a finished drag leaves behind
  if (active) active.abort();
  const ac = new AbortController();
  active = ac;

  const piece = (id) => (id ? PIECES[id] : null);
  const view = () => (drag && drag.plan && drag.to.kind === 'gap' ? drag.plan.rig : st);

  function slotHtml(rigView, loc, act, reasons) {
    const id = pieceAt(rigView, loc);
    const p = piece(id);
    const cls = ['slot', p ? p.type : 'empty'];
    if (p && reasons && reasons.has(loc.i)) cls.push('dead');
    if (sel && sameLoc(sel, loc)) cls.push('sel');
    if (suggest && sameLoc(suggest, loc)) cls.push('suggest');
    if (drag) {
      if (sameLoc(drag.from, loc) && !(drag.plan && drag.to.kind === 'gap')) cls.push('lifted');
      if (drag.plan && drag.to.kind === 'gap' && sameLoc(drag.plan.landed, loc)) cls.push('ghost');
      if (drag.to && drag.to.kind !== 'gap' && sameLoc(drag.to, loc)) cls.push('target');
    }
    if (incoming && p) cls.push('replace');
    return `<button class="${cls.join(' ')}" data-act="${act}">${p ? `${icon(p, 24)}<b>${esc(p.short)}</b><i>${p.cost}</i>` : ''}</button>`;
  }

  function chainHtml(ci) {
    const rv = view();
    const def = chainDefOf(rv, ci);
    const a = analyzeChain(def);
    const n = def.slots.length;
    let row = '';
    for (let i = 0; i < n; i++) {
      if (sel) row += `<button class="gap" data-act="gap:${ci}:${i}" aria-label="insert here"></button>`;
      else row += '<span class="gapsp"></span>';
      row += slotHtml(rv, { kind: 'slot', c: ci, i }, `slot:${ci}:${i}`, a.reasons);
    }
    row += sel ? `<button class="gap" data-act="gap:${ci}:${n}" aria-label="insert at the end"></button>` : '<span class="gapsp"></span>';
    const first = [...a.reasons.entries()].sort((x, y) => x[0] - y[0])[0];
    const why = first ? ` <span class="why">Greyed: ${esc(PIECES[def.slots[first[0]]].name)} (${esc(first[1])})</span>` : '';
    return `<div class="rstrip"><span class="rbadge" style="background:${CHAIN_COLORS[ci]}">${CHAIN_NAMES[ci]}</span>
      <div class="rslots" data-chain="${ci}">${row}</div></div>
      <div class="rpreview"><b>${esc(RULES[def.rule].name)}</b> · ${esc(a.text)}${why}</div>`;
  }

  function offersHtml() {
    if (incoming) {
      const p = PIECES[incoming];
      return `<div class="rfull">${icon(p, 28)}<span><b>${esc(p.name)}</b> needs a slot. The rig is full: tap a piece to replace it (the old piece is sold), or skip.</span>
        <button class="rbtn" data-act="back">Back</button><button class="rbtn" data-act="skip">Skip</button></div>`;
    }
    if (!pending) return '';
    return `<div class="rcards">${pending.map((o, k) => {
      const d = describeOffer(st, o);
      const ic = d.piece || (o.kind === 'stat' ? STAT_ICON : CAP_ICON);
      const ban = used.banishes > 0 && (o.kind === 'piece' || o.kind === 'level') ? `<button class="rban" data-act="ban:${k}">Ban</button>` : '';
      return `<div class="rcardw"><button class="rcard ${d.type}" data-act="offer:${k}">${icon(ic, 30)}<b>${esc(d.title)}</b><span>${esc(d.tag)}</span><em>${esc(d.desc)}</em></button>${ban}</div>`;
    }).join('')}</div>`;
  }

  function render() {
    const chains = st.chains.map((_, ci) => chainHtml(ci)).join('');
    let bench = '';
    for (let i = 0; i < BENCH; i++) bench += slotHtml(view(), { kind: 'bench', i }, `bench:${i}`, null);
    let hint;
    if (drag && drag.to && !drag.plan) hint = 'No room for it there.';
    else if (sel) {
      const p = piece(pieceAt(st, sel));
      hint = `<b>${esc(p.name)}</b> (${p.type}, costs ${p.cost}): ${esc(p.desc)}. Tap a slot to swap, or a gap to insert. <button class="rbtn sell" data-act="sell">Sell</button>`;
    } else hint = note || 'Tap a piece, then tap where it goes, or drag it. Drop it between two pieces to slide it in.';
    overlays.show(`
      <div class="rhead"><b>Rig</b>
        ${pending && deal && used.rerolls > 0 && !incoming ? `<button class="rbtn" data-act="reroll">Reroll ${used.rerolls}</button>` : ''}
        ${pending ? '<button class="rbtn" data-act="skip">Skip</button>' : ''}
        <button class="rbtn" data-act="undo"${history.length ? '' : ' disabled'}>Undo</button>
        <button class="rbtn" data-act="reset">Reset</button>
        <button class="rbtn primary" data-act="done"${pending || incoming ? ' disabled' : ''}>Done</button></div>
      ${offersHtml()}${chains}
      <div class="rbench">${bench}<span class="rlabel">Bench: spare pieces</span></div>
      <div class="rhint">${pending && !incoming ? 'Pick one, or skip.' : hint}</div>`, onAct, 'sheet');
  }

  function commit(next) {
    history.push(st);
    st = next;
    sel = null;
    suggest = null;
    note = '';
  }

  const validLoc = (rig, l) => (l.kind === 'bench' ? l.i >= 0 && l.i < rig.bench.length : !!rig.chains[l.c] && l.i >= 0 && l.i < rig.chains[l.c].slots.length);
  const locOf = (kind, a, b) => (kind === 'bench' ? { kind, i: Number(a) } : { kind, c: Number(a), i: Number(b) });

  function onAct(act) {
    if (performance.now() < quietUntil) return;
    const [kind, a, b] = act.split(':');
    if (kind === 'done') {
      if (!pending && !incoming) { ac.abort(); onDone(st, used); }
    } else if (kind === 'undo') {
      if (history.length) { st = history.pop(); sel = suggest = null; render(); }
    } else if (kind === 'reset') {
      st = cloneRig(snapshot);
      history.length = 0;
      sel = suggest = null;
      note = 'Back to how it was.';
      render();
    } else if (kind === 'skip') {
      pending = incoming = null;
      note = 'Skipped. Nothing taken.';
      render();
    } else if (kind === 'back') {
      incoming = null;
      render();
    } else if (kind === 'sell') {
      if (sel) {
        const name = PIECES[pieceAt(st, sel)].name;
        commit(setPiece(st, sel, null));
        note = `Sold ${name}.`;
      }
      render();
    } else if (kind === 'reroll') {
      if (deal && used.rerolls > 0) { used.rerolls--; pending = deal(used.banished); render(); }
    } else if (kind === 'ban') {
      const o = pending[Number(a)];
      if (deal && used.banishes > 0 && o) { used.banishes--; used.banished.push(o.id); pending = deal(used.banished); render(); }
    } else if (kind === 'offer') {
      const o = pending[Number(a)];
      if (o.kind !== 'piece') {                                // a level, a passive or capacity: no slot needed
        const next = applyOffer(st, o);
        if (!next) return;
        const d = describeOffer(st, o);
        st = next;
        snapshot = cloneRig(st);
        history.length = 0;
        pending = null;
        note = `${d.title}: ${d.desc}. Tap Done to keep it.`;
        render();
        return;
      }
      const id = o.id;
      const placed = placeSuggested(st, id);
      if (!placed) {                                          // full: replace a piece, or skip
        incoming = id;
        sel = null;
        render();
        return;
      }
      st = placed.rig;
      snapshot = cloneRig(st);
      history.length = 0;
      suggest = placed.loc;
      pending = null;
      note = `${PIECES[id].name} went into the outlined slot. Tap Done to keep it, or move it.`;
      render();
    } else if (kind === 'slot' || kind === 'bench' || kind === 'gap') {
      const loc = locOf(kind, a, b);
      if (incoming) {                                         // replace mode: the piece you tap is sold
        const old = pieceAt(st, loc);
        if (kind === 'gap' || !old) return;
        st = setPiece(st, loc, incoming);
        snapshot = cloneRig(st);
        history.length = 0;
        suggest = loc;
        note = `${PIECES[old].name} sold. ${PIECES[incoming].name} went into the outlined slot. Tap Done to keep it, or move it.`;
        incoming = pending = null;
        render();
        return;
      }
      if (!sel) {
        if (kind !== 'gap' && pieceAt(st, loc)) sel = loc;
      } else if (kind !== 'gap' && sameLoc(sel, loc)) {
        sel = null;
      } else {
        const plan = planMove(st, sel, loc);
        if (plan) commit(plan.rig);
        else note = 'No room for that.';
      }
      render();
    }
  }

  // ---- dragging ----

  const sheet = () => document.querySelector('.overlay.sheet');

  function slotRects() {
    const out = [];
    for (const el of sheet().querySelectorAll('.slot[data-act]')) {
      const [kind, a, b] = el.dataset.act.split(':');
      const r = el.getBoundingClientRect();
      out.push({ loc: locOf(kind, a, b), left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    return out;
  }

  // What the pointer is over, from the slot positions at the start of the drag (the row moves as it previews, so
  // the live layout would flicker): the edge of a slot in a chain is the gap before or after it, the middle swaps.
  function targetAt(x, y, rects) {
    const rows = new Map();
    for (const r of rects) {
      const key = r.loc.kind === 'bench' ? 'bench' : r.loc.c;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(r);
    }
    for (const [key, list] of rows) {
      const top = Math.min(...list.map((r) => r.top)) - 8;
      const bottom = Math.max(...list.map((r) => r.bottom)) + 8;
      if (y < top || y > bottom) continue;
      let best = list[0];
      for (const r of list) if (Math.abs((r.left + r.right) / 2 - x) < Math.abs((best.left + best.right) / 2 - x)) best = r;
      if (key === 'bench') return best.loc;
      const f = (x - best.left) / (best.right - best.left);
      if (f < EDGE) return { kind: 'gap', c: key, i: best.loc.i };
      if (f > 1 - EDGE) return { kind: 'gap', c: key, i: best.loc.i + 1 };
      return best.loc;
    }
    return null;
  }

  function startDrag(e) {
    const rects = slotRects();
    const id = pieceAt(st, press.loc);
    const ghost = document.createElement('div');
    ghost.className = 'dragghost';
    ghost.innerHTML = icon(PIECES[id], 34);
    ghost.dataset.type = PIECES[id].type;
    document.body.appendChild(ghost);
    try { document.documentElement.setPointerCapture(e.pointerId); } catch { /* the pointer may already be gone */ }
    drag = { from: press.loc, to: null, plan: null, ghost, rects };
    sel = null;
    suggest = null;
    moveGhost(e);
    render();
  }

  function moveGhost(e) {
    drag.ghost.style.transform = `translate(${e.clientX - 22}px, ${e.clientY - 56}px)`;
  }

  const rig_ok = (to) => !!st.chains[to.c];

  function sameTarget(a, b) {
    return (!a && !b) || (a && b && a.kind === b.kind && a.c === b.c && a.i === b.i);
  }

  function updateDrag(e) {
    moveGhost(e);
    let to = targetAt(e.clientX, e.clientY, drag.rects);
    if (to && to.kind === 'gap' ? !rig_ok(to) : to && !validLoc(st, to)) to = null;
    if (sameTarget(to, drag.to)) return;
    drag.to = to;
    drag.plan = to ? planMove(st, drag.from, to) : null;
    if (to && sameLoc(to, drag.from)) drag.plan = null;
    render();
  }

  function endDrag() {
    const plan = drag.plan;
    drag.ghost.remove();
    drag = null;
    quietUntil = performance.now() + 80;
    if (plan) commit(plan.rig);
    render();
  }

  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest('.overlay.sheet .slot[data-act]');
    if (!el || incoming) return;
    const [kind, a, b] = el.dataset.act.split(':');
    const loc = locOf(kind, a, b);
    if (!validLoc(st, loc) || !pieceAt(st, loc)) return;
    press = { loc, x: e.clientX, y: e.clientY, id: e.pointerId };
  }, { signal: ac.signal });
  document.addEventListener('pointermove', (e) => {
    if (drag) { updateDrag(e); return; }
    if (press && press.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_START) startDrag(e);
  }, { signal: ac.signal });
  const release = () => {
    press = null;
    if (drag) endDrag();
  };
  document.addEventListener('pointerup', release, { signal: ac.signal });
  document.addEventListener('pointercancel', release, { signal: ac.signal });

  render();
  return { rig: () => st };
}
