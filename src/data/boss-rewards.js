// Boss rewards (docs/plan-v13-boss-rewards.md): after the Warlord and after the Seer, a pilot picks one reward that bends a
// rule only that pilot can bend. It replaces the boss chest's rolls (the chassis pick stays). Rewards live in rig.rewards.
//   pick   what the screen asks for: 'piece' (a piece you own), later 'weapon', 'chain', 'chain+rule', 'shop'
// A pilot names its reward in PILOTS[id].reward; a pilot with no implemented reward keeps the old boss chest.

export const REWARD_BOSSES = 2;

export const REWARDS = {
  overcharge: {
    name: 'Overcharge', pick: 'piece',
    desc: 'Pick a piece you own. Its defining number is tripled, and it costs twice the energy.',
  },
};

export const rewardOfPilot = (pilot) => (pilot && pilot.reward && REWARDS[pilot.reward] ? pilot.reward : null);
