// The rig as the editor sees it, and the moves the editor makes. Pure data in, new data out: nothing here
// touches the engine, so the rules can be tested without a run.
//
//   rig  { cap, chains: [{ chassis, mk, rule, slots: [piece id | null], key, charge, cell }], bench: [piece id | null] * BENCH, levels, stats }
//        A chain is a chassis (rig/chassis.js): it fixes the rule card, the battery and recharge, and how far the slots can
//        grow (cap is the hard limit for every chain; the sandbox fills chains to it). charge and cell count the recharge
//        and battery upgrades bought for this chassis.
//        levels is { piece id: 2..5 } (all copies of a piece share a level); stats is { RIG_STATS id: times taken }.
//
// A location is { kind: 'slot', c, i } | { kind: 'bench', i }. A drop target may also be a gap,
// { kind: 'gap', c, i }: between slot i-1 and slot i of chain c, which pushes the pieces to its right along.

import { PIECES, RULES, MAX_CHAINS, MAX_LEVEL, OVERCLOCK_MAX } from './pieces.js';
import { CHASSIS, chassisStats, chassisForRule, keepsUpgrades, MK_MAX } from './chassis.js';

export const BENCH = 3;
export const SLOTS = 6;

export function newRig(chainDefs, cap = SLOTS) {
  return {
    cap,
    chains: chainDefs.map((d) => chainState(d.chassis || chassisForRule(d.rule), d.mk || 1, padSlots(d.slots, d.size || cap), d)),
    bench: new Array(BENCH).fill(null),
    levels: {},
    stats: {},
  };
}

// One chain's state. `d` can carry key, charge and cell (a saved chain, a preset).
function chainState(chassis, mk, slots, d = {}) {
  return { chassis, mk, rule: CHASSIS[chassis].rule, key: d.key || null, charge: d.charge || 0, cell: d.cell || 0, slots };
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

// What the engine and the analyzer read for chain c: its rule card, slots, battery, recharge, quirk and the piece levels.
export function chainDefOf(rig, c) {
  const ch = rig.chains[c];
  const s = chassisStats(ch);
  const d = CHASSIS[ch.chassis];
  return { rule: ch.rule, slots: ch.slots, key: ch.key, energy: s.battery, recharge: s.recharge, chargeWhile: d.chargeWhile || null, quirk: d.quirk, levels: rig.levels };
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

// The workbench's Overclock: a maxed piece goes one level further, up to OVERCLOCK_MAX.
export function overclock(rig, id) {
  const lv = pieceLevel(rig, id);
  if (lv < MAX_LEVEL || lv >= OVERCLOCK_MAX) return null;
  const next = cloneRig(rig);
  next.levels[id] = lv + 1;
  return next;
}

export function takeStat(rig, id) {
  const next = cloneRig(rig);
  next.stats[id] = (next.stats[id] || 0) + 1;
  return next;
}

// How many slots chain c can grow to: its chassis's max, never past the rig's cap.
export const slotMax = (rig, c) => Math.min(rig.cap, chassisStats(rig.chains[c]).max);
export const hasSlotRoom = (rig, c) => rig.chains[c].slots.length < slotMax(rig, c);

// The chain a +1 slot would go to: the one with the fewest slots (the first, on a tie), or -1 when all are full.
export function slotTarget(rig) {
  let best = -1;
  rig.chains.forEach((c, i) => { if (hasSlotRoom(rig, i) && (best < 0 || c.slots.length < rig.chains[best].slots.length)) best = i; });
  return best;
}

export function addSlot(rig, c) {
  if (!rig.chains[c] || !hasSlotRoom(rig, c)) return null;
  const next = cloneRig(rig);
  next.chains[c].slots.push(null);
  return next;
}

// +CHARGE_STEP recharge (kind 'charge') or +CELL_STEP battery (kind 'cell') for chain c.
export function addPower(rig, c, kind) {
  if (!rig.chains[c] || (kind !== 'charge' && kind !== 'cell')) return null;
  const next = cloneRig(rig);
  next.chains[c][kind] = (next.chains[c][kind] || 0) + 1;
  return next;
}

// A new chain on `chassis`, when there is room for one.
export function addChassis(rig, chassis, mk = 1) {
  if (rig.chains.length >= MAX_CHAINS || !CHASSIS[chassis]) return null;
  const next = cloneRig(rig);
  next.chains.push(chainState(chassis, Math.min(MK_MAX, mk), padSlots([], Math.min(rig.cap, chassisStats({ chassis, mk }).start))));
  return next;
}

// What replacing chain c's chassis does: { rig, benched: [ids], sold: [ids] }. The pieces move onto the new chassis in
// order; the ones that do not fit go to the bench, and once the bench is full they are sold. Upgrades bought for the old
// chassis go with it, unless the new one is the same chassis at an equal or higher mark (it is an upgrade of the same frame). The new chassis starts with max(its starting slots, the old slot count) slots, up to its max, so a
// replacement never strands pieces it has room for.
export function replaceChassis(rig, c, chassis, mk = 1) {
  if (!rig.chains[c] || !CHASSIS[chassis]) return null;
  const next = cloneRig(rig);
  const old = next.chains[c];
  const s = chassisStats({ chassis, mk });
  const size = Math.min(rig.cap, s.max, Math.max(s.start, old.slots.length));
  const pieces = old.slots.filter(Boolean);
  const slots = padSlots(pieces.slice(0, size), size);
  next.chains[c] = chainState(chassis, Math.min(MK_MAX, mk), slots, keepsUpgrades(old, chassis, mk) ? { charge: old.charge, cell: old.cell, key: null } : {});
  const benched = [];
  const sold = [];
  for (const id of pieces.slice(size)) {
    const b = next.bench.indexOf(null);
    if (b < 0) sold.push(id);
    else { next.bench[b] = id; benched.push(id); }
  }
  return { rig: next, benched, sold };
}
