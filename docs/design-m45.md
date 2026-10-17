# M45: Forge rework (tempers, affixes, a legendary tier)

Written after a forge review with Dan (v0.44.19). Each milestone below ships on its own, in order, with the usual
rules: small labeled commits, a version bump (`0.45.n`), docs rows updated in the same commit, tests, and
`node tests/run.mjs`, `node tests/offline.mjs`, `node tests/smoke.mjs --ui --music` green. **Show Dan before
shipping** anything that changes what the forge offers. Post a short comparison table (bench numbers) for
balance changes, and a screenshot of the forge cards for UI-visible changes. Ship on his "ship it".

## Why

- **Hasted always wins.** At +5 the generic pair is Honed (20% more damage) vs Hasted (-20% cooldown).
  Hasted is 1/0.8 = 1.25x attacks, already more than 1.2x. It also multiplies everything that fires per
  attack, which Honed does not: on-attack triggers, fusion payloads, status rolls, Thunderscythe shells,
  Stormfall's every-other-volley. So the +5 choice is not a choice.
- **Only 4 of 36 weapons have their own tempers** (Ember Bow, Forge Hammer, Storm Javelin, Rending Axe).
  Every other weapon sees Honed/Hasted at +5 and Mighty/Vast at +10.
- **Some affixes are never picked.** Keen (+5% crit chance) is worth about +2.5% damage at the base 1.5x
  crit multiplier. Brutal (+0.3 crit multiplier) at the base 5% crit is about +1.5%. Shoving (+50% knockback)
  often hurts: it pushes enemies out of auras, melee arcs and parked Gyres. Heavy (+12% `inc` damage) shrinks
  as the weapon is enhanced, because it adds to the +8%/level enhance `inc` (worth about +6.7% at +10).
- **The epic tier is thin and conditional.** Executioner needs crits; Colossal is the only unconditional
  epic. Many rares need a tag (projectile, storm, fire), so a weapon without them sees few real options.
- **Untouched stats:** `duration`, `projSpeed`, projectile size and summon count have no affix, though many
  weapons now lean on them: trails, patches, vortices, pillars, rods, parked Gyre, mortar and Stormfall shells,
  minions.

Data lives in `src/data/forge.js` (`ENHANCE.tempers`, `AFFIXES`, `REFORGE`) and per-weapon
`forge.tempers` in `src/data/weapons.js`. Rules are in `src/game/forge.js` (`tempersFor` picks a weapon's own
pair over the generic one; reforge rolls 3 affixes filtered by `requires`). Stats are in
`src/stats/stat-defs.js`. Measure with `tools/bench.mjs --dps` (and `DPS_IDS=`), bots with
`tools/variants.mjs`, following `docs/balance-playbook.md`.

## M45a: retune the generic tempers (small, do first)

Goal: at +5 and +10 the two generic options are roughly even in damage over a fight, so the choice is about
playstyle. Hasted keeps its extra procs, so Honed must be worth clearly more than 1.25x on paper.

- Measure first: for a spread of weapons (one per behavior: projectile, slam, orbit, aura, rod, nova, arc,
  chain, boomerang, trail, mortar, bolt, summon, pulse, judge), DPS with Honed vs Hasted at +5, and Mighty vs
  Vast at +10, single target and crowd. Add a `--tempers` mode to `bench.mjs` if that is the cleanest way
  (tooling only, no version bump on its own).
- Starting candidates: Honed 30% more damage; or Hasted -15% cooldown. Pick from the numbers; the target
  is no option winning on both columns for most weapons.
- Tests: the generic pairs exist and validate; a bench-style check is not needed in tests.

## M45b: tempers by weapon shape

Goal: every weapon offers a temper pair that fits how it attacks, a playstyle choice rather than two flat
bumps. Add per-behavior temper pairs (a new `TEMPERS_BY_BEHAVIOR` in `data/forge.js`, keyed by
`behavior`, for +5 and +10). `tempersFor` order becomes: the weapon's own `forge.tempers`, then its
behavior's pair, then the generic pair. The four class weapons that already have their own keep them.

Starting point (numbers to be benched; +10 versions are stronger or a different axis, such as an element
infusion versus a mechanic change, like Ember Bow's Flamebow/Stormbow):

| Behavior | Option A | Option B |
|---|---|---|
| projectile, rod, nova | **Longshot**: +2 pierce, +40% projectile speed, 30% more damage | **Barrage**: +2 projectiles, 10% less damage |
| slam, arc | **Crushing**: 40% more damage, hits stagger (short stun), +15% cooldown | **Flurry**: -25% cooldown, 10% less area |
| orbit | **Halo of Blades**: +2 blades | **Whirling**: spins 40% faster, 20% more damage |
| aura, pulse | **Wide Ring**: 35% more radius | **Searing Ring**: ticks 30% faster |
| summon | **Pack**: +1 minion | **Alpha**: minions 40% bigger and 40% stronger |
| bolt, chain | **Forked**: +1 target and +1 chain | **Focused**: 50% more damage on the first target |
| trail, mortar, boomerang, judge | **Lingering**: 50% longer lasting (patches, shells, parked time, pillars) | **Volatile**: 40% more damage, bursts when it expires |

- Any mechanic that needs code (stagger on hit, burst on expiry, faster spin, first-target bonus) goes
  through stats or hooks that behaviors already read where possible; add a stat to `stat-defs.js` rather than
  special cases. Check each behavior's `uses` list so the stat actually applies.
- Every weapon must end up with a valid pair at +5 and +10 (test). The temper text must describe what it does
  for that weapon (test that no projectile text appears on a slam, as in the masterwork text tests).
- Visible: the forge cards show the new names and text. Screenshot the +5 choice for 3 different shapes.
- Bench: per-shape A vs B within about 15% of each other on at least one of single-target or crowd, and
  neither option strictly better on both.

## M45c: affix cleanup and new affixes

Fix the never-picks:

- **Merge Keen and Brutal** into one common **Keen**: +8% crit chance, +0.4 crit multiplier. Remove Brutal.
- **Replace Shoving** with **Staggering** (common or uncommon): 10% chance on hit to stun 0.4 s (the stun is
  `e.stunT`, see `systems/status.js`; bosses take half as the existing stun code does).
- **Heavy** becomes a `more` bonus (about 10% more) so it does not shrink with enhance.

New affixes (rarity in brackets; `requires` where it only makes sense on some shapes):

- **Lingering** [uncommon]: +35% `duration`. Trails, patches, vortices, pillars, rods, parked Gyre, shells.
  Check every behavior that should read `duration` does.
- **Broad** [uncommon, projectile]: +40% projectile size (add the stat if missing; pairs with Heavy Fletching).
- **Swiftshot** [uncommon, projectile]: +40% projectile speed, +1 pierce.
- **Bane** [rare]: 30% more damage to elites and bosses (new conditional stat read in `systems/damage.js`).
  Matters more now with the Crusher, the Ashen Seer and the war party.
- **Seeking** [rare, projectile]: projectiles curve toward the nearest enemy. The old Eventide `bend` hook
  in `systems/movement.js` (removed in v0.44.18, see git history) is the model: turn rate limited per tick.
- **Packmaster** [rare, summon]: +1 minion.

Unconditional epics (today only Colossal is unconditional):

- **Echoing**: every 4th attack repeats at 60% (fires the attack again; it counts as an attack for
  triggers, so watch for loops: the repeat must not count toward the next echo).
- **Overcharged**: every 3rd attack deals double damage with 30% more area.
- **Hunter's Mark**: the weapon's first hit on an enemy marks it for 4 s; marked enemies take 20% more damage
  from all your weapons. A reason to pair weapons.
- **Prismatic** (infusion): counts as fire, frost and storm (adds all three tags) with a 10% chance of each
  status. Joins every element's perks and resonance; exclusive with the other infusions.

- Tests: validate data (no affix with an unknown stat, requires tags exist); Keen/Brutal merge and Shoving
  replacement migrate cleanly for weapons in a saved run snapshot if snapshots store affix ids (check
  `game/run-snapshot.js`); each new mechanic has a behavior test (Seeking curves, Echoing repeats once per 4
  attacks, Mark raises damage from another weapon, Lingering lengthens a patch).
- Bench: reforge option value. Each affix's DPS gain on 3 representative weapons; nothing under +5% at its
  rarity, and no epic over about +40%.
- Compendium Forge tab entries update automatically from `AFFIXES`; check the text reads well.

## M45d: legendary tier

A separate, build-defining slot so it does not dilute the reforge pool.

- **Unlock:** one legendary slot per weapon, at +10 enhance, bought with starsteel (start at 2). You see 3
  legendaries filtered by the weapon's shape and pick 1. Rerolling costs starsteel too.
- **Pool (starting point):**
  - **Wellspring**: kills by this weapon cut its current cooldown by 10%.
  - **Overflow**: damage beyond a kill carries to the nearest enemy.
  - **Starfall**: every 10th attack calls a falling star at the thickest crowd (an area blast).
  - **Bloodpact**: 50% more damage; every attack costs 1 hp (pairs with Berserker lifesteal; can't kill you,
    stops at 1 hp).
  - **Twinned**: the whole attack fires again 0.3 s later at 50%.
- UI: a new section in the forge weapon card, a distinct legendary color (add it to `data/rarities.js`), and
  the compendium Forge tab lists them. Show Dan a mockup screenshot before building the UI.
- Save/snapshot: the legendary id is stored on the weapon instance; fusing keeps the host's, the donor's is lost
  (state this in the fusion rules text). Salvage loses it.
- Bench: a legendary should be a clear but not mandatory jump (about +30 to +60% for that weapon). Run bots
  (`BOT_SPEND=all` so they buy it) for all classes at 100 seeds and compare win rates.

## M45e: review and tune

- Bot bench for all classes, plain and smart, 100+ seeds, before and after M45a-d. The forge should not
  push win rates up more than about 5 points overall; if it does, raise enhance or reforge costs, not
  the new options' power.
- Update `docs/balance-playbook.md` with the temper bench mode and anything learned.
- Update `data/builds.js` tips that name affixes or tempers (Searing, Conductive, Ricocheting, Splitting,
  Ember-touched...) if any changed.
