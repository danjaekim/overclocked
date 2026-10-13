# Roadmap after the prototype (M9 onward)

The prototype milestones (M0 to M8, `docs/architecture.md` §10) are done: the loop, two open classes plus
the Berserker, five weapons, the forge, shrines, evolutions, a boss, titles, saving and install support.
This file plans what comes next, driven by the first playtest (2026-10-13). Same rules as before: small
milestones that fit one mobile-sized session, each pushed with its tests, docs updated in the same commit.

## What the playtest told us

1. **Sound** did not play on the phone. Likely cause: iPhone's silent switch mutes WebAudio, and Safari
   only unlocks audio on certain gestures. Fixed in `audio/audio.js` (more unlock events, a playback
   audio session, a silent keep-alive track) and `?debug=1` now shows the audio state. **Still needs
   confirming on the phone.**
2. **Build variety is thin.** There are 6 passives and almost no non-numeric upgrades. Real synergy needs
   statuses (burn, slow, freeze, shock) plus modifiers that interact with them, and many more small
   modifiers to pick from.
3. **Role imbalance.** Area weapons (Cinder Ward, arcs) clear crowds; the Archer's single arrow does not,
   and nothing in the upgrade pool fixes that (no chain, ricochet, split or size).
4. **Reforge** should offer a choice, and its pool needs more exciting effects.
5. **Evolution requirements** (weapon level 8) feel slow to reach. Elites that drop chests would help.
6. Performance held for a whole run on the phone, and the Smith's forge economy felt good.

Balancing exact numbers is premature, but fixing the *shape* of the options (roles, scaling, what can
combine) is not: it decides what content to build. So: measure first, build the missing systems, then tune.

## Milestones

M10–M13 are specified in detail in `docs/design-m10-m13.md` (status model, hit pipeline, perk catalogue, builds, chests, forge choices), which also proposes splitting M11 into M11a/M11b and adding tempers to M13.

| # | Name | Contents |
|---|---|---|
| **M9** *(done)* | Measure and fix the basics | Confirm sound on the phone. `tools/bench.mjs`: a headless benchmark that reports, per weapon at levels 1, 4 and 8, single-target DPS and time to clear a 20-enemy crowd, plus a simple bot run per class (level, kills, survival at 5:00 and 10:00). Archer starting kit buff (the bench decides how: base pierce 1, a 2-arrow fan, or faster fire). |
| **M10** *(done)* | Status effects | A status layer on enemies: **burn** (damage over time), **slow**, **freeze** (a hard stop that can shatter), **shock** (chains to nearby enemies). Fixed-size, allocation-free, ticked in the reserved step 9 of the tick. Hit effects: weapons and upgrades can apply a status on hit. Conditions and tags that read statuses (`targetBurning`, `targetFrozen`), so upgrades like "30% more damage to burning enemies" are plain data. Visual tints per status. Elemental identity for existing weapons (Ember Bow burns, Storm Javelin shocks) and one new ice weapon. |
| **M11** | Perks (the modifier pool) | A new upgrade category: many small stackable **perks** (3 to 5 levels each, no slot cap), scoped by weapon tag. First set of about 20: projectile size, ricochet/bounce, chain, split on hit, explode on kill, +pierce, burn/slow/freeze/shock chance, status duration, crit variants, lifesteal, extra blade/swing, and **synergy payoffs** that need two parts: *Shatter* (frozen enemies explode), *Wildfire* (burning enemies spread burn when they die), *Conductive* (shock jumps further and prefers burning targets). Offers lean toward perks that match your owned weapon tags (about 1.5x), which guides a build without forcing it. Target: at least 6 distinct builds that can carry a run (for example fire bomb, freeze and shatter, chain lightning crit, crowd-control aura, glass cannon). |
| **M12** | Elites and chests | Elite enemies on the timeline (roughly every 75 s from 1:30): glowing, bigger, tougher, with one affix (fast, shielded, volatile, regenerating). They drop a **chest**. A chest opens a treasure screen with **1, 3 or 5 rolls** (weighted, luck helps); each roll levels a random owned weapon, passive or perk. Rolls are biased toward items that block an available evolution (low weapon level or passive level), so combines stop feeling like a grind. The boss drops a guaranteed 5-roll chest. |
| **M13** | Reforge choice | Reforge shows 3 random options and you pick one (instead of accepting a blind reroll). Multi-affix weapons reforge one slot at a time. The affix pool grows to include the M10/M11 effects (burn on hit, chain, explode, size, freeze), tiered by rarity, so crit chance becomes the boring common pick and not the default. Optional lock on a slot you like. |
| **M14** | More weapons and evolutions | 3 to 4 more weapons that fit the element builds (an ice weapon if M10 did not add one, chain lightning, a ricochet/boomerang weapon). An evolution recipe for every starting weapon (at least 6), including recipes that need a perk or a status build, not just levels. A true **fusion** of two weapons into one. |
| **M15** | Balance pass and class parity | Driven by the M9 bench: single-target vs area weapon parity, scaling curves, enemy hp and spawn tuning, boss tuning, forge costs. Then the remaining classes: **Mage**, **Summoner** (needs a minion behavior), **Saint**. |
| Later | | More enemy types (ranged, splitters, chargers) and biomes, real art and music, meta progression beyond unlocks, daily seed. |

### Why this order

Measure (M9) so later tuning is evidence, not feel. Statuses (M10) before perks (M11), because most
synergy perks refer to them. Chests (M12) need perks to roll into. Reforge choice (M13) needs the larger
effect pool. New weapons and recipes (M14) are the payoff once the systems exist. Balance (M15) last,
because it is wasted work while the option pool is still changing.

### Design notes

**Statuses.** Enemy pool objects get a few fixed fields (`burnT`, `burnDps`, `slowT`, `slowMul`,
`freezeT`, `shockT`), not per-enemy arrays. A hit carries "on-hit effects" resolved in `flushDamage`,
next to the existing trigger dispatch, so projectiles, arcs, auras and explosions all share one path.
Status potency and duration are stats (`statusPower`, `duration`) so passives and perks scale them.
Depth limits on chains and spreads reuse the existing trigger depth cap.

**Perks.** Same data shape as passives (`levels`, `levelText`, `tags`) plus optional `requires` tags and
`triggers`/`onHit` entries, so most are data only. Tag scoping already exists: a fire perk's modifiers
carry `tags: ['fire']` and only reach fire weapons. Synergy payoffs are triggers with a status
condition, for example `{ on: 'kill', when: 'targetFrozen', effect: 'explode' }`.

**Chests.** Chest rolls are a pure function of (state, rng), like level-up offers, so they are tested the
same way: same seed and state give the same rolls. The "bias toward blocked evolutions" rule reads the
recipe checklist that the forge already computes (`game/evolution.js#checklist`).

**Reforge choice.** `reforge()` becomes two steps: `rollChoices(run, inst)` returns 3 affix options,
`applyChoice(run, inst, choice)` commits one. The UI shows the three as cards. Cost is charged when the
choices are rolled.

**Archer.** The bench will say which lever is right, but the candidates are: base pierce 1, a 2-arrow
starting fan, and a class-wide small chain chance. M11 gives every class real ways to scale single-target
damage (chain, ricochet, split), which matters more than the starting buff.

## M9 as built

`node tools/bench.mjs [--weapons|--bots] [--quick] [--json]` reports single-target DPS (L1/L4/L8), 20-enemy crowd clear (10 s / 20 s) and a role-aware bot run per class. Findings and fixes:

- Projectile fans made "+N arrows" nearly useless against one target at range. Projectile weapons now fire a tight volley (`spread` 0.02 rad plus a sideways `gap`), so extra arrows all land. Ember Bow: damage 14, cooldown 0.9, pierce 1; its level-8 bonus is 10% more damage.
- Spirit Blades orbit radius 74 -> 46 (the ring was too wide to touch enemies at contact range).
- Rending Axe damage 30 -> 24, cooldown 0.85 -> 0.9; Berserker lifesteal 3% -> 2%.
- Bot result (3 seeds, quick): Archer 2/3 wins, Smith 3/3, Berserker 3/3; avg level 14 / 12 / 17. Classes are within about 2x of each other, which is the bar until M15.
- Sound is still unconfirmed on iPhone (check the `audio` line under `?debug=1`, and the ringer switch).
