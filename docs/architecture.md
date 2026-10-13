# Overforged — Architecture Plan

This is the source of truth for how the game is built. Any agent or person adding code should read this first and keep it in sync: if an implementation deviates from it, update this file in the same commit.

---

## 1. Goals and constraints

| | |
|---|---|
| **Genre** | Survivors-style roguelike: move only, weapons auto-fire, enemy hordes, XP → level-up choices. **10-minute runs** (short sessions suit mobile; length is one constant, §5.8). |
| **Hook** | The **forge**: ore drops feed enhance / reforge / combine decisions that turn a run absurdly strong. |
| **Platform** | Web app. **Mobile-first, portrait-only** (iPhone Safari, Add to Home Screen). Desktop is playable with keyboard in the same portrait-shaped view, so balance is identical on both (§8). |
| **Tech** | Plain ES modules, Canvas 2D, **no build step, no runtime dependencies.** Served as static files (GitHub Pages). |
| **Performance floor** | 60 fps on iPhone 12-class hardware with the budgets in §7. |
| **Iteration** | Content (weapons, passives, enemies, waves) is **data**, not code. Adding a weapon that uses an existing behavior must not touch engine code. |
| **IP** | Inspired by the genre and by VR-MMO/blacksmith fantasy; all names, characters and art are original. |

Non-goals for the prototype: art pipeline, audio beyond simple procedural blips, online features, native packaging.

---

## 2. Directory layout

```
index.html
manifest.webmanifest           (M8) PWA metadata
docs/
  architecture.md              this file
src/
  main.js                      boot: create canvas, input, game; start loop
  core/
    loop.js                    fixed-timestep loop (60 Hz update, rAF render)
    rng.js                     seeded PRNG (mulberry32) + helpers (pick, weighted)
    pool.js                    generic object pool
    spatial-hash.js            uniform grid for broadphase queries
    events.js                  tiny synchronous event bus
    math.js                    vec helpers that write into out-params (no allocs)
  input/
    input.js                   joystick + keyboard → normalized move vector; ignores the HUD top zone
  stats/
    stats.js                   StatBlock: modifiers in, cached final values out
    stat-defs.js               every stat id, its base value, clamps, display info
    conditions.js              named predicates for conditional modifiers (§4.5)
  game/
    game.js                    top-level state machine (§6.1)
    run.js                     one run: owns world, player, director, timers
    world.js                   entity stores (pools), spatial hash, damage queue, scratch buffers
    player.js                  player entity, StatBlock, weapon and passive lists, xp/level
    weapons.js                 weapon instances: add, level up (as modifiers), per-tick update
    weapon-params.js          how a weapon's base params combine with stats: param(), weaponStat()
    projectiles.js             spawnProjectile + hit-set helpers
    director.js                spawn director: reads waves data, spawns enemies and forge shrines
    upgrades.js                level-up offer generation (§5.6); pure, no run access
    apply-offer.js             applies a chosen offer to the run; offerState(run) snapshot for upgrades.js
    xp.js                      xpToNext(level), gainXp(run, amount)
    passives.js                owned passives: add, level up (as modifiers, source passive:<id>:<lvl>)
    forge.js                   forge actions; pure functions over inventory (§6)
    evolutions.js              recipe checks
    triggers.js                trigger dispatch for on-hit/on-kill/etc. effects (§4.6)
  behaviors/                   weapon behaviors, one file each (§5.2)
    index.js                   registry: id → behavior
    projectile.js  orbit.js  aura.js  arc.js  chain.js  nova.js  summon.js
  effects/                     effect handlers used by triggers (§4.6)
    index.js
  systems/                     per-tick systems over entity stores
    movement.js  enemy-ai.js  collision.js  damage.js  damage-queue.js  pickups.js (xp gems)  status.js
  render/
    view.js                    portrait view: 480-unit width, desktop column, safe-area inset
    renderer.js                camera (with shake), layers, draw order
    entities.js                batched enemy and projectile drawing, culled to the camera
    fx.js                      pooled damage numbers and death puffs (hit flash is in entities.js)
    hud.js                     canvas HUD: hp, xp bar, timer, level, ore, off-screen shrine arrow
  ui/                          DOM overlays (menus are DOM, gameplay is canvas)
    overlay.js                 mount/unmount helper, safe-area aware
    rotate-prompt.js           "rotate to portrait" cover shown (and run paused) in landscape on touch devices
    levelup.js  pause.js  results.js  title.js   (built)   forge-ui.js  class-select.js   (planned)
  data/                        ALL tunable content lives here
    classes.js  weapons.js  passives.js  enemies.js  waves.js  rarities.js  progression.js   (built)
    titles.js  evolutions.js  forge.js  ores.js   (planned)
    validate.js                boot-time schema checks for everything above (§5)
  meta/
    save.js                    versioned localStorage persistence
    unlocks.js                 meta-progression rules
  debug/
    debug.js                   ?debug=1: fps/entity overlay, god mode, spawn/give
tests/
  run.mjs                      zero-dep test runner (node tests/run.mjs)
  stats.test.mjs  upgrades.test.mjs  forge.test.mjs  spatial-hash.test.mjs
```

Rules:
- `data/*` files export plain objects/arrays only. No imports from engine code, no functions except where §5 explicitly allows (none in the prototype).
- `stats/`, `game/upgrades.js`, `game/forge.js`, `game/evolutions.js`, and `core/*` are **pure** (no DOM, no canvas) so they run in Node tests.
- Modules talk via direct calls; the event bus is for loose coupling only (UI ← game, FX ← damage), never for core simulation order.

---

## 3. Runtime core

### 3.1 Loop
Fixed 60 Hz simulation (`STEP = 1/60`), accumulator with a 0.1 s clamp, render once per rAF. Simulation never reads wall-clock time; `run.time` advances only in `update`. This makes runs reproducible from a seed and lets pause/level-up/forge simply stop calling `update`.

On `visibilitychange → hidden`, auto-pause.

### 3.2 Entity storage
No general ECS. A few typed **stores**, each a fixed-capacity pool of plain objects with stable shape (all fields initialised in the factory so V8/JSC keep one hidden class):

| Store | Capacity (prototype) | Notes |
|---|---|---|
| `enemies` | 600 | hp, speed, radius, defId, status timers, hitFlash |
| `projectiles` | 800 | owner weapon instance, pierce left, ttl, hit-set |
| `pickups` | 600 | xp gems, ore, chests, heals; merge when over cap (§7) |
| `shrines` | 4 | forge shrines (§6.3); at most 1 active by default |
| `summons` | 50 | minions; share enemy-like AI pointed at enemies |
| `fx` | 400 | damage numbers, particles; pure visual, droppable |

Each store keeps an `active` dense array plus a free list. Removal is swap-remove (O(1)); never splice. Systems iterate the dense array backwards so removal during iteration is safe.

### 3.3 Update order (one tick)
1. `director.update` — spawn enemies and shrines per wave schedule
2. `player.update` — movement from input, regen, timers
3. `weapons.update` — each weapon instance ticks its behavior (fires/spawns projectiles, applies auras)
4. `enemyAI.update` — seek player, separation via spatial hash
5. `movement.update` — integrate projectiles, summons
6. `spatialHash.rebuild(enemies)`
7. `collision.update` — projectile↔enemy, enemy↔player, player↔pickup (magnet radius), player↔shrine (channel progress; opens the forge when full)
7d. `status.update` — status timers, slow, burn ticks (queued as DOT damage; runs before the flush so burn kills resolve this tick)
8. `damage.flush` — apply queued damage (target multipliers, lifesteal, status rolls, chains, triggers, deaths → drops)
10. `run.checkEvents` — level-up pending? forge pending? boss? win/lose?

Damage is **queued** during collision and applied in one place (`damage.flush`), so on-hit / on-kill triggers, damage numbers and kill counts are handled consistently and can't recurse unboundedly (triggered damage enqueues for the next flush, with a depth cap of 3).

---

## 4. Stat and modifier system

Everything that makes the player stronger — level-up passives, weapon levels, titles, forge enhancement, affixes, set bonuses, meta-unlocks — is expressed as **modifiers** applied to a **StatBlock**. Engine code only ever *reads* final stats. This is the single most important rule for iteration speed.

### 4.1 Stats
`stats/stat-defs.js` declares every stat once:

```js
export const STATS = {
  maxHp:        { base: 100, min: 1,               fmt: 'int' },
  moveSpeed:    { base: 150, min: 40,  max: 600,   fmt: 'int' },   // 200 made the horde trivial to outrun at M3
  pickupRadius: { base: 60,  min: 20,              fmt: 'int' },
  armor:        { base: 0,                         fmt: 'int' },   // flat damage reduction
  regen:        { base: 0,                         fmt: 'dec' },   // hp per second
  xpGain:       { base: 1,   min: 0,               fmt: 'pct' },
  oreGain:      { base: 1,   min: 0,               fmt: 'pct' },
  luck:         { base: 0,                         fmt: 'int' },   // offer rarity / forge success
  // offensive — usually read per weapon (§4.4)
  damage:       { base: 1,   min: 0,               fmt: 'pct' },   // multiplier on weapon base damage
  cooldown:     { base: 1,   min: 0.1,             fmt: 'pct' },   // multiplier; lower is faster
  area:         { base: 1,   min: 0.1,             fmt: 'pct' },
  projectiles:  { base: 0,   min: 0,               fmt: 'int' },   // additional projectiles
  pierce:       { base: 0,   min: 0,               fmt: 'int' },
  duration:     { base: 1,   min: 0.1,             fmt: 'pct' },
  projSpeed:    { base: 1,   min: 0.1,             fmt: 'pct' },
  critChance:   { base: 0.05, min: 0, max: 1,      fmt: 'pct' },
  critMult:     { base: 1.5, min: 1,               fmt: 'mult' },
  knockback:    { base: 1,   min: 0,               fmt: 'pct' },
  lifesteal:    { base: 0,   min: 0,               fmt: 'pct' },
  // add stats freely; unknown stat ids in data fail validation at boot
};
```

### 4.2 Modifier shape

```js
{
  stat: 'damage',          // a key of STATS
  op: 'inc',               // 'flat' | 'inc' | 'more' | 'set'
  value: 0.15,
  tags: ['fire'],          // optional: only applies to weapons with ALL these tags (§4.4)
  when: 'hpBelow50',       // optional: condition id (§4.5)
  source: 'passive:ember_core:3', // who added it; used for removal and tooltips
}
```

### 4.3 Calculation

```
final = clamp( ( base + Σflat ) × ( 1 + Σinc ) × Π(1 + more) )
```

- **flat** — additive to base (`+2 projectiles`, `+10 maxHp`).
- **inc** — "increased": all `inc` on a stat sum together (`+15%` and `+20%` → ×1.35). This is the common, diminishing-feeling bucket.
- **more** — each multiplies separately (`+50% more` and `+50% more` → ×2.25). Reserved for rare, exciting sources: evolutions, legendary affixes, high titles. This bucket is what produces "very powerful" late runs, so keep it scarce.
- **set** — overrides the final value (rare; e.g. a curse that sets `regen` to 0). Last `set` by insertion order wins; applied after clamp-free calc, then clamped.
- `cooldown` uses the same formula; negative `inc` values speed it up (`-10%` cooldown → `inc: -0.10`).

StatBlock API:

```js
const sb = new StatBlock(STATS);
sb.add(mod);                    // or addMany(mods)
sb.removeBySource(prefix);      // e.g. 'passive:ember_core' on level change
sb.get('maxHp');                // global final value, cached
sb.getFor('damage', tags);      // value including tag-scoped modifiers, cached per (stat, tags.key)
// `tags` comes from makeTags(['projectile', 'fire', 'weapon:3']) -> { set, key }, built once per
// weapon instance so hot paths never allocate. get(stat) = getFor(stat, NO_TAGS).
// Cache invalidation is per stat; a stat with any `when` modifier bypasses the cache entirely.
```

Caching: each `add/remove` marks the touched stat dirty; `get` recomputes only dirty stats. Tag-scoped reads cache by `stat + '|' + sortedTags`. Condition-gated modifiers are excluded from the cache and evaluated on read (they're few).

### 4.4 Scopes: global vs weapon
There is **one** player StatBlock. Weapons don't own separate blocks; instead a weapon instance reads `player.stats.getFor(stat, weapon.tags)` and multiplies by its own per-level base values. So:

- A passive with `{ stat:'damage', op:'inc', value:0.1 }` buffs everything.
- A passive with `tags:['projectile']` buffs only projectile weapons.
- Weapon-local upgrades (a weapon's own level-ups, forge enhancement, affixes) are added with `tags:['weapon:<instanceId>']`, and every weapon includes its own `weapon:<instanceId>` in its tag set when reading. This keeps a single code path for all stat math.

Effective weapon damage per hit:
```
hit = weapon.base.damage(level) × stats.getFor('damage', tags) × (crit ? stats.getFor('critMult', tags) : 1)
```

### 4.5 Conditions
`when` references a small registry of named predicates evaluated against run state:
`hpBelow50`, `hpFull`, `moving`, `standingStill`, `recentKill3s`, `bossAlive`. Add new ones in `stats/conditions.js`. Data never contains code.

### 4.6 Triggers and effects (non-stat upgrades)
Some upgrades aren't numbers (explode on kill, chain lightning on crit, shield every 10 s). These are **triggers** that call **effects**:

```js
triggers: [
  { on: 'kill', chance: 0.15, effect: 'explode', params: { radius: 60, damageFrac: 0.5 }, tags: ['fire'] },
  { on: 'interval', every: 10, effect: 'shield', params: { amount: 20 } },
]
```

- `on`: `hit | crit | kill | hurt | levelUp | interval | pickupOre | forge`.
- `effect`: id in `effects/index.js` registry; `params` are data.
- Optional `tags` restrict which weapon's hits fire it.
- Triggered damage is enqueued (§3.3) and carries `depth+1`; depth > 3 is dropped.

---

## 5. Data schemas

All content IDs are `snake_case`, unique per file. At boot, `data/validate.js` checks every schema (unknown stat ids, unknown behaviors/effects, missing levels, recipe references) and throws in debug mode / logs in production.

### 5.1 Weapon

```js
// data/weapons.js
export const WEAPONS = {
  ember_bow: {
    name: 'Ember Bow',
    class: 'archer',               // starting weapon for class; null = general pool
    rarity: 'common',              // affects offer weight (data/rarities.js)
    tags: ['projectile', 'ranged', 'fire'],
    behavior: 'projectile',        // behaviors/index.js key
    base: {                        // behavior-specific base params at level 1
      damage: 14, cooldown: 0.9, speed: 520, count: 1, pierce: 1,
      spread: 0.02, gap: 7, ttl: 1.2, radius: 5, range: 380,   // tight volley: small spread + sideways gap
    },
    maxLevel: 8,
    levels: [                      // index 0 = level 2, etc. Each is a list of modifiers
      [{ stat: 'damage', op: 'inc', value: 0.2 }],
      [{ stat: 'projectiles', op: 'flat', value: 1 }],
      [{ stat: 'pierce', op: 'flat', value: 1 }],
      [{ stat: 'cooldown', op: 'inc', value: -0.15 }],
      [{ stat: 'projectiles', op: 'flat', value: 1 }],
      [{ stat: 'damage', op: 'inc', value: 0.3 }],
      [{ stat: 'damage', op: 'more', value: 0.25 }],
    ],
    levelText: ['+20% damage', '+1 arrow', '+1 pierce', '-15% cooldown', '+1 arrow', '+30% damage', '25% more damage'],
    triggers: [],                  // optional, §4.6
    evolvesInto: 'storm_volley',   // optional; recipe lives in evolutions.js
  },
};
```

Level modifiers are auto-tagged `weapon:<instanceId>` when applied, so data authors never write instance tags.

### 5.2 Behaviors
A behavior is a small object of functions; all per-shot numbers come from `base` × stats:

```js
// behaviors/projectile.js
export default {
  init(inst, ctx) {},                     // allocate per-instance state (timers)
  update(inst, dt, ctx) {},               // tick cooldown; when ready, fire via ctx.spawnProjectile
  onProjectileHit(inst, proj, enemy, ctx) {}, // optional
};
```

**As built (M3):** there is no separate `ctx` object. Behaviors receive the `run` (which holds `world`, `player`, `rng`) and import helpers directly: `param(run, inst, key)` and `weaponStat(run, inst, id)` from `game/weapon-params.js`, `spawnProjectile` from `game/projectiles.js`, `queueDamage` from `systems/damage-queue.js`, and `run.world.hash.queryRadius / queryNearest` for targeting. Keep behaviors reading stats only through these helpers.

How `base` params combine with stats (one place: `ctx.param(inst, key)`, so behaviors never re-derive this):

| `base` key | Combined as | Stat |
|---|---|---|
| `damage` | `base × stat` | `damage` (multiplier) |
| `cooldown` | `base × stat` | `cooldown` (multiplier, lower = faster) |
| `count` | `base + stat` | `projectiles` (flat) |
| `pierce` | `base + stat` | `pierce` (flat) |
| `speed` | `base × stat` | `projSpeed` |
| `ttl` | `base × stat` | `duration` |
| `radius`, `range`, `arcWidth` | `base × stat` | `area` |

Keys not in this table (e.g. `spread`, `targeting`) are used as-is. Stats that don't apply to a behavior (e.g. `projectiles` on an `aura`) are simply ignored; offer generation should skip upgrades whose only stats are irrelevant to every owned weapon (`behaviors/<x>.uses = ['damage','cooldown','area', ...]`).

Prototype behaviors and the archetypes they serve:

| Behavior | Shape | Archetype examples |
|---|---|---|
| `projectile` | fires `count` shots at targets | Archer bow, Mage bolt |
| `arc` | melee sweep in facing/nearest direction | Berserker greatsword, Smith hammer |
| `orbit` | N bodies circling the player | Smith's orbiting anvils, Saint's wards |
| `aura` | damage/slow field around the player | Saint's halo, Mage frost field |
| `chain` | hit nearest, jump N times | Mage lightning |
| `nova` | periodic radial burst | Smith "forge blast", evolutions |
| `summon` | spawns minions with simple AI | Summoner skeletons |

Adding a new weapon = a data entry using an existing behavior. Adding a new *behavior* = one file + registry line; it must not require edits elsewhere.

### 5.3 Passive

```js
// data/passives.js
export const PASSIVES = {
  tempered_core: {
    name: 'Tempered Core',
    rarity: 'common',
    tags: ['defense'],              // for offer filtering and evolution recipes
    maxLevel: 5,
    levels: [                       // index 0 = level 1
      [{ stat: 'maxHp', op: 'inc', value: 0.1 }, { stat: 'armor', op: 'flat', value: 1 }],
      // ...
    ],
    levelText: ['+10% max HP, +1 armor', /* ... */],
    triggers: [],
  },
};
```

On level change (as built): add only the new level's modifiers with `source: 'passive:<id>:<lvl>'`; they stack on the earlier levels. `removeBySource('passive:<id>')` removes the whole passive. A passive's own `tags` are for offer filtering and recipes; a *modifier's* `tags` scope it to weapons (Wind Sigil's effects only reach projectile weapons).

Indexing differs on purpose, and `validate.js` enforces it: a **weapon** is already useful at level 1 from `base`, so `levels.length === maxLevel - 1`; a **passive** does nothing until taken, so `levels.length === maxLevel`. `levelText.length` must equal `levels.length` in both.

### 5.4 Title
Titles are run-long, non-leveling modifiers granted by milestones (kill 1000, survive 10 min, hit +10 enhance, beat a boss) and shown as a toast. Some are offered rarely in level-ups. They are the main source of **conditional** and **more** modifiers.

```js
// data/titles.js
export const TITLES = {
  unyielding: {
    name: 'Unyielding',
    desc: '40% more damage while below 50% HP',
    grant: { type: 'offer', rarity: 'epic' },    // or { type:'milestone', event:'kills', count:1000 }
    mods: [{ stat: 'damage', op: 'more', value: 0.4, when: 'hpBelow50' }],
    triggers: [],
  },
};
```

### 5.5 Evolution recipe

```js
// data/evolutions.js
export const EVOLUTIONS = [
  {
    id: 'storm_volley',
    from: 'ember_bow',               // weapon id
    requires: [                      // ALL must be satisfied
      { weaponLevel: 8 },
      { passive: 'wind_sigil', minLevel: 1 },
      // optional: { enhance: 5 }, { ore: { starsteel: 3 } }, { title: 'sharpshooter' }
    ],
    into: 'storm_volley',            // a WEAPONS entry (rarity 'evolved', class null, not in normal pool)
    at: 'forge',                     // 'forge' (combine action) | 'chest' (VS-style auto)
  },
];
```

Evolved weapons are normal weapon entries flagged `pool: false`. Evolving replaces the instance: keeps enhance level and affixes, resets level to 1 of the evolved weapon (which starts much stronger).

### 5.6 Level-up offers

`game/upgrades.js#generateOffers(state, rng, count = 3)`:
1. Build candidates: new weapons (if a weapon slot is free, max 6), level-ups of owned weapons/passives below max, new passives (if passive slot free, max 6), offer-type titles not owned.
2. Weight = `rarities[r].weight × (1 + luck × rarities[r].luckScale)` × modifiers (owned items ×1.5 to encourage depth; items that progress a recipe ×1.3).
3. Weighted sample without replacement.
4. If fewer than `count`, add the **Rest** fallback (heal 30%); +ore and +gold fallbacks join with the forge (M6). When nothing is left to improve, Rest is the only offer.
5. Player has limited **rerolls** and **banishes** (meta-unlocked). *Not built yet; planned for M8.*

Offer generation is pure: same seed + state → same offers. Tested in `tests/upgrades.test.mjs`.

### 5.7 Class

```js
// data/classes.js
export const CLASSES = {
  smith:     { name: 'Smith',     startWeapon: 'forge_hammer', mods: [{ stat:'oreGain', op:'inc', value:0.25 }], forge: { enhanceBonus: 0.1 }, unlocked: true },
  archer:    { name: 'Archer',    startWeapon: 'ember_bow',    mods: [{ stat:'critChance', op:'flat', value:0.05 }], unlocked: true },
  berserker: { name: 'Berserker', startWeapon: 'cleaver',      mods: [{ stat:'lifesteal', op:'flat', value:0.03 }], unlocked: false },
  mage:      { name: 'Mage',      startWeapon: 'arc_bolt',     mods: [{ stat:'area', op:'inc', value:0.15 }],        unlocked: false },
  summoner:  { name: 'Summoner',  startWeapon: 'bone_call',    mods: [],                                             unlocked: false },
  saint:     { name: 'Saint',     startWeapon: 'halo',         mods: [{ stat:'regen', op:'flat', value:0.5 }],       unlocked: false },
};
```

### 5.8 Enemy and waves

```js
// data/enemies.js
export const ENEMIES = {
  goblin:  { hp: 10, speed: 70,  damage: 5,  radius: 10, xp: 1, ore: { chance: 0.02, type: 'iron' }, ai: 'chase', color: '#6aa84f' },
  brute:   { hp: 80, speed: 50,  damage: 12, radius: 18, xp: 5, ore: { chance: 0.15, type: 'iron' }, ai: 'chase', color: '#a64d79' },
  warlord: { hp: 3000, speed: 60, damage: 25, radius: 34, xp: 100, ore: { chance: 1, type: 'starsteel', count: 3 }, ai: 'boss_charge', boss: true, color: '#cc0000' },
};

// data/waves.js — a timeline; director interpolates rates within each segment
export const RUN = {
  length: 600,            // seconds. THE run-length knob (10 min). Win = survive until `length`.
  designLength: 600,      // the length the timeline below was authored for
};
export const WAVES = [
  { from: 0,   to: 60,  spawns: [{ enemy: 'goblin', perSec: 1.5 }], hpScale: 1.0 },
  { from: 60,  to: 180, spawns: [{ enemy: 'goblin', perSec: 4 }, { enemy: 'brute', perSec: 0.2 }], hpScale: 1.2 },
  // ...
];
// As built (M6) one-off events are a separate sorted list, not mixed into WAVES:
export const EVENTS = [
  { at: 120, event: 'shrine' },    // forge shrines, see §6.3
  { at: 240, event: 'shrine' },
  { at: 390, event: 'shrine' },
  { at: 510, event: 'shrine' },
  // { at: 300, event: 'boss', enemy: 'warlord' } arrives with M7; boss death also drops a shrine
];
```

**Changing run length.** Every time value in `WAVES` (`from`, `to`, `at`) is authored against `RUN.designLength`. The director multiplies them by `RUN.length / RUN.designLength`, so setting `RUN.length = 480` compresses the whole arc (boss at 4:00, shrines earlier) without editing the timeline. Spawn *rates* (`perSec`) are not scaled, so a shorter run also has fewer total enemies; retune rates if that matters. HUD timer and the win check read `RUN.length`.

Enemies spawn on the **perimeter of a rectangle** just outside the visible view (view rect expanded by 40 units), with the side chosen weighted by side length. The view is portrait and tall (§8), so a ring would waste most spawns far to the left and right. Director enforces the enemy cap (§7): at cap, it stops spawning and instead buffs `hpScale` so pressure still rises.

---

## 6. The forge in the run loop

### 6.1 Game state machine

```
Title → ClassSelect → Run ─┬─ Playing ⇄ Paused
                           ├─ Playing → LevelUp → Playing
                           ├─ Playing → Forge   → Playing
                           └─ Playing → Results → (Meta screen) → Title
```

`LevelUp`, `Forge`, `Paused` all freeze simulation (no `update` calls) and mount a DOM overlay. If multiple level-ups are pending, they are shown back to back; forge waits until level-ups are cleared.

### 6.2 Resources
- **Ore** drops from enemies (`ENEMIES[*].ore`), bosses and chests. Types (`data/ores.js`): `iron` (common), `mithril` (uncommon), `starsteel` (boss), `void_ember` (late/rare). Ore is a pickup like XP gems, pulled by the magnet.
- **Gold**: secondary, from chests and fallbacks; used for reroll/banish costs and meta shop.

### 6.3 When the forge opens: shrines
Forge is **an event, not a menu you can open any time**, to keep pacing tight. On a 10-minute mobile run it opens through **anvil shrines**, so reaching the forge is itself a small risk/reward decision made mid-horde.

Sources of shrines:
- `shrine` events in `WAVES` (default 2:00, 4:00, 6:30, 8:30 of a 10:00 run).
- A boss kill drops a shrine at the boss's death position, along with `starsteel`.
- The `forge` event type (opens the forge immediately, no shrine) still exists for debug, tests and scripted moments, but is **not used in the default timeline**. Auto-opening on top of shrines would mean 6+ interruptions in 10 minutes.

Shrine behavior (all numbers in `data/forge.js#SHRINE`):
- **Placement (as built):** just past the left or right edge of the view (the view is tall and narrow, so a 220–360 unit ring would land on screen), choosing the least crowded of 6 random candidate spots via the spatial hash.
- **Finding it:** a glowing anvil, plus a **HUD edge arrow** pointing at it with a ring showing remaining time, and a sound cue on spawn.
- **Activating:** stand within `radius` for `channel` seconds (progress ring fills; leaving the radius drains it at 2× speed). Standing still in danger is the cost. When full, state → `Forge`.
- **Expiry:** `ttl` seconds after spawning it fades (the boss-drop shrine lasts longer). A missed shrine is simply a missed forge; nothing carries over.
- **One use.** Unspent ore carries to the next shrine.
- **Concurrency:** at most `maxActive` (default 1) shrines exist; a spawn event while one is active is skipped.

During the forge the run is paused. The player can perform any number of actions while ore lasts, then press **Return to battle**.

### 6.4 Items forge actions operate on
Each weapon instance carries:

```js
{ instanceId, weaponId, level, enhance: 0, affixes: [ { affixId, mods } ], locked: false }
```

### 6.5 Actions (all defined in `data/forge.js`, logic in `game/forge.js`)

| Action | Cost | Effect | Risk |
|---|---|---|---|
| **Enhance** | ore scaled by current `enhance` | `enhance += 1`; adds `{damage, op:'inc', value: 0.08}` per level, plus a **breakpoint** bonus at +5, +10, +15 (e.g. +1 projectile, `more` damage) | Success chance from table (100% to +3, falls after). On fail: lose the ore spent; above +7 it may also drop 1 enhance level (Smith class and `luck` reduce this; a "protection" ore prevents it). **A failed enhance never destroys or removes the weapon**; the worst case is losing one enhance level. Only the player's own **Salvage** removes a weapon. |
| **Reforge** | iron + gold | Reroll a weapon's affixes (1 affix at common, up to 3 at epic). Affixes come from `data/forge.js#AFFIXES` with weights and tag filters. | Can lock one affix for extra cost. |
| **Combine** | recipe-defined | Execute an evolution whose requirements are met (§5.5). | None; it's the payoff. |
| **Salvage** | — | Remove a weapon you don't want for ore back; frees a slot. | — |

```js
// data/forge.js
export const ENHANCE = {
  maxLevel: 15,
  cost:    [3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 26, 30, 35, 40, 50], // iron-equivalent
  success: [1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15],
  perLevel: [{ stat: 'damage', op: 'inc', value: 0.08 }],
  breakpoints: {
    5:  [{ stat: 'projectiles', op: 'flat', value: 1 }],
    10: [{ stat: 'damage', op: 'more', value: 0.3 }],
    15: [{ stat: 'damage', op: 'more', value: 0.5 }, { stat: 'area', op: 'inc', value: 0.25 }],
  },
  downgradeAbove: 7,
  downgradeChance: 0.5,    // lose 1 enhance level on failure above the threshold; 0 disables downgrades entirely
  // invariant (tested): no failure outcome removes the weapon instance
};
export const SHRINE = {
  maxActive: 1,
  ttl: 45,                 // seconds before a shrine fades
  bossShrineTtl: 90,
  radius: 32,              // activation radius, world units
  channel: 0.6,            // seconds standing in radius to open the forge
  placement: { min: 220, max: 360, candidates: 6 },
};
// A weapon may override breakpoints with `forge: { breakpoints: { 5: [...] } }` on its WEAPONS entry
// (e.g. a melee arc gets +area at +5 instead of +1 projectile). Overrides replace that level only.
export const AFFIXES = {
  keen:     { rarity: 'common', mods: [{ stat: 'critChance', op: 'flat', value: 0.05 }] },
  swift:    { rarity: 'common', mods: [{ stat: 'cooldown',   op: 'inc',  value: -0.08 }] },
  volatile: { rarity: 'rare',   triggers: [{ on: 'kill', chance: 0.1, effect: 'explode', params: { radius: 50, damageFrac: 0.4 } }] },
  // ...
};
```

All forge modifiers go into the player StatBlock with `tags:['weapon:<instanceId>']` and `source:'forge:<instanceId>:...'`, so they flow through the same calculation as everything else.

`game/forge.js` exports pure functions (`enhance(inv, instanceId, rng, stats) → {ok, inv, result}` etc.) so success tables and edge cases are unit-tested without UI.

### 6.6 Why this design
Level-ups give **breadth** (which weapons/passives); the forge gives **depth** (how hard to push one weapon) and **risk** (enhance gambling). Evolutions tie them together. Ore is a second economy, so killing efficiently matters beyond XP.

---

## 7. Performance

### 7.1 Budgets (prototype, must hold at 60 fps on iPhone 12)

| Thing | Budget |
|---|---|
| Live enemies | 500 (hard cap 600) |
| Live projectiles | 600 (cap 800) |
| Pickups | 400 (gems merge beyond cap) |
| FX particles / numbers | 300 (oldest dropped) |
| Simulation per tick | ≤ 4 ms |
| Render per frame | ≤ 6 ms |
| Allocations in hot loop | zero steady-state (no GC sawtooth) |

### 7.2 Techniques
- **Object pools** (`core/pool.js`) for every store in §3.2. `acquire()` returns a reset object; `release()` returns it. Projectile hit-sets use a small fixed array + generation counter, not a `Set`.
- **Spatial hash** (`core/spatial-hash.js`): uniform grid, cell size 64 px (≈ 2–3× typical enemy diameter). Rebuilt once per tick from enemies (cheap: clear heads, insert into preallocated `Int32Array` buckets with a linked-list `next` array). Cells are hashed into a fixed 4096-slot table, so the world is unbounded; every candidate is distance-checked and de-duplicated. Items are stored **by reference**, so objects released after the rebuild are still safe to read (callers skip `alive === false`). Queries: `queryRadius(x, y, r, outArray) → count` and `queryNearest(x, y, r, pred) → object | null`. Used for projectile hits, aura/nova AoE, chain targeting, enemy separation, nearest-enemy targeting.
- **Enemy separation**: each enemy pushes away from at most 4 neighbours found via the hash, every other tick (alternate halves by index parity).
- **Nearest target**: query expanding rings in the hash; fall back to a cached nearest that refreshes every 6 ticks per weapon.
- **No per-frame allocation**: math helpers write into out-params; no closures, spreads or array literals inside systems. Damage queue is a preallocated ring buffer.
- **Rendering**: cull by camera rect; batch by fill style (draw all goblins in one path), avoid `save/restore` per entity, avoid `shadowBlur`, text only for damage numbers with a cap. Pre-render repeated shapes to small offscreen canvases if profiling shows `arc` cost. DPR capped at 2.
- **Gem merging**: when pickups exceed cap, combine far-away gems into a single larger gem.
- **Off-screen enemies**: when farther than 1.5 view-heights from the player, teleport them to the opposite side of the spawn perimeter instead of simulating a long walk back.
- **Mobile power**: pause on hidden; drop to 30 fps render (sim still 60 Hz) if frame time > 20 ms for 2 s, show in debug overlay.

### 7.3 Measurement
`?debug=1` overlay: fps, sim ms, render ms, counts per store, hash bucket max occupancy. A `stress` debug button spawns 500 enemies + 600 projectiles; this must stay green before merging milestone M5 onward.

---

## 8. Platform and UX details

- **Orientation: portrait only.** Played one-handed with the thumb. The manifest declares `orientation: portrait` (M8), and on a touch device in landscape `ui/rotate-prompt.js` covers the screen and pauses the run.
- **Logical view**: the camera shows a fixed **480 world units of width**; height is whatever the screen aspect gives, capped at **1040** units (about 19.5:9). Taller than that is letterboxed with dark bars. Scale = canvas pixel width / 480, so every phone sees the same horizontal field and fairness doesn't depend on the device. All spawn, shrine and teleport distances are expressed against this view rect.
- **Desktop**: the same portrait view is drawn as a centered column (max about 9:16, as tall as the window allows) on a dark background, not a stretched wide view. Balance is therefore identical to the phone.
- **Input**: floating joystick appearing wherever the thumb lands, ignoring touches that begin in the top ~12% (HUD and pause button). Keyboard WASD/arrows on desktop; Esc / pause button = pause. The joystick must also work when the first touch lands during a shrine channel.
- **Thumb layout**: HUD (hp, xp bar, timer, ore, pause) sits at the top, away from the playing thumb. Level-up cards stack **vertically**, each ≥ 72 px tall. The forge is a bottom-sheet: weapon list at the top, actions and cost in the lower half within thumb reach. Minimum tap target 48 px. Overlays use `env(safe-area-inset-*)`.
- **Audio**: WebAudio, unlocked on first touch; procedural blips in the prototype.
- **PWA (M8)**: `manifest.webmanifest` (`orientation: portrait`, `display: fullscreen`), icons; a service worker for offline play is optional later.
- **Persistence**: `meta/save.js` stores `{ version, unlocks, currency, bestTimes, settings }` in `localStorage` under `overforged:save`, wrapped in try/catch; on version mismatch, run a migration function or reset safely.
- **Determinism**: every run has a seed (shown on results screen). All gameplay randomness goes through `run.rng`; visual-only randomness may use a separate FX rng.

---

## 9. Testing

- `node tests/run.mjs` — tiny zero-dependency runner (`test(name, fn)`, `assert` helpers).
- Required tests: stat formula and caching (flat/inc/more/set, tags, conditions), offer generation determinism and slot rules, forge enhance tables and downgrade rules (including the invariant that no failure removes the weapon), shrine placement/expiry/channel rules, `RUN.length` timeline scaling, evolution requirement checks, spatial hash queries vs brute force, data validation passes for all shipped data.
- Manual checklist per milestone: play 3 minutes on phone, play 3 minutes on desktop, run debug stress.

---

## 10. Milestones (prototype)

Each milestone ends playable, is one or a few commits, and has a clear done-check. Order is chosen so the riskiest systems (stats, performance) land early and content comes last.

| # | Milestone | Done when |
|---|---|---|
| **M0** | Scaffold *(done)* | Canvas, loop, joystick, player moves. |
| **M1** *(done)* | Core runtime refactor | `core/` loop, rng, pool, events split out; `game.js` state machine with Title → Run → Results stubs; debug overlay with fps; **portrait view** (480-unit width, desktop column, rotate prompt, joystick top-zone ignore, §8). |
| **M2** *(done)* | Enemies + spatial hash | `goblin` and `brute` spawn from `waves.js`, chase, separate; player takes contact damage and can die; `?debug=1` stress button shows 500 enemies at 60 fps. Measured in headless Chromium only (about 0.7 ms sim, worst case 1.9 ms with everything stacked on the player); **still to verify on a real iPhone.** |
| **M3** *(done)* | Stats + first weapon | `StatBlock` with tests; `projectile` behavior; Archer's `ember_bow` kills enemies; damage numbers, hit flash, death puffs, knockback, screen shake on hit. |
| **M4** *(done)* | XP + level-up | Gems drop and magnet in; xp curve; level-up overlay with 3 offers from `upgrades.js`; weapon levels and passives working through modifiers. **As built:** 6 passives, 3-card vertical level-up screen with a 0.35 s input lock and 1 s of i-frames on resume, gems that merge at the pool cap, XP bar / level / item chips in the HUD. Rerolls and banish are deferred to M8 with meta-progression. |
| **M5** *(done)* | Weapon variety | `arc`, `orbit`, `aura` behaviors; Smith class with `forge_hammer`; class select screen; 5 weapons total; triggers + 2 effects (`explode`, `shield`). Perf budget re-verified. **As built:** weapons `ember_bow` (archer), `forge_hammer` (smith, arc), `spirit_blades` (orbit), `cinder_ward` (aura), `storm_javelin` (projectile); the last three are class-neutral and offered to every class. Direct hits go through `game/hit.js#strike`, which queues damage exactly like projectile hits; the damage queue now carries `src` (the weapon instance) so `game/triggers.js` can fire `hit`/`crit`/`kill` triggers from `flushDamage`, and `interval` triggers tick per weapon. Triggers are per weapon with an optional `minLevel` (Ember Bow lv5: 15% of kills explode; Forge Hammer lv3: shield every 12 s); the `chance` roll uses the sim rng. Trigger damage carries `depth + 1`, capped at 3. `player.shield` soaks damage before hp (capped at max hp). Behaviors may define `draw(inst, ctx, run)`. Orbit and aura deal damage on a tick (`tickEvery` x cooldown stat, or the cooldown itself) rather than per frame. Class select remembers the last class in localStorage; `?class=smith` skips it; `?debug=1` runs get `run.debugLoadout()` (smoke test `--loadout`). |
| **M6** *(done)* | Forge + shrines | Ore drops; `shrine` events spawn shrines with edge arrow, channel and expiry (§6.3); enhance (with tables + breakpoints; failures never remove the weapon), reforge (affixes), salvage; forge overlay; unit tests for `forge.js` and shrine rules. **As built:** ore is one currency in iron-equivalents (`data/ores.js`, iron only until M7) dropped as pickups (`kind` 1 in the pickup pool; never merged, banked directly if the pool is full; `oreGain` scales the drop chance). Timeline one-offs live in `EVENTS` in `data/waves.js` (separate from `WAVES` segments) and run through `game/run-events.js`; shrines at 2:00, 4:00, 6:30 and 8:30. Shrines (`systems/shrines.js`) spawn just past the left or right view edge, because the view is tall and narrow (radius 40, channel 0.8 s, ttl 45 s, maxActive 1); `run.forgeReady` makes `game.js` open the forge after any pending level-ups. Forge modifiers use sources `forge:<id>:enh:<n>:*` and `forge:<id>:affix:<affix>` so a downgrade or reforge is a prefix removal. Smith pays 20% less ore (`CLASSES.smith.forge.costMult`); luck cuts the downgrade chance. Affix triggers live on `inst.extraTriggers`. Salvage is refused for the last weapon. **Deferred:** Combine (M7 evolutions), gold, reforge locks, mithril/starsteel. Debug keys: `F` spawns a shrine, `O` gives 20 ore; smoke test `--forge`. |
| **M7** *(done)* | Evolutions + boss + titles | 2 evolution recipes executed at the forge; a boss at 5:00 that drops starsteel and a shrine; 4 titles (milestone + offer). A full 10-minute run (`RUN.length = 600`) is winnable by surviving to the end and feels escalating. **As built:** *Evolutions* (`data/evolutions.js`, `game/evolution.js`): `storm_volley` (Ember Bow lv8 + Wind Sigil + 1 starsteel) and `colossus_maul` (Forge Hammer lv8 + Tempered Core lv2 + enhance +3 + 1 starsteel). Combine mutates the instance in place (same `instanceId`, so enhance levels and affixes carry over), removes the old weapon's level modifiers, resets to level 1 of the evolved weapon and re-inits its behavior. Evolved weapons are `pool: false`, rarity `evolved`, and level up (6 levels) once owned. The forge card lists each requirement with a check or cross. Not built: the 1.3x offer weight for recipe progress. *Boss*: `warlord` (hp 1800, not wave-scaled, `ai: 'boss_charge'`: chase 5 s, stand and flash 0.9 s, dash 0.7 s at 340 along the aimed line), spawned by the `boss` timeline event at 5:00 (`run.boss`, `run.bossAlive`, HUD bar, toast). On death it drops 2 starsteel (separate `run.starsteel` counter; ore types carry a `bank`), places a 90 s shrine on the spot even if another shrine is active, and grants Warbreaker. Killing it is not required to win. *Titles* (`data/titles.js`, `game/titles.js`): Slayer (1000 kills), Forgemaster (+5 enhance), Warbreaker (boss kill) are milestones; Unyielding (40% more damage under half HP) is an epic level-up offer (`title_new`). Titles appear as chips in the HUD and in the results. Title `triggers` are not implemented yet. Debug keys: `B` spawns the boss, `X` gives 2 starsteel; smoke test `--boss`. Boss hp and damage are first guesses to tune by playtest. |
| **M8** *(done)* | Polish for phone | PWA manifest + icons, pause menu, results screen with seed and stats, simple meta unlock (Berserker after first boss kill), save/load, audio blips, GitHub Pages deploy. **As built:** `manifest.webmanifest` (standalone, portrait, relative `start_url`/`scope` so the Pages subpath works), icons generated by `tools/make-icons.py` into `icons/` (192, 512, maskable, apple-touch), and `sw.js` (network-first for same-origin GETs with a cache fallback, so deploys show up immediately online and the game still loads offline after one visit; bump `CACHE` to flush). Save (`save/save.js`, injectable storage so it is tested): one versioned JSON key with last class, unlocked classes, bests, run/win/boss counts and the sound setting; corrupt or missing storage falls back to defaults and never throws. **No mid-run save** (runs are 10 minutes and auto-pause when hidden). God-mode (`?god=1`) runs never write to the save. Meta unlock: classes carry `unlock: { event: 'boss', hint }`; the Berserker (`rending_axe`, lifesteal 3%, 30% more damage under half HP, +10% speed) unlocks on the first Warlord kill; class select shows locked classes with the hint; `?unlock=all` opens them for testing without saving. Lifesteal is now a real stat (heals a share of damage dealt, scoped per weapon). Audio (`audio/audio.js`): synthesized WebAudio blips with per-sound rate limits, created on the first gesture (iOS); the sim only calls `run.sfx(name)` (a no-op default) so tests stay silent and deterministic. Rerolls and banishes (2 and 1 per run, `LEVELUP`): reroll redraws the offers; banish (toggle, then tap a card) removes that item id from the pool for the run, and an all-banished pool falls back to Rest. Title screen shows bests and a sound toggle; pause has the sound toggle; results show level, new-best markers, titles and unlocks. Smoke test `--ui`. |
| **M9** *(done)* | Measure and fix the basics | `tools/bench.mjs`; tight projectile volleys (`spread` + `gap`); Ember Bow, Spirit Blades, Rending Axe and Berserker tuning. See `docs/roadmap.md` "M9 as built". |
| **M10** *(done)* | Status effects | Design in `docs/design-m10-m13.md` §3. **As built:** three statuses on fixed enemy fields (`status` bit flags, `burnDps/burnT/burnAcc/burnSrc`, `chill/chillT/freezeT/freezeImm`, `shockT`, `slowMul`; `data/statuses.js`). **Burn**: each application adds `burnPower x hit` to a pool dealt evenly over 3 s in 0.25 s ticks (queued as `KIND_DOT`); re-applying pays out accrued damage at the old rate first, so the total always equals the pool. **Chill**: stacks slow 10% each; 4 stacks freeze (1 s), then 1.5 s freeze-immunity (stacks cap at 3); bosses cap at 2 stacks and never freeze. **Shock**: marks and, on a weapon hit (`KIND_HIT`), chains `chains` hops at `chainDamage` x the hit to the nearest un-hit enemies within 120 (hops are `KIND_PROC`, never chain again, and chain even if the hit killed its target). Damage queue entries carry a `kind` (HIT / PROC / DOT): DOT gets no lifesteal, statuses or hit/crit triggers but its kills still fire kill triggers. `game/hit.js#resolveHit` is the single weapon-hit entry (projectiles and direct hits). `flushDamage` order: target multiplier (`vsBurning/vsChilled/vsShocked`, read through the source weapon's tags) -> hp, knockback, number -> lifesteal -> status rolls -> crit/hit triggers -> death. 15 new stats (`burnChance` ... `executeBelow`; ricochet/split/executeBelow are defined but used from M11); `validate.js` forbids `when` on them. Weapons gain `baseMods` (their elemental identity, source `weapon:<id>:base:`, re-applied on evolve): Ember Bow burns (35%), Cinder Ward burns (25%, base damage 7 -> 6), Storm Javelin shocks (50%), Storm Volley both (30%/30%). Tag `lightning` renamed `storm`; melee, orbit and aura weapons gained `close`. New `nova` behavior and **Rime Shards** (frost: 6 shards in a ring, 100% chill, 2 stacks per hit). Status rings are drawn on every enemy (one path per colour; frozen enemies get a pale fill); chain bolts are a new fx kind. Deviations from the spec: no damage numbers for burn ticks (text is the expensive part); the `run.hitCtx` trigger context is deferred to M11b where payoffs need it. |
| **M11a** *(done)* | Perk engine + first 14 perks | Design in `docs/design-m10-m13.md` §4. **As built:** `data/perks.js` (same shape as passives: `levels`, `levelText`, plus `requires`, `affinity`, optional `rule`), `game/perks.js` (`addPerk`, `levelUpPerk`, `findPerk`, `meetsRequires`; sources `perk:<id>:<level>:`), `player.perks`, `run.rules`. `requires` is an AND of ORs over `tag:<t>` (owned weapon INSTANCE tags, so infusions count), `perk:<id>[:<minLevel>]` and `class:<id>`; unmet requirements keep a perk out of the pool. Offers: new kinds `perk_new` / `perk_up`; perks have no slot cap; matching `affinity` makes a perk 1.5x as likely; **first card rule**: when any weapon or passive can be upgraded, card 1 is one of those. `offerState` gained `perks` and `ownedTags`. Perks shipped: Kindling, Frostbite, Static Charge (enablers); Fan the Flames, Deep Freeze, Arc Conductor (amplifiers); Ricochet, Splitting Tips, Heavy Fletching, Volley (projectile); Long Reach, Echo Strike, Bloodletting (close); Keen Eye (crit). Projectiles read `ricochet`/`split`/`splitDamage` at spawn: a spent projectile with bounces left turns toward the nearest un-hit enemy within 180 (ttl topped up to 0.5 s); the first hit of a splitting projectile spawns children at 0.44 rad steps with the split damage, pierce 0, no split or bounce, skipping the enemy that spawned them. Lifesteal's fast path now checks for any lifesteal modifier (tag-scoped ones count). HUD shows a perk chip row. Bench bot scores perks. Deviation: 14 perks instead of 12 (the payoffs, alloys and Headsman are M11b). |
| **M11b** *(done)* | Payoffs, alloys, resonance | Design in `docs/design-m10-m13.md` §4. **As built:** rule perks (`run.rules[id]` = the current level's values; engine in `systems/status.js`): **Wildfire** (a burning enemy that dies adds `mult` x its remaining burn, split among the `n` nearest enemies within 90; 2/1.5, 3/1.75, 4/2.0), **Shatter** (a frozen enemy that dies deals `frac` of its max hp, 25/35/50%, to enemies within 70 as PROC damage), **Thunderclap** (a shocked enemy that dies chains 2/3/4 hops at 60% of the killing blow), and the alloys **Quench** (burning + chilled, in either order: both consumed, remaining burn x2/x3 dealt within 60), **Overload** (a chain hop landing on a burning enemy explodes within 60 for 50/80% of the hop and ignites what it hits), **Superconduct** (`resolveHit` forces a crit on chilled + shocked targets; level 2 adds +0.5 crit multiplier). Alloys need a source of BOTH elements (`requires` lists one per element). **Headsman** (needs Keen Eye or the Berserker): a crit that would leave a non-boss under `executeBelow` (12%, then 20%) of max hp kills it, computed in `flushDamage`. The flush takes a snapshot (`status`, `maxHp`, remaining burn) before `killEnemy` and calls `onStatusDeath`, so the planned `run.hitCtx` was not needed. **Resonance** (`data/resonance.js`, `game/resonance.js`): 2 weapons sharing a tag (instance tags) give tier I, 3 give tier II (cumulative), modifiers scoped to that tag; recomputed on add and evolve (M13 will also call it on infusion); the HUD shows labels like "Fire II". `tools/bench.mjs --builds` runs the design table's builds at a mid-run power level. First numbers (200 enemies at 3x hp, stationary player; Warlord duel): crowd clear 3.7-11.7 s across builds, boss 7.8-30.8 s; **Wildfire (3.7 s / 7.8 s) is the outlier** and the weak ends are Glacier and Reaper against a single target. Left for the M15 balance pass. |
| **M12** *(done)* | Elites and chests | Design in `docs/design-m10-m13.md` §6. **As built:** *Elites* (`data/elites.js`, `spawnElite`): a normal def with hp x8, radius x1.35, damage x1.5, xp x8, one affix: **Swift** (speed x1.45), **Warded** (half damage while above 50% hp; applied in `flushDamage`), **Regenerating** (3% max hp/s after 2 s unhit; in `enemy-ai.js`); gold pulsing ring and the affix name drawn above them; elites freeze for half as long. `EVENTS` gained 7 `elite` events (brutes at 1:30, 2:45, 4:00, 5:45, 7:00, 8:00, 9:00). *Chests*: pickup kind 2 (`value` = tier, 0 elite / 1 boss; `spawnChest`), never magnetised, collected by touch into `run.pendingChests` (a full pool queues it directly so it can never be lost); gold box in the world and an off-screen arrow in the HUD. The boss now banks its starsteel at once (no pickup) and drops a boss chest next to its shrine. `game/chests.js`: `chestCount` (elite 65/28/7% for 1/3/5 rolls, luck x(1+0.1 luck) on the big two, boss always 5, the first elite chest at least 3), `evolutionBlockers` (items that advance a recipe's unmet weapon level or passive level), pure `pickChestItem(state, rng, blockers, wantNew)` (weights weapon_up 1.5 / passive_up 1 / perk_up 1, x3 for a blocker; respects banishes), `openChest(run, tier)` which applies every roll through `applyOffer` and returns descriptors. A ready evolution (starsteel included) is performed as roll 1 (the jackpot). On 5-roll chests each roll after the first has a 12% chance to be a new weapon (at most one, only with a free slot, x1.5 for a shared element tag). With nothing left to improve a roll is +6 ore. `game.js` order: level-ups, then chests (`ui/treasure.js`: the count, then cards revealed 0.32 s apart, Collect), then the forge. Debug keys `C` (chest at your feet) and `E` (an elite); smoke test `--chest`. Bench bots detour to chests and open them (4-6 per run). |

After M8: see `docs/roadmap.md` (M9 onward: statuses, perks, elites and chests, reforge choice, more weapons and evolutions, balance, remaining classes).

---

## 11. How to extend (cheat sheet for agents)

- **New weapon with existing behavior** → add to `data/weapons.js`. Run tests (validation). Done.
- **New behavior** → `src/behaviors/<name>.js` + one line in `behaviors/index.js`. Read only via `ctx.stat()`; never touch StatBlock internals.
- **New passive/title/affix** → data only. If it needs non-stat behavior, add an effect to `effects/` and reference it via `triggers`.
- **New stat** → add to `STATS`, then read it where relevant. Don't hardcode numbers in systems that should be stats.
- **New condition** → `stats/conditions.js`.
- **New enemy / wave change** → `data/enemies.js`, `data/waves.js`.
- **Balance change** → data only; note it in the commit message.
- Keep files small (< ~300 lines). Prefer adding a file over growing one.
- Update this document when an interface here changes.

---

## 12. Decisions

Closed on 2026-10-12. Changing any of these means updating the sections cited.

| Question | Decision | Where |
|---|---|---|
| Orientation | **Portrait only**, phone-first. Desktop shows the same portrait-shaped view. | §1, §8 |
| Run length | **10 minutes**, kept short for mobile. One constant (`RUN.length`) rescales the whole timeline if it feels wrong. | §5.8 |
| Enhance failure | **Never destroys a weapon.** Worst case is losing one enhance level above +7 (tunable, can be set to 0). | §6.5 |
| Forge access | **Via shrine pickups**, from M6. Replaces timed auto-opens in the default timeline. | §6.3 |

Deferred beyond M8: Mage, Summoner and Saint, more enemies and biomes, balance passes, real art and music, gold, reforge locks, title triggers, the 1.3x offer weight for recipe progress.

Tuning knobs to revisit after playtesting (not blockers): `RUN.length`, `ENHANCE.downgradeChance`, shrine count and `ttl`.
