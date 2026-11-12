// Boss rewards on the rig (docs/plan-v13-boss-rewards.md). Pure: every function takes a rig and returns a value or a new rig.
//   rig.rewards  [{ id, piece?, n }]  n: 1 for the first boss, 2 for the second

import { REWARDS } from '../data/boss-rewards.js';
import { PIECES, OVERCHARGE } from './pieces.js';
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
  return [];
}

// Takes a reward. entry: { id, piece?, n }. Returns the new rig, or null when the choice is not allowed.
export function takeReward(rig, entry) {
  if (!REWARDS[entry.id]) return null;
  if (entry.id === 'overcharge' && !rewardChoices(rig, 'overcharge').includes(entry.piece)) return null;
  const next = cloneRig(rig);
  next.rewards = [...(rig.rewards || []), { id: entry.id, piece: entry.piece, n: entry.n || 1 }];
  return next;
}

export const describeReward = (id, piece) => (id === 'overcharge' && PIECES[piece] ? `${PIECES[piece].name}: ${OVERCHARGE[piece].text}` : REWARDS[id].desc);
