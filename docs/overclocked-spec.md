# Overclocked: game spec and milestones

Last updated: 2026-10-26

## Pitch

Overclocked is a survivors-like where you *program* your power instead of picking it from a menu. Your character fires automatically, and what it fires comes from a **rig**: a few short **chains**. Each chain starts with a **rule card** that says when it runs, followed by pieces that say what happens. Pieces are read left to right, so moving one piece can turn a mortar into a cluster bomb. Overclocked is a working title.

**Pillars**

1. **Order is power.** Rearranging pieces changes how you move and position, not just a damage number. A piece that doesn't pass this test gets cut.
2. **Discovery over recipes.** Nothing is a fixed fusion recipe. Chain reactions come out of simple rules, and the compendium records what you've found.
3. **Fast by default, deep by choice.** A new piece goes into a sensible spot automatically. Rearranging is optional, and only happens during level-ups and chests.
4. **Built on Overforged.** We reuse its arena, enemies, bosses, weapon behaviors, statuses, effects and tooling, and keep its standard of polish and offline play on a phone.

## Core loop

A run lasts about 10 minutes, the same as Overforged, on the same arena with the same wave timeline, elites and bosses.

1. **Start.** You begin with a starter rig: one chain holding a rule card and one weapon, already working. Classes come after the proof of concept, and each will start with a different rule card. You fight from the first second.
2. **Fight.** Move with one thumb. Chains fire on their own rules. Enemies drop XP gems, and elites and bosses drop chests.
3. **Level up.** The game pauses and the rig editor opens over the lower 40% of the screen. You pick 1 of 3 offers. The new piece goes into a suggested slot, and you can accept that, move it, or put it on the bench. One tap resumes.
4. **Open chests.** Chests give rarer pieces, more capacity (slots, chains, energy) or piece upgrades. The same editor opens.
5. **Visit a workbench.** Shrines appear on the timeline, as Overforged's anvil shrines do. Standing in one opens a shop where you spend gold on a specific piece, a reroll or an upgrade.
6. **End.** Survive the final boss or die. The results screen shows your final rig and the reactions you discovered.

## The rig

The rig holds up to 3 chains, plus a bench of 3 slots for pieces you're keeping but not using. A run starts with 1 chain, and the proof of concept has 2. Since v0.6.0 each chain is built on a **chassis** (see "Chassis" below), which sets its rule card, how many slots it starts with and can grow to (never past 6), its battery and recharge, and a quirk.

**How a chain runs.** When its rule card fires, a cursor reads the slots left to right, paying each piece from the chain's **battery**:

1. **Modifier.** It's held and applied to the *next* weapon only, then cleared. Several modifiers in a row all apply to that weapon in order, and their order decides element reactions.
2. **Weapon.** It fires one attack of its Overforged behavior from the player, with the held modifiers. Weapons next to each other with nothing between them fire together as a volley.
3. **Trigger.** It attaches to the weapon just before it. Everything to its right becomes that trigger's *payload*. The payload runs later, when the trigger's event happens, from where it happens and aimed away from the player. A trigger with no weapon before it does nothing and shows a warning.
4. **Energy.** Every piece costs energy each time it runs, and payloads draw from the same battery. If a Nova with On Hit strikes 12 enemies, it keeps firing payloads until the battery runs out. That's what ends chain reactions, and there's no separate cap. The battery recharges over time at the chain's rate, up to its size; it does not refill when the rule card fires (v0.6.0). A chain that costs more than it recharges fires its front pieces and drops its tail until the battery catches up.

```text
Pulse (pool of 10) -> Flame (1) -> Mortar (3) -> On Impact (1) -> Scatter (2) -> Nova (3)

Flame is held for the Mortar.
Scatter and Nova are the payload: they run where the shell lands.
1 + 3 + 1 + 2 + 3 = 10, the whole pool. A sixth piece would wait for the next pulse.
```

This is a chain from later in a run, with 5 slots. Every second, a burning shell lands, and five small novas burst around the crater.

**Rule cards**

| Rule card | Fires | Play style |
| --- | --- | --- |
| Pulse | Every 1 s | Steady. The default |
| Stride | Every 80 px you move | Kiting |
| Anchor | Every 0.6 s while standing still | Turret. Risky in a crowd |
| Reaper | On any kill, at most 4 times per second, and every 3 s if nothing dies | Snowballs in big waves |

**Pilots** (v0.12.0 on; plan in `docs/plan-v12-pilots.md`, data in `src/data/pilots.js`). The classes. A pilot is chosen before a run and changes a rule for the whole run, not for one chain, so its bonus still works after the starting chassis is replaced. Each has a starting chain, a few stat changes, a cost, a signature passive that starts at Lv1 and can reach Lv4 (one more than anyone else), and its own sprite.

| Pilot | Starts with | Advantage | Cost |
|---|---|---|---|
| Rookie | Standard, Blaster | Boss reward **Retrofit** (after the Warlord and the Seer, replacing the boss chest's rolls): pick a chain and a second rule card for it (up to 2 extras); the chain fires on any of its cards, each on its own timer, from one battery | none |
| Courier | Strider, Blaster, Momentum | +20% move speed, +40% pickup range | -20 max HP |
| Bulwark | Anchor, Blaster, Turret Mode | +50 max HP, +3 armor, braced (1 s standing still): +4 more armor, and each kill heals 0.5% max HP, up to 2% a second | -15% move speed |
| Splicer | Standard with Echo and Blaster, Hair Trigger | every chassis +1 starting slot and +2 max slots (8 on Standard) | 2 chains at most. Boss reward **Feedback loop**: pick a chain; when its last trigger fires, the whole chain runs again 0.35 s later, free, at 50% power (75% after the second boss), up to 3 repeats, each half the last |
| Broker | Standard and Blaster, no signature | first reroll of every level-up is free (never banks); workbench prices and rerolls x0.75 | -25 max HP, 20% fewer gold drops from kills |
| Overclocker | Standard and Blaster, no signature | Boss reward **Overcharge** after the Warlord and after the Seer (replaces the boss chest's rolls; the chassis pick stays): pick a piece you own, its defining number is tripled and it costs twice the energy (Blaster 9 shots, Nova ring 18, Scatter 15 copies, a trigger's payload runs 3 times, ...) | -15 max HP |

The rig state carries `rig.pilot` (signature passive, slot bonuses, chain limit, brace armor), so saves, resumed runs and the editor all see it. A saved run, history entry or snapshot with no pilot is a Rookie run. Broker, Overclocker and Tinker, the picker screen, unlocks and balance numbers follow in the plan.

**Triggers**

| Trigger | Runs its payload | From |
| --- | --- | --- |
| On Impact | Once per attack, at the first hit or landing | That point |
| On Hit | Every enemy hit (costly) | Each enemy hit |
| On Kill | Every kill the attack makes | The enemy that died |
| Every 3rd | Every third time the cursor reaches it | The player |

Weapons that run continuously in Overforged, such as orbit, aura and trail, become "on for 2 seconds" pieces later. They aren't in the first builds.

## Starter piece set

These are the 16 pieces for the first test build. The proof of concept uses the 10 marked **PoC**: 2 rule cards (Pulse, Stride), 3 weapons, 3 modifiers and 2 triggers. Energy costs are starting guesses to tune later.

| Piece | Type | Energy | Effect | Built from (Overforged) | PoC |
| --- | --- | --- | --- | --- | --- |
| Mortar | Weapon | 3 | Lobs a shell that bursts on landing | `mortar` behavior | PoC |
| Nova | Weapon | 3 | A ring of damage around its origin | `nova` behavior | PoC |
| Blaster | Weapon | 1 | A 3-shot volley at the nearest enemy; each shot is its own hit (v0.6.6) | `projectile` behavior | PoC |
| Chain Bolt | Weapon | 3 | Lightning that jumps between enemies | `chain` behavior |  |
| Slam | Weapon | 4 | A heavy ground strike that knocks enemies back | `slam` behavior |  |
| Scatter | Modifier | 2 | The next weapon fires 5 copies at 25% power each, spread out | The projectile count param | PoC |
| Flame | Modifier | 1 | Adds fire: the attack burns | Fire tag and burn status | PoC |
| Frost | Modifier | 1 | Adds frost: the attack chills | Frost tag and chill status | PoC |
| Storm | Modifier | 1 | Adds storm: the attack shocks | Storm tag and shock status |  |
| Heavy | Modifier | 2 | Double damage and area, slower shots | The damage and area params |  |
| Echo | Modifier | 2 | The next weapon fires twice, 0.2 s apart, at 60% each | Echoing perk logic |  |
| Sunder | Modifier | 1 | Each hit of the weapon adds a stack to the enemy: every stack makes it take 8% more from everything (5 stacks, 3 s from the last hit); shots also pass through 2 more enemies (v0.6.7; was Pierce) | `SUNDER` in `rig/pieces.js`; stacks on the enemy (`sunderN`, `sunderS`), applied in `systems/damage.js` |  |
| On Impact | Trigger | 1 | Runs the payload once, where the attack first lands, at x2.5 power (v0.6.8). Best against bosses and elites | Hit triggers | PoC |
| On Kill | Trigger | 1 | Runs the payload from each enemy the attack kills, at x2.5 power. Kills made by the payload set it off again, up to 3 generations deep (v0.6.8) | Kill triggers | PoC |
| On Hit | Trigger | 2 | Runs the payload from every enemy hit | Hit triggers |  |
| Every 3rd | Trigger | 0 | Runs the payload every third time it's reached, from the player, at x3 power, for no energy (v0.6.8) | The `every` counter on attack triggers |  |

## Element reactions

A reaction happens when two element modifiers are held for the same weapon, one directly after the other. The first element is the base and the second acts on it, so reversing the two gives a different reaction. The same element twice makes **Intensify**, a stronger version of its status. The proof of concept only includes the fire and frost pair. All magnitudes are guesses to tune later.

| First → second | Reaction | Effect |
| --- | --- | --- |
| Fire → Frost | Steam | A cloud that slows enemies 40% and blinds them so they wander for 2 s. Defensive |
| Frost → Fire | Shatter | Chilled enemies hit by the attack burst into shards that hit nearby enemies. Clears packs |
| Fire → Storm | Overload | Burning enemies explode when shocked. Grows with crowd density |
| Storm → Fire | Plasma | Shocks leave burning ground along the arc. Zone control |
| Frost → Storm | Superconduct | Chilled and shocked targets are always crits. Overforged already has this as an alloy |
| Storm → Frost | Static field | Shocked enemies are pulled slightly together. Sets up area attacks |

The compendium records each reaction the first time it happens in a run.

## Chassis

Added in v0.6.0 so a run keeps asking you to rebuild: chains differ, energy binds, and a new chassis after the third replaces one. Design doc: https://claude.ai/artifact/4Cf2LP4yKbwCnmtkePxYJt. Numbers live in `src/rig/chassis.js`.

| Chassis | Rule | Slots | Battery | Recharge | Quirk |
| --- | --- | --- | --- | --- | --- |
| Standard (start) | Pulse 1 s | 3-6 | 10 | 6/s | None |
| Capacitor | Charge: when full, at most once a second | 4-6 | 24 | 6/s | x1.6 power (v0.11.6: was 5/s and x1.5) |
| Overdrive | Rapid 0.6 s | 3-5 | 10 | 9/s | None: a fast, smaller chain (v0.11.6: the +1 cost per piece is gone; was 3-4 slots, 8 battery, 8/s) |
| Kiln | Pulse 1 s | 4-6 | 12 | 6/s | Element amplifier (v0.9.1): elements held by this chain hit as if held twice (burn x2, +1 chill stack, +2 shock jumps), and Steam, Plasma and Static come twice as often. No cost discount |
| Relay | Pulse 1 s | 5-6 | 14 | 6/s | Payload doubler (v0.9.1): each payload run repeats 0.15 s later at 60% power, for free (from its own pool of 8, so nested triggers work), and a repeat never repeats again |
| Strider | Stride: every 80 px you move | 4-6 | 10 | 7/s | x1.25 power (v0.11.6: recharges standing still too, so a packed screen slows it but does not drain it). Fire rate is move speed (v0.9.2): about 1.9 a second at base speed, 2.6 with +40% speed. A jump of 50 px or more in one tick (a respawn) does not count |
| Anchor | Anchor 0.6 s, only while still | 4-6 | 16 | 8/s, only while still | Turret (v0.9.2): x1.6 power and +50% area (radius, range, arc, jump). It stacks with the Turret Mode passive |
| Reaper | On kill, at most twice a second, or every 3 s if nothing dies | 4-5 | 12 | 5/s | Each kill adds 0.3 energy (v0.9.0; was 4 a second and 0.5) |

- v0.11.6 (Dan: Overdrive, Strider and Capacitor felt weak after the v0.8-0.9 pressure changes): `tools/chassisbench.mjs` puts every chain from your past runs, with your piece levels, on each chassis at Mk I. Before, against Standard on a crowd moving half the time: Overdrive 0.58, Strider 0.63, Capacitor 1.10, Kiln 1.13, Anchor 1.20, Relay 2.19 (Reaper reads low there, as the bench has few kills). After: Overdrive 1.17, Strider 1.10, Capacitor 1.23. Relay was left as it is.
- v0.9.3 note: Overdrive holds at most 4 slots, so a 5-piece chain swapped onto it loses its last piece (the swap test reads about half). That is its trade; nothing was changed. On Dan's replays the old rigs lost about a third of their late dps to the nerfs (free payloads, Reaper rate), and still won.
- v0.9.0 cut Long frame and Spite: neither was ever picked and their quirks (more slots, a heal on hit) did not matter late. Saved chains on either become Standard, keeping mark, pieces and upgrades. Standard now grows to 6 slots. Plan: `docs/plan-v09.md`.
- Mk II and Mk III add a starting slot (up to the max), 25% battery and +1/s each.
- Upgrades bought for a chain (+1/s recharge, +50% battery) belong to its chassis and go when it is replaced.
- Overdraft (v0.6.5): an attack that costs more than the whole battery (a Heavy Scatter Echo Nova stack on a small battery) is no longer dead. It fires when the battery is full, which puts the pool into debt, and the chain waits while it recharges back. So such a chain runs at about recharge / cost activations a second, and a bigger battery only helps up to the cost of its dearest attack.
- Replacing a chain with the same chassis at an equal or higher mark keeps the recharge and battery upgrades bought for it (v0.6.5); any other replacement loses them.
- Replacing: the pieces move onto the new chassis in order, which keeps at least as many slots as the old chain had (up to its max). Extras go to the bench, and once the bench is full they are sold. Passing on a chassis instead gives a pick of upgrade cards (+1 slot, +1/s recharge, +50% battery, or a piece level).
- Sources: levels 5 and 10 offer 2 Mk I chassis and a slot while a chain is free (then slot, recharge and battery cards); about 1 elite chest in 2 holds one (Mk II about 1 in 3); a boss chest holds 2 Mk II or Mk III to pick from; the workbench stocks one on about 1 visit in 2 (60/90/120 gold by mark).
- Full rig (v0.6.3): with no free slot or bench space, level cards draw 2.5x as often and new pieces 0.4x, and copies of pieces you own are dropped from the offers. Pieces stop at level 5 (v0.13.0 removed Overclock levels 6-7, the workbench Overclock and the fuse card; old saves read levels above 5 as 5). Late power comes from pilot boss rewards (docs/plan-v13-boss-rewards.md).
- The rig screen shows each piece's level (L1 and up, gold once overclocked) beside its cost. A chain's cost line shows what one run of the whole chain costs; a piece that costs more than the whole battery is greyed with the numbers.
- A trigger's payload going off shows a larger, white-edged ring, plays a short blip (`proc` sfx, at most one per 0.08 s), and an On Kill cascade shows its depth as a floating x2, x3 or x4 (v0.6.9).
- Combo cards were dropped (2026-10-31); the plan in docs/plan-v066-v07.md reworks passives instead.

## Progression

Power comes from five layers during a run and one between runs, which comes after the first test build. Each layer is tied to a moment in the run that Overforged already has.

| Layer | Source | What it gives |
| --- | --- | --- |
| New pieces | Level-up, pick 1 of 3 | New verbs. Offers lean toward pieces that fit the rig you have, so a rig with a weapon and no trigger is more likely to be offered a trigger |
| Piece levels | Level-up: an offer for a piece you already own levels it up, to a maximum of 5 | Each level adds +10% to the piece's main number; levels 3 and 5 add a **signature effect** (Scatter +1 copy, Heavy +30% area, Sunder +1 max stack, Echo's third shot, Every 3rd becoming every 2nd, ...; `SIGNATURE` in `rig/pieces.js`). Mastery twists (M5) are still to come |
| Capacity | Elite and boss chests, plus levels 5, 10, 15 and 20 | A chassis (a new chain, or a replacement for one), +1 slot in a chain, +1/s recharge or +50% battery for one chain |
| Workbench | Shrines on the wave timeline. Gold drops from chests and elites | Buy a chosen piece, reroll, level up a piece, buy capacity or a chassis |
| Passive stats | About 1 offer in 6 at level-up; 30% of those are a plain stat card | Move speed, max HP, magnet range, armor |
| Passives (v0.7.0) | The other 70% of that slot. Each stacks to 3 (`rig/passives.js`, kept in `rig.passives`); a passive at 3 is never offered again | A rule change that points at how the rig is built: **Last Word** (the last weapon of each chain x1.3/1.5/1.7), **Hair Trigger** (payloads x1.5/1.8/2.1, every modifier costs 1 more), **Ricochet** (shots bounce 1/1/2 more times and hit 20% softer), **Pyromaniac** (a burning enemy that dies passes its burn on: Wildfire), **Conductor** (a shocked enemy that dies fires bolts: Thunderclap), **Permafrost** (a chilled or frozen enemy that dies bursts for 30/45/60% of its max HP: Shatter), **Siphon** (a kill gives every chain 0.15/0.25/0.35 energy), **Overflow** (recharge past a full battery is banked: the next activation hits up to +25/40/55% harder), **Redline** (a chain under half battery recharges 20/30/40% faster), **Momentum** (+15/30/45% recharge while moving, -20% still), **Turret Mode** (after 1 s still, rig damage +30/45/60%), **Glass Cannon** (per stack max HP x0.7 and all damage +30%) |
| Unlocks (later) | Firsts: first boss kill, first reaction found, and so on | New pieces and rule cards join the offer pool. The compendium logs your discoveries |

**Mastery twists (examples)**

| Piece | Level 5 twist |
| --- | --- |
| Mortar | Lobs 2 shells |
| Nova | Leaves a ring on the ground for 1 s |
| Blaster | Shots ricochet once |
| Scatter | 6 copies instead of 5 |
| On Impact | Refunds half its energy |
| On Kill | Payloads from kills cost 1 less energy |

**Chest contents** (Overforged's chests roll 1, 3 or 5 items): a mix of rare pieces, capacity and piece levels. Boss chests always include one capacity item. Rerolls and banishes carry over from Overforged's level-up (2 rerolls and 1 banish per run).

**Enemy pressure (v0.8.1).** Waves run at a fixed rate, so the director also keeps a minimum crowd: when fewer than `MIN_ALIVE` enemies are alive (10 in the first minute, rising to 300 from 7:00) it tops the field up at 25 a second from the current wave's mix, and from 5:00 a quarter of the top-ups are the tougher non-goblin entries. Top-ups and horde enemies drop no ore. Three hordes (3:00 60, 6:00 100 plus 2 elites, 8:30 150 plus 3 elites) arrive as a ring just off screen on every side. All of it is data in `src/data/waves.js`.

**Bosses (v0.8.2).** A boss's HP is set when it spawns: your raw damage per second over the last 20 s (overkill included, so it follows the rig and not the crowd) x a share x a fight length (Enforcer 0.2 x 35 s, Oracle 0.06 x 45 s), never below its base HP and at most 8x (Oracle 12x). A weak rig meets the base boss. At 66% and 33% HP a boss calls an escort (20 wave enemies and 2 brutes, no ore). The Enforcer's charge windup drops from 0.9 s to 0.6 s below half HP. v0.8.5 refit to Dan's replayed builds: Enforcer 0.3 x 35 s (cap 10x), Oracle 0.2 x 45 s (cap 40x).

**Wave HP follows the rig (v0.8.5).** Once a second, wave and elite HP is multiplied by your raw dps over the last 20 s divided by `HP_FOLLOW_REF` (a solid build's raw dps for that minute), clamped to 1-3x. Charge and cell upgrades at the workbench cost 15 more for each one the rig already has.

## Editing and readability

**The rig editor** opens over the lower 40% of the screen while the game is paused:

- Each chain is one horizontal strip: its rule card, then its slots. Below the strips are the bench and the offer cards.
- When you pick an offer, the piece drops into a **suggested slot**, shown with a pulsing outline. Tap **Done** to keep it there.
- **Tap to move.** Tap a piece, then tap a slot or the gap between two pieces. Drag also works, but it's never required.
- **Live preview.** One line under each chain describes what it does now, such as "1 s: Mortar, then 5 Novas at the crater (cost 9 of 10)". It updates while you move pieces. Pieces that can't run are greyed out, with a reason ("no weapon before this trigger", "out of energy").
- **Undo** puts back the last move. **Reset** returns the rig to how it was when you opened the editor.

**During combat:**

- A small rig strip in the HUD flashes each piece as it runs, so you can see the cause of each effect in the arena.
- Each element and reaction has its own color and shape in the arena, using Overforged's element colors.
- A battery bar under each chain drains as pieces and payloads run and refills at the recharge rate. A tick marks one full run of the chain, and the bar dims while it is below that.

**Compendium.** One entry per piece and rule card, a "How chains run" page covering the four evaluation rules, a reactions page that fills in as you discover them, and the rigs from past runs in the history.

## Technical plan

### Repo and deploy

Overclocked gets its own repo, `danjaekim/overclocked`, seeded with a copy of Overforged's `main` including its history. GitHub won't fork a repo into the same account that owns it, so this is a copy rather than a GitHub fork. It still works like option 3 in `docs/fork-plan.md`: fork now, extract a shared engine later. The new repo gets its own GitHub Pages site at `danjaekim.github.io/overclocked/`, set up the same way Overforged's is (Settings → Pages → Deploy from branch → `main` / root).

Both games will share the `danjaekim.github.io` origin, so they share browser storage. Milestone 0 has to fix three collisions:

- **Save keys.** `overforged.save.v1` and `overforged.run.v1` become `overclocked.save.v1` and `overclocked.run.v1`.
- **Service worker cache.** On activate, `sw.js` deletes every cache that isn't its own, so each game's worker would wipe the other game's offline copy. The new game uses its own cache prefix and only deletes caches with that prefix. Overforged needs the same one-line fix, as a separate small commit to Overforged.
- **Identity.** The manifest name, `id` and icons, the page title, and the `window.__overforged` startup watchdog.

### Module plan

| Area | Keep as is | Reuse through an adapter | Replace or drop | New |
| --- | --- | --- | --- | --- |
| Core | `src/core`, `src/input`, fixed-step loop |  |  | None needed: the editor reuses the pause of Overforged's level-up screen |
| Combat | `src/systems` (movement, collision, AI, damage queue, hazards, boss zones) | Statuses, `hit.js`, `effects/payloads.js` |  | Reaction effects |
| Weapons |  | `src/behaviors`: fire on demand, from a chosen point | `weapons.js`, evolution, fusion, Starforge, legendary, resonance | Weapon piece adapter |
| Build logic |  | `triggers.js` hit and kill events, `weapon-params.js` (packet power) | Perks, passives, class traits, forge, `apply-offer.js`, `upgrades.js` | `src/rig/`: piece data, chain evaluation, energy, payload queue, reactions, offers |
| Run and loot | Director, waves, enemies, elites, XP | `chests.js` (new loot types), shrines (workbench), ore (as gold) | `run-snapshot.js` | Rig snapshot |
| UI | Overlay, title, results, settings, pause, history, compendium framework | Level-up overlay shell | Build screen, forge screen, compendium content | Rig editor, HUD rig strip, compendium entries |
| Tests and tools | `tests/run.mjs` harness, `offline.mjs`, `smoke.mjs`, sprite pipeline | Bench and bots, once there's content | Overforged content tests | Headless chain tests |

### The main engine change

Today every behavior fires from the player (`run.player`) on its own cooldown (`inst.cd`). A weapon piece needs to fire *once, on request, from any point*. That's what On Impact and On Kill need. The adapter gives each weapon piece a hidden Overforged weapon instance that keeps updating so shells and projectiles in flight still move. Its cooldown is held, and it fires when the chain asks it to. Each behavior also needs an optional origin (`inst.ox`, `inst.oy`, falling back to the player), and its targeting needs to search around that origin. The proof of concept needs this for 3 behaviors (mortar, nova, projectile). The rest get audited one at a time later. This is the riskiest engine work, so it's done first in Milestone 1.

## Milestones

There are six milestones. The concept check comes right after the sandbox, before we build the editor. Preset buttons are enough to find out whether chains are fun, so we don't spend the effort on the editor until that's answered. Each milestone ends with a build on your phone, and UI work follows our usual rule: screenshots first, ship on your go-ahead.

```text
M0 Setup -> M1 Chain engine -> M2 Sandbox proof of concept -> M3 Rig editor -> M4 First test build -> M5 Depth
```

Gates between milestones:

- After M0: builds load on your phone, and Overforged still works offline
- After M1: tests match the expected attacks for all six test chains
- After M2 (the concept check): you can tell the chains apart from the arena alone
- After M3: any test chain built in under 10 s on a phone
- After M4: a full run plays start to finish, and two runs feel different

If the concept check fails, we stop and rethink the pieces before building the editor. The tasks for each milestone are below.

**M0: Setup**

- [x] You create the empty `overclocked` repo, and I push the copy of Overforged
- [x] Rename the save keys, the service worker cache and the app identity
- [x] Fix the cache cleanup in Overforged's `sw.js` (small separate commit)
- [x] Turn on Pages and confirm the build loads on your phone

**M1: Chain engine**

- [x] `src/rig/` with piece data, chain evaluation, energy and the payload queue
- [x] Headless tests that check the attacks and energy use for the six test chains (`tests/rig.test.mjs`; the chains are in `src/rig/presets.js`: Blaster, Scatter shot, Cluster mortar, Steam nova, Shatter shell, Kill chain)
- [x] Weapon adapter: mortar, nova and projectile fire on request from any point

**M2: Sandbox proof of concept**

- [x] Sandbox as the default start screen: the arena with steady waves, no level-ups
- [x] Two chains, with buttons to load each test chain
- [x] HUD rig strip, energy pips, and the Steam and Shatter reactions
- [x] Playtest on your phone: the concept check (checked off by Dan, 2026-10-28: the core concept has legs)

**M3: Rig editor**

- [x] Pause the game while the editor is open, reusing the level-up state
- [x] Editor strips, tap-to-move, suggested slot, live preview line, undo and reset (drag is not built; tap covers it)
- [x] Level-up offers drawn from the proof-of-concept pieces (the 8 pieces; the 2 rule cards are not offered yet)

**M4: First test build**

- [x] Remove Overforged's build systems from `run.js` and the UI (title, class select, level-up, forge, build screen, compendium, history, backup and run-resume screens and their code are gone; the engine-era modules that the stat and status tests still use stay, see docs/architecture.md)
- [x] All 16 pieces and 5 rule cards, piece levels, and chests with capacity items
- [x] Full 10-minute runs with elites and bosses, and the run's rig on the results screen
- [x] Playtest on your phone: the M4 gate (checked off by Dan, 2026-10-28)

**M5: Depth**

- [x] Workbench at shrines with ore as gold (v0.5.2: shrines at 2:00, 4:00, 6:30, 8:30 and the boss; a visit stocks 2 pieces, a level and a rule card; reroll). Mastery twists became the level 3 and 5 signature effects (v0.5.0)
- [x] All six reactions plus Intensify (v0.5.1)
- [x] Compendium entries (v0.5.3: pause -> Compendium: how chains run, pieces, rule cards, reactions found, past rigs)
- [ ] A first balance pass, with a bench table posted first and your go-ahead before any long run

## Decisions

- The game is called Overclocked, for now. The repo is `danjaekim/overclocked`.
- The editor pauses the game instead of slowing it down.
- Modifiers apply only to the next weapon.
- Classes are pilots (see above). Unlocks follow in v0.12.5.
- No query parameter. The game's default path boots into the build for the current milestone: the sandbox for M2, then the full run from M4.
- The preset-chain buttons stay after M2 as a debug panel, so any chain can be loaded for testing. From M4 it opens from the pause menu ("Chain sandbox (debug)"); `?sandbox=1` boots it directly, for tests.
- Piece levels are per piece, not per copy: every Mortar in the rig shares one level. Each level adds 10% damage to the piece's attack (a modifier: to the weapon it is held for; a trigger: to its payload), and levels 3 and 5 add a signature effect (v0.5.0). A trigger's payload power depends on its job (v0.6.8, `TRIGGER_POWER`): On Hit x0.9 (it runs for every enemy hit, so crowds supply the power), On Impact x2.5 (once per attack), On Kill x2.5 (and a payload's kills cascade), Every 3rd x3 (and its payload costs no energy). Each other payload piece costs 1 less energy (v0.5.0, retuned v0.5.4), so reactions are a multiplier on their own.
- A run starts with 130 HP and 0.5 HP/s regeneration (the stat default plus the Archer's numbers from Overforged). This is a first guess, tuned in M5.
- Capacity: levels 5, 10, 15 and 20 offer three capacity cards (+1 slot in the shortest chain, a new chain with a random rule card, +3 energy for a chain) instead of pieces. Chests roll 1, 3 or 5 items (the first elite chest at least 3, a boss chest always 5 with capacity first), and a piece with no room becomes another kind of roll.
- Duplicates and capacity (v0.5.6): level-ups, chests and the shop offer copies of pieces you own (all copies share one level). Capacity cards offer +1 slot for the two shortest chains and energy; a new chain is offered only once every chain has 4 slots, and +1 slot also gives that chain +2 energy. The workbench stocks two pieces (new or copies), an upgrade (a level, or an Overclock to level 6 or 7, x1.1 power each since v0.8.5 (was x1.25, which compounded across every overclocked piece in a chain), 100 and 200 gold, shop only), +1 slot (50, +25 per slot bought) or +3 energy for a chain you pick, and a rule card on about one visit in three.
- Elements (v0.5.5): Flame burns for 80% of each hit over 3 s; Storm arcs to 2 nearby enemies for 35% each and marks them, and a shocked enemy takes 15% more from everything; Frost chills (10% slow a stack, freeze at 4). The Warlord hits for 18 (25 in Overforged).
- Chassis chains and a recharging battery (v0.6.0) replace the per-activation energy pool, rule cards as items, 4 chains, "+3 energy" and the 4-slot gate on new chains. See "Chassis". The 12-seed bot matched v0.5.6 (4/12 wins, level 16, about 1600 kills) after one tuning step (+1/s recharge on every chassis).
- Shrines and ore are the workbench (v0.5.2): ore is gold, an ore drop is worth 3, an elite pays 40, the boss 100 and reaching a shrine 120 (v0.8.0, was 15/25/100/none: gold scaled with kills, so strong rigs outbought weak ones). Prices: piece 40, level 30-60, rule card 60, reroll 25, 50, 100 within a visit. Weapons aim only at enemies on screen (plus 20 px); shots fly on.

- Resume (v0.6.4): the run in progress is frozen to JSON (`game/run-snapshot.js`, key `overclocked.run.v1`, `save/run-save.js`) whenever the game stops at a menu (pause, level-up, chest, workbench), and dropped when the run ends or a new one starts. Booting with a save lands on the pause menu of that run. The chain rig is rebuilt from `run.rigState` instead of copied, so queued payloads and Echo shots in flight start over; each chain's battery is kept. A save that cannot be read (older format, changed rig) is dropped and a new run starts. Debug (god) runs and the sandbox never save. Test: `tests/resume.test.mjs`, `tests/resume-smoke.mjs`.

## Open questions

None right now. New questions will be added here.

## Look (v0.10, Neon Noir)

Plan: `docs/plan-v10-neon.md`. The game wears a cyberpunk night-street look. Cyan is the player's colour (rig, shots, battery) and no enemy uses it; each enemy type is a dark body with one bright accent colour in its own bold silhouette. Gold is money and loot, green is XP. Every canvas colour comes from `src/data/palette.js`, and the menu CSS variables in `index.html` mirror it. The floor is `neon` in `src/render/ground.js` (near-black asphalt, a faint violet grid, pools of pink, cyan and violet light, a few road markings). Fonts are self-hosted in `fonts/` (Chakra Petch 700 for labels and numbers, IBM Plex Mono 500 for data) and cached by the service worker. Sprites arrive in v0.10.1, effects in v0.10.2 and the new names in v0.10.3. Game rules and ids are unchanged.


**Cast (v0.10.3).** goblin = Street Drone, brute = Bruiser, shieldbearer = Riot Unit, slinger = Spitter, splitter = Swarm Pod, shaman = Hacker, crusher = Wrecker, warlord = Enforcer (boss), seer = Oracle (boss), crate = Cargo Drop. Ids are unchanged. Runner is the player.

- v0.11.7 Ricochet (Dan: pushing Blaster + Ricochet felt weak): stack 2 gave no extra bounce (values 1,1,2) and every projectile hit 20% softer even with nothing to bounce to (Blaster alone, single target -28%). Now 1/2/3 bounces, no flat penalty, each bounce keeps 85%. piecebench passives, Blaster, crowd at stack 1 and 3: +18% / +60% -> +52% / +158%; single target -28% -> 0.
