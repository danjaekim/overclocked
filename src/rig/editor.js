// The rig as the editor sees it, and the moves the editor makes. Pure data in, new data out: nothing here
// touches the engine, so the rules can be tested without a run.
//
//   rig  { cap, chains: [{ rule, slots: [piece id | null] * cap, key }], bench: [piece id | null] * BENCH }
//
// A location is { kind: 'slot', c, i } | { kind: 'bench', i }. A drop target may also be a gap,
// { kind: 'gap', c, i }: between slot i-1 and slot i of chain c, which pushes the pieces to its right along.

import { PIECES } from './pieces.js';

export const BENCH = 3;
export const SLOTS = 6;

export function newRig(chainDefs, cap = SLOTS) {
  return {
    cap,
    chains: chainDefs.map((d) => ({ rule: d.rule, key: d.key || null, slots: padSlots(d.slots, cap) })),
    bench: new Array(BENCH).fill(null),
  };
}

export function padSlots(slots, cap = SLOTS) {
  const out = slots.slice(0, cap);
  while (out.length < cap) out.push(null);
  return out;
}

export function cloneRig(rig) {
  return { cap: rig.cap, chains: rig.chains.map((c) => ({ ...c, slots: c.slots.slice() })), bench: rig.bench.slice() };
}

export function pieceAt(rig, loc) {
  if (loc.kind === 'bench') return rig.bench[loc.i];
  return rig.chains[loc.c].slots[loc.i];
}

function setAt(rig, loc, id) {
  if (loc.kind === 'bench') rig.bench[loc.i] = id;
  else rig.chains[loc.c].slots[loc.i] = id;
}

export const sameLoc = (a, b) => a.kind === b.kind && a.i === b.i && a.c === b.c;

// Moves the piece at `from` to `to`. A slot or bench target swaps with whatever is there; a gap target
// inserts, pushing the pieces to its right along into the nearest empty slot (or the left, if there is none
// on the right). Returns the new rig, or null when the move is not possible (nothing to move, or no room).
export function moveTo(rig, from, to) {
  const id = pieceAt(rig, from);
  if (id === null || id === undefined) return null;
  const next = cloneRig(rig);
  if (to.kind === 'gap') {
    setAt(next, from, null);
    return insertAt(next, to.c, to.i, id) >= 0 ? next : null;
  }
  if (sameLoc(from, to)) return null;
  setAt(next, from, pieceAt(rig, to));
  setAt(next, to, id);
  return next;
}

// Puts `id` into chain c at gap i, in place. Returns the slot it landed in, or -1 when the chain has no
// empty slot to take up the shift.
function insertAt(rig, c, i, id) {
  const slots = rig.chains[c].slots;
  if (slots[i] === null) {                                 // an empty slot right there: just fill it
    slots[i] = id;
    return i;
  }
  let hole = -1;
  for (let k = i; k < slots.length; k++) if (slots[k] === null) { hole = k; break; }
  if (hole >= 0) {                                         // shift the run i..hole-1 one to the right
    for (let k = hole; k > i; k--) slots[k] = slots[k - 1];
    slots[i] = id;
    return i;
  }
  for (let k = i - 1; k >= 0; k--) if (slots[k] === null) { hole = k; break; }
  if (hole < 0) return -1;
  for (let k = hole; k < i - 1; k++) slots[k] = slots[k + 1];   // shift the run hole+1..i-1 one to the left
  slots[i - 1] = id;
  return i - 1;
}

// Where a new piece should go (the editor outlines it): { loc, rig } with the piece placed, or null when
// every slot and bench space is taken.
//   weapon    the end of the first chain with room
//   modifier  just before the first weapon that has no modifier in front of it
//   trigger   the end of the first chain that has a weapon and no trigger
export function placeSuggested(rig, id) {
  const type = PIECES[id].type;
  const next = cloneRig(rig);
  const tryGap = (c, i) => {
    const at = insertAt(next, c, i, id);
    return at < 0 ? null : { kind: 'slot', c, i: at };
  };
  let loc = null;
  if (type === 'modifier') {
    for (let c = 0; c < next.chains.length && !loc; c++) {
      const s = next.chains[c].slots;
      for (let i = 0; i < s.length && !loc; i++) {
        if (s[i] === null || PIECES[s[i]].type !== 'weapon') continue;
        const before = i > 0 ? s[i - 1] : null;
        if (before !== null && PIECES[before].type === 'modifier') continue;
        if (hasRoom(s)) loc = tryGap(c, i);
      }
    }
  } else if (type === 'trigger') {
    for (let c = 0; c < next.chains.length && !loc; c++) {
      const s = next.chains[c].slots;
      const kinds = s.filter((x) => x !== null).map((x) => PIECES[x].type);
      if (kinds.includes('weapon') && !kinds.includes('trigger') && hasRoom(s)) loc = appendTo(next, c, id);
    }
  }
  for (let c = 0; c < next.chains.length && !loc; c++) if (hasRoom(next.chains[c].slots)) loc = appendTo(next, c, id);
  if (!loc) {
    const b = next.bench.indexOf(null);
    if (b < 0) return null;
    next.bench[b] = id;
    loc = { kind: 'bench', i: b };
  }
  return { rig: next, loc };
}

const hasRoom = (slots) => slots.includes(null);

// The slot after the chain's last piece, or the first empty slot if the last slot is taken.
function appendTo(rig, c, id) {
  const s = rig.chains[c].slots;
  let last = -1;
  for (let k = 0; k < s.length; k++) if (s[k] !== null) last = k;
  const i = last + 1 < s.length ? last + 1 : s.indexOf(null);
  s[i] = id;
  return { kind: 'slot', c, i };
}

export function chainDefsOf(rig) {
  return rig.chains.map((c) => ({ rule: c.rule, slots: c.slots, key: c.key }));
}
