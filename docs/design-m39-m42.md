# Design spec: M39–M42 (starsteel sinks: Star Quench and Starforge)

Written 2026-10-16 after M38 (v0.38.0). This file is a **plan**. The source of truth stays
`docs/architecture.md`, and each implementing commit updates it as usual. Every number here is a first
guess; anything marked **[bench]** is tuned with `node tools/bench.mjs` before a playtest.

Contents
1. Why: the starsteel surplus
2. The numbers this is priced on
3. M38b: Berserker iron check
4. M39: Star Quench
5. M40: Starforge core and the first four mutations
6. M41: Starforge, six more mutations
7. M42: Starforge, the last five mutations and a balance pass
8. Rules for every milestone
9. Decisions

---

## 1. Why: the starsteel surplus

Dan, 2026-10-16: *"I usually end up with a surplus of starsteel by the end of a run. I'd like to
brainstorm other uses for this currency. Could it be used to empower or alter weapons?"* and, on the
plan: *"Consider multiple enhance levels or variable number of levels per starsteel since it's such a rare
resource. Also will starforge be possible on any weapon including evos and fusions?"*

Today starsteel has two uses: evolutions (1 each, 22 recipes) and fusions (1 each, once per weapon).
Both run out early, so the rest piles up. Two new sinks:

- **Star Quench** (M39): starsteel buys guaranteed enhance attempts, so the enhance track past +10 is
  reachable and spare iron has a use.
- **Starforge** (M40–M42): starsteel buys one visible mutation per weapon, keyed to its behavior.

## 2. The numbers this is priced on

From `node tools/bench.mjs --bots --seeds 20` (6 classes, winning runs; the metrics are in the bench output):

| | Mean | p10 | p50 | p90 |
|---|---|---|---|---|
| Starsteel earned | 6.7 | | | |
| Iron earned | 451 | 220 | 479 | 574 |
| Best weapon's enhance at the end | | 4 | 9 | 11 |

- Starsteel: about 9 elites per run (the first always drops 1, later ones 50%) plus the boss's 2 at 5:00.
  The first arrives around 2:20. Every class earns 6.2 to 6.9.
- Bots spend only about 1.4 (they rarely evolve). A person doing 2–3 evolutions and one fusion spends
  3–4, so the **realistic surplus is about 3**.
- Bots also end with 150–380 iron unspent, so iron is in surplus too.

Expected iron to climb each enhance step (retries and downgrades counted, luck 0, `ENHANCE` today):

| Step | Price per attempt | Success | Expected iron | Saved if guaranteed |
|---|---|---|---|---|
| +3 → +4 | 6 | 90% | 7 | 1 |
| +6 → +7 | 12 | 60% | 20 | 8 |
| +7 → +8 | 15 | 50% | 30 | 15 |
| +9 → +10 | 22 | 40% | 99 | 77 |
| +10 → +11 | 26 | 35% | 166 | 140 |
| +11 → +12 | 30 | 30% | 294 | 264 |
| +12 → +13 | 35 | 25% | 580 | 545 |
| +13 → +14 | 40 | 20% | 1,361 | 1,321 |
| +14 → +15 | 50 | 15% | 4,189 | 4,139 |

Gambling from +0 to +15 costs about 6,840 iron (15 runs of income); with every attempt guaranteed it is
284. A guarantee is worth almost nothing below +7 and thousands of iron at +14, which is why Star Quench
gives a variable number of guarantees per starsteel (section 4) instead of one per starsteel.

## 3. M38b: Berserker iron check (done, finding only)

Berserker bots earn about 250 iron and reach about +4, against 430–580 and +8 to +10 for other classes.
It is **not an iron-drop or enhance bug**. The Berserker bot kills about 3,200 enemies per run against
about 5,300 for Smith and Saint, so it collects proportionally less iron (and visits the forge about as
often, 2.8 times against 3.0 to 3.3). Why it kills less: it spends 66% of the run below 45% hp (Smith
56%, Saint 16%), and the bot retreats when hurt, which a short-range axe cannot fight from. By the last
five minutes about 270 enemies are alive on the Berserker's screen, against about 48.

The bench bot's retreat threshold was tested as the cause. Lowering it for the Berserker (fight while
wounded, as its kit intends) trades kills for deaths: wins out of 20 were 17 at the 45% threshold, 13 at
38%, 7 at 30% and 3 at 20%, with kills rising from 3,200 to 4,700. So the Berserker survives only by
kiting and clears poorly, or fights and dies. That is a **class balance** signal (low sustain: 1.5%
lifesteal, no hp or armor bonus), not a bot fault, and it was left alone: a number for Dan to decide.
Options were lifesteal, a max-hp bonus or a Frenzy heal. The bench now records
`forges`, the share of time hurt, and iron per run.

**Fix (v0.38.1).** Dan: raise lifesteal and add armor. Bot sweep, Berserker, 20 seeds (lifesteal / armor: wins, kills, time hurt, late enemies alive): 1.5% / 0: 17, 3,200, 66%, 270; 2.5% / 0: 17, 4,000, 45%, 175; 2.5% / 2: 20, 5,270, 13%, 59; 2% / 2: 20, 5,280, 18%, 63; 2.5% / 3: 20, 5,280, 4%, 58. Shipped 2% lifesteal and 2 armor: kills match the other classes and it is still hurt about a fifth of the run, so it plays as a wounded fighter. Armor 3 and above is not needed.

## 4. M39: Star Quench

**Rule.** At the forge, spend 1 starsteel on a weapon to give it **Quench charges**. While the weapon
has a charge, its next enhance attempt cannot fail and cannot downgrade; the attempt uses one charge.
The iron price is still paid.

**Charges per starsteel**, by the weapon's enhance level when bought:

| Enhance when bought | Charges |
|---|---|
| +0 to +3 | cannot buy (those steps are already 100%) |
| +4 to +9 | 3 |
| +10 to +12 | 2 |
| +13 to +14 | 1 |
| +15 | cannot buy |

What that costs:
- +7 → +10: 1 starsteel and about 55 iron.
- +10 → +15: 3 starsteel (2 + 2 + 1 charges) and about 180 iron. That is the whole surplus: getting one
  weapon to +15 becomes a plan.
- Safe to +10, then gamble: the cheap middle path, still there.

**Details.**
- Charges stay on the weapon until used (no expiry). They show as cyan pips on its forge card.
- A temper pick at +5 or +10 still has to be made before the next attempt (as today).
- Evolving keeps enhance, so it keeps charges. A fusion adds the donor's charges to the host. Salvage
  loses them (the forge warns).
- Data: a `QUENCH` table in `data/forge.js` (`cost: 1`, `bands: [[4, 3], [10, 2], [13, 1]]`). Rules in
  `game/forge.js` (`canQuench`, `quench`, and `enhance` reads `inst.quench`). `inst.quench` is a plain
  number, so run snapshots keep it.
- UI: a Quench button on the enhance panel showing "1 starsteel: next N attempts can't fail". Success
  odds read 100% while charged.
- Feedback: a quenched attempt plays a distinct sfx and a cyan spark burst, so it reads differently
  from a lucky roll.
- Bench bot: buys a Quench when its best weapon is at +7 or more and it has spare starsteel after
  evolving.

**What to watch.** The +15 breakpoint (50% more damage, 25% more area) goes from unreachable to one
weapon per run. Check the late screen-clear fraction (M38 `late` metric) and win rate per class
**[bench]**; if +15 is too strong, trim the breakpoint, not the Quench price.

- Tests: band lookup at each edge (+3, +4, +9, +10, +12, +13, +14, +15); a charged attempt always
  succeeds and never downgrades at any rng; charges carry through evolve and fusion, are lost on salvage;
  snapshot round-trip keeps charges.
- Done when: tests pass, the bench shows how often bots reach +15, and the forge panel is checked on a
  phone-sized screen.

## 5. M40: Starforge core and the first four mutations

**Rule.** At the forge, spend **2 starsteel** to Starforge a weapon, once per weapon. The weapon must be
at its max weapon level (8 for base weapons, 6 for evolutions).

**Effect.** One mutation that changes how the weapon plays, keyed to its **behavior**: 15 behaviors
cover all 36 weapons, base, evolved and fused. Every mutation must be visible: it draws in the
starsteel cyan (`#7fe9ff`) and the weapon's HUD and forge icons gain a small star.

**Pricing.** With about 3 spare, a typical run picks one of: one Starforge and one Quench; three
Quenches (one weapon to +15); more evolutions; or two Starforges by skipping a fusion. At 1 starsteel
everything gets starred; at 3, most runs cannot afford one.

**Evolutions, fusions and salvage** (built in M40, since starred weapons will evolve and fusion):
- Evolving a Starforged weapon keeps the star. The mutation follows the new behavior. Three recipes
  change behavior: Rending Axe (arc) → Whirlwind Cleaver (aura), Halo (pulse) → Judgement (judge), and
  Cinder Ward (aura) + Rime Orbs → Vapor Wheel (trail). Starsteel is never wasted.
- Fusions: the host keeps its behavior, so a starred host keeps its mutation. A starred donor fused
  into an unstarred host passes its star on. If both are starred, the donor's star is lost; the fusion
  screen warns first.
- Salvage: no refund (the forge warns), so a star cannot be sold back for value.

**First four mutations** (one per common shape, so the system is proven before the content grows):

| Behavior | Mutation | Draft numbers |
|---|---|---|
| projectile | Starfall: every 5th volley, each enemy its arrows hit calls a star down on that spot (replaced the comet in v0.40.4: it looked like Sunpiercer) | 0.35 s delay, 40 radius, 45% of the arrow |
| slam | Each slam collapses 0.4 s later: a wider ring that pulls enemies back in | 1.3x radius, 30% damage, inward pull (tuned in v0.40.3/4) |
| orbit | Binary Stars: each blade becomes a pair of smaller blades spinning around each other (replaced Counter Ring in v0.40.4: an outer ring missed anything at melee range) | halves 0.85x size at 85% damage, 1.1 blade radii apart |
| boomerang | Returns twice | second outbound trip at 80% damage |

**Structure.**
- Data: `data/starforge.js` with `STARFORGE = { cost: 2 }` and `MUTATIONS` keyed by behavior
  (`{ name, desc, params }`).
- Rules: `game/starforge.js` (`canStarforge`, `starforge`, `starOf(inst)`). `inst.star` is a
  boolean; the mutation is looked up from the weapon's current behavior, so evolution needs no
  migration.
- Behaviors read `inst.star` and their `MUTATIONS` entry (the same pattern as fusion `hooks`).
- UI: a Starforge panel at the forge listing eligible weapons and showing the mutation text. The
  compendium entry for each behavior's weapons shows its star mutation.
- Bench bot: Starforges its best weapon once it is at max level and it has 2 spare starsteel.

- Tests: cost and max-level gate; once per weapon; star survives evolve, including a behavior change
  (the mutation follows); donor-to-host transfer and the both-starred loss; salvage gives no starsteel;
  snapshot round-trip; each of the four mutations fires (comet on volley 5, aftershock 0.4 s later,
  outer ring present, second return).
- Done when: tests pass, the four mutations are checked in the browser (and the weapon preview), and
  the bench reports win rates with Starforge on.

## 6. M41: Starforge, six more mutations

| Behavior | Mutation | Draft numbers |
|---|---|---|
| aura | Every 3 s the aura releases an outward shockwave ring | ring to 2x radius, 80% damage |
| rod | Each strike leaves a star mark that detonates | 1 s fuse, 60 radius, 70% damage |
| nova | Shards turn at max range and fly back through the crowd | return trip at 70% damage, pierce kept |
| arc | Each swing leaves a crescent that cuts again | 0.5 s later, 60% damage |
| chain | The chain forks at its first target | fork with half the jumps, 70% damage |
| trail | Trail patches pulse outward once before fading | pulse to 1.5x radius, 50% damage |

- Tests: each mutation fires and draws (a non-empty fx or projectile appears when it should).
- Done when: tests pass and each mutation is checked in the weapon preview.

## 7. M42: Starforge, the last five mutations and a balance pass

| Behavior | Mutation | Draft numbers |
|---|---|---|
| mortar | Shells split into 3 bomblets on landing | bomblets 40% damage, 0.6x radius |
| bolt | After its first hit, a bolt homes on one more target | 80% damage, range 160 |
| summon | +1 star-touched minion | bigger, glowing, 1.5x damage and hp |
| pulse | Each ring echoes outward twice | echoes 0.25 s apart, 50% damage |
| judge | Pillars strike twice | 0.3 s apart, 60% damage |

**Balance pass.** Bench all 15 mutations with `--builds` (crowd clear and boss duel, starred against
unstarred) and `--bots` (win rate and late screen-clear fraction). Target: a Starforge is worth about
20–40% more crowd damage on its weapon, and no mutation is more than 2x the median. A Starforged
masterwork fusion at +15 is the strongest combination in the game; check it is not run-breaking.

- Done when: all 15 mutations ship, the bench table is in `docs/architecture.md`, and outliers are trimmed.

## 8. Rules for every milestone

- Same as always: small labelled commits, docs (`docs/architecture.md`, `docs/roadmap.md`) updated in
  the same commit, `src/version.js` bumped (`0.<milestone>.<n>`), tests and the offline check pass.
- Every new effect is **visible**: if it changes what a weapon does, it changes what you see.
- New fields on weapon instances are plain data, so run snapshots keep them with no special cases.
- New sfx get GAP entries so busy fights do not stack them.

## 9. Decisions

- Starsteel keeps its current sources. Supply is not raised to fund the new sinks: they compete with
  each other and with evolutions on purpose.
- Star Quench charges come in variable amounts per starsteel because a guarantee is worth 1 iron at +4
  and over 4,000 at +14.
- Starforge is keyed to behavior, not weapon: 15 mutations instead of 36, and it works on evolutions and
  fusions with no extra content.
- Open: whether luck should also affect Quench (for example, a chance of a bonus charge). Left out for
  now.
