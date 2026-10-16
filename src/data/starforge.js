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
    name: 'Comet Volley',
    desc: 'Every 6th volley is one huge comet that pierces everything, weakening as it goes, and bursts where it ends.',
    every: 6,                  // volleys between comets
    size: 2,                   // comet radius x
    burstRadius: 70,
    burstFrac: 0.4,            // burst damage x the whole volley's
    damage: 1,                 // the comet's own damage x the whole volley's
    falloff: 0.9,             // each enemy it pierces leaves it this share of its damage (the first is hit in full)
  },
  slam: {
    name: 'Aftershock',
    desc: 'Each slam collapses 0.4 s later in a wider ring, pulling back what it threw and hitting it again at 35%.',
    delay: 0.4,
    frac: 0.35,
    radius: 1.3,               // the collapse is this much wider than the slam, so thrown enemies are still inside
    pull: 1.6,                 // inward knockback, x the slam's own throw
  },
  orbit: {
    name: 'Counter Ring',
    desc: 'A second ring of blades spins the other way, much further out (three quarters as many).',
    radius: 1.7,               // x the main ring
    count: 0.75,                // x the main blade count (at least 1)
  },
  boomerang: {
    name: 'Double Return',
    desc: 'Every disc flies out a second time after it returns, at 80% damage.',
    frac: 0.8,
  },
};
