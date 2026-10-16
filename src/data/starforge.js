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
    desc: 'Every 5th volley is one huge comet that pierces everything and bursts where it ends.',
    every: 5,                  // volleys between comets
    size: 2.5,                 // comet radius x
    burstRadius: 70,
    burstFrac: 1,              // burst damage x the comet's
  },
  slam: {
    name: 'Aftershock',
    desc: 'Each slam lands a second time on the same spot 0.4 s later at 60% damage.',
    delay: 0.4,
    frac: 0.6,
  },
  orbit: {
    name: 'Counter Ring',
    desc: 'A second ring of blades spins the other way, further out (half as many).',
    radius: 1.6,               // x the main ring
    count: 0.5,                // x the main blade count (at least 1)
  },
  boomerang: {
    name: 'Double Return',
    desc: 'Every disc flies out a second time after it returns, at 80% damage.',
    frac: 0.8,
  },
};
