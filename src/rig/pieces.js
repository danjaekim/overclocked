// Piece and rule-card data for the rig (docs/overclocked-spec.md, "Pieces"). Data only.
// The proof of concept has 10 pieces: 3 weapons, 3 modifiers, 2 triggers, plus 2 rule cards.
// Energy costs are starting guesses to tune later.
//
//   weapon    fires one attack from a point; `def` is a weapon definition in the shape of data/weapons.js
//   modifier  held, then applied to the next weapon only
//   trigger   attaches to the weapon before it; everything to its right is the payload it runs later

export const DEFAULT_ENERGY = 10;

// Scatter: the next weapon fires `copies` attacks at `mult` power each, spread out: on a ring of radius `ring` around the origin, and aimed `fan` radians apart.
export const SCATTER = { copies: 5, mult: 0.25, ring: 28, fan: 0.15 };

export const PIECES = {
  mortar: {
    type: 'weapon', name: 'Mortar', cost: 3, desc: 'Lobs a shell that bursts on landing',
    def: {
      name: 'Mortar', tags: ['ranged', 'magic', 'area'], behavior: 'mortar',
      base: { damage: 14, cooldown: 1.7, count: 1, range: 300, radius: 46, fuse: 0.7 },
    },
  },
  nova: {
    type: 'weapon', name: 'Nova', cost: 3, desc: 'A ring of shots around its origin',
    def: {
      name: 'Nova', tags: ['projectile', 'ranged', 'magic'], behavior: 'nova',
      base: { damage: 8, cooldown: 1.4, speed: 300, count: 6, pierce: 0, ttl: 0.7, radius: 6, range: 220 },
    },
  },
  blaster: {
    type: 'weapon', name: 'Blaster', cost: 2, desc: 'A volley at the nearest enemy',
    def: {
      name: 'Blaster', tags: ['projectile', 'ranged'], behavior: 'projectile',
      base: { damage: 16, cooldown: 0.9, speed: 520, count: 1, pierce: 1, spread: 0.02, gap: 7, ttl: 1.2, radius: 5, range: 380 },
    },
  },

  scatter: { type: 'modifier', name: 'Scatter', cost: 2, desc: 'The next weapon fires 5 copies at 25% power each, spread out', scatter: true },
  flame: { type: 'modifier', name: 'Flame', cost: 1, desc: 'Adds fire: the attack burns', element: 'fire' },
  frost: { type: 'modifier', name: 'Frost', cost: 1, desc: 'Adds frost: the attack chills', element: 'frost' },

  on_impact: { type: 'trigger', name: 'On Impact', cost: 1, on: 'impact', desc: 'Runs the payload once, where the attack first lands' },
  on_kill: { type: 'trigger', name: 'On Kill', cost: 1, on: 'kill', desc: 'Runs the payload from each enemy the attack kills' },
};

// Stat modifiers an element puts on the weapon it is held for (applied to that piece's instance only).
export const ELEMENTS = {
  fire: { tag: 'fire', mods: [{ stat: 'burnChance', op: 'flat', value: 1 }] },
  frost: { tag: 'frost', mods: [{ stat: 'chillChance', op: 'flat', value: 1 }, { stat: 'chillStacks', op: 'flat', value: 1 }] },
};

// First element then second, in the order the modifiers sit in the chain. Effects are M2 work.
export const REACTIONS = {
  'fire>frost': 'steam',
  'frost>fire': 'shatter',
};

// Chain identity in the HUD and the arena: strip badge, and the ring where each of its pieces runs.
export const CHAIN_COLORS = ['#ff7ac6', '#9be564'];
export const CHAIN_NAMES = 'AB';

// When a rule card starts an activation. `while` gates the timer: it only runs while the player is moving.
export const RULES = {
  pulse: { name: 'Pulse', every: 1, first: 0.3, desc: 'Every 1 s' },
  stride: { name: 'Stride', every: 0.5, first: 0.3, while: 'moving', desc: 'Every 0.5 s while moving' },
};
