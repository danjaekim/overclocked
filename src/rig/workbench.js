// The workbench (docs/overclocked-spec.md, "Progression"): a shop at a shrine, paid for with ore, which a run calls gold.
// Each visit stocks a few things to buy: pieces you lack, a level for a piece you own, and a rule card for one of your
// chains. Pure: every function takes a rig and an rng.

import { PIECES, RULES, MAX_LEVEL } from './pieces.js';
import { pieceCandidates, offerWeights } from './offers.js';
import { placeSuggested, levelUp, cloneRig, pieceLevel } from './editor.js';

export const PRICE = { piece: 40, level: 30, rule: 60, reroll: 10 };
export const GOLD_NAME = 'Gold';
const STOCK_PIECES = 2;

export const levelPrice = (to) => PRICE.level + 10 * (to - 2);          // 30 for level 2, 40 for 3, 50 for 4, 60 for 5
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

// What is for sale: up to two new pieces (weighted like level-up offers), one level, one rule card.
export function stockUp(rng, rig, banished = []) {
  const all = pieceCandidates(rig, banished);
  const pieces = all.filter((c) => c.kind === 'piece');
  const levels = all.filter((c) => c.kind === 'level');
  const w = offerWeights(rig);
  const out = [];
  for (let i = 0; i < STOCK_PIECES && pieces.length; i++) {
    const c = take(rng, pieces, (x) => w[x.id]);
    out.push({ kind: 'piece', id: c.id, price: PRICE.piece });
  }
  if (levels.length) {
    const c = take(rng, levels);
    out.push({ kind: 'level', id: c.id, to: c.to, price: levelPrice(c.to) });
  }
  const rules = Object.keys(RULES);
  out.push({ kind: 'rule', rule: rules[Math.floor(rng.next() * rules.length)], price: PRICE.rule });
  return out;
}

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
  const next = setRule(rig, chain, item.rule);
  return next ? { rig: next, placed: null } : null;
}

export function describeItem(rig, item) {
  if (item.kind === 'piece') {
    const p = PIECES[item.id];
    return { title: p.name, tag: `new ${p.type}`, desc: p.desc, piece: p };
  }
  if (item.kind === 'level') {
    const p = PIECES[item.id];
    return { title: p.name, tag: `level ${item.to - 1} → ${item.to}`, desc: 'Stronger, and a new effect at levels 3 and 5', piece: p };
  }
  const r = RULES[item.rule];
  return { title: `${r.name} rule card`, tag: 'swap a chain\'s rule', desc: r.desc, piece: null };
}
