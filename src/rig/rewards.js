// Boss rewards on the rig (docs/plan-v13-boss-rewards.md). Pure: every function takes a rig and returns a value or a new rig.
//   rig.rewards  [{ id, piece?, n }]  n: 1 for the first boss, 2 for the second

import { REWARDS, LOOP_SHARE } from '../data/boss-rewards.js';
import { PIECES, OVERCHARGE, RULES } from './pieces.js';
import { owned, cloneRig } from './editor.js';

export const rewardsOf = (rig, id = null) => (rig.rewards || []).filter((r) => id === null || r.id === id);

// Piece ids that are overcharged (compileChain reads them through chainDefOf).
export const overchargedOf = (rig) => rewardsOf(rig, 'overcharge').map((r) => r.piece);

// What a reward screen can choose from: for Overcharge, owned pieces that have an effect and are not overcharged yet.
export function rewardChoices(rig, id) {
  if (id === 'overcharge') {
    const have = new Set(overchargedOf(rig));
    return [...owned(rig)].filter((p) => OVERCHARGE[p] && !have.has(p));
  }
  if (id === 'loop') return rig.chains.map((_, i) => i).filter((i) => (rig.chains[i].slots || []).some(Boolean));
  if (id === 'retrofit') return rig.chains.map((_, i) => i).filter((i) => retrofitRules(rig, i).length);
  return [];
}

// Rule cards chain c can still take as an extra (Retrofit): not its own, not one it already has, at most 2 extras.
export function retrofitRules(rig, c) {
  const ch = rig.chains[c];
  if (!ch || (ch.extra || []).length >= 2) return [];
  return Object.keys(RULES).filter((r) => r !== ch.rule && !(ch.extra || []).includes(r));
}

// Takes a reward. entry: { id, piece?, n }. Returns the new rig, or null when the choice is not allowed.
export function takeReward(rig, entry) {
  if (!REWARDS[entry.id]) return null;
  if (entry.id === 'overcharge' && !rewardChoices(rig, 'overcharge').includes(entry.piece)) return null;
  if (entry.id === 'retrofit' && (!rewardChoices(rig, 'retrofit').includes(entry.chain) || !retrofitRules(rig, entry.chain).includes(entry.rule))) return null;
  if (entry.id === 'loop' && !rewardChoices(rig, 'loop').includes(entry.chain)) return null;
  const next = cloneRig(rig);
  if (entry.id === 'retrofit') next.chains[entry.chain].extra = [...(next.chains[entry.chain].extra || []), entry.rule];
  if (entry.id === 'loop') {
    const share = LOOP_SHARE[Math.min(LOOP_SHARE.length, entry.n || 1) - 1];
    for (const c of next.chains) if (c.loop) c.loop = Math.max(c.loop, share);            // the second boss strengthens repeats already running
    next.chains[entry.chain].loop = Math.max(next.chains[entry.chain].loop || 0, share);
  }
  next.rewards = [...(rig.rewards || []), { id: entry.id, ...(entry.piece ? { piece: entry.piece } : {}), ...(entry.chain !== undefined ? { chain: entry.chain } : {}), ...(entry.rule ? { rule: entry.rule } : {}), n: entry.n || 1 }];
  return next;
}

export const describeReward = (id, piece) => (id === 'overcharge' && PIECES[piece] ? `${PIECES[piece].name}: ${OVERCHARGE[piece].text}` : REWARDS[id].desc);

