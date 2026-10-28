// Level-up offers for the rig (docs/overclocked-spec.md, "Progression"). Three cards, each one of:
//   piece   a piece you do not own yet. Leans toward what the rig is missing, so a rig with a weapon and no
//           trigger is more likely to be offered a trigger
//   level   a piece you already own, one level up (to a maximum of 5)
//   stat    a passive: move speed, max HP, pickup range or armor. About 1 card in 6
//   cap     capacity, offered at levels 5, 10, 15 and 20 instead of the above: +1 slot, a new chain, or +3 energy
// Pure: every function takes a rig and an rng (anything with next() in [0, 1)).

import { PIECES, RULES, RIG_STATS, MAX_LEVEL, MAX_CHAINS, LEVEL_STEP, SIGNATURE, SIG_LEVELS } from './pieces.js';
import { owned, pieceLevel, levelUp, takeStat, slotTarget, addSlot, addChain, addEnergy } from './editor.js';

export const OFFER_COUNT = 3;
export const STAT_CHANCE = 1 / 6;
export const CAPACITY_LEVELS = [5, 10, 15, 20];

function counts(rig) {
  const n = { weapon: 0, modifier: 0, trigger: 0 };
  const all = [...rig.bench];
  for (const c of rig.chains) all.push(...c.slots);
  for (const id of all) if (id) n[PIECES[id].type]++;
  return n;
}

// How much each unowned piece wants to be offered.
export function offerWeights(rig) {
  const n = counts(rig);
  const w = {};
  for (const [id, p] of Object.entries(PIECES)) {
    let x = 1;
    if (p.type === 'weapon' && n.weapon === 0) x = 4;
    if (p.type === 'trigger' && n.weapon > 0) x = n.trigger === 0 ? 3 : n.trigger < n.weapon ? 2 : 1;     // lean toward what the rig lacks: a trigger for each weapon
    if (p.type === 'modifier' && n.weapon > 0) x = n.modifier === 0 ? 2 : n.modifier > n.weapon * 2 ? 0.5 : 1;
    w[id] = x;
  }
  return w;
}

const LEVEL_WEIGHT = 1.2;

function pick(rng, pool, weight) {
  let total = 0;
  for (const c of pool) total += weight(c);
  let r = rng.next() * total;
  let k = 0;
  for (; k < pool.length - 1; k++) {
    r -= weight(pool[k]);
    if (r < 0) break;
  }
  return pool.splice(k, 1)[0];
}

// The piece cards for a rig: new pieces and level-ups, weighted, without repeats.
export function pieceCandidates(rig, banished = []) {
  const have = owned(rig);
  const out = [];
  for (const id of Object.keys(PIECES)) {
    if (banished.includes(id)) continue;
    if (!have.has(id)) out.push({ kind: 'piece', id });
    else if (pieceLevel(rig, id) < MAX_LEVEL) out.push({ kind: 'level', id, to: pieceLevel(rig, id) + 1 });
  }
  return out;
}

// Capacity cards: +1 slot (in the chain with the fewest), a new chain with a random rule card, +3 energy to a random chain.
export function capacityOffers(rng, rig) {
  const out = [];
  const s = slotTarget(rig);
  if (s >= 0) out.push({ kind: 'cap', cap: 'slot', c: s });
  if (rig.chains.length < MAX_CHAINS) {
    const rules = Object.keys(RULES);
    out.push({ kind: 'cap', cap: 'chain', rule: rules[Math.floor(rng.next() * rules.length)] });
  }
  out.push({ kind: 'cap', cap: 'energy', c: Math.floor(rng.next() * rig.chains.length) });
  return out;
}

// opts: { count, banished: [piece ids], capacity: true for a capacity level }
export function makeOffers(rng, rig, { count = OFFER_COUNT, banished = [], capacity = false } = {}) {
  if (capacity) return capacityOffers(rng, rig).slice(0, count);
  const w = offerWeights(rig);
  const pool = pieceCandidates(rig, banished);
  const stats = Object.keys(RIG_STATS);
  const out = [];
  while (out.length < count && (pool.length || stats.length)) {
    if (stats.length && (rng.next() < STAT_CHANCE || !pool.length)) {
      out.push({ kind: 'stat', id: stats.splice(Math.floor(rng.next() * stats.length), 1)[0] });
    } else {
      out.push(pick(rng, pool, (c) => (c.kind === 'level' ? LEVEL_WEIGHT : w[c.id])));
    }
  }
  return out;
}

// Applies a card that does not need a slot. Returns the new rig, or null for a piece (the editor places it) or when it cannot apply.
export function applyOffer(rig, o) {
  if (o.kind === 'level') return levelUp(rig, o.id);
  if (o.kind === 'stat') return takeStat(rig, o.id);
  if (o.kind === 'cap') {
    if (o.cap === 'slot') return addSlot(rig, o.c);
    if (o.cap === 'chain') return addChain(rig, o.rule);
    if (o.cap === 'energy') return addEnergy(rig, o.c, 3);
  }
  return null;
}

const pct = (n) => `+${Math.round(n * 100)}%`;

// Words and an icon source for a card: { title, tag, desc, piece } (piece: the PIECES entry to draw, or null).
export function describeOffer(rig, o) {
  if (o.kind === 'piece') {
    const p = PIECES[o.id];
    return { title: p.name, tag: `new ${p.type} · ${p.cost}`, desc: p.desc, piece: p, type: p.type };
  }
  if (o.kind === 'level') {
    const p = PIECES[o.id];
    const what = p.type === 'trigger' ? 'its payload' : p.type === 'modifier' ? 'the weapon it is held for' : 'its attack';
    return { title: p.name, tag: `level ${o.to - 1} → ${o.to}`, desc: `${pct(LEVEL_STEP)} damage to ${what}${SIG_LEVELS.includes(o.to) && SIGNATURE[o.id] ? `; ${SIGNATURE[o.id].text}` : ''}`, piece: p, type: p.type };
  }
  if (o.kind === 'stat') {
    const s = RIG_STATS[o.id];
    return { title: s.name, tag: 'passive', desc: s.desc, piece: null, type: 'stat' };
  }
  if (o.cap === 'slot') return { title: 'More room', tag: 'capacity', desc: `+1 slot in chain ${'ABCD'[o.c]}`, piece: null, type: 'cap' };
  if (o.cap === 'chain') return { title: 'New chain', tag: 'capacity', desc: `A chain with the ${RULES[o.rule].name} rule card: ${RULES[o.rule].desc.toLowerCase()}`, piece: null, type: 'cap' };
  return { title: 'More power', tag: 'capacity', desc: `+3 energy for chain ${'ABCD'[o.c]}`, piece: null, type: 'cap' };
}
