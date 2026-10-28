// The workbench (docs/overclocked-spec.md, "Progression"): a shop at a shrine, paid for with ore, which a run calls gold.
// Each visit stocks: two pieces (new ones, or copies of ones you own), an upgrade (a level, or an Overclock past level
// 5 once a piece is maxed), capacity (+1 slot or +3 energy for a chain you pick), and on about one visit in three a rule
// card. Pure: every function takes a rig and an rng.

import { PIECES, RULES, MAX_LEVEL, OVERCLOCK_MAX } from './pieces.js';
import { pieceCandidates, offerWeights, COPY_WEIGHT } from './offers.js';
import { placeSuggested, levelUp, cloneRig, pieceLevel, owned, overclock, addSlot, addEnergy } from './editor.js';

export const PRICE = { piece: 40, copy: 35, level: 30, rule: 60, reroll: 10, slot: 50, slotStep: 25, energy: 35, overclock: 100, overclockStep: 50 };
export const RULE_CHANCE = 0.35;      // a rule card is on offer about one visit in three
export const GOLD_NAME = 'Gold';
const STOCK_PIECES = 2;

export const levelPrice = (to) => PRICE.level + 10 * (to - 2);          // 30 for level 2, 40 for 3, 50 for 4, 60 for 5
export const slotPrice = (bought) => PRICE.slot + PRICE.slotStep * bought;          // each slot bought this run costs more
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
  const room = rig.chains.some((c) => c.slots.length < rig.cap);
  if (room && rng.next() < 0.7) out.push({ kind: 'slot', price: slotPrice(slotBuys) });
  else out.push({ kind: 'energy', price: PRICE.energy });
  if (rng.next() < RULE_CHANCE) {
    const rules = Object.keys(RULES);
    out.push({ kind: 'rule', rule: rules[Math.floor(rng.next() * rules.length)], price: PRICE.rule });
  }
  return out;
}

// Items that need a chain picked when bought.
export const needsChain = (item) => item.kind === 'rule' || item.kind === 'slot' || item.kind === 'energy';

// A copy of the rig with chain c's rule card swapped.
export function setRule(rig, c, rule) {
  if (!rig.chains[c] || !RULES[rule]) return null;
  const next = cloneRig(rig);
  next.chains[c].rule = rule;
  return next;
}

// Buys `item` for a rig. Returns { rig, placed } (placed: where a piece landed, or null), or null when it cannot be done
// (no room for the piece, the piece is already maxed, no such chain).
export function buyItem(rig, item, chain = 0) {
  if (item.kind === 'piece') {
    const p = placeSuggested(rig, item.id);
    return p ? { rig: p.rig, placed: p.loc } : null;
  }
  if (item.kind === 'level') return pieceLevel(rig, item.id) < MAX_LEVEL ? { rig: levelUp(rig, item.id), placed: null } : null;
  if (item.kind === 'overclock') { const r = overclock(rig, item.id); return r ? { rig: r, placed: null } : null; }
  if (!rig.chains[chain]) return null;
  if (item.kind === 'slot') { const r = addSlot(rig, chain); return r ? { rig: r, placed: null } : null; }
  if (item.kind === 'energy') return { rig: addEnergy(rig, chain, 3), placed: null };
  const next = setRule(rig, chain, item.rule);
  return next ? { rig: next, placed: null } : null;
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
  if (item.kind === 'slot') return { title: '+1 slot', tag: 'capacity', desc: 'A slot and +2 energy for the chain you pick (up to 6)', piece: null };
  if (item.kind === 'energy') return { title: '+3 energy', tag: 'capacity', desc: 'More energy for the chain you pick', piece: null };
  const r = RULES[item.rule];
  return { title: `${r.name} rule card`, tag: 'swap a chain\'s rule', desc: r.desc, piece: null };
}
