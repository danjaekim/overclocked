# Roadmap after the prototype (M9 onward)

The prototype milestones (M0 to M8, `docs/architecture.md` §10) are done: the loop, two open classes plus
the Berserker, five weapons, the forge, shrines, evolutions, a boss, titles, saving and install support.
This file plans what comes next, driven by the first playtest (2026-10-13). Same rules as before: small
milestones that fit one mobile-sized session, each pushed with its tests, docs updated in the same commit.

Balance work (a class, a weapon, a Starforge mutation, a masterwork) follows `docs/balance-playbook.md`.

## What the playtest told us

1. **Sound** did not play on the phone. Likely cause: iPhone's silent switch mutes WebAudio, and Safari
   only unlocks audio on certain gestures. Fixed in `audio/audio.js` (more unlock events; the playback audio session and silent keep-alive track added then were removed in v0.34.1 so the game obeys the silent switch) and `?debug=1` now shows the audio state. **Still needs
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
| **M11** *(done: M11a, M11b)* | Perks (the modifier pool) | A new upgrade category: many small stackable **perks** (3 to 5 levels each, no slot cap), scoped by weapon tag. First set of about 20: projectile size, ricochet/bounce, chain, split on hit, explode on kill, +pierce, burn/slow/freeze/shock chance, status duration, crit variants, lifesteal, extra blade/swing, and **synergy payoffs** that need two parts: *Shatter* (frozen enemies explode), *Wildfire* (burning enemies spread burn when they die), *Conductive* (shock jumps further and prefers burning targets). Offers lean toward perks that match your owned weapon tags (about 1.5x), which guides a build without forcing it. Target: at least 6 distinct builds that can carry a run (for example fire bomb, freeze and shatter, chain lightning crit, crowd-control aura, glass cannon). |
| **M12** *(done)* | Elites and chests | Elite enemies on the timeline (roughly every 75 s from 1:30): glowing, bigger, tougher, with one affix (fast, shielded, volatile, regenerating). They drop a **chest**. A chest opens a treasure screen with **1, 3 or 5 rolls** (weighted, luck helps); each roll levels a random owned weapon, passive or perk. Rolls are biased toward items that block an available evolution (low weapon level or passive level), so combines stop feeling like a grind. The boss drops a guaranteed 5-roll chest. |
| **M13** *(done)* | Reforge choice | Reforge shows 3 random options and you pick one (instead of accepting a blind reroll). Multi-affix weapons reforge one slot at a time. The affix pool grows to include the M10/M11 effects (burn on hit, chain, explode, size, freeze), tiered by rarity, so crit chance becomes the boring common pick and not the default. Optional lock on a slot you like. |
| **M13b** *(done)* | Build view and run stats | Requested after M13. A **build panel** (key stats, weapons with tempers/affixes, passives, techniques, resonance, titles) opened from the pause menu, by tapping the HUD, and from a Build button on the level-up screen, which also shows a one-line summary of what you own. **Run stats**: damage per weapon and per cause (direct, burn, shock chains, blasts, Quench, Overload, Shatter, Thunderclap), kills, DPS now / average / peak; shown live in the build panel and as a breakdown on the end screen. |
| **M14** *(done)* | More weapons and evolutions | 3 to 4 more weapons that fit the element builds (an ice weapon if M10 did not add one, chain lightning, a ricochet/boomerang weapon). An evolution recipe for every starting weapon (at least 6), including recipes that need a perk or a status build, not just levels. A true **fusion** of two weapons into one. |
| **M15** *(done)* | Balance pass and class parity | Driven by the M9 bench: single-target vs area weapon parity, scaling curves, enemy hp and spawn tuning, boss tuning, forge costs. Then the remaining classes: **Mage**, **Summoner** (needs a minion behavior), **Saint**. |
| **M16** *(done)* | Compendium | An in-game guide reachable from the title screen and pause menu: every weapon, passive, perk, alloy, affix, temper and recipe, with categories (element, kind, rarity, class) and filters, plus a **Builds** tab that lists the synergies (which perks and weapons combine into which build, what to reroll or look for). Generated from the data files so it can never drift; locked entries show as `???` with their unlock hint until seen. Needs content to be stable, so it comes after the M15 balance pass. |
| **M17** *(done)* | Run history and export/import | The save keeps the last 100 runs (class, result, time, kills, level, damage, DPS, seed and the full build). A History screen on the title menu has totals, class and wins-only filters, expandable builds and Same seed. Export / import turns the whole save into a copyable code (checksummed, compressed) so progress can be backed up or moved between the Safari tab, the home-screen app and other devices. |
| **M18** *(done)* | Music | Three synthesized techno tracks (title, run, boss) and layered sound effects with a music toggle and volume slider on the title and pause screens, saved with the game. See `architecture.md` M18. Sound effects were replaced with layered versions (`audio/sfx.js`), including a rising gem-pickup chain. |
| **M19** *(done)* | Character art in the game | The six classes drawn as sprites (woodcut ink style), portraits on class select. See `architecture.md` M19.  |
| **M20** *(done)* | Enemy art in the game | Goblin, Brute and Warlord drawn as sprites. See `architecture.md` M20.  |
| **M21** *(done)* | Loot and prop art | Gems, ore, chests and the shrine anvil as sprites (set C). See `architecture.md` M21. |
| **M22** *(prototype)* | Evolved-weapon glow | A mote per evolved weapon orbits the hero in its element colour, plus a halo. Judge it on a phone before building art for it. |
| **M23** *(done)* | Title and results art | Anvil title scene and win/lose results scenes. See `architecture.md` M23. |
| **M24** *(done)* | Playtest fixes | Forge picks open as a panel, goblins slower with a steeper late spawn ramp, level-up offers favour and mark what an evolution still needs. See `architecture.md` M24. |
| **M25** *(done)* | Evolution access and enemy variety | Elite starsteel, evolutions at weapon level 6, armoured Shieldbearers and ranged Slingers. See `architecture.md` M25. |
| **M26** *(done)* | Branch evolutions | Shared effect vocabulary (attack trigger, patches, vortices, pillars, shockwaves, sunder, bless) and six new evolutions, one more per starter weapon. See `architecture.md` M26 and `design-m26-m28.md`. |
| **M27** *(done)* | Grafts | Forge grafting (1 starsteel, donor consumed), generic echo, masterworks 1-6, discovery in the save and Compendium. See `architecture.md` M27.  |
| **M28** *(done)* | Masterworks 7-12 and late-game difficulty | Black Sun, Bladestorm, Comet, Fault Line, Wrath, Familiars; Armoured and Volatile elites, second affixes, War Party, Splitter and Shaman, tougher last wave. See `architecture.md` M28a/M28b. M28c: first tuning pass after a mage playthrough (see architecture.md). Next: more playtest tuning; art rounds for Shieldbearer, Slinger, Splitter, Shaman and masterwork illustrations; Apex grafts. |
| **M29** *(done)* | Crowd control perks | Chain Reaction, Forked Strikes, Broad Strokes; Shatter works without a frost weapon. M29b: forge Weapons / Graft tabs, grafts shown on the results screen and in run history. See `architecture.md` M29. |
| **M30** *(done)* | Graft payloads | The generic echo is replaced by a payload on every attack: the host's first hit fires an effect shaped like the donor (shrapnel, cleave, spinning blades, imprint, arc, shard burst, blast, pounce, smite). `tools/bench.mjs --grafts` measures it. See `architecture.md` M30 and `design-m30-m33.md` §3. |
| **M31** *(done)* | Frost Wake and Halo Pulse | Rime Orbs became a frost trail you leave as you move (Vapor Wheel became Steam Wake); Halo became expanding light rings (Radiant Halo became Radiant Pulse). Ids unchanged. `trail` and `pulse` behaviors. See `architecture.md` M31 and `design-m30-m33.md` §4. |
| **M32** *(done)* | Slam, Chain Lightning, Lightning Rod | Forge Hammer, Colossus Maul and Quakebreaker crater the thickest part of the crowd and stagger it (new `stunT`); Static Rod becomes Chain Lightning (jumps enemy to enemy); Storm Javelin, Thunder Lance and Stormfrost Lance plant rods that zap, link or chill. Ids unchanged. See `architecture.md` M32 and `design-m30-m33.md` §5. |
| **M32b** *(done)* | Live weapon preview | Every weapon entry in the Compendium (Weapons and Evolve tabs) has a "Watch it in action" canvas running the real engine: the weapon at Lv 1, a middle level or Max against an endless crowd. No files, so offline is unaffected. v0.32.1. |
| **M33a** *(done)* | Chakram branches | Ricochet Saw (hops between up to 6 enemies, +8% damage per bounce; needs the Ricochet technique at level 2) and Gyre (parks at the far end of its throw and spins as a buzzsaw for 1.5 s, dragging the crowd in; needs Wind Sigil at level 2). v0.33.0. See `architecture.md` M33a. |
| **M33b** *(done)* | Masterwork review | All 12 checked against host alone, both weapons, and the generic payload (`tools/masterwork-review.mjs`). Five were below the generic graft and were retuned: Hellhounds, Sanctum Titan (now pulses rings of light), Bladestorm, Comet (shards burst at the last enemy, not off-screen) and Familiars. Three new masterworks proposed, not built: Aurora Wake, Millstone, Storm Saw. v0.33.1. See `design-m30-m33.md` §6.2a-b. |
| **M33c** *(done)* | Tempest | Chain Lightning's evolution (level 6 + Static Charge 2 + starsteel): the chain branches, every struck enemy forking the bolt to two more for three generations (four at level 5). The chain shape can now be grafted (donor payload Arcing x2). Chain Lightning still fuses into Stormshell Mortar. v0.33.2. |
| **M34** *(done)* | Four new masterworks | Aurora Wake (Steam Wake + Radiant Pulse), Millstone (Gyre + Colossus Maul), Storm Saw (Ricochet Saw + Thunder Lance), Stormspire (Thunder Lance + Tempest). 16 masterworks in all. v0.34.0. |
| **M35** *(done)* | Run resume | Pause, close the app, reopen: you land on the pause screen of the same run (v0.35.0). The whole run is snapshotted to `localStorage` when the game pauses (including every app switch) and when a level-up, chest or forge screen is open; cleared on quit, win or loss. Restored runs play on identically to uninterrupted ones (tested). Not saved: debug/god runs, `?seed=`/`?class=` URLs. A snapshot from an older encoding is dropped. |
| **M35b** *(done)* | Graft payload audit | Found while playing: a Quakebreaker of Saws made almost no visible saws. Saws are now two spinning, hopping discs; Shards and Cleaving were strengthened; `tools/payload-audit.mjs` checks every generic payload adds a real share of damage (15 payloads, 15-35%). v0.35.1. |
| **M35c** *(done)* | Debug lab fixes | In `?debug=1` the lab's weapon buttons reused an already-grafted copy (so a plain weapon still carried its masterwork's effects); they now add a fresh plain copy. The lab also lacked the three alloy evolutions (Steam Wheel, Stormshell Mortar, Stormfrost Lance). The debug text lists grafted weapons by graft name and both parents. v0.35.2. |
| **M36** *(done)* | Class identity | Each class has a signature trait that works with any build: Archer Deadeye (Long Shot, Fleet, Evasion), Smith Forgemaster (Tempered Steel, Heavy Blows, more ore), Berserker Bloodlust (Frenzy stacks), Mage Attunement (stronger elements, Arcane Ward), Summoner Soul Harvest (souls from kills), Saint Sanctuary (Holy Nova). Shown on the class cards and the build panel. Balance: `tools/bench.mjs --classes` (same build, every class) and 20-seed bots, where the win spread narrowed from 3-19 of 20 to 10-20 of 20. v0.36.0. Needs a playtest: do the traits feel distinct? |
| **M36b** *(done)* | Element-true shots | Projectiles look like their element (ice crystals, embers, sparks) and grow with area, so Colossal is visible and matches the hitbox. Melee swings, slams and orbit blades are still element-neutral. v0.36.1. |
| **M36c** *(done)* | Element visuals on every weapon | Swings, slams, orbit blades, auras, mortars, discs, minions and chain bolts draw in their weapon's element colour, including forge infusions (an Ember-touched axe swings orange). Arcane bolts are now violet instead of storm yellow. v0.36.2. |
| **M36d** *(done)* | Visuals match stats | Skeletons now grow with area (they were drawn small while hitting wide) and a faint dashed ring shows your magnet range once it is above normal. v0.36.3. |
| **M37** *(done)* | Supply crates | About one crate every 75 s appears just past the screen edge with a green arrow. Any attack breaks it; weapons never aim at it. It drops a heart (15% max hp, weighted up when you are hurt, never at full hp), a burst of xp, or ore. Hearts wait on the ground until you need them. v0.37.0. Next: rerolls and other drops in the same table, if the heal feels right. |
| **M38** *(done)* | Magnet, shrines, late pressure, fusion odds | Crates can drop a magnet (only when there is loot on the ground) that pulls in all xp, iron and hearts. Shrines last 80 s (boss shrines 150 s). Spawn rate ramps up to x1.8 from 3:00 to 10:00 so the late screen stops clearing. Level-ups and chests lean toward weapons that complete a fusion you can build. v0.38.0. Next: tune from real play (ramp end, partner boosts), rerolls in the crate table. |
| **M38b** *(done)* | Berserker iron check | Not an iron bug: the Berserker bot kills about 40% fewer enemies (3,200 against 5,300) because it is hurt 66% of the run and cannot fight from a retreat. Fighting wounded instead drops bot wins from 17/20 to 3/20. Fixed in v0.38.1: lifesteal 2% and +2 armor (bot wins 20/20, kills in line with other classes). Findings in `docs/design-m39-m42.md` §3. |
| **M39** *(done)* | Star Quench (v0.39.0) | 1 starsteel buys Quench charges on a weapon (3 at +4 to +9, 2 at +10 to +12, 1 at +13 to +14). Each charge makes the next enhance attempt certain, with no downgrade; iron is still paid. +10 to +15 becomes 3 starsteel and about 180 iron instead of about 6,800 iron of gambling. Spec: `docs/design-m39-m42.md` §4. |
| **M40** *(done)* | Starforge core (v0.40.0) | 2 starsteel, once per weapon, at max weapon level: one visible mutation keyed to the weapon's behavior, so it works on base, evolved and grafted weapons. The star survives evolution (the mutation follows the new behavior) and passes from a graft donor to an unstarred host. First four: projectile comet, slam aftershock, orbit outer ring, boomerang double return. Spec: `docs/design-m39-m42.md` §5. |
| **M41** *(done)* | Starforge, six more (v0.41.0) | Aura shockwave, rod star mark, nova return, arc crescent, chain fork, trail pulse. Spec: `docs/design-m39-m42.md` §6. |
| **M42** *(done)* | Starforge, the last five and a balance pass (v0.42.0) | Mortar cluster shells, bolt seeking, summon star-touched, pulse echoes, judge double strike: all 15 behaviors have a mutation. Typical crowd gain about +45%; outliers trimmed. See `docs/architecture.md`. |
| **M42b** *(done)* | Starforge measurement (v0.42.1) | Bot win rates, all 36 weapons star vs none, and all 16 masterworks at +15 with and without a star; Aftershock no longer re-fires hit triggers. Numbers in `docs/architecture.md`. |
| **M43** *(done)* | Archer rework (v0.43.0) | Quiver (+1 shot on every ranged weapon, replacing +1 pierce), Rain of Arrows class trait, Ember Bow Embers at level 4. Archer bot win rate 47% -> 69% (smart bot 55% -> 75%). Bench tools: `CLASS_OVERRIDE`, `WEAPON_OVERRIDE`, `BOT_POLICY=smart`, `tools/diag-class.mjs`. |
| **M43b** *(done)* | Archer recheck (v0.43.1) | Embers no longer cascade (trigger `direct`), Rain of Arrows every 3 s; Archer 67% / 77% (plain / smart bot). Balance procedure: `docs/balance-playbook.md`, runner `tools/variants.mjs`. |
| **M26–M28** *(planned)* | Evolution branches and grafts | Two evolutions per starter weapon, grafting one evolved weapon into another (12 named masterworks plus a generic echo graft), a shared effect vocabulary, and late-game difficulty. Spec: `docs/design-m26-m28.md`. |
| Later | | More enemy types (ranged, splitters, chargers) and biomes, real art, meta progression beyond unlocks, daily seed, cloud sync. |

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
- v0.34.1: the game now respects the iPhone silent switch. `audio/audio.js` sets `navigator.audioSession.type = 'ambient'` and no longer plays the silent keep-alive `<audio>` element (which had forced sound through silent mode). Needs a check on the phone with the ringer switch off.
