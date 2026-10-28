// Chest rolls for the rig (docs/overclocked-spec.md, "Chest contents"). A chest gives 1, 3 or 5 rolls, each a new
// piece, a piece level, or capacity; a boss chest always includes one capacity roll. Pure, like offers: the same
// rng and rig give the same chest. A piece goes to its suggested slot (or the bench); with no room it becomes
// another kind of roll, so nothing a chest gives is lost.

import { CHEST } from '../data/elites.js';
import { placeSuggested } from './editor.js';
import { offerWeights, pieceCandidates, upgradeOffers, applyOffer, describeOffer, chassisCards } from './offers.js';

const WEIGHTS = { piece: 0.4, level: 0.35, cap: 0.25 };

// How many rolls the chest gives: one of 1 / 3 / 5, weighted by tier. The first elite chest is at least 3.
export function chestCount(rng, tier, first = false) {
  const w = tier === 1 ? CHEST.boss : CHEST.elite;
  const counts = [1, 3, 5];
  let total = w[0] + w[1] + w[2];
  let r = rng.next() * total;
  let n = counts[2];
  for (let i = 0; i < 3; i++) {
    r -= w[i];
    if (r < 0) { n = counts[i]; break; }
  }
  if (tier === 0 && first && n < CHEST.firstEliteMin) n = CHEST.firstEliteMin;
  return n;
}

function pickWeighted(rng, list, weight) {
  let total = 0;
  for (const x of list) total += weight(x);
  let r = rng.next() * total;
  for (const x of list) {
    r -= weight(x);
    if (r < 0) return x;
  }
  return list[list.length - 1];
}

// One roll against `rig`. Returns { rig, roll } where roll is { kind, name, tag, desc, piece, placed } or null for "nothing left".
function rollOne(rng, rig, wantCap) {
  const cands = pieceCandidates(rig);
  const newPieces = cands.filter((c) => c.kind === 'piece' && placeSuggested(rig, c.id));
  const levels = cands.filter((c) => c.kind === 'level');
  const caps = upgradeOffers(rng, rig);
  const kinds = [];
  if (wantCap && caps.length) kinds.push('cap');
  else {
    if (newPieces.length) kinds.push('piece');
    if (levels.length) kinds.push('level');
    if (caps.length) kinds.push('cap');
  }
  if (!kinds.length) return null;
  const kind = pickWeighted(rng, kinds, (k) => WEIGHTS[k]);
  let offer;
  if (kind === 'piece') {
    const w = offerWeights(rig);
    offer = pickWeighted(rng, newPieces, (c) => w[c.id]);
    const placed = placeSuggested(rig, offer.id);
    return { rig: placed.rig, roll: { ...describeOffer(rig, offer), kind, placed: placed.loc, offer } };
  }
  offer = kind === 'level' ? levels[Math.floor(rng.next() * levels.length)] : caps[Math.floor(rng.next() * caps.length)];
  return { rig: applyOffer(rig, offer), roll: { ...describeOffer(rig, offer), kind, placed: null, offer } };
}

// Chassis in a chest: about one elite chest in two holds one (Mk II about one time in three), and a boss chest
// always holds two Mk II or Mk III to pick from. They are not applied: the editor offers them, since one may replace a chain.
export const CHASSIS_DROP = { elite: 0.5, eliteMk2: 0.35, bossMk3: 0.4 };
export function chestChassis(rng, tier) {
  if (tier === 1) return chassisCards(rng, 2, rng.next() < CHASSIS_DROP.bossMk3 ? 3 : 2);
  if (rng.next() >= CHASSIS_DROP.elite) return [];
  return chassisCards(rng, 1, rng.next() < CHASSIS_DROP.eliteMk2 ? 2 : 1);
}

// Opens a chest: returns { count, rolls, rig, chassis } with every roll applied to the returned rig, and chassis cards
// for the editor to offer. `first`: no elite chest has been opened yet.
export function openRigChest(rng, rig, tier, first = false) {
  const count = chestCount(rng, tier, first);
  const rolls = [];
  let cur = rig;
  for (let i = 0; i < count; i++) {
    const r = rollOne(rng, cur, tier === 1 && i === 0);
    if (!r) break;
    cur = r.rig;
    rolls.push(r.roll);
  }
  return { count: rolls.length, rolls, rig: cur, chassis: chestChassis(rng, tier) };
}
