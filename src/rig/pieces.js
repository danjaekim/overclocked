// Piece and rule-card data for the rig (docs/overclocked-spec.md, "Pieces"). Data only.
// The proof of concept has 10 pieces: 3 weapons, 3 modifiers, 2 triggers, plus 2 rule cards.
// Energy costs are starting guesses to tune later.
//
//   weapon    fires one attack from a point; `def` is a weapon definition in the shape of data/weapons.js
//   modifier  held, then applied to the next weapon only
//   trigger   attaches to the weapon before it; everything to its right is the payload it runs later

export const DEFAULT_ENERGY = 12;       // a chain's energy pool: it was 10, which six slots could not afford; 16 felt too high (v0.3.3)

// Scatter: the next weapon fires `copies` attacks at `mult` power each, spread out: on a ring of radius `ring` around the origin, and aimed `fan` radians apart.
export const SCATTER = { copies: 5, mult: 0.25, ring: 28, fan: 0.15 };

// Each piece has an `icon` (SVG path data on a 24-unit square, drawn as strokes; `filled` adds a soft fill) and a `short`
// name for tight places. The editor draws them as SVG and the HUD strip as Path2D, from the same data.
export const PIECES = {
  mortar: {
    glyph: 'Mo', short: 'Mortar', icon: 'M3 21h18 M4 17 Q12 -3 20 17 M16 14l4 3 2-5', filled: false, type: 'weapon', name: 'Mortar', cost: 3, desc: 'Lobs a shell that bursts on landing',
    def: {
      name: 'Mortar', tags: ['ranged', 'magic', 'area'], behavior: 'mortar',
      base: { damage: 14, cooldown: 1.7, count: 1, range: 300, radius: 46, fuse: 0.7 },
    },
  },
  nova: {
    glyph: 'No', short: 'Nova', icon: 'M12 2v4 M12 18v4 M2 12h4 M18 12h4 M5 5l3 3 M16 16l3 3 M19 5l-3 3 M8 16l-3 3 M16 12a4 4 0 1 0-8 0 4 4 0 1 0 8 0', filled: false, type: 'weapon', name: 'Nova', cost: 3, desc: 'A ring of shots around its origin',
    def: {
      name: 'Nova', tags: ['projectile', 'ranged', 'magic'], behavior: 'nova',
      base: { damage: 8, cooldown: 1.4, speed: 300, count: 6, pierce: 0, ttl: 0.7, radius: 6, range: 220 },
    },
  },
  blaster: {
    glyph: 'Bl', short: 'Blaster', icon: 'M2 12h13 M11 6l7 6-7 6 M20 7v10', filled: false, type: 'weapon', name: 'Blaster', cost: 2, desc: 'A volley at the nearest enemy',
    def: {
      name: 'Blaster', tags: ['projectile', 'ranged'], behavior: 'projectile',
      base: { damage: 16, cooldown: 0.9, speed: 520, count: 1, pierce: 1, spread: 0.02, gap: 7, ttl: 1.2, radius: 5, range: 380 },
    },
  },

  scatter: { glyph: 'Sc', short: 'Scatter', icon: 'M3 12L21 3 M3 12L21 7.5 M3 12h18 M3 12l18 4.5 M3 12l18 9', filled: false, type: 'modifier', name: 'Scatter', cost: 2, desc: 'The next weapon fires 5 copies at 25% power each, spread out', scatter: true },
  flame: { glyph: 'Fl', short: 'Flame', icon: 'M13 2c0 4 5 6 5 12a6 6 0 0 1-12 0c0-3 1.5-5 3-6 .5 2 1 3 2 3 0-3-1-6 2-9z', filled: true, type: 'modifier', name: 'Flame', cost: 1, desc: 'Adds fire: the attack burns', element: 'fire' },
  frost: { glyph: 'Fr', short: 'Frost', icon: 'M12 2v20 M3.3 7l17.4 10 M3.3 17l17.4-10 M9 4l3 3 3-3 M9 20l3-3 3 3', filled: false, type: 'modifier', name: 'Frost', cost: 1, desc: 'Adds frost: the attack chills', element: 'frost' },

  on_impact: { glyph: 'Im', short: 'Impact', icon: 'M12 2l2 7 7-2-5 5 5 5-7-2-2 7-2-7-7 2 5-5-5-5 7 2z', filled: true, type: 'trigger', name: 'On Impact', cost: 1, on: 'impact', desc: 'Runs the payload once, where the attack first lands' },
  on_kill: { glyph: 'Ki', short: 'Kill', icon: 'M12 3a8 8 0 0 0-8 8c0 3 2 5 4 6v4h8v-4c2-1 4-3 4-6a8 8 0 0 0-8-8z M9 11h.01 M15 11h.01 M10 17v3 M14 17v3', filled: true, type: 'trigger', name: 'On Kill', cost: 1, on: 'kill', desc: 'Runs the payload from each enemy the attack kills' },
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
