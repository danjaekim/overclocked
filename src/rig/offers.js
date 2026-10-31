// Level-up offers for the rig (docs/overclocked-spec.md, "Progression"). Three cards, each one of:
//   piece   a piece you do not own yet. Leans toward what the rig is missing, so a rig with a weapon and no
//           trigger is more likely to be offered a trigger
//   level   a piece you already own, one level up (to a maximum of 5)
//   stat    a passive card: about 1 card in 6. 70% of them a rig passive (rig/passives.js), the rest move speed, max HP, pickup range or armor
//   passive a rig passive: a rule change that points at how the rig is built, stacking to 3
//   cap     capacity, offered at levels 5, 10, 15 and 20 instead of the above: two chassis to pick from while you have
//           fewer than MAX_CHAINS chains, then +1 slot, +1/s recharge or a bigger battery
//   chassis a chain to build on (rig/chassis.js): a new chain while there is room, else it replaces one (the editor asks which)
// Pure: every function takes a rig and an rng (anything with next() in [0, 1)).

import { PIECES, RIG_STATS, MAX_LEVEL, OVERCLOCK_MAX, MAX_CHAINS, LEVEL_STEP, SIGNATURE, SIG_LEVELS, CHAIN_NAMES } from './pieces.js';
import { owned, pieceLevel, levelUp, overclock, takeStat, takePassive, addSlot, addPower, addChassis, hasSlotRoom, chainDefOf } from './editor.js';
import { CHASSIS, START_CHASSIS, CHARGE_STEP, CELL_STEP, MK_NAMES, chassisStats } from './chassis.js';
import { compileChain, chainCost } from './chain.js';
import { PASSIVES, PASSIVE_IDS } from './passives.js';

export const OFFER_COUNT = 3;
export const STAT_CHANCE = 1 / 6;
export const PASSIVE_SHARE = 0.7;                       // of the passive cards, this share is a rig passive (rig/passives.js) and the rest a stat card
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

// No empty slot in any chain and no free bench space: a new piece would have to replace one.
export const rigFull = (rig) => rig.bench.every(Boolean) && rig.chains.every((c) => c.slots.every(Boolean));

// The piece cards for a rig: new pieces, level-ups, and copies of pieces you own (all copies share one level), weighted.
// With the rig full there is nowhere for a copy to go, so a copy of a maxed piece becomes a fuse: it merges into the
// piece you have, one Overclock level (to OVERCLOCK_MAX). A copy of a piece below its maximum is left out, since its level card is the same gain.
export const COPY_WEIGHT = 0.6;
export function pieceCandidates(rig, banished = []) {
  const have = owned(rig);
  const full = rigFull(rig);
  const out = [];
  for (const id of Object.keys(PIECES)) {
    if (banished.includes(id)) continue;
    if (!have.has(id)) out.push({ kind: 'piece', id });
    else {
      const lv = pieceLevel(rig, id);
      if (lv < MAX_LEVEL) out.push({ kind: 'level', id, to: lv + 1 });
      if (!full) out.push({ kind: 'piece', id, copy: true });
      else if (lv >= MAX_LEVEL && lv < OVERCLOCK_MAX) out.push({ kind: 'fuse', id, to: lv + 1 });
    }
  }
  return out;
}

// With the rig full, upgrades are worth more than pieces that need a slot: levels and fuses draw this much more, new pieces this much less.
export const FULL_UPGRADE_WEIGHT = 2.5;
export const FULL_PIECE_WEIGHT = 0.4;

// What passing on a chassis offers instead: a slot, +1/s recharge, +50% battery, and a level for a piece you own.
export function passOffers(rng, rig) {
  const out = upgradeOffers(rng, rig);
  const lv = pieceCandidates(rig).filter((c) => c.kind === 'level' && PIECES[c.id].type === 'weapon');
  const any = lv.length ? lv : pieceCandidates(rig).filter((c) => c.kind === 'level' || c.kind === 'fuse');
  if (any.length) out.push(any[Math.floor(rng.next() * any.length)]);
  return out;
}

// `n` different chassis cards of mark `mk`, never the starting chassis.
export function chassisCards(rng, n, mk = 1) {
  const ids = Object.keys(CHASSIS).filter((id) => id !== START_CHASSIS);
  const out = [];
  while (out.length < n && ids.length) out.push({ kind: 'chassis', chassis: ids.splice(Math.floor(rng.next() * ids.length), 1)[0], mk });
  return out;
}

// How far chain c is from paying for itself: its full cost over what it recharges in a second (higher = more starved).
export function starved(rig, c) {
  const def = chainDefOf(rig, c);
  return chainCost(compileChain(def).nodes) / Math.max(0.1, def.recharge);
}

// Upgrade cards for the chains you have: +1 slot for the shortest chain with room, +1/s recharge for the most starved
// chain, and a bigger battery for another (the next most starved).
export function upgradeOffers(rng, rig) {
  const out = [];
  const room = rig.chains.map((c, i) => [c.slots.length, i]).filter(([, i]) => hasSlotRoom(rig, i)).sort((a, b) => a[0] - b[0]);
  if (room.length) out.push({ kind: 'cap', cap: 'slot', c: room[0][1] });
  const order = rig.chains.map((_, i) => [starved(rig, i), rng.next(), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[2]);
  out.push({ kind: 'cap', cap: 'charge', c: order[0] });
  out.push({ kind: 'cap', cap: 'cell', c: order[1 % order.length] });
  return out;
}

// Capacity cards: two chassis and +1 slot while there is room for another chain, else the upgrade cards.
export function capacityOffers(rng, rig) {
  if (rig.chains.length >= MAX_CHAINS) return upgradeOffers(rng, rig);
  const out = chassisCards(rng, 2);
  const slot = upgradeOffers(rng, rig).find((o) => o.cap === 'slot');
  out.push(slot || upgradeOffers(rng, rig)[0]);
  return out;
}

// Passives you can still be offered: below max stacks, and the element ones only once you own their element.
export const passivePool = (rig) => PASSIVE_IDS.filter((id) => ((rig.passives && rig.passives[id]) || 0) < PASSIVES[id].max && !(PASSIVES[id].needs && !PASSIVES[id].fits(rig)));
export const passiveWeight = (rig, id) => (PASSIVES[id].fits(rig) ? 3 : 0.5);

// opts: { count, banished: [piece ids], capacity: true for a capacity level }
export function makeOffers(rng, rig, { count = OFFER_COUNT, banished = [], capacity = false } = {}) {
  if (capacity) return capacityOffers(rng, rig).slice(0, count);
  const w = offerWeights(rig);
  const pool = pieceCandidates(rig, banished);
  const full = rigFull(rig);
  const stats = Object.keys(RIG_STATS);
  const pas = passivePool(rig);
  const out = [];
  while (out.length < count && (pool.length || stats.length || pas.length)) {
    if ((stats.length || pas.length) && (rng.next() < STAT_CHANCE || !pool.length)) {
      if (pas.length && (rng.next() < PASSIVE_SHARE || !stats.length)) out.push({ kind: 'passive', id: pick(rng, pas, (id) => passiveWeight(rig, id)) });
      else out.push({ kind: 'stat', id: stats.splice(Math.floor(rng.next() * stats.length), 1)[0] });
    } else {
      const c = pick(rng, pool, (x) => (x.kind === 'level' || x.kind === 'fuse' ? LEVEL_WEIGHT * (full ? FULL_UPGRADE_WEIGHT : 1) : w[x.id] * (x.copy ? COPY_WEIGHT : 1) * (full ? FULL_PIECE_WEIGHT : 1)));
      out.push(c);
      for (let k = pool.length - 1; k >= 0; k--) if (pool[k].id === c.id) pool.splice(k, 1);   // one card per piece
    }
  }
  return out;
}

// Applies a card that does not need a slot. Returns the new rig, or null for a piece (the editor places it) or when it cannot apply.
export function applyOffer(rig, o) {
  if (o.kind === 'level') return levelUp(rig, o.id);
  if (o.kind === 'fuse') return overclock(rig, o.id);
  if (o.kind === 'stat') return takeStat(rig, o.id);
  if (o.kind === 'passive') return takePassive(rig, o.id);
  if (o.kind === 'cap') {
    if (o.cap === 'slot') return addSlot(rig, o.c);
    return addPower(rig, o.c, o.cap);
  }
  if (o.kind === 'chassis') return addChassis(rig, o.chassis, o.mk);     // null when every chain is taken: the editor asks which to replace
  return null;
}

const pct = (n) => `+${Math.round(n * 100)}%`;

// Words and an icon source for a card: { title, tag, desc, piece } (piece: the PIECES entry to draw, or null).
export function describeOffer(rig, o) {
  if (o.kind === 'piece') {
    const p = PIECES[o.id];
    return { title: p.name, tag: `${o.copy ? 'copy' : 'new'} ${p.type} · ${p.cost}`, desc: o.copy ? `Another ${p.name}, at the level yours already has. ${p.desc}` : p.desc, piece: p, type: p.type };
  }
  if (o.kind === 'level') {
    const p = PIECES[o.id];
    const what = p.type === 'trigger' ? 'its payload' : p.type === 'modifier' ? 'the weapon it is held for' : 'its attack';
    return { title: p.name, tag: `level ${o.to - 1} → ${o.to}`, desc: `${pct(LEVEL_STEP)} damage to ${what}${SIG_LEVELS.includes(o.to) && SIGNATURE[o.id] ? `; ${SIGNATURE[o.id].text}` : ''}`, piece: p, type: p.type };
  }
  if (o.kind === 'fuse') {
    const p = PIECES[o.id];
    return { title: `Fuse ${p.name}`, tag: `overclock → level ${o.to}`, desc: `Merge a spare ${p.name} into yours: +25% power, and no slot used`, piece: p, type: p.type };
  }
  if (o.kind === 'stat') {
    const s = RIG_STATS[o.id];
    return { title: s.name, tag: 'passive', desc: s.desc, piece: null, type: 'stat' };
  }
  if (o.kind === 'passive') {
    const n = ((rig.passives && rig.passives[o.id]) || 0) + 1;
    return { title: PASSIVES[o.id].name, tag: `passive \u00b7 ${n}/${PASSIVES[o.id].max}`, desc: PASSIVES[o.id].desc(n), piece: null, type: 'passive' };
  }
  if (o.kind === 'chassis') return { ...describeChassis(o.chassis, o.mk), tag: `chassis · ${rig.chains.length < MAX_CHAINS ? 'new chain' : 'replaces one'}` };
  if (o.cap === 'slot') return { title: 'More room', tag: 'capacity', desc: `+1 slot in chain ${CHAIN_NAMES[o.c]}`, piece: null, type: 'cap' };
  if (o.cap === 'charge') return { title: 'Faster recharge', tag: 'capacity', desc: `+${CHARGE_STEP}/s recharge for chain ${CHAIN_NAMES[o.c]}`, piece: null, type: 'cap' };
  return { title: 'Bigger battery', tag: 'capacity', desc: `+${Math.round(CELL_STEP * 100)}% battery for chain ${CHAIN_NAMES[o.c]}`, piece: null, type: 'cap' };
}

// A chassis card's words: its name and mark, its quirk (which says when it fires, if not every second), slots, battery and recharge.
export function describeChassis(id, mk = 1) {
  const d = CHASSIS[id];
  const s = chassisStats({ chassis: id, mk });
  return { title: `${d.name} ${MK_NAMES[mk]}`, tag: 'chassis', desc: `${d.desc}. ${s.start === d.max ? s.start : `${s.start}-${d.max}`} slots, battery ${s.battery}, +${s.recharge}/s.`, piece: null, type: 'chassis' };
}
