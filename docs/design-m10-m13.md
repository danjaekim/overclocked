# Design spec: M10–M13 (statuses, perks, chests, forge choices)

Written 2026-10-13 after M9. Audience: whoever implements M10 onward. This file is a **plan**; the
source of truth stays `docs/architecture.md`, which each implementing commit updates as usual. Numbers
here are first guesses with a reason attached. The M9 bench (`node tools/bench.mjs`) checks them,
and anything marked **[bench]** should be tuned there before anyone playtests it.

Contents
1. Review of the roadmap, and alternatives (read this first)
2. Revised milestone plan
3. Statuses and the on-hit pipeline (M10)
4. Perks: schema, offers, catalogue (M11a, M11b)
5. Builds: which combinations make which builds
6. Elites and chests (M12)
7. Forge choices: reforge pick-one, affix pool, tempers (M13)
8. Fit with existing code, file by file
9. Tests and bench additions
10. Decisions

---

## 1. Review of the roadmap, and alternatives

The roadmap's direction is right: survivors games get build variety from **statuses that other things
cash in**, plus many small modifiers. Copying that shape is fine, because players read it instantly.
Three problems with the plan as written, and four ideas that are more *Overforged* than copied:

### Problems

1. **Payoffs that are always offered dilute the pool.** With ~20 perks in the pool, level-up cards
   will often show "Shatter" to a fire build. Fix: payoff perks have **prerequisites**
   (`requires`) and only enter the pool once you own a source of the status they pay off. The pool
   grows as you commit, and that growth is the build guidance. This is the main structural change.
2. **Weapon levels get starved.** Weapons, passives and perks compete for 3 cards, so evolutions
   (weapon level 8) get *slower*, which is the opposite of what the chests are for. Fix: the
   **first card is always drawn from weapons/passives** when any are upgradable; cards 2 and 3 come
   from the full pool.
3. **"Damage vs burning" as a `when` condition doesn't fit the stat engine.** Conditions receive the
   run, not the target, and any `when` modifier turns off the stat cache for that stat. Fix: separate
   **target stats** (`vsBurning`, `vsChilled`, `vsShocked`) that the damage flush multiplies in only
   when the target has the status. These are plain modifiers, still data only, and they stay cached.

### Alternatives (recommended, in this order)

**A. Tempers: weapon variations live in the forge.** *(Recommended, M13.)* You said you want to
"build up a weapon and end up with different powerful variations". Today the +5 and +10 enhance
breakpoints are fixed bonuses. Make each one a **choice of two tempers** per weapon: at +5, the
Ember Bow becomes a *Longbow* (one heavy piercing arrow) or a *Shortbow* (more arrows, faster); at
+10, a *Flamebow* or a *Stormbow*. That gives per-weapon build forks for very little content (two
modifier sets per breakpoint), and it makes the forge, the game's hook, where builds get decided.
No survivors game I know does this. The closest thing is Hades' weapon aspects, which are chosen
before the run.

**B. Infusion changes a weapon's element tags.** *(Recommended, M13, comes free with the new affix
pool.)* An "Ember-touched" affix doesn't just add burn chance: it **adds the `fire` tag to that weapon
instance**, so every fire-scoped perk and resonance now applies to it. The Forge Hammer can join a
fire build. That's one line of engine work (rebuild `inst.tags`), and it makes reforge choices
matter in a way crit chance never will.

**C. Alloys: two-element reactions as perks.** *(Recommended, M11b.)* Instead of only single-element
payoffs (Shatter, Wildfire), three epic perks make *pairs* of elements react: fire + frost = **Quench**,
fire + storm = **Overload**, frost + storm = **Superconduct**. The forge theme names them (alloys).
They're gated perks, not always-on rules, so the screen stays readable on a phone and mixing
elements is a choice you make.

**D. Resonance: owning several weapons with one tag gives a set bonus.** *(Recommended, M11b,
small.)* It's like Teamfight Tactics traits: 2 or 3 owned weapons sharing `fire`, `frost`, `storm`,
`projectile` or `close` grant a bonus. It guides weapon picks without using any offer slots.
It's cheap: recompute when weapons change or are infused.

**What I'd not do:** always-on elemental reactions (too much to read at 300 enemies); resistances
or immune enemies (frustrating with random offers); a fourth physical status like bleed (crit and
execute already give physical builds their own payoff); a big perk count before the bench shows
the first 12 work.

---

## 2. Revised milestone plan

| # | Contents | Size |
|---|---|---|
| **M10** | Status layer (burn, chill/freeze, shock + chain), unified hit resolution, target stats, elemental identity for existing weapons, new frost weapon **Rime Shards** (`nova` behavior), the `close` tag. | one session |
| **M11a** | Perk engine: schema, `requires`, offers (first-card rule, affinity), HUD/levelup display. The 12 non-payoff perks (enablers, amplifiers, projectile, close, crit). Ricochet and split in the projectile pipeline. | one session |
| **M11b** | Payoff rules: Wildfire, Shatter, Thunderclap, Quench, Overload, Superconduct, Headsman (via `executeBelow`). Bloodletting. Resonance. | one session |
| **M12** | Elites (3 affixes), chests (1/3/5 rolls, evolution bias, chest-evolve jackpot), treasure overlay. | one session |
| **M13** | Forge choices: reforge one slot and pick 1 of 3, expanded affix pool with infusion tags, tempers at +5/+10. | one session |

M14 (weapons, recipes, fusion) and M15 (balance, classes) are unchanged. The **lock** from the old
M13 is dropped: reforging one slot at a time never touches the others, so there's nothing to lock.

---

## 3. Statuses and the on-hit pipeline (M10)

### 3.1 The three elements

One status per element. Each one has a clear job and a clear look:

| Element | Status | Job | Rule |
|---|---|---|---|
| fire | **Burn** | damage over time that stacks with hit rate | Each application adds `burnPower × hit damage` to a pool that is dealt evenly over the burn duration. The duration refreshes; the pool adds up. |
| frost | **Chill → Freeze** | control | Each application adds `chillStacks` stacks (max 4). Slow 10% per stack. At 4 stacks the enemy **freezes**: it stops for 1.0 s, then its chill clears and it is freeze-immune for 1.5 s (no permanent lock). |
| storm | **Shock** | spread to nearby enemies | Applying shock marks the enemy (2 s) and fires a **chain arc**: it jumps to the nearest un-hit enemy within 120 units, `chains` times, each hop dealing `chainDamage × hit damage`. Chain hops shock their targets but don't chain again. |

Burn math (no stacks array, two fields):
```
on apply:  remaining = e.burnDps * e.burnT
           e.burnT   = BURN.duration * statusDuration
           e.burnDps = (remaining + burnPower * hitAmount) / e.burnT
tick:      every BURN.tickEvery (0.25 s), staggered by uid, queue e.burnDps * 0.25 as DoT damage
```
Fast weapons and big hits both feed fire, so attack speed and damage perks both help burn builds.

Bosses can't freeze; their chill caps at 2 stacks (20% slow). Elites freeze for half as long.

### 3.2 Constants (`src/data/statuses.js`, new)

```js
export const BURN   = { duration: 3, tickEvery: 0.25, color: '#ff8a3c' };
export const CHILL  = { maxStacks: 4, slowPerStack: 0.10, duration: 2.5, freezeTime: 1.0,
                        freezeImmune: 1.5, bossMaxStacks: 2, eliteFreezeMult: 0.5, color: '#7fd4ff' };
export const SHOCK  = { duration: 2, chainRange: 120, maxHops: 8, color: '#ffe066' };
```

### 3.3 New stats (`stat-defs.js`)

All of these are read through a weapon's tag scope, so a perk can say "fire weapons only".

| Stat | Base | Fmt | Meaning |
|---|---|---|---|
| `burnChance` `chillChance` `shockChance` | 0 (max 1) | pct | chance per hit to apply the status |
| `burnPower` | 0.5 | pct | share of the hit's damage added to the burn pool |
| `chillStacks` | 1 | int | chill stacks per application |
| `chains` | 1 | int | hops per shock |
| `chainDamage` | 0.5 | pct | each hop's damage as a share of the hit |
| `statusDuration` | 1 | pct | multiplies burn, chill, freeze and shock durations |
| `vsBurning` `vsChilled` `vsShocked` | 1 | pct | damage multiplier against a target with that status (chilled includes frozen) |
| `ricochet` | 0 | int | (M11a) bounces after pierce runs out |
| `split` | 0 | int | (M11a) child projectiles on first hit |
| `splitDamage` | 0.4 | pct | (M11a) child damage as a share of the parent's |
| `executeBelow` | 0 | pct | (M11b) a crit against a non-boss under this hp fraction kills it |

Validation: these stats must never carry a `when` condition. They're read on every hit and must stay
cached.

### 3.4 Elemental identity for existing weapons

A new optional weapon field, `baseMods`: modifiers applied at `addWeapon` with the instance tag
(source `weapon:<id>:base:`). Each weapon's element lives in data, just like level modifiers.

| Weapon | Tags added | baseMods | Note |
|---|---|---|---|
| ember_bow | (has fire) | burnChance +0.35 | fire Archer from minute one |
| cinder_ward | `close` | burnChance +0.25 | it's already strong; base damage 7 → 6 **[bench]** |
| storm_javelin | (has lightning → rename the tag to `storm`) | shockChance +0.5 | pierce + chain = the crowd answer |
| storm_volley | (fire, storm) | burnChance +0.3, shockChance +0.3 | evolved: both, which sets up Overload |
| forge_hammer, rending_axe, colossus_maul | `close` | none | physical: crit and execute builds, or infused in M13 |
| spirit_blades | `close` | none | light/neutral |

Rename `lightning` to `storm` everywhere; one element name per element keeps `requires` simple.

### 3.5 New weapon: Rime Shards (frost)

A new `nova` behavior: fires `count` projectiles evenly around 360° (rotated by a random offset each
volley), only when an enemy is within `range`. It reuses `spawnProjectile`, so pierce, ricochet and
split work for free. About 30 lines.

```js
rime_shards: {
  name: 'Rime Shards', desc: 'Bursts of ice shards in every direction. Chills what they hit.',
  class: null, glyph: 'R', rarity: 'uncommon',
  tags: ['projectile', 'frost'], behavior: 'nova',
  base: { damage: 8, cooldown: 1.4, speed: 300, count: 6, pierce: 0, ttl: 0.7, radius: 6, range: 220 },
  baseMods: [{ stat: 'chillChance', op: 'flat', value: 1 }, { stat: 'chillStacks', op: 'flat', value: 1 }],
  maxLevel: 8,
  levels: [
    [{ stat: 'damage', op: 'inc', value: 0.25 }],
    [{ stat: 'projectiles', op: 'flat', value: 2 }],
    [{ stat: 'cooldown', op: 'inc', value: -0.15 }],
    [{ stat: 'pierce', op: 'flat', value: 1 }],
    [{ stat: 'projectiles', op: 'flat', value: 2 }],
    [{ stat: 'damage', op: 'inc', value: 0.35 }],
    [{ stat: 'damage', op: 'more', value: 0.3 }],
  ],
  levelText: ['+25% damage', '+2 shards', '-15% cooldown', '+1 pierce', '+2 shards', '+35% damage', '30% more damage'],
  triggers: [], evolvesInto: null,
},
```
It applies 2 stacks per hit, so two hits within 2.5 s freeze an enemy. It's deliberately weak on
damage: it's the frost *enabler*, not a carry.

### 3.6 The on-hit pipeline

Today crit and knockback are computed in two places (`collision.js` for projectiles,
`hit.js#strike` for direct hits). They merge into one function, and the queue gains a **kind**:

| kind | Source | Target mult | Lifesteal | Applies statuses | Chains | hit/crit triggers | Kill: triggers + payoffs |
|---|---|---|---|---|---|---|---|
| 0 `HIT` | weapon hits (projectile, arc, orbit, aura, nova) | yes | yes | yes | yes | yes | yes |
| 1 `PROC` | explode, chain hop, payoff bursts | yes | yes | yes | no | yes (depth-capped as now) | yes |
| 2 `DOT` | burn ticks | yes | no | no | no | no | yes |

`game/hit.js` becomes the single entry point for weapon damage:
```js
// e: target, base: pre-crit damage. Rolls crit (target-aware), knockback, queues kind HIT.
export function resolveHit(run, inst, e, base, dx, dy)
```
`collision.js` calls it instead of its own copy. Crit is target-aware here because Superconduct
(M11b) makes chilled + shocked targets always crit.

`systems/damage.js#flushDamage`, per entry, in this order:
1. Skip if dead or the slot was reused (as now).
2. `amount *= targetMult(e, src)`: a product of `vsBurning` / `vsChilled` / `vsShocked` for the
   statuses the target has, read through `src.tags`, plus the elite *Warded* factor (§6.1). DoT
   entries use `e.burnSrc` as their scope.
3. Execute (M11b): if crit and `executeBelow > 0` and the target is not a boss, and
   `(hp - amount) / maxHp < executeBelow`, set `amount = hp`.
4. Apply hp, flash, knockback and a damage number. DoT numbers are small and orange, and only
   shown when ≥ 1.
5. Lifesteal (kinds 0, 1).
6. Statuses (kinds 0, 1): roll `burnChance`, `chillChance`, `shockChance` with the sim rng and call
   `applyStatus(run, e, element, src, amount, depth, kind)`. A shock with kind 0 runs the chain.
7. crit/hit triggers (kinds 0, 1), as now.
8. Death: snapshot `mask = e.status` and `maxHp` **before** `killEnemy`, then `killEnemy`, then
   `onStatusDeath(run, ctx)` (payoffs, M11b), then kill triggers.

**Trigger context.** `fireTriggers(run, on, src, x, y, depth)` grows to take a preallocated
`run.hitCtx = { x, y, depth, src, mask, maxHp, amount }`, filled and reused per event, so payoffs
can read what the dead enemy was carrying without allocating.

**Tick order.** Status update goes **before** the flush (between steps 7 and 8). Burn kills then
resolve in the same tick, and statuses applied during the flush tick on the next frame. Update §3.3
of the architecture doc to match.

### 3.7 `systems/status.js` (new)

```js
export function applyStatus(run, e, element, src, hitAmount, depth, kind)  // M11b alloys hook in here
export function updateStatuses(run, dt)   // timers, slowMul, burn ticks (4 Hz, staggered by uid)
export function statusMask(e)             // bit flags: 1 burning, 2 chilled, 4 frozen, 8 shocked
export function chainArc(run, e, src, hitAmount, depth)  // nearest-unvisited hop, fixed uid buffer
```

New enemy fields (initialised in `makeEnemy`, reset in `spawnEnemy`):
`burnDps, burnT, burnAcc, burnSrc, chill, chillT, freezeT, freezeImm, shockT, slowMul, status,
elite, eliteAffix, lastHitT`.

`enemy-ai.js` multiplies speed by `e.slowMul`, and frozen enemies don't move (knockback still
applies). The boss's charge timers pause while it's slowed past 50%. It can't freeze.

**Rendering.** Rings go on **every** enemy (Dan's call; revisit if it gets busy or costs frames at
300+ enemies). After the enemy batch, a second pass draws status rings: one `beginPath` per status
color (orange burning, blue chilled, white-filled frozen, yellow shocked). That's at most 4 extra
fills, culled the same way as the main batch. Chain arcs are a new fx kind, a jagged line with
ttl 0.12 s, in the existing fx pool.

**Perf.** Each status check is `if (e.status === 0)` on the fast path. Burn ticks are at most about
150 queue entries per tick at 600 burning enemies, well under the 1024 cap. Each hit adds 3 `getFor`
calls, which are cached Map lookups.

---

## 4. Perks (M11a, M11b)

Passives are **gear**: 6 slots, 5 levels, and evolution recipes need them. Perks are
**techniques**: no slot cap, 1–3 levels each, and most need a weapon tag or another perk. The UI can
call them "Techniques" for flavor; the code says `perks`.

### 4.1 Schema (`src/data/perks.js`)

```js
export const PERKS = {
  shatter: {
    name: 'Shatter',
    desc: 'Frozen enemies burst into ice when they die.',
    rarity: 'rare',
    maxLevel: 3,
    // AND of ORs. Each inner list is satisfied by any one entry:
    //   'tag:<t>'       you own a weapon instance with tag t (instance tags: infusions count)
    //   'perk:<id>'     you own that perk (optionally 'perk:<id>:<minLevel>')
    //   'class:<id>'
    requires: [['tag:frost', 'perk:frostbite']],
    affinity: ['frost'],            // owned-weapon tags that raise the offer weight (x1.5)
    levels: [ [], [], [] ],         // modifiers per level (index 0 = level 1); may be empty
    levelText: ['...', '...', '...'],
    rule: { id: 'shatter', values: [{ frac: 0.25 }, { frac: 0.35 }, { frac: 0.5 }] },   // optional
  },
};
```

- `levels` are modifiers, exactly like passives (source `perk:<id>:<lvl>:`; trailing colon as usual).
- `rule` drives the engine payoffs: `run.rules[rule.id] = values[level - 1]` on gain or level-up,
  `null` when not owned. Engine code checks `run.rules.shatter` and reads its numbers from there. No
  per-hit allocation, and the numbers stay data.
- `triggers` (generic, global, tag-filtered) is **reserved** in the schema but unused in the first
  catalogue. Every payoff below is a rule, which keeps them testable and cheap.
- `validate.js`: `levels.length === maxLevel`, `levelText.length === maxLevel`, `requires` entries
  parse and reference real tags/perks/classes, `rule.values.length === maxLevel`, `rule.id` is
  known to `status.js` / `damage.js`.

### 4.2 Offers

- `offerState` gains `perks: [{id, level}]` and `ownedTags`, the union of **instance** tags.
- New candidate kinds: `perk_new` and `perk_up`. A perk is a candidate only if its `requires` hold.
- Weight = rarity weight × luck (as now) × 1.5 if owned (as now) × **1.5 if `affinity` intersects
  `ownedTags`**.
- **First-card rule:** card 1 is drawn from weapon/passive candidates when any exist. Cards 2–3 come
  from everything left. Reroll keeps the rule. Banish works on perks too.
- `applyOffer` handles both perk kinds through `game/perks.js` (`addPerk`, `levelUpPerk`).
- Tests stay pure: same state + same seed gives the same offers. A perk never appears before its
  requirements hold. Card 1 is an item whenever one is available.

### 4.3 Catalogue (21 perks)

Notation: `+x tag` means a modifier scoped to weapons with that tag. Unscoped means all weapons.

**Element enablers** (common, no requirements: any build can pick up an element)

| Perk | Lv | Per level | Total at max |
|---|---|---|---|
| **Kindling** | 3 | burnChance +0.10, burnPower +0.10 | 30% burn chance on every weapon, power 0.8 |
| **Frostbite** | 3 | chillChance +0.12; L3 also chillStacks +1 | 36% chill, 2 stacks |
| **Static Charge** | 3 | shockChance +0.08; L2 also chains +1 | 24% shock, 2 hops |

**Element amplifiers** (uncommon)

| Perk | Lv | Requires | Per level |
|---|---|---|---|
| **Fan the Flames** | 3 | tag:fire or perk:kindling | vsBurning inc +0.20; L3 also burnPower +0.25 |
| **Deep Freeze** | 3 | tag:frost or perk:frostbite | vsChilled inc +0.15; L2 also statusDuration inc +0.2 (scoped `frost`) |
| **Arc Conductor** | 3 | tag:storm or perk:static_charge | chains +1, chainDamage +0.10 |

**Single-element payoffs** (rare, rules)

| Perk | Lv | Requires | Rule (values per level) |
|---|---|---|---|
| **Wildfire** | 3 | fire source | A burning enemy that dies passes its remaining burn ×(1.5 / 1.75 / 2.0) on to the (2 / 3 / 4) nearest enemies within 90, split evenly. Spread burns can spread again (depth cap 3). |
| **Shatter** | 3 | frost source | A frozen enemy that dies bursts: (25 / 35 / 50)% of its max hp as PROC damage to enemies within 70, which also adds 1 chill stack. Max-hp based, so it keeps up with wave hp scaling. |
| **Thunderclap** | 3 | storm source | A shocked enemy that dies fires a chain of (2 / 3 / 4) hops at 60% of the killing hit. |

"Fire source" = `['tag:fire', 'perk:kindling']`; same pattern for frost and storm.

**Alloys** (epic, rules, need **two** element sources)

| Perk | Lv | Requires | Rule |
|---|---|---|---|
| **Quench** | 2 | fire source **and** frost source | Chilling a burning enemy (or burning a chilled one) consumes both statuses and deals the remaining burn ×(2 / 3) instantly to everything within 60. Steam burst fx. |
| **Overload** | 2 | fire source **and** storm source | A chain hop that lands on a burning enemy explodes: radius 60, (50 / 80)% of the hop's damage, and applies burn to everything it hits. |
| **Superconduct** | 2 | frost source **and** storm source | Hits on an enemy that is chilled **and** shocked always crit; L2 also +0.5 crit multiplier against them. |

**Projectile** (affinity `projectile`; require `tag:projectile`)

| Perk | Lv | Rarity | Per level |
|---|---|---|---|
| **Ricochet** | 3 | uncommon | ricochet +1 (projectile). A projectile whose pierce is used up turns toward the nearest un-hit enemy within 180 instead of dying; ttl tops up to 0.5 s. |
| **Splitting Tips** | 3 | uncommon | L1 split +2; L2 splitDamage +0.2; L3 split +1. On its first enemy hit, a projectile spawns `split` children at ±25° steps, with pierce 0, no split, and no ricochet. |
| **Heavy Fletching** | 3 | common | area inc +0.20 (projectile), knockback inc +0.15 (projectile). Bigger shots. |
| **Volley** | 2 | rare | projectiles +1 (projectile) |

**Close range** (affinity `close`; require `tag:close`)

| Perk | Lv | Rarity | Per level |
|---|---|---|---|
| **Long Reach** | 3 | common | area inc +0.15 (close) |
| **Echo Strike** | 2 | rare | projectiles +1 (arc) and +1 (orbit): an extra swing or blade. Requires tag:arc or tag:orbit. |

**Crit and physical**

| Perk | Lv | Rarity | Requires | Per level |
|---|---|---|---|---|
| **Keen Eye** | 3 | common | none | critChance +0.05; L3 also critMult +0.25 |
| **Headsman** | 2 | rare | perk:keen_eye or class:berserker | executeBelow +0.12 / +0.08 (total 20%); never bosses |
| **Bloodletting** | 3 | uncommon | tag:close | lifesteal +0.01 (close); L3 also maxHp inc +0.10 |

That's 21 perks and 57 perk levels. A run gets about 25 level-ups, and with the first-card rule
roughly 8–12 go to perks. So a run can max one or two lines and dip into a payoff, which forces a
direction. That's the point.

### 4.4 Resonance (M11b)

`game/resonance.js` recomputes when weapons are added, evolved or infused. It counts owned instances
per tag and installs modifiers with source `resonance:` (removed and re-added each time).

| Tag | 2 weapons | 3 weapons |
|---|---|---|
| fire | burnPower +0.25 | vsBurning more +0.10 |
| frost | chillStacks +1 | statusDuration inc +0.25 (frost) |
| storm | chains +1 | chainDamage +0.15 |
| projectile | — | pierce +1 (projectile) |
| close | — | area inc +0.15 (close) |

HUD: a small chip per active resonance, next to the titles.

---

## 5. Builds: which combinations make which builds

A "build" here = an engine (where the damage comes from) plus a multiplier plus, usually, a payoff.
Each row should carry a full run once tuned. **[bench]**: add a bot scenario per row (§9).

| Build | Core weapons | Perks | Why it works | Fits |
|---|---|---|---|---|
| **Wildfire** | Ember Bow, Cinder Ward | Kindling, Fan the Flames, Wildfire, Volley | Arrows ignite; burning deaths spread the pool through the crowd; Fan the Flames multiplies hits and ticks | Archer |
| **Glacier** | Rime Shards, Forge Hammer | Frostbite, Deep Freeze, Shatter, Long Reach | Shards freeze the ring around you; hammer kills frozen enemies; shatter chains through the pack | Smith |
| **Storm chain** | Storm Javelin, Ember Bow | Static Charge, Arc Conductor, Thunderclap, Ricochet | Piercing javelins shock lines; arcs and ricochets reach what arrows miss: the Archer's crowd answer | Archer |
| **Steam engine** | Cinder Ward, Rime Shards | Kindling, Frostbite, Quench, Long Reach | Burn and chill both land near you; every overlap is an instant AoE burst | Smith |
| **Overload** | Storm Volley (evolved) | Kindling, Arc Conductor, Overload, Fan the Flames | The evolved bow burns *and* shocks; every chain hop on a burning target explodes and re-ignites | Archer late |
| **Superconductor** | Rime Shards, Storm Javelin | Frostbite, Static Charge, Superconduct, Keen Eye, Headsman | Chilled + shocked = guaranteed crits; Headsman turns crits into executes | any |
| **Splinter volley** | Ember Bow | Ricochet, Splitting Tips, Volley, Heavy Fletching, Keen Eye | Pure physical projectiles: every arrow becomes 3–4 hits; crit scales it | Archer |
| **Reaper** | Rending Axe, Spirit Blades | Echo Strike, Long Reach, Bloodletting, Keen Eye, Headsman | Wide double swings, lifesteal sustain, executes; Unyielding title fits | Berserker |
| **Infused hammer** *(M13)* | Forge Hammer + Ember-touched affix + Flamebow temper | Kindling, Fan the Flames, Wildfire | The forge turns a physical weapon into a fire weapon; shows the forge is the build tool | Smith |

**Checks this table implies:**
- Every class has ≥ 2 builds that use its start weapon.
- Every payoff appears in ≥ 1 build.
- No build needs a specific evolution to come online before 5:00.

---

## 6. Elites and chests (M12)

### 6.1 Elites

An elite is a normal enemy def spawned with the `elite` flag. It isn't a new enemy type, so new
enemies get elite versions for free.

```js
// data/elites.js
export const ELITE = {
  hpMult: 8, radiusMult: 1.35, damageMult: 1.5, xpMult: 8,
  freezeMult: 0.5,                 // freeze lasts half as long
  affixes: {
    swift:        { name: 'Swift',        speedMult: 1.45 },
    warded:       { name: 'Warded',       damageTaken: 0.5, untilHpFrac: 0.5 },   // takes half damage above 50% hp
    regenerating: { name: 'Regenerating', regenFrac: 0.03, delay: 2 },             // 3% max hp/s, 2 s after its last hit
  },
};
```
- An elite brute at 1:30 has 80 × 8 × 1.2 = 768 hp: about 15 s for one L4 weapon, 6–8 s for a
  normal build. **[bench]**
- Look: radius ×1.35, a pulsing gold outline, the affix name over its head, and the off-screen arrow
  (reuse the shrine arrow).
- Timeline (`EVENTS`, authored against 600 s): `elite` at 90, 165, 240, 345, 420, 480, 540, using
  enemy `brute` and a random affix from the sim rng. That's 7 elites plus the boss.
- Death drops one **chest** pickup (pickup kind `chest`: no magnet, never expires, collected on
  touch, off-screen arrow while it exists).

### 6.2 Chest rolls

`game/chests.js` is **pure**, like `upgrades.js`:

```js
// tier: 'elite' | 'boss'. state: offerState(run) + { starsteel, chestsOpened }.
export function rollChest(state, rng, tier) -> { count, rolls: [{ kind, id, instanceId?, toLevel }] }
```

**Roll count**

| Tier | 1 roll | 3 rolls | 5 rolls |
|---|---|---|---|
| elite | 65 | 28 | 7 |
| boss | — | — | always 5 |

- Luck multiplies the 3 and 5 weights by `(1 + 0.1 × luck)`.
- The **first elite chest of a run is at least 3**, so new players see the jackpot early.

**Each roll**
- Picks one *upgrade of something owned*: `weapon_up`, `passive_up` or `perk_up`. Chests mostly
  deepen a build, so a chest rarely undoes a deliberate one.
- **New-weapon roll (5-roll chests only).** If a weapon slot is free, each roll after the first
  has a **12% chance** to be a `weapon_new` instead. At most one per chest, so a 5-roll chest
  gives a new weapon about 40% of the time (1 − 0.88⁴). The weapon is drawn like a level-up
  offer: class filter, rarity weights, luck, banishes respected, and ×1.5 if it shares an element
  tag with an owned weapon (so it tends to feed resonance). It arrives at level 1, and later rolls
  in the same chest can level it. **[playtest]**: if it feels like too much, lower the 12%; if it
  never feels like it happens, raise it or allow it on 3-roll chests.
- Rolls are sequential on a copy of the state, so the same item can be rolled twice and maxed items
  drop out.
- Weights: weapon_up 1.5, passive_up 1.0, perk_up 1.0, **×3 if the item blocks an available
  evolution**. "Blocks" means `evolution.checklist()` for some recipe whose `from` weapon you own
  has an unmet `weaponLevel` or `passive.minLevel` entry that this upgrade advances.
- If nothing is upgradable, a roll becomes **+6 ore**.

**Jackpot.** If, when the chest opens, any recipe's checklist is fully met (starsteel included),
roll 1 is replaced by **that evolution**, performed through `evolution.evolve()`. One per chest.
The boss chest plus the boss's starsteel makes this the 5:00 moment. So the boss's starsteel must be
credited **before** its chest can be opened: credit `run.starsteel` directly on the boss's death
instead of dropping pickups.

**Flow** (`game.js` state machine):
- Pending order is level-ups → chests → forge.
- `run.pendingChests` is a list of tiers.
- The treasure overlay (`ui/treasure.js`) shows the count big ("×3"). It reveals each roll as a
  card, 0.3 s apart (tap to skip), applies each through `applyOffer` (and `evolve` for the jackpot),
  then shows "Collect".
- Sfx: a rising tone per roll, and a chord on a 5.

Tests:
- Same seed and state give the same rolls.
- The count distribution over 10k seeds stays within ±2% of the weights.
- No roll exceeds `maxLevel`.
- Blocked-evolution items are picked about 3× as often.
- The jackpot fires only when the checklist is fully met, and spends starsteel.
- The first elite chest is never 1.
- Never more than one new weapon per chest; none when weapon slots are full; never on 1- or
  3-roll chests.

---

## 7. Forge choices (M13)

### 7.1 Reforge: one slot, pick 1 of 3

Slots per rarity stay as now (`REFORGE.affixCount`).

1. The player opens a weapon and taps **Reforge** on a slot (empty slots fill first and are
   offered first).
2. Ore is charged now (cost as today, rising per reforge of that weapon). `rollReforge(run, inst,
   slot)` draws **3 distinct** affixes from the eligible pool. The pool excludes affixes on the
   weapon's other slots, and **at least one of the three is uncommon or better**.
3. The three options are stored on the instance (`inst.pendingReforge = { slot, options }`) until
   the player picks. Closing and reopening the forge shows the same three, so there's no free
   reroll by backing out.
4. **Pick one**: it replaces that slot (old modifiers and triggers removed, new ones added, instance
   tags rebuilt). Or **Keep current**, which costs nothing more and clears the pending roll.

`reforge()` becomes `rollReforge()` + `applyReforge(run, inst, choiceIndex)`. The existing tests
change shape but keep their invariants: only eligible affixes, old ones removed, cost rises.

### 7.2 Affix pool (19)

`addTags` is new: on apply, the instance gains those tags (`inst.tags = makeTags([...def.tags,
...affixTags, instanceTag])`), and `offerState.ownedTags` reflects them. On removal the tags go
away again.

| Affix | Rarity | Requires | Effect |
|---|---|---|---|
| Keen, Swift, Heavy, Wide, Shoving | common | — | as now |
| Piercing | uncommon | projectile | as now |
| Brutal | uncommon | — | as now |
| **Ember-touched** | uncommon | — | burnChance +0.25, **adds `fire`** |
| **Rime-touched** | uncommon | — | chillChance +0.25, **adds `frost`** |
| **Storm-touched** | uncommon | — | shockChance +0.20, **adds `storm`** |
| Twin | rare | projectile/orbit/arc | as now |
| Volatile | rare | — | as now |
| **Ricocheting** | rare | projectile | ricochet +2 |
| **Splitting** | rare | projectile | split +2 |
| **Conductive** | rare | storm | chains +1, chainDamage +0.15 |
| **Searing** | rare | fire | vsBurning inc +0.40 |
| **Vampiric** | rare | — | lifesteal +0.02 |
| **Executioner** | epic | — | executeBelow +0.15 |
| **Colossal** | epic | — | area more +0.30 |

Rarity weights for rolls: 100 / 60 / 30 / 10, with luck scaling as in `RARITIES`. An "only one
element infusion per weapon" rule keeps a weapon's identity readable: rolling a second infusion
while one is on another slot is excluded.

### 7.3 Tempers (+5 and +10)

When a weapon reaches enhance +5 or +10, the forge shows **two temper cards** for that weapon, and
the player picks one. That choice replaces today's fixed breakpoint bonus for that weapon.
`data/forge.js` keeps generic defaults for weapons without their own:

```js
ENHANCE.tempers = {
  5:  [ { id: 'honed',  name: 'Honed',  mods: [{ stat: 'damage', op: 'more', value: 0.2 }] },
        { id: 'hasted', name: 'Hasted', mods: [{ stat: 'cooldown', op: 'inc', value: -0.2 }] } ],
  10: [ { id: 'mighty', name: 'Mighty', mods: [{ stat: 'damage', op: 'more', value: 0.3 }] },
        { id: 'vast',   name: 'Vast',   mods: [{ stat: 'area', op: 'more', value: 0.3 }, { stat: 'projectiles', op: 'flat', value: 1 }] } ],
};
```

Per-weapon tempers (in `weapons.js`, `forge.tempers`):

| Weapon | +5 option A | +5 option B | +10 option A | +10 option B |
|---|---|---|---|---|
| Ember Bow | **Longbow**: projectiles −1 (min 1), pierce +2, projSpeed inc +0.4, damage more +0.6 | **Shortbow**: projectiles +1, cooldown inc −0.25 | **Flamebow**: burnChance +0.5, burnPower +0.3, adds fire | **Stormbow**: shockChance +0.4, chains +1, adds storm |
| Forge Hammer | **Maul grip**: damage more +0.4, cooldown inc +0.15 | **Twin hammers**: projectiles +1 | **Molten**: burnChance +0.6, adds fire | **Quake**: area more +0.4, knockback inc +0.5 |
| Rending Axe | **Cleaver**: critMult +0.5 | **Whirl**: projectiles +1, arcWidth via area inc +0.2 | **Bloodaxe**: lifesteal +0.02, executeBelow +0.1 | **Frostbite axe**: chillChance +0.6, adds frost |
| Storm Javelin | **Harpoon**: pierce +3, damage more +0.25 | **Bundle**: projectiles +2 | **Thunderhead**: chains +2 | **Ice lance**: chillChance +0.7, chillStacks +1, adds frost |

Stored as `inst.tempers = { 5: 'longbow' }` and applied as modifiers with source
`forge:<id>:temper:<lvl>:`. A **downgrade below +5 removes the temper**; reaching +5 again offers the
choice again. Tempers are what make two Ember Bows in two runs feel like different weapons.

---

## 8. Fit with existing code, file by file

**M10**
- `data/statuses.js` (new): constants. `data/stat-defs.js`: the 15 new stats (§3.3; ricochet,
  split, splitDamage and executeBelow can wait until they're used).
- `data/weapons.js`: `baseMods`, `close` tag, `lightning` → `storm`, Rime Shards.
  `data/validate.js`: baseMods, no `when` on status stats.
- `game/weapons.js#addWeapon`: apply `baseMods` with source `weapon:<id>:base:`.
  `evolution.evolve` removes and re-applies them.
- `behaviors/nova.js` (new), registered in `behaviors/index.js`.
- `game/hit.js`: `resolveHit` (target-aware crit). `systems/collision.js` calls it.
- `systems/damage-queue.js`: `kind` Uint8Array; `queueDamage(..., kind = 0)`.
- `systems/damage.js`: the flush order of §3.6; `targetMult`; status rolls; mask snapshot before
  `killEnemy`.
- `systems/status.js` (new). `game/run.js`: call `updateStatuses` before `flushDamage`.
  `game/world.js#makeEnemy` and `director.js#spawnEnemy`: the new fields.
- `game/triggers.js` and `effects/index.js`: switch to the `run.hitCtx` context.
  `effects.explode` queues kind PROC.
- `systems/enemy-ai.js`: `slowMul`, freeze.
- `render/entities.js`: status ring pass. `render/fx.js`: arc fx.
- Docs: architecture §3.3 tick order, §4.1 stats, §4.6 hit kinds, §5.1 baseMods.

**M11a**
- `data/perks.js` (new), `game/perks.js` (new: add, level up, `run.rules`).
- `game/upgrades.js`: perk candidates, `requires` evaluation, affinity, first-card rule.
- `game/apply-offer.js`: perk kinds; `offerState` with perks and `ownedTags`.
- Projectile fields `ricochet`, `split`, `child`; `game/projectiles.js` grows a
  `spawnChild(run, parent, angle)`; ricochet and split handling in `collision.js` after a hit.
- `ui/levelup.js`: perk card style (a distinct border color and a "Technique" label). `ui/pause.js`
  lists owned perks.
- `tools/bench.mjs`: the bot can pick perks (`scoreOffer` knows perk kinds).

**M11b**
- `systems/status.js`: `onStatusDeath` (Wildfire, Shatter, Thunderclap), alloy hooks inside
  `applyStatus` (Quench) and `chainArc` (Overload). `game/hit.js`: Superconduct in the crit roll.
  `damage.js`: execute.
- `game/resonance.js`, plus a HUD chip.

**M12**
- `data/elites.js` (new). `data/waves.js`: `elite` events. `director.js`: spawn an elite (flag,
  multipliers, affix). `damage.js`: Warded in `targetMult`, regen in `status.js`, elite death drops
  a chest, boss starsteel credited directly.
- `systems/pickups.js`: kind `chest`.
- `game/chests.js` (new, pure). `ui/treasure.js` (new). `game/game.js`: the pending-chests state.
- `render/hud.js`: chest and elite off-screen arrows. Audio: chest sfx.

**M13**
- `data/forge.js`: new affixes, `addTags`, `ENHANCE.tempers`. `data/weapons.js`: per-weapon tempers.
- `game/forge.js`: `rollReforge` / `applyReforge`; temper application at +5/+10; tag rebuild helper
  `rebuildTags(inst)`; downgrade removes the temper.
- `ui/forge.js`: slot list, the three reforge cards, temper cards.

---

## 9. Tests and bench additions

**Unit tests** (one file per milestone, `tests/m10.test.mjs` and so on)
- Burn pool: two applications sum. Total burn damage dealt equals the sum of the pool to within 1%.
- Chill: 4 stacks freeze; freeze then immunity; a boss never freezes and caps at 2 stacks.
- Chain: hops ≤ `chains`, never hits the same enemy twice, and stops when nothing is in range.
- Hit kinds: DoT never fires hit triggers or lifesteal, but does fire kill payoffs.
- `vsBurning` applies only to burning targets, and the cache stays valid (`conditional` count 0).
- Perks: `requires` gating, the first-card rule, affinity weighting (statistical, 10k draws), rules
  installed per level.
- Payoffs: one test per rule with a hand-placed scene, like the existing explode-chain test.
- Chests: §6.2.
- Reforge: §7.1 invariants.
- Tempers: +5 choice applied; a downgrade below +5 removes it and the next +5 offers it again.

**Bench** (`tools/bench.mjs`)
- `--statuses`: single-target and crowd numbers for each weapon with 0 / 1 / 3 levels of its
  element enabler.
- `--builds`: each §5 row as a scripted loadout (weapons, perks and levels set directly at 2:00,
  5:00 and 8:00 power levels), then a 60 s crowd and a boss duel. The target is every build within
  2× of the median. That's the M15 gate, but it shows outliers early.
- Bot `scoreOffer`: +2 for a perk whose `affinity` matches owned tags, +4 for a payoff whose
  requirements just became met.

---

## 10. Decisions (Dan, 2026-10-13)

1. **Tempers:** in (M13).
2. **Infusion, alloys:** in (M13, M11b).
3. **Resonance:** in (M11b).
4. **Chests:** favour upgrades; 5-roll chests can include one new weapon (§6.2).
5. **Status visuals:** rings on every enemy to start; adjust if they get busy or cost frames.
