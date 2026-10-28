// Piece and rule-card data for the rig (docs/overclocked-spec.md, "Pieces"). Data only.
// The first test build has 16 pieces: 5 weapons, 7 modifiers, 4 triggers, plus 5 rule cards.
// Energy costs are starting guesses to tune later.
//
//   weapon    fires one attack from a point; `def` is a weapon definition in the shape of data/weapons.js
//   modifier  held, then applied to the next weapon only
//   trigger   attaches to the weapon before it; everything to its right is the payload it runs later

export const DEFAULT_ENERGY = 12;       // a chain's energy pool: it was 10, which six slots could not afford; 16 felt too high (v0.3.3)

// Scatter: the next weapon fires `copies` attacks at `mult` power each, spread out: on a ring of radius `ring` around the origin, and aimed `fan` radians apart.
export const SCATTER = { copies: 5, mult: 0.25, ring: 28, fan: 0.15 };

// Echo: the next weapon fires again `delay` seconds later, both at `mult` power.
export const ECHO = { delay: 0.2, mult: 0.6, boosted: 0.75 };

// Every 3rd: its payload runs once for every `n` times the cursor reaches it.
export const EVERY = 3;

// Piece levels: each level after the first adds this to the piece's main number (an attack's damage, a payload's damage).
export const LEVEL_STEP = 0.1;
export const MAX_LEVEL = 5;

// A trigger's payload is conditional, so it hits harder: its power is multiplied by this, and each payload piece costs 1 less energy (never below 1).
export const TRIGGER_BONUS = 1.5;

// Signature effects: at levels 3 and 5 a piece gains something of its own, on top of the +10% a level. `mods` are stat
// modifiers applied to the weapon the piece is (or is held for); `text` is what the card says. Scatter, Echo and the
// triggers have code behind them (rig/chain.js): copies, echo shots, payload power.
export const SIG_LEVELS = [3, 5];
export const sigCount = (levels, id) => { const lv = (levels && levels[id]) || 1; return lv >= 5 ? 2 : lv >= 3 ? 1 : 0; };
export const SIGNATURE = {
  blaster: { text: '+1 shot', mods: [{ stat: 'projectiles', op: 'flat', value: 1 }] },
  nova: { text: '+2 shots in the ring', mods: [{ stat: 'projectiles', op: 'flat', value: 2 }] },
  mortar: { text: '+25% blast radius', mods: [{ stat: 'area', op: 'inc', value: 0.25 }] },
  slam: { text: '+25% shockwave radius', mods: [{ stat: 'area', op: 'inc', value: 0.25 }] },
  chain_bolt: { text: '+1 jump', mods: [{ stat: 'chains', op: 'flat', value: 1 }] },
  scatter: { text: '+1 copy' },
  heavy: { text: '+30% more area', mods: [{ stat: 'area', op: 'inc', value: 0.3 }] },
  pierce: { text: 'pierces 1 more enemy', mods: [{ stat: 'pierce', op: 'flat', value: 1 }] },
  flame: { text: '+50% burn damage', mods: [{ stat: 'burnPower', op: 'inc', value: 0.5 }] },
  frost: { text: 'chills deeper (+1 stack)', mods: [{ stat: 'chillStacks', op: 'flat', value: 1 }] },
  storm: { text: '+1 shock jump', mods: [{ stat: 'chains', op: 'flat', value: 1 }] },
  echo: { text: 'echoes hit harder, then a third shot' },
  on_impact: { text: 'payload +25% power' },
  on_kill: { text: 'payload +25% power' },
  on_hit: { text: 'payload +25% power' },
  every_3rd: { text: 'payload +25% power, then every 2nd time' },
};
export const SIG_TRIGGER_STEP = 1.25;


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

  chain_bolt: {
    glyph: 'Ch', short: 'Chain', icon: 'M9 15l6-6 M7 11a3 3 0 0 1 0-4l2-2a3 3 0 0 1 4 0 M17 13a3 3 0 0 1 0 4l-2 2a3 3 0 0 1-4 0', filled: false, type: 'weapon', name: 'Chain Bolt', cost: 3, desc: 'Lightning that jumps between enemies',
    def: {
      name: 'Chain Bolt', tags: ['bolt', 'ranged', 'magic', 'storm'], behavior: 'chain',
      baseMods: [{ stat: 'shockChance', op: 'flat', value: 1 }],
      base: { damage: 16, cooldown: 1.2, count: 1, range: 240, chains: 4, jump: 140, ownChain: true },
    },
  },
  slam: {
    glyph: 'Sl', short: 'Slam', icon: 'M12 3v10 M7 9l5 5 5-5 M3 20h18 M6 17l-2 3 M18 17l2 3', filled: false, type: 'weapon', name: 'Slam', cost: 4, desc: 'A heavy ground strike that knocks enemies back',
    def: {
      name: 'Slam', tags: ['melee', 'physical', 'close'], behavior: 'slam',
      base: { damage: 32, cooldown: 1.2, count: 1, range: 130, radius: 62, stun: 0.35 },
    },
  },

  scatter: { glyph: 'Sc', short: 'Scatter', icon: 'M3 12L21 3 M3 12L21 7.5 M3 12h18 M3 12l18 4.5 M3 12l18 9', filled: false, type: 'modifier', name: 'Scatter', cost: 2, desc: 'The next weapon fires 5 copies at 25% power each, spread out', scatter: true },
  flame: { glyph: 'Fl', short: 'Flame', icon: 'M13 2c0 4 5 6 5 12a6 6 0 0 1-12 0c0-3 1.5-5 3-6 .5 2 1 3 2 3 0-3-1-6 2-9z', filled: true, type: 'modifier', name: 'Flame', cost: 1, desc: 'Adds fire: the attack burns', element: 'fire' },
  frost: { glyph: 'Fr', short: 'Frost', icon: 'M12 2v20 M3.3 7l17.4 10 M3.3 17l17.4-10 M9 4l3 3 3-3 M9 20l3-3 3 3', filled: false, type: 'modifier', name: 'Frost', cost: 1, desc: 'Adds frost: the attack chills', element: 'frost' },
  storm: { glyph: 'St', short: 'Storm', icon: 'M13 2L4 14h7l-1 8 9-12h-7z', filled: true, type: 'modifier', name: 'Storm', cost: 1, desc: 'Adds storm: the attack shocks', element: 'storm' },
  heavy: { glyph: 'He', short: 'Heavy', icon: 'M7 8h10l3 12H4z M9 8a3 3 0 0 1 6 0', filled: true, type: 'modifier', name: 'Heavy', cost: 2, desc: 'Double damage and area, slower shots', mods: [{ stat: 'damage', op: 'more', value: 1 }, { stat: 'area', op: 'inc', value: 1 }, { stat: 'projSpeed', op: 'inc', value: -0.3 }] },
  echo: { glyph: 'Ec', short: 'Echo', icon: 'M12 18h.01 M8.5 14.5a5 5 0 0 1 7 0 M5 11a10 10 0 0 1 14 0 M2 7.5a15 15 0 0 1 20 0', filled: false, type: 'modifier', name: 'Echo', cost: 2, desc: 'The next weapon fires twice, 0.2 s apart, at 60% each', echo: true },
  pierce: { glyph: 'Pi', short: 'Pierce', icon: 'M2 12h20 M16 6l6 6-6 6 M9 4v16', filled: false, type: 'modifier', name: 'Pierce', cost: 1, desc: 'Shots pass through 2 more enemies', mods: [{ stat: 'pierce', op: 'flat', value: 2 }] },

  on_impact: { glyph: 'Im', short: 'Impact', icon: 'M12 2l2 7 7-2-5 5 5 5-7-2-2 7-2-7-7 2 5-5-5-5 7 2z', filled: true, type: 'trigger', name: 'On Impact', cost: 1, on: 'impact', desc: 'Runs the payload once, where the attack first lands' },
  on_kill: { glyph: 'Ki', short: 'Kill', icon: 'M12 3a8 8 0 0 0-8 8c0 3 2 5 4 6v4h8v-4c2-1 4-3 4-6a8 8 0 0 0-8-8z M9 11h.01 M15 11h.01 M10 17v3 M14 17v3', filled: true, type: 'trigger', name: 'On Kill', cost: 1, on: 'kill', desc: 'Runs the payload from each enemy the attack kills' },
  on_hit: { glyph: 'Ht', short: 'Hit', icon: 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0 M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0', filled: false, type: 'trigger', name: 'On Hit', cost: 2, on: 'hit', desc: 'Runs the payload from every enemy hit' },
  every_3rd: { glyph: 'E3', short: 'Every 3', icon: 'M4 7h16 M4 17h16 M6 12h.01 M12 12h.01 M18 12h.01', filled: false, type: 'trigger', name: 'Every 3rd', cost: 0, on: 'every', desc: 'Runs the payload every third time it is reached, from the player' },
};

// Stat modifiers an element puts on the weapon it is held for (applied to that piece's instance only).
export const ELEMENTS = {
  fire: { tag: 'fire', mods: [{ stat: 'burnChance', op: 'flat', value: 1 }] },
  frost: { tag: 'frost', mods: [{ stat: 'chillChance', op: 'flat', value: 1 }, { stat: 'chillStacks', op: 'flat', value: 1 }] },
  storm: { tag: 'storm', mods: [{ stat: 'shockChance', op: 'flat', value: 1 }] },
};

// First element then second, in the order the modifiers sit in the chain; the same element twice is an Intensify.
export const REACTIONS = {
  'fire>frost': 'steam',
  'frost>fire': 'shatter',
  'fire>storm': 'overload',
  'storm>fire': 'plasma',
  'frost>storm': 'superconduct',
  'storm>frost': 'static',
  'fire>fire': 'intensify_fire',
  'frost>frost': 'intensify_frost',
  'storm>storm': 'intensify_storm',
};
export const REACTION_INFO = {
  steam: { name: 'Steam', recipe: 'Flame then Frost', desc: 'A cloud that slows enemies and blinds them so they wander for 2 s. Defensive' },
  shatter: { name: 'Shatter', recipe: 'Frost then Flame', desc: 'Chilled enemies hit by the attack crack, and ice shards hit the enemies around them. Clears packs' },
  overload: { name: 'Overload', recipe: 'Flame then Storm', desc: 'Burning enemies explode when hit, hurting their neighbours. Grows with crowd density' },
  plasma: { name: 'Plasma', recipe: 'Storm then Flame', desc: 'Hits leave burning ground. Zone control' },
  superconduct: { name: 'Superconduct', recipe: 'Frost then Storm', desc: '+50% crit chance on the weapon' },
  static: { name: 'Static field', recipe: 'Storm then Frost', desc: 'Hits draw nearby enemies together. Sets up area attacks' },
  intensify_fire: { name: 'Intensify: fire', recipe: 'Flame twice', desc: 'Burns for double damage' },
  intensify_frost: { name: 'Intensify: frost', recipe: 'Frost twice', desc: 'Chills 2 stacks a hit, so enemies freeze sooner' },
  intensify_storm: { name: 'Intensify: storm', recipe: 'Storm twice', desc: 'Shocks jump 2 more times' },
};

// Chain identity in the HUD and the arena: strip badge, and the ring where each of its pieces runs.
export const CHAIN_COLORS = ['#ff7ac6', '#9be564', '#6cc8ff', '#ffc857'];
export const CHAIN_NAMES = 'ABCD';
export const MAX_CHAINS = 4;

// When a rule card starts an activation. `while` gates the timer: 'moving' or 'still'. A card with `on` is not
// timed: it runs when that event happens ('kill': any enemy dies; 'hurt': you take damage), at most once per `gap` seconds.
// `short` is the second line of the HUD badge.
// Spite: each firing heals this share of max hp, and the more hp you are missing the harder it hits and the more it heals (x2 at death's door).
export const SPITE_HEAL = 0.06;

export const RULES = {
  pulse: { name: 'Pulse', every: 1, first: 0.3, desc: 'Every 1 s', short: '1s' },
  stride: { name: 'Stride', every: 0.5, first: 0.3, while: 'moving', desc: 'Every 0.5 s while moving', short: '0.5s' },
  anchor: { name: 'Anchor', every: 0.6, first: 0.3, while: 'still', desc: 'Every 0.6 s while standing still', short: 'still' },
  reaper: { name: 'Reaper', on: 'kill', gap: 0.25, desc: 'On any kill, at most 4 times a second', short: 'kills' },
  spite: { name: 'Spite', on: 'hurt', gap: 0.4, heal: SPITE_HEAL, scales: true, desc: 'When you take damage; the lower your hp, the harder it hits and the more it heals', short: 'hurt' },
};

// Passive stats an offer can give (about 1 offer in 6). Each pick adds one step; the rig keeps the counts
// (rig.stats) and game/sandbox.js applyRig turns them into stat modifiers.
export const RIG_STATS = {
  speed: { name: 'Swift feet', desc: '+8% move speed', mod: { stat: 'moveSpeed', op: 'inc', value: 0.08 } },
  hp: { name: 'Tough hide', desc: '+15 max HP', mod: { stat: 'maxHp', op: 'flat', value: 15 } },
  magnet: { name: 'Magnet', desc: '+25% pickup range', mod: { stat: 'pickupRadius', op: 'inc', value: 0.25 } },
  armor: { name: 'Plating', desc: '+1 armor', mod: { stat: 'armor', op: 'flat', value: 1 } },
};
