# Design spec: M30–M33 (graft payloads, distinct weapon shapes)

Written 2026-10-14 after M29 (v0.29.4). This file is a **plan**. The source of truth stays
`docs/architecture.md`, and each implementing commit updates it as usual. Every number here is a first
guess; anything marked **[bench]** is tuned with `node tools/bench.mjs` before a playtest.

Contents
1. Why: what is wrong today
2. Shape, not element: the principle
3. M30: graft payloads (replace the generic echo)
4. M31: Frost Wake and Halo Pulse (trail and pulse shapes)
5. M32: Slam, Chain Lightning, Lightning Rod (three more shapes)
6. M33: Chakram branches and masterwork review
7. Rules for every milestone
8. Decisions

---

## 1. Why: what is wrong today

Dan, 2026-10-14: *"Spirit Blades vs. Rime Orbs and Cinder Ward vs. Halo ... from a gameplay and visual
standpoint they look identical. I want the weapons to feel different and for evolutions and
combinations to feel interesting and novel. ... the generic combos where every x attacks it'll trigger
the grafted weapon feels a little weak and uninspired. I'd prefer if every attack has the combined
effect or something more noticeable/tangible."*

The 33 weapons fall into a few shapes, and 5 of the 14 starters are recolours of another starter:

| Shape (behavior) | Starters | Evolved |
|---|---|---|
| orbit | Spirit Blades, **Rime Orbs** | Seraph Blades, Vapor Wheel |
| aura | Cinder Ward, **Halo** | Pyre Crown, Radiant Halo, Whirlwind Cleaver |
| arc (melee swing) | **Forge Hammer**, Rending Axe | Colossus Maul, Reaper Axe, Quakebreaker |
| projectile (straight shot) | Ember Bow, **Storm Javelin** | Storm Volley, Thunder Lance, Stormfrost Lance, Sunpiercer |
| bolt (sure hit) | Arc Bolt, **Static Rod** | Prismatic Bolt, Singularity |
| nova, mortar, boomerang, summon, judge | one each | one or two each (boomerang: none) |

**Bold** = the starter that gets a new shape in M31/M32.

The generic graft is a net loss: it destroys an evolved weapon and gives back that weapon's attack on
every 3rd host attack at 50% (about 17% of what was consumed). One cast every few seconds is also hard
to see on a crowded screen.

## 2. Shape, not element: the principle

A player tells weapons apart by **where and how the attack lands**, not by its colour or status chance.
So:

- No two starters share a behavior. After M32 every starter has its own.
- An evolution can share its starter's behavior (it is that weapon, grown up), but no two evolutions
  should look the same on screen. Branches add a mechanic, not just numbers.
- A graft keeps the host's shape and adds the donor's **payload** on every attack (§3), so the donor's
  shape is visible in the result.

## 3. M30: graft payloads (replace the generic echo)

### 3.1 The rule

The host decides **where and when** it hits. The donor decides **what happens where it lands**.

- Each attack of the host **arms** the payload (`inst.payloadArmed = true`, set in
  `attackTriggers`, `game/triggers.js`).
- The **first enemy that attack hits** fires the payload at that enemy, then it disarms. So every attack
  carries the payload once, whatever the shape (a 12-arrow volley still fires one payload, not 12).
- Floor: at most one payload per weapon per `GRAFT.payloadMinGap` (0.15 s), so fast auras and orbits
  cannot spam it.
- Payload damage = `GRAFT.payloadFrac[shape]` x the host's current per-hit damage
  (`param(run, src, 'damage')`), so it scales with the host's levels, enhances and the player's stats.
  It is queued as `KIND_PROC` at `depth + 1` with its own damage cause (`Graft`), so it shows in the
  results breakdown and cannot start an endless chain.
- Element: the donor's element tags still move to the host (as today). Payload hits roll statuses as
  normal PROC hits.

Replaces: `GRAFT.echoEvery`, `GRAFT.echoFrac` and the `cast` effect (`effects/index.js`), which only the
generic graft uses. Masterworks are unchanged.

### 3.2 Payload per donor shape

Each payload is built from the shared effect vocabulary (`effects/index.js`, `systems/hazards.js`)
wherever possible. Numbers are **[bench]**.

| Donor behavior | Payload id | What it does at the hit enemy | frac | Notes |
|---|---|---|---|---|
| projectile | `shrapnel` | 3 small shots burst onward (away from the player, +-25 deg), pierce 1 | 0.35 each | sub-projectiles (`pr.sub = true`) so they never trigger trails or payloads |
| arc | `cleave` | a half-circle cut, radius 55, facing away from the player | 0.5 | draw as a short white arc |
| orbit | `spin` | 3 blades circle the enemy for 1.2 s, radius 34, hitting every 0.2 s | 0.15 per tick | new hazard `SPIN` in hazards.js, drawn as blades |
| aura | `imprint` | a ring patch, radius 42, 2 s, ticks every 0.4 s | 0.2 per tick | the donor's element picks the status: fire burns, frost chills, light blesses (and heals the player 1 per hit, cap 4/s), else plain |
| bolt | `arc` | jumps to the nearest other enemy within 150 | 0.6 | `chainArc` with cause FORK (no shock) unless the donor has `storm`, then shock |
| nova | `burst` | 6 shards ring out from the enemy, ttl 0.35 | 0.3 each | sub-projectiles |
| mortar | `blast` | a delayed blast, radius 55, after 0.3 s | 0.7 | `addBlast` |
| summon | `pounce` | a spirit hound leaps from the player to the enemy and bites it and anything within 40 | 0.6 | a dash streak fx plus a small explode |
| judge | `smite` | a pillar on the enemy, 0.25 s telegraph | 0.9 | `addPillar`; heavier, so its own min gap of 0.6 s |
| aura with `spin: true` (Whirlwind Cleaver) | `cleave` | as arc | 0.5 | treat as arc |
| boomerang (M33) | `saw` | a small disc flies from the enemy out 90 units and back | 0.4 | after M33 adds evolutions |
| trail (M31) | `frost_step` | a 1.5 s chilling patch under the enemy | 0.15 per tick | |
| pulse (M31) | `ripple` | a small ring expands from the enemy to radius 70 | 0.5 | |
| slam (M32) | `quake` | a mini crater, radius 45, short stagger 0.25 s | 0.6 | |
| chain (M32) | `arc` | as bolt, but 2 jumps | 0.45 | |
| rod (M32) | `spark` | plants a mini rod for 1.2 s that zaps 1 enemy within 90 every 0.4 s | 0.3 per zap | |

Data: `data/grafts.js` gets `PAYLOADS = { [behavior]: { id, effect, params, name } }` (the table above)
and `GRAFT.payloadFrac` folds into each entry's params. `validate.js` checks every behavior in
`BEHAVIORS` has a payload, so a new shape cannot ship without one.

### 3.3 Naming and text

- Name: `{Host} of {Element}` when the donor has an element (as today), else `{Host} of {Payload name}`
  (e.g. "Colossus Maul of Shrapnel", "Judgement of Hounds").
- Description (forge card, Compendium): one plain sentence, e.g. *"Every attack's first hit bursts into
  6 ice shards (30% damage each)."* Built from the payload entry, not hand-written per pair.
- The Compendium Grafts tab's rules entry is rewritten to describe payloads, with the table above as a
  list (shape -> what it adds).

### 3.4 Value target **[bench]**

New bench section `--grafts`: for each evolved host, crowd-clear DPS alone vs with each donor's payload.
Target: a generic graft adds **+35% to +60%** to the host's crowd DPS. (The donor's slot is freed, so
the graft does not need to replace all of the donor's damage.) Masterworks should land above the generic
range for their pair; if one does not, note it for M33.

### 3.5 Tests (`tests/m30.test.mjs`)

- Every behavior has a payload; data validates.
- One attack arms, the first hit fires, the second hit of the same attack does not; the next attack
  fires again; the min gap holds for an aura ticking every 0.1 s.
- Each payload id hits an enemy next to the target and not one far away; sub-projectiles do not fire
  payloads.
- Payload damage scales with the host's damage stat; cause `Graft` appears in `run-stats`.
- A masterwork pair still gets the masterwork (no payload).
- History/results still show generic grafts (the stored id becomes `payload:<id>`).

Version: v0.30.x.

## 4. M31: Frost Wake and Halo Pulse (trail and pulse shapes)

Weapon **ids stay the same** (saves, history, recipes and tests use them); names and behaviors change.

### 4.1 Rime Orbs -> **Frost Wake** (new behavior `trail`)

- **Play:** you leave a trail of frost as you move. Enemies that walk through it are chilled and
  damaged. Rewards kiting in loops; nothing else in the game does this.
- **Mechanics:** every `spacing` units the player moves (default 26), drop a patch (radius 22, ttl 2.4,
  tick 0.4). Standing still drops one under you every 0.8 s, so it is never dead. Uses `addPatch` with a
  new `status` option (`'chill' | 'burn' | 'shock' | null`) replacing the `shock` boolean.
  Level-ups: damage, longer patches, wider patches, chill stacks. `range` is unused; `area` scales
  patch radius.
- **Visual:** pale blue frost discs that fade out, with a few sparkles; frozen enemies on it glint.
- **Fusion:** Vapor Wheel (Cinder Ward + Rime Orbs) becomes **Steam Wake** (`trail`): the trail burns
  *and* chills, so Quench (perk) fires on its own. Keep the id `vapor_wheel`.
- **Payload** (as a donor, after evolving into Steam Wake): `frost_step` (§3.2).

### 4.2 Halo -> **Halo Pulse** (new behavior `pulse`; the Saint's starter)

- **Play:** every 1.1 s a ring of light expands from you to its range, hitting each enemy once as it
  passes and healing you a little per hit. You see waves, not a static circle.
- **Mechanics:** a pulse is `{ r, rMax, speed, hit: Set }`, stepped each tick; at most 3 alive. Damage
  per pass, `interval:shield` trigger kept. Level-ups: damage, faster pulses, bigger rings, a second
  ring 0.2 s behind the first.
- **Visual:** a gold ring with a soft inner glow, thinning as it grows.
- **Evolutions:** Radiant Halo -> **Radiant Pulse** (`pulse`): bigger and faster rings that bless
  (existing `bless` effect) everything they pass. Judgement unchanged (`judge`).
- **Masterwork check:** Sanctum Titan (Bone Colossus + Radiant Halo) keeps its effect (minion aura and
  heal); rename nothing.
- **Payload:** `ripple` (§3.2).

### 4.3 Bench and tests

- Each changed weapon's single-target and crowd DPS at L1/L4/L8 within +-20% of the weapon it replaces
  **[bench]**, except the Saint's win rate in bot runs should not fall.
- `tests/m31.test.mjs`: trail drops by distance and by time; patches chill; Steam Wake burns and chills;
  pulse hits each enemy once per ring and heals; Radiant Pulse blesses; both new behaviors have payloads.
- Lab panel lists them automatically (it reads the weapon tables); check.

Version: v0.31.x.

## 5. M32: Slam, Chain Lightning, Lightning Rod (three more shapes)

### 5.1 Forge Hammer -> **Forge Hammer** slam (new behavior `slam`; the Smith's starter)

- **Play:** the hammer leaps to a spot near the nearest enemy and craters it: a round impact, strong
  knockback outward, and a short stagger. Slower and heavier than the axe's sweep.
- **Mechanics:** pick the densest point within `range` (sample the 3 nearest enemies, choose the one with
  the most neighbours within 60). 0.22 s telegraph (a shadow circle), then damage in `radius` (base 64),
  knockback 220 outward, stagger 0.35 s. New enemy field `stunT` (set in `spawnEnemy`; enemy-ai skips
  movement and attacks while > 0; bosses take half). Keep `interval:shield`.
- **Evolutions:** Colossus Maul -> giant slam (radius 96, stagger 0.6 s, shield kept). Quakebreaker ->
  slam that also sends 4 shockwaves out in a cross from the crater (`addWave`). Masterworks Glacier Maul
  (freeze in the crater) and Fault Line (cracking waves) keep their hooks; check they still read.
- **Payload:** `quake`.

### 5.2 Static Rod -> **Chain Lightning** (new behavior `chain`)

- **Play:** one visible bolt that jumps from enemy to enemy. Stronger the denser the crowd.
- **Mechanics:** first target = nearest in range; then up to `chains` (base 4) jumps within 140 each,
  -12% damage per jump, never the same enemy twice, shocks each. Uses `addArc` for the visual; stat
  `chains` from perks adds jumps. Level-ups: +1 jump twice, damage, cooldown, jump range.
- **Fusion:** Stormshell Mortar (Cinder Mortar + Static Rod) unchanged.
- **Payload:** `arc` (2 jumps).

### 5.3 Storm Javelin -> **Lightning Rod** (new behavior `rod`)

- **Play:** the javelin pierces a line, then plants in the ground where it stops and zaps anything near
  it for a few seconds. You place it rather than just fire it.
- **Mechanics:** a projectile (as today, pierce 3); at the end of its flight or when pierce runs out it
  becomes a hazard `ROD` (radius 100, ttl 3, zaps 2 enemies every 0.5 s for 40%, shocks). At most 3
  rods per weapon (the oldest goes). Level-ups: damage, +1 rod alive, zap radius, longer rods.
- **Evolutions:** Thunder Lance -> twin javelins that plant twin rods, and rods arc to each other
  (a damaging line between rods within 160, like Wrath's net). Stormfrost Lance (fusion) -> rods that
  also chill everything in the radius every second.
- **Masterworks:** Spear Wheel (blades launch outward) and Wrath (pillars net to each other) use
  Thunder Lance as donor only through hooks; check both still work.
- **Payload:** `spark`.

### 5.4 Bench and tests

As §4.3, in `tests/m32.test.mjs`: slam picks a dense point, staggers, bosses half; chain never repeats a
target and loses damage per jump; rods plant, zap, cap at 3, Thunder Lance rods link; each new behavior
has a payload. Smith bot win rate should not fall.

Version: v0.32.x.

## 6. M33: Chakram branches (M33a) and masterwork review (M33b)

Split in two so they can be built separately: **M33a** is 6.1 (Sonnet), **M33b** is 6.2 and 6.3 (Opus).

### 6.1 Chakram evolutions (boomerang)

The only weapon with no evolution. Two branches (recipe: Chakram level 6 + 1 starsteel + one of):

- **Ricochet Saw** (+ Ricochet perk level 2): the disc bounces between up to 6 enemies before it
  returns, +8% damage per bounce.
- **Gyre** (+ Wind Sigil passive level 2): the disc parks at the far end of its throw and spins as a
  buzzsaw for 1.5 s, pulling enemies in slightly, then returns.

Payload as a donor: `saw` (§3.2).

### 6.2 Masterwork review

After M31/M32 several hosts and donors have new shapes. For each of the 12 masterworks: confirm it
works, reads on screen, and beats the generic payload for its pair (§3.4). Then propose to Dan (not
build) 2-3 new masterworks that show off the new shapes, for example:

- **Aurora Wake** (Steam Wake + Radiant Pulse): pulses travel along your trail.
- **Stormspire** (Thunder Lance + Chain Lightning): chains start from every rod.
- **Meteor Hammer** (Colossus Maul + Stormshell Mortar): the slam rains shells around the crater.

### 6.2a Review results (M33b, v0.33.1)

`node tools/masterwork-review.mjs` compares each masterwork with its host alone, with both weapons kept
(no graft), and with the generic payload graft for the same pair. Ring = dps against 24 pinned dummies
(inflated for freeze-shatter effects, whose dummies never die); horde = kills in a 30 s walking horde.

| Masterwork | Before (ring / horde vs generic) | Change | After (ring MW vs generic, horde MW vs generic) |
|---|---|---|---|
| Thunderscythe | +188% vs +71%, 224 vs 225 | none | same; ahead on damage, level on kills |
| Glacier Maul | +98% vs +9%, 307 vs 330 | shatter 0.6 -> 1.0 | +163% vs +9%, 308 vs 330 (the freeze lock is defensive value the god-mode bench cannot see) |
| Eventide Volley | +299% vs +34%, 250 vs 211 | none | |
| Hellhounds | **+53% vs +111%**, 274 vs 273 | aura radius 34 -> 46, tick 0.5 -> 0.4, 40% -> 60% | +179% vs +111%, 305 vs 273 |
| Spear Wheel | +96% vs +39%, 299 vs 202 | none | |
| Sanctum Titan | **+107% vs +120%**, 276 vs 283 | reworked for the new Radiant Pulse: the colossus sends out blessing rings of light (`minionPulse`) instead of a static aura; +30% burn chance | +164% vs +120%, 372 vs 283 |
| Black Sun | +217% vs +19%, 306 vs 269 | none | |
| Bladestorm | **+16% vs +40%**, 212 vs 257 | blades on every spin (was every 2nd), 4 blades (was 3) at 100% (was 70%) | +63% vs +40%, 280 vs 257 |
| Comet | **+13% vs +106%**, 219 vs 258 | the shard burst was firing where the arrow ran out (off-screen); it now bursts at the last enemy pierced (`pr.hx/hy`), shards no longer set off shatter (depth 1); chill 100% and +2 stacks so the line actually freezes | ring inflated (shatter on pinned dummies), 336 vs 258 |
| Fault Line | +80% vs +18%, 355 vs 278 | none (works on the slam's cross waves) | |
| Wrath | +74% vs +0%, 285 vs 187 | none (Thunder Lance as a rod donor is fine) | |
| Familiars | **+9% vs +38%**, 187 vs 209 | hounds cast every 1.2 s (was 2) at 100% (was 60%), and each bolt strikes 2 enemies (`targets`) | +64% vs +38%, 245 vs 209 |

All twelve read on screen (screenshots in the M33b report). Echo Strike and the Twin affix now say they
add a slam; the Compendium's Grafts tab calls the rod shape "Planted rod" and the projectile shape "Arrow".

### 6.2b Proposed new masterworks (for Dan; not built)

The suggested Stormspire (Thunder Lance + Chain Lightning) cannot exist: Chain Lightning has no evolution,
so it can never be grafted. Meteor Hammer (slam + mortar shells) repeats Thunderscythe and Fault Line.
Three that use the new shapes and only weapons that can be grafted:

1. **Aurora Wake** (host Steam Wake, donor Radiant Pulse). Every 4th patch of your trail is a beacon that
   sends out two small rings of light, and every patch blesses what stands in it. The wake already burns
   and chills (so Quench fires on its own); blessed enemies take +10% from everything. Shows: trail + pulse.
2. **Millstone** (host Gyre, donor Colossus Maul). When the parked saw finishes spinning, the maul comes
   down on that spot: a full crater on the crowd the saw has just dragged together, with the maul's
   stagger. Shows: boomerang park + slam, a two-beat combo you can see coming.
3. **Storm Saw** (host Ricochet Saw, donor Thunder Lance). Each bounce plants a short rod (1.5 s) where it
   struck; rods within reach link with Thunder Lance's lightning, so the saw's zig-zag path becomes a
   lightning fence for a moment. Shows: bounce + rod links.

Also worth deciding: give Chain Lightning an evolution so the chain shape can take part in grafts.

### 6.3 Docs

Update the Compendium text for every changed weapon (it is generated from data, so check the strings),
and rewrite `design-m26-m28.md` §4.3 to point here.

Version: v0.33.x.

## 7. Rules for every milestone

- Small commits, each runnable; bump `src/version.js` in every game change and start the commit message
  with `vX.Y.Z:`; tell Dan the version.
- Each commit updates `docs/architecture.md` (a milestone row) and `docs/roadmap.md`.
- Tests: `node tests/run.mjs`, `node tests/smoke.mjs --stress --ui --music`, `node tests/offline.mjs`;
  bench numbers in the architecture row.
- New behavior files go in `src/behaviors/` and one line in `behaviors/index.js`. **Never name a file
  after a known tracker or ad script** (see `architecture.md` M8: `boomerang.js` broke Safari). Use
  `trail.js`, `pulse.js`, `slam.js`, `chain-bolt.js`, `rod.js`.
- Keep weapon ids; change names, behaviors and numbers. Old run history then shows the new names, which
  is fine.
- Visuals are canvas primitives in each behavior's `draw` (no new sprite art); they must read at phone
  size in a 500-enemy crowd. Screenshot each new shape with the Playwright helpers before pushing.
- Performance: the stress smoke and `tools/bench.mjs` timing must not regress by more than 10%.

## 8. Decisions

Dan, 2026-10-14: go with graft payloads first, then the five shape changes, then Chakram and the
masterwork review. Sonnet implements; this spec is the brief.

Open, to settle in playtest:
- The payload damage fractions (§3.2) and the +35% to +60% value target.
- Whether the Smith and Saint starters changing shape (slam, pulse) feels right for those classes.
- Which of the §6.2 masterwork ideas to build.
