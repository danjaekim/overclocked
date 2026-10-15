# Design spec: M26–M28 (evolution branches, grafts)

Written 2026-10-14 after M25. This file is a **plan**. The source of truth stays `docs/architecture.md`,
and each implementing commit updates it as usual. Every number here is a first guess, and the M9 bench
(`node tools/bench.mjs`) tunes anything marked **[bench]** before a playtest.

Contents
1. Goals, and what is wrong today
2. Shared effect vocabulary (M26a)
3. Branches: two evolutions per starter weapon (M26b)
4. Grafts: combining evolutions (M27, M28)
5. Economy: can a run reach two evolutions and a graft?
6. Difficulty with stronger builds
7. Changes to existing weapons and evolutions
8. Fit with existing code, file by file
9. Tests and bench additions
10. Apex grafts (later)
11. Decisions

---

## 1. Goals, and what is wrong today

Goals, in Dan's words: **cool combinations, gameplay excitement, discovery, variety.**

What is wrong today:

1. **Every starter weapon has exactly one evolution.** Once you know it, the path to it is fixed: level
   the weapon and take the one passive. The forge's evolution card is a checklist, not a choice.
2. **Most evolutions are "the same weapon, bigger".** Radiant Halo is a bigger Halo. Grave Legion is more
   hounds. Pyre Crown is a bigger Cinder Ward. Bigger numbers feel good once and then never surprise you.
3. **The engine's on-hit vocabulary is thin.** Triggers fire on `hit`, `crit`, `kill` and `interval`.
   The only effects are `explode` and `shield`, plus the three statuses. Grafts need more verbs than that
   to make combinations that feel different.

Design rules for everything below:

- **A branch changes how you play, not only how hard you hit.** Each pair of branches asks a different
  question: crowd or single target, ranged or close, safe or risky.
- **The requirement picks the branch.** Two branches of one weapon never share a requirement, so your
  level-up picks steer you toward one. The M24 evolution hint then marks the cards for both.
- **Choosing is permanent.** Combining into one branch removes the other, and the forge says so on the
  card.
- **Grafts are named discoveries.** Twelve hand-made "masterwork" pairs each have their own name and
  effect. Every other pair still works through a generic graft, so no combination is a dead end.

---

## 2. Shared effect vocabulary (M26a)

These are built once and then reused by branches, grafts and later content. Each is an `EFFECTS` entry
(`src/effects/index.js`), so any weapon, affix or graft can fire one from a trigger.

| Effect | What it does | Used by |
|---|---|---|
| `fire_patch` | Burning ground at a point: radius r, t seconds, ticks burn on anything standing in it. Pooled like fx, cap 40. | Sunpiercer, Pyre graft, Fault Line |
| `vortex` | Pulls enemies within r toward a point for t seconds (bosses barely move), then bursts for damage. | Singularity, Black Sun, Eventide Volley |
| `shockwave` | A wide, slow line projectile along the ground, pierces everything, travels range r. | Quakebreaker, Fault Line |
| `pillar` | After a 0.35 s telegraph ring, a column of light hits everything in r. | Judgement, Wrath |
| `sunder` | The target's armour is 0 for t seconds, shown as a cracked ring. | Bone Colossus, any graft from it |
| `cast` | Fires the **donor weapon's own behaviour** once, at x% of its damage, aimed at a point. | Every generic graft (§4.3) |

New trigger fields, in `game/triggers.js`:

- **`on: 'attack'`**: fires when the weapon attacks (a swing, volley, cast or pulse), not per enemy hit,
  so melee and multi-hit weapons don't fire it many times per attack. It takes `every: n`, so the trigger
  fires on every nth attack; the instance keeps the counter.
- **`chance`** on any trigger, plus the trigger depth guard that already exists (`MAX_TRIGGER_DEPTH`
  3).

New stat: **`lowHpDamage`**, a multiplier that scales from 1 at full HP up to its value at 25% HP. It is
read through the weapon's tag scope like every other stat. Used by Whirlwind Cleaver.

---

## 3. Branches: two evolutions per starter weapon (M26b)

Each starter weapon keeps its current evolution (**A**) and gains a new one (**B**) that plays
differently. Both need weapon level 6 and 1 starsteel. Their other requirements are different.

| Weapon | A (existing) | B (new) | The question it asks |
|---|---|---|---|
| **Ember Bow** (Archer) | **Storm Volley**: a fan of 4 arrows that burn and shock. *Wind Sigil 1* | **Sunpiercer**: one heavy arrow every 1.6 s. It pierces everything, leaves a burning line (`fire_patch` along its path), and a crit adds an explosion. *Keen Eye 2* | Sweep the crowd, or delete the line and the elite at its end? |
| **Forge Hammer** (Smith) | **Colossus Maul**: a huge crushing arc plus shields. *Tempered Core 2, +3 enhance* | **Quakebreaker**: every swing also sends a `shockwave` forward along the ground, about 260 units, so the melee weapon reaches a long way. *Long Reach 2* | Stand and tank, or clear lanes from range? |
| **Rending Axe** (Berserker) | **Reaper Axe**: sweeps front and back, and crits cut down the wounded. *Keen Eye 2* | **Whirlwind Cleaver**: a constant 360° spin (aura-style ticks) that hits up to 2.5x harder as your HP falls (`lowHpDamage`). Hits heal a little. *Bloodletting 2* | Clean precise kills, or ride the edge of death? |
| **Arc Bolt** (Mage) | **Prismatic Bolt**: three bolts, each able to burn, chill or shock. *Scholar's Lens 2* | **Singularity**: a slower bolt that opens a `vortex` where it lands. The vortex gathers the crowd for 1.5 s, then collapses for big damage. *Quickening Gear 2* | Spread statuses everywhere, or herd the horde into one spot? |
| **Bone Call** (Summoner) | **Grave Legion**: 6 fast hounds that swarm the field. *Fleet Greaves 2* | **Bone Colossus**: one giant hound. Its bites stomp in an area with heavy knockback and `sunder` armour for 4 s. It is the answer to Shieldbearers. *Tempered Core 2* | Many small biters, or one walking wrecking ball? |
| **Halo** (Saint) | **Radiant Halo**: a huge burning ring that heals. *Tempered Core 2* | **Judgement**: the aura is gone. Every 1.2 s it calls a `pillar` of light on the toughest enemy within 300 units (elites and the boss first), and each kill from a pillar heals you. *Keen Whetstone 2* | A safe zone around you, or a sniper from heaven? |

Notes:

- Sunpiercer and Judgement are the first evolutions that **prefer elites and bosses**. That gives
  single-target builds a reason to exist now that late waves are denser.
- Quakebreaker, Singularity and Bone Colossus each bring a **new verb** (line reach, grouping, armour
  break). Those verbs are also what makes their grafts interesting.
- Whirlwind Cleaver is the only branch with **built-in risk**. That fits the Berserker, and the
  Bloodletting requirement gives it a way to stay alive.

### 3.1 Forge and level-up UI

- The forge already lists every recipe for a weapon (`recipesFor`). Two cards appear, each headed
  "Branch: Sunpiercer". A line under the checklist says *"Combining locks the other branch."*
- The M24 hint marks the offers for **both** branches. The text names the branch: "★ Needed to evolve into
  Sunpiercer".
- The Compendium shows both branches per weapon. An unseen branch shows as a silhouette with its
  requirement, so players know it exists without knowing what it does.

---

## 4. Grafts: combining evolutions (M27, M28)

### 4.1 The rule

At the forge, **graft** one evolved weapon (the *donor*) into another (the *host*):

- **Cost:** 1 starsteel (decided). The donor is consumed too. **[bench]**
- **Result:** the host keeps its behaviour, level, enhance and affixes. It gains the donor's element tags,
  so cross-element perks (Overload, Quench, Superconduct) can start working, and it gains a graft effect
  (§4.2 or §4.3).
- **The donor is consumed**, and that frees a weapon slot. This is the loop that makes grafting feel good:
  graft, pick up a new weapon, level it, evolve it, graft again.
- **One graft per weapon.** The grafted weapon gets a gold rim and a new name.
- Both orders (A into B, B into A) are offered when both are evolved. For a masterwork pair, the
  masterwork defines the host, so both orders give the same result.

### 4.2 Masterworks: 12 named pairs

These are the discoveries. Each one turns two familiar weapons into something with its own name and
effect.

| # | Host + donor | Masterwork | What happens | Why it's exciting |
|---|---|---|---|---|
| 1 | Reaper Axe + Stormshell Mortar | **Thunderscythe** | Each sweep plants 3 storm shells along the edge of the arc. They burst 0.4 s later, burning and shocking. | Dan's example. Melee that leaves a minefield behind it. |
| 2 | Colossus Maul + Glacial Bloom | **Glacier Maul** | Slams freeze everything in the arc. A slam that hits a frozen enemy shatters it into a ring of ice shards. | A two-hit combo the player feels: freeze, then smash. |
| 3 | Storm Volley + Singularity | **Eventide Volley** | Every 4th volley's lead arrow opens a vortex. Arrows bend toward vortices in flight. | Grouping plus homing: the screen folds in on itself. |
| 4 | Grave Legion + Pyre Crown | **Hellhounds** | Every hound wears a small burning aura. | Mobile auras spread across the whole field. |
| 5 | Seraph Blades + Thunder Lance | **Spear Wheel** | Every 3 s the blades launch outward as piercing lances, then fly back into orbit. | An orbit weapon that suddenly reaches the edge of the screen. |
| 6 | Bone Colossus + Radiant Halo | **Sanctum Titan** | The colossus carries the halo. Anything near it burns, and its kills heal you. | Your safe zone walks into the crowd for you. |
| 7 | Singularity + Pyre Crown | **Black Sun** | The vortex is a burning star. Pulled enemies burn, and the collapse is a fire explosion that leaves a `fire_patch`. | The biggest single moment in the game. |
| 8 | Whirlwind Cleaver + Seraph Blades | **Bladestorm** | The spin flings out blades that spiral away from you, cutting as they go. | Close range turns into a spreading storm. |
| 9 | Sunpiercer + Glacial Bloom | **Comet** | The arrow bursts into a ring of ice shards where it ends. Enemies frozen along its line shatter. | One shot clears a lane and a circle. |
| 10 | Quakebreaker + Stormshell Mortar | **Fault Line** | Shockwaves leave a burning, shocking crack for 3 s. | Lanes become hazards that the horde walks into. |
| 11 | Judgement + Thunder Lance | **Wrath** | Pillars stay for 1.5 s, and lightning chains between all live pillars. Anything crossing a chain is shocked. | The player draws a net of lightning across the field. |
| 12 | Prismatic Bolt + Grave Legion | **Familiars** | Each hound casts a small prismatic bolt every 2 s. | Turret pets, with statuses everywhere. |

Coverage check: every starter's B branch appears at least once (Sunpiercer, Quakebreaker, Whirlwind,
Singularity, Bone Colossus, Judgement). Every A branch appears too. The non-starter evolutions are
included as donors (Pyre Crown, Glacial Bloom, Thunder Lance, Seraph Blades, Stormshell Mortar), so the
side weapons you pick up have a reason to be evolved.

Ship order: M27 ships #1–#6, so a playtest can show whether the system is fun before more art and code go
in. M28 ships #7–#12.

### 4.3 Generic graft: every other pair

Any two evolved weapons without a masterwork still graft. The host gets:

- the donor's element tags, and
- ~~an echo: every 3rd attack casts the donor's behaviour at 50%~~ (replaced in M30) a **payload**: the
  first hit of every host attack fires an effect shaped like the donor's attack (shrapnel, cleave,
  spinning blades, quake, spark, ...). See [design-m30-m33.md](design-m30-m33.md) §3 for the table and
  §6.2 / `architecture.md` M33b for the masterwork review against it.

The name is "{Host} of {Donor's element}", for example "Reaper Axe of Frost" (decided: always readable,
where generated portmanteaus are sometimes ugly; easy to change later). A donor with no element uses
its own name ("Grave Legion of the Thunder Lance").

This is the Magic Survival / BALL x PIT feel: every pair *does something*, and the named ones are the
jackpots.

### 4.4 Discovery

- The Compendium gets a **Grafts** page: "Masterworks found 3 / 12". Found ones are listed with their
  effect. Unfound ones show the host's name and "+ ???".
- The first time a masterwork is made, a special banner shows ("Masterwork discovered: Thunderscythe") and
  the `evolve` sfx plays an octave up. The results screen lists any grafts made that run.
- Saved in `save.discovered.grafts` (save version 3, with a migration).

---

## 5. Economy: can a run reach two evolutions and a graft?

Starsteel per 10-minute run, after M25: the first elite always drops 1. Six more elites drop 1 at 50%
each, so about 3 on average. The boss drops 2. That is about **6 per run** (at least 3).

| Spend | Starsteel | Earliest realistic time |
|---|---|---|
| 1st evolution | 1 | minute 2–3 (first elite at 1:30, weapon level 6) |
| 2nd evolution | 1 | minute 4–6 |
| Graft | 1 | minute 5–7 |
| 3rd evolution, or a graft on a second weapon | 1–2 | minute 7+, usually affordable |

So the target is **two evolutions and one graft in most runs**. With grafts at 1 starsteel, a third evolution
or a second graft on a different weapon is often in reach late; the bench decides whether that is too much. **[bench]**: the bench should report the minute of the first evolution and the first graft over
200 seeded bot runs. The target medians are 3:00 and 6:30.

Two more levers, only if the bench says the economy is too tight:

- **Salvaging an evolved weapon returns 1 starsteel.** This makes "wrong branch, start over" possible
  without being free.
- A **starsteel chest roll**: a 5% chance per roll in elite chests.

---

## 6. Difficulty with stronger builds

Grafts are deliberately a power spike, so the last third of the run has to push back. Here is the plan,
cheapest first:

1. **Health scaling after minute 6:** `hpScale` goes from 2.9 to 3.6 in the last segment. The
   director's soft-cap buff already adds health when it's at 500 enemies. **[bench]**
2. **Elite affixes that counter builds.** New: **Armoured** (armour 12, so it counters many-small-hits
   builds) and **Volatile** (explodes on death, so it punishes standing in melee). Late elites roll two
   affixes after minute 7.
3. **A third minute-8 threat**, a *War Party*: 2 Shieldbearer elites and a Slinger pack arrive as one
   event. It's a mid-boss without a new sprite.
4. **Enemy variants are the main lever, not raw health.** Shieldbearers punish "fast, weak" builds and
   Slingers punish standing still. The next ones I'd add are a **Splitter** (splits into 3 goblins when
   it dies, which punishes single-target builds) and a **Shaman** (gives nearby enemies a ward, so you
   have to target it first).

---

## 7. Changes to existing weapons and evolutions

| Change | Why |
|---|---|
| Radiant Halo: hits also apply a 1 s "Blessed" mark, and marked enemies take 10% more damage from your other weapons. | Today it's just a bigger Halo. This gives it a team role next to Judgement's sniping. |
| Grave Legion: hounds that kill something get +30% speed for 2 s (a "frenzy"). | Gives the swarm some motion, and contrasts with the slow Bone Colossus. |
| Pyre Crown: the aura leaves short `fire_patch` embers where enemies die. | It's an aura that grows today. This gives it a mark on the ground and makes it a better donor. |
| Colossus Maul: keep the +3 enhance requirement. | It's the Smith's identity: the forge class evolves at the forge. |
| Fusions (Vapor Wheel, Stormshell Mortar, Stormfrost Lance): unchanged. | They already act as "branches" for side weapons, and they're good graft donors. |
| `explode` gets an optional `patch` param that leaves a `fire_patch`. | Reuses the vocabulary. Storm Volley's kill explosions can scorch the ground once grafted with fire. |

---

## 8. Fit with existing code, file by file

| File | Change |
|---|---|
| `src/data/weapons.js` | 6 new evolved weapons (`pool: false, rarity: 'evolved'`). |
| `src/data/evolutions.js` | 6 new recipes, plus an `exclusiveWith` group per starter weapon so the forge can say which branch it locks. |
| `src/data/grafts.js` (new) | `GRAFT = { cost, echoEvery, echoFrac }`, the 12 `MASTERWORKS` `{ id, host, donor, name, desc, mods, triggers }`, and an element-name table for generic names. |
| `src/effects/index.js` | `fire_patch`, `vortex`, `shockwave`, `pillar`, `sunder`, `cast`. |
| `src/systems/hazards.js` (new) | Fire patches and vortices: pooled, updated in the tick between statuses and the flush, drawn under enemies. |
| `src/game/triggers.js` | `on: 'attack'` with `every`, `chance` on all triggers. Behaviours call `fireTriggers(run, 'attack', inst, ...)` once per attack. |
| `src/behaviors/*` | Each behaviour reports its attack, and aura/orbit gain the hooks Hellhounds and Spear Wheel need (an aura that follows a summon, blades that launch and return). |
| `src/game/graft.js` (new) | `canGraft`, `graftOptions(run)`, `graft(run, host, donor)`, `masterworkFor(a, b)`. Pure rules with no DOM, like `game/forge.js`. |
| `src/ui/forge.js` | A **Graft** section under the weapon list when 2+ evolved weapons are owned. Picking a host, then a donor, shows a preview card with the name, effect and "consumes the donor". |
| `src/game/compendium.js`, `src/ui/compendium.js` | A branches view and a Grafts page with discovery. |
| `src/save/save.js` | v3: `discovered: { branches: [], grafts: [] }`. |
| `src/data/validate.js` | Masterwork hosts and donors must be evolved weapons, no duplicate pairs, and effect params must be present. |

Staging:

- **M26a:** vocabulary, triggers and hazards. Nothing visible changes yet except that the hazards can be
  tested.
- **M26b:** the 6 branch evolutions plus the forge and Compendium branch UI.
- **M27:** graft rules, generic grafts, masterworks #1–#6, forge graft UI, discovery and save v3.
- **M28:** masterworks #7–#12, the difficulty items from §6, and bench tuning.

---

## 9. Tests and bench additions

- Every recipe pair on a starter weapon has disjoint requirements. Combining one branch removes the other
  card.
- `graft()`: the donor is consumed, the slot is freed, tags are merged, starsteel is spent, a weapon
  cannot be grafted twice, and a masterwork is found in either order.
- Generic echo: over 30 attacks, the donor is cast exactly 10 times, at 50% of its damage.
- Hazards: patch and vortex pools never exceed their caps under the 500-enemy stress test, and the frame
  budget still holds with 3 vortices and 30 patches live.
- Bench: report the minute of the first evolution, second evolution and first graft, plus DPS before and
  after the graft. Flag any masterwork whose DPS is more than 1.6x the median masterwork.

---

## 10. Apex grafts (later, after the M27 playtest)

A grafted weapon cannot take a second graft. Separate grafts on **different** weapons are allowed, and
they add more variety for the same starsteel. A small, named exception is worth trying once grafts have
been played: an **Apex**, where one specific masterwork takes one specific third weapon. There are no
generic triples, so balance stays in hand and each Apex is a rare jackpot. Candidates:

| Masterwork + third | Apex | What happens |
|---|---|---|
| Black Sun + Thunder Lance | **Event Horizon** | The collapse fires lightning lances outward in every direction. |
| Thunderscythe + Glacial Bloom | **Hailscythe** | The planted shells freeze; a shock on a frozen enemy shatters it. |
| Hellhounds + Judgement | **Wild Hunt** | Every bite calls a pillar of light on what the hound bit. |
| Spear Wheel + Stormshell Mortar | **Starfall Wheel** | Launched lances turn into shells where they land. |

Gate: a title earned by making a masterwork, and 2 starsteel, so an Apex is a late-run reward.

## 11. Decisions (Dan, 2026-10-14)

1. Graft cost: **1 starsteel**.
2. Second graft on one weapon: **not for now**. Separate grafts on different weapons are allowed. Apex
   triples (§10) are revisited after the M27 playtest.
3. Masterwork illustrations in the Compendium: **yes**, as an art round once masterworks #1–#6 are in.
4. Generic graft names: **"{Host} of {Element}"**, changeable later.
