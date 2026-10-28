// The workbench (docs/overclocked-spec.md, "Progression"): a shop at a shrine, paid for with ore, which a run calls gold.
// Each visit stocks: two pieces (new ones, or copies of ones you own), an upgrade (a level, or an Overclock past level
// 5 once a piece is maxed), capacity (+1 slot, +1/s recharge or a bigger battery for a chain you pick), and on about one
// visit in two a chassis (a new chain, or a replacement for one). Pure: every function takes a rig and an rng.

import { PIECES, MAX_LEVEL, OVERCLOCK_MAX, MAX_CHAINS } from './pieces.js';
import { pieceCandidates, offerWeights, COPY_WEIGHT, chassisCards, describeChassis } from './offers.js';
import { placeSuggested, levelUp, pieceLevel, owned, overclock, addSlot, addPower, addChassis, replaceChassis, hasSlotRoom } from './editor.js';
import { CHARGE_STEP, CELL_STEP } from './chassis.js';

export const PRICE = { piece: 40, copy: 35, level: 30, reroll: 10, slot: 50, slotStep: 25, charge: 35, cell: 30, chassis: 60, chassisStep: 30, overclock: 100, overclockStep: 50 };
export const CHASSIS_CHANCE = 0.5;    // a chassis is on offer about one visit in two
export const CHASSIS_MK2 = 0.35;      // and a Mk II about one time in three
export const GOLD_NAME = 'Gold';
const STOCK_PIECES = 2;

export const levelPrice = (to) => PRICE.level + 10 * (to - 2);          // 30 for level 2, 40 for 3, 50 for 4, 60 for 5
export const slotPrice = (bought) => PRICE.slot + PRICE.slotStep * bought;          // each slot bought this run costs more
export const chassisPrice = (mk) => PRICE.chassis + PRICE.chassisStep * (mk - 1);         // 60 for Mk I, 90 for Mk II, 120 for Mk III
export const overclockPrice = (to) => PRICE.overclock + PRICE.overclockStep * (to - MAX_LEVEL - 1);   // 100 for level 6, 150 for 7
export const rerollPrice = (visitRerolls) => PRICE.reroll * (visitRerolls + 1);

function take(rng, list, weight = () => 1) {
  let total = 0;
  for (const c of list) total += weight(c);
  let r = rng.next() * total;
  let k = 0;
  for (; k < list.length - 1; k++) {
    r -= weight(list[k]);
    if (r < 0) break;
  }
  return list.splice(k, 1)[0];
}

// What is for sale. opts: { slotBuys } (slots bought so far this run, for the price).
export function stockUp(rng, rig, banished = [], { slotBuys = 0 } = {}) {
  const all = pieceCandidates(rig, banished);
  const pieces = all.filter((c) => c.kind === 'piece');
  const levels = all.filter((c) => c.kind === 'level');
  const w = offerWeights(rig);
  const out = [];
  for (let i = 0; i < STOCK_PIECES && pieces.length; i++) {
    const c = take(rng, pieces, (x) => w[x.id] * (x.copy ? COPY_WEIGHT : 1));
    for (let k = pieces.length - 1; k >= 0; k--) if (pieces[k].id === c.id) pieces.splice(k, 1);
    out.push({ kind: 'piece', id: c.id, copy: !!c.copy, price: c.copy ? PRICE.copy : PRICE.piece });
  }
  const maxed = [...owned(rig)].filter((id) => { const lv = pieceLevel(rig, id); return lv >= MAX_LEVEL && lv < OVERCLOCK_MAX; });
  if (maxed.length && (!levels.length || rng.next() < 0.5)) {
    const id = maxed[Math.floor(rng.next() * maxed.length)];
    const to = pieceLevel(rig, id) + 1;
    out.push({ kind: 'overclock', id, to, price: overclockPrice(to) });
  } else if (levels.length) {
    const c = take(rng, levels);
    out.push({ kind: 'level', id: c.id, to: c.to, price: levelPrice(c.to) });
  }
  const room = rig.chains.some((_, i) => hasSlotRoom(rig, i));
  const r = rng.next();
  if (room && r < 0.5) out.push({ kind: 'slot', price: slotPrice(slotBuys) });
  else if (r < 0.75) out.push({ kind: 'charge', price: PRICE.charge });
  else out.push({ kind: 'cell', price: PRICE.cell });
  if (rng.next() < CHASSIS_CHANCE) {
    const mk = rng.next() < CHASSIS_MK2 ? 2 : 1;
    out.push({ ...chassisCards(rng, 1, mk)[0], price: chassisPrice(mk) });
  }
  return out;
}

// Items that need a chain picked when bought. For a chassis, the chain is the one it replaces, or NEW_CHAIN.
export const needsChain = (item) => item.kind === 'chassis' || item.kind === 'slot' || item.kind === 'charge' || item.kind === 'cell';
export const NEW_CHAIN = -1;
export const canTakeNew = (rig) => rig.chains.length < MAX_CHAINS;

// Buys `item` for a rig. Returns { rig, placed } (placed: where a piece landed, or null), or null when it cannot be done
// (no room for the piece, the piece is already maxed, no such chain).
export function buyItem(rig, item, chain = 0) {
  if (item.kind === 'piece') {
    const p = placeSuggested(rig, item.id);
    return p ? { rig: p.rig, placed: p.loc } : null;
  }
  if (item.kind === 'level') return pieceLevel(rig, item.id) < MAX_LEVEL ? { rig: levelUp(rig, item.id), placed: null } : null;
  if (item.kind === 'overclock') { const r = overclock(rig, item.id); return r ? { rig: r, placed: null } : null; }
  if (item.kind === 'chassis' && chain === NEW_CHAIN) { const r = addChassis(rig, item.chassis, item.mk); return r ? { rig: r, placed: null } : null; }
  if (!rig.chains[chain]) return null;
  if (item.kind === 'slot') { const r = addSlot(rig, chain); return r ? { rig: r, placed: null } : null; }
  if (item.kind === 'charge' || item.kind === 'cell') return { rig: addPower(rig, chain, item.kind), placed: null };
  if (item.kind === 'chassis') { const r = replaceChassis(rig, chain, item.chassis, item.mk); return r ? { rig: r.rig, placed: null, sold: r.sold } : null; }
  return null;
}

export function describeItem(rig, item) {
  if (item.kind === 'piece') {
    const p = PIECES[item.id];
    return { title: p.name, tag: `${item.copy ? 'copy' : 'new'} ${p.type}`, desc: item.copy ? `Another ${p.name}, at the level yours has` : p.desc, piece: p };
  }
  if (item.kind === 'level') {
    const p = PIECES[item.id];
    return { title: p.name, tag: `level ${item.to - 1} → ${item.to}`, desc: 'Stronger, and a new effect at levels 3 and 5', piece: p };
  }
  if (item.kind === 'overclock') {
    const p = PIECES[item.id];
    return { title: `Overclock ${p.name}`, tag: `level ${item.to - 1} → ${item.to}`, desc: 'Past the usual maximum: +25% power', piece: p };
  }
  if (item.kind === 'slot') return { title: '+1 slot', tag: 'capacity', desc: 'A slot for the chain you pick, up to its chassis max', piece: null };
  if (item.kind === 'charge') return { title: 'Faster recharge', tag: 'capacity', desc: `+${CHARGE_STEP}/s recharge for the chain you pick`, piece: null };
  if (item.kind === 'cell') return { title: 'Bigger battery', tag: 'capacity', desc: `+${Math.round(CELL_STEP * 100)}% battery for the chain you pick`, piece: null };
  return { ...describeChassis(item.chassis, item.mk), tag: canTakeNew(rig) ? 'chassis · new chain' : 'chassis · replaces one' };
}
