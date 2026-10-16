// Starforge (M40+, docs/design-m39-m42.md): spend starsteel to give a weapon at its maximum level ONE
// mutation that changes how it plays. A mutation belongs to a BEHAVIOR, not a weapon, so it works on
// base weapons, evolutions and grafted weapons alike, and a star survives evolving (the mutation follows
// the weapon's current behavior). Data only; rules in game/starforge.js, effects in the behaviors.
// Every mutation is drawn in STARFORGE.color so it reads on screen.

export const STARFORGE = {
  cost: 2,                     // starsteel, once per weapon
  color: '#7fe9ff',
  light: '#e6fbff',
};

// name/desc are shown in the forge and the compendium. The other numbers are read by the behavior.
export const MUTATIONS = {
  projectile: {
    name: 'Starfall',
    desc: 'Every 5th volley, each arrow that hits calls a star down on that spot a moment later.',
    every: 5,                  // volleys between starfall volleys
    delay: 0.35,               // seconds from the hit to the star landing
    radius: 40,                // blast radius
    frac: 0.45,                // blast damage x the arrow's
  },
  slam: {
    name: 'Aftershock',
    desc: 'Each slam collapses 0.4 s later in a wider ring, pulling back what it threw and hitting it again at 30%.',
    delay: 0.4,
    frac: 0.3,
    radius: 1.3,               // the collapse is this much wider than the slam, so thrown enemies are still inside
    pull: 1,                   // inward knockback, x the slam's own throw
  },
  orbit: {
    name: 'Binary Stars',
    desc: 'Each blade splits into a pair of smaller blades that spin around each other, sweeping a wider path.',
    sep: 1.1,                  // half the distance between the pair, x the blade radius
    size: 0.85,                // each half's radius x the blade's
    frac: 0.85,                // each half's damage x the blade's
    spin: 9,                   // radians per second the pair turns around its centre
  },
  boomerang: {
    name: 'Double Return',
    desc: 'Every disc flies out a second time after it returns, at 80% damage.',
    frac: 0.8,
  },
};
