// The rig as the editor sees it, and the moves the editor makes. Pure data in, new data out: nothing here
// touches the engine, so the rules can be tested without a run.
//
//   rig  { cap, chains: [{ rule, slots: [piece id | null], key, bonus }], bench: [piece id | null] * BENCH, levels, stats }
//        A chain has as many slots as it has unlocked (3 to cap in a run, cap in the sandbox); bonus is extra energy.
//        levels is { piece id: 2..5 } (all copies of a piece share a level); stats is { RIG_STATS id: times taken }.
//
// A location is { kind: 'slot', c, i } | { kind: 'bench', i }. A drop target may also be a gap,
// { kind: 'gap', c, i }: between slot i-1 and slot i of chain c, which pushes the pieces to its right along.

import { PIECES, RULES, DEFAULT_ENERGY, MAX_CHAINS, MAX_LEVEL } from './pieces.js';

export const BENCH = 3;
export const SLOTS = 6;

export function newRig(chainDefs, cap = SLOTS) {
  return {
    cap,
    chains: chainDefs.map((d) => ({ rule: d.rule, key: d.key || null, bonus: d.bonus || 0, slots: padSlots(d.slots, d.size || cap) })),
    bench: new Array(BENCH).fill(null),
    levels: {},
    stats: {},
  };
}

export function padSlots(slots, cap = SLOTS) {
  const out = slots.slice(0, cap);
  while (out.length < cap) out.push(null);
  return out;
}

export function cloneRig(rig) {
  return { cap: rig.cap, chains: rig.chains.map((c) => ({ ...c, slots: c.slots.slice() })), bench: rig.bench.slice(), levels: { ...rig.levels }, stats: { ...rig.stats } };
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
// on the right). Returns { rig, landed } (the new rig and where the piece ended up), or null when the move is
// not possible (nothing to move, or no room).
export function planMove(rig, from, to) {
  const id = pieceAt(rig, from);
  if (id === null || id === undefined) return null;
  const next = cloneRig(rig);
  if (to.kind === 'gap') {
    setAt(next, from, null);
    const at = insertAt(next, to.c, to.i, id);
    return at >= 0 ? { rig: next, landed: { kind: 'slot', c: to.c, i: at } } : null;
  }
  if (sameLoc(from, to)) return null;
  setAt(next, from, pieceAt(rig, to));
  setAt(next, to, id);
  return { rig: next, landed: to };
}

export function moveTo(rig, from, to) {
  const plan = planMove(rig, from, to);
  return plan ? plan.rig : null;
}

// A copy of the rig with `id` (or an empty slot, for null) at `loc`. Selling a piece is setPiece(rig, loc, null).
export function setPiece(rig, loc, id) {
  const next = cloneRig(rig);
  setAt(next, loc, id);
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
//   trigger   the end of the first chain that has a weapon and no trigger, with room for a payload after it; with no
//             such room it waits on the bench, since a trigger in the last slot has nothing to run
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
      if (kinds.includes('weapon') && !kinds.includes('trigger') && roomAfterLast(s) >= 2) loc = appendTo(next, c, id);
    }
    if (!loc && next.bench.includes(null)) {
      const b = next.bench.indexOf(null);
      next.bench[b] = id;
      loc = { kind: 'bench', i: b };
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

// Empty slots after the chain's last piece.
function roomAfterLast(s) {
  let last = -1;
  for (let k = 0; k < s.length; k++) if (s[k] !== null) last = k;
  return s.length - 1 - last;
}

// The slot after the chain's last piece, or the first empty slot if the last slot is taken.
function appendTo(rig, c, id) {
  const s = rig.chains[c].slots;
  let last = -1;
  for (let k = 0; k < s.length; k++) if (s[k] !== null) last = k;
  const i = last + 1 < s.length ? last + 1 : s.indexOf(null);
  s[i] = id;
  return { kind: 'slot', c, i };
}

// What the engine and the analyzer read for chain c: its rule card, slots, energy pool and the piece levels.
export function chainDefOf(rig, c) {
  const ch = rig.chains[c];
  return { rule: ch.rule, slots: ch.slots, key: ch.key, energy: DEFAULT_ENERGY + (ch.bonus || 0), levels: rig.levels };
}

export function chainDefsOf(rig) {
  return rig.chains.map((_, c) => chainDefOf(rig, c));
}

// ---- levels and capacity: pure, each returns a new rig ----

export const pieceLevel = (rig, id) => (rig.levels && rig.levels[id]) || 1;

export function owned(rig) {
  const ids = new Set(rig.bench.filter(Boolean));
  for (const c of rig.chains) for (const id of c.slots) if (id) ids.add(id);
  return ids;
}

export function levelUp(rig, id) {
  const next = cloneRig(rig);
  next.levels[id] = Math.min(MAX_LEVEL, pieceLevel(rig, id) + 1);
  return next;
}

export function takeStat(rig, id) {
  const next = cloneRig(rig);
  next.stats[id] = (next.stats[id] || 0) + 1;
  return next;
}

// The chain a +1 slot would go to: the one with the fewest slots (the first, on a tie), or -1 when all are full.
export function slotTarget(rig) {
  let best = -1;
  rig.chains.forEach((c, i) => { if (c.slots.length < rig.cap && (best < 0 || c.slots.length < rig.chains[best].slots.length)) best = i; });
  return best;
}

export function addSlot(rig, c) {
  if (rig.chains[c].slots.length >= rig.cap) return null;
  const next = cloneRig(rig);
  next.chains[c].slots.push(null);
  return next;
}

export function addChain(rig, rule, size = 3) {
  if (rig.chains.length >= MAX_CHAINS || !RULES[rule]) return null;
  const next = cloneRig(rig);
  next.chains.push({ rule, key: null, bonus: 0, slots: padSlots([], size) });
  return next;
}

export function addEnergy(rig, c, n = 3) {
  const next = cloneRig(rig);
  next.chains[c].bonus = (next.chains[c].bonus || 0) + n;
  return next;
}
