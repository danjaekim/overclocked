// Level-up offers for the rig: 3 distinct pieces out of the proof-of-concept set. An offer leans toward what
// the rig is missing, so a rig with a weapon and no trigger is more likely to be offered a trigger.

import { PIECES } from './pieces.js';

export const OFFER_COUNT = 3;

function counts(rig) {
  const n = { weapon: 0, modifier: 0, trigger: 0 };
  const all = [...rig.bench];
  for (const c of rig.chains) all.push(...c.slots);
  for (const id of all) if (id) n[PIECES[id].type]++;
  return n;
}

export function offerWeights(rig) {
  const n = counts(rig);
  const w = {};
  for (const [id, p] of Object.entries(PIECES)) {
    let x = 1;
    if (p.type === 'weapon' && n.weapon === 0) x = 4;
    if (p.type === 'trigger' && n.weapon > 0 && n.trigger === 0) x = 3;
    if (p.type === 'modifier' && n.weapon > 0 && n.modifier === 0) x = 2;
    w[id] = x;
  }
  return w;
}

// rng: anything with next() in [0, 1).
export function makeOffers(rng, rig, count = OFFER_COUNT) {
  const w = offerWeights(rig);
  const pool = Object.keys(w);
  const out = [];
  while (out.length < count && pool.length) {
    let total = 0;
    for (const id of pool) total += w[id];
    let r = rng.next() * total;
    let k = 0;
    for (; k < pool.length - 1; k++) {
      r -= w[pool[k]];
      if (r < 0) break;
    }
    out.push(pool.splice(k, 1)[0]);
  }
  return out;
}
