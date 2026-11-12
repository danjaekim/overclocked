# Plan: pilot boss rewards (v0.13.0 to v0.13.6)

Dan approved the direction on 2026-11-12, after playing the v0.12.7 Overclocker. A doubled level-up felt like any other
upgrade with fewer options. What he wants is what 20 Minutes Till Dawn's Shana or its tomes give: a rare, big pick that
changes how an ability works and that only this character can make. So:

- **Every pilot gets a boss reward**, after the Warlord (4:00) and after the Seer (8:00). Each pilot's reward bends a rule
  that only that pilot can bend. That is two picks a run, made with the boss's lessons fresh, and they set the late game.
- **Overclocks go away** (the workbench Overclock and the level-up Fuse card, Lv6-7). They were plain stat bumps. Pieces
  cap at Lv5, and the boss rewards replace that late power.
- **Overclocker goes back to 3 cards a level-up and no doubling.** Its reward is Overcharge.

This plan comes before unlocks (plan-v12-pilots.md M6, M7, M8 move after it, unchanged). Seven milestones, each one push
to main, then a gate.

## Ground rules for whoever runs this

- **Before starting:** read `docs/overclocked-spec.md` (Pilots, Chassis, Progression), `docs/plan-v12-pilots.md` (ground
  rules there still hold), `src/rig/chain.js` (how a chain compiles: modifiers hold for the next weapon, a trigger's
  payload is everything to its right, payloads nest), `src/rig/rig.js` (how a chain fires, energy, `onEvent`),
  `src/rig/chests.js` and the boss events in `src/data/waves.js`.
- **A reward is per run and lives in the rig state** (`rig.rewards`, an array), so saves, snapshots, history entries and
  `cloneRig` carry it, the same way `rig.pilot` does. A run with no rewards is the old game.
- **A reward must still work after the chain or chassis it was put on changes.** Rewards that pick a chain store the
  chain's index and move with it. A chassis replace keeps the reward on that chain. If the chain disappears, the reward
  goes back to "unplaced" and the next editor visit asks for a chain.
- **Novel, not bigger.** Each reward must make something look and play differently. If a bench says a reward is just
  +x% dps with nothing new on screen, the reward is wrong, not the number.
- **Tests, versioning, benchmarking, saves, colours:** as in plan-v12-pilots.md. Versions are `0.13.N`.
- **Measuring rewards:** add `--reward <id>[:arg]` to `tools/replaybench.mjs` (apply a reward to Dan's real rigs at 240 s
  and 480 s) and report Warlord/Seer fight time and raw dps before and after, for 5 of Dan's runs
  (`/mnt/project-files/overclocked/dan-runs-v0125.json`). Target for every reward: late raw dps between x1.5 and x3 the
  same rig without it, in the scenario the reward is built for. One 12-seed bot run per milestone at most.

## The rewards

| Pilot | Reward | What it does | Second boss |
|---|---|---|---|
| Overclocker | **Overcharge** | Pick a piece you own. Its defining number is tripled (table below). It costs twice the energy. | A different piece. |
| Bulwark | **Emplacement** | Pick a chain. A turret copy of it is planted where you brace (stand still 1 s), and keeps firing from there when you walk away. Bracing somewhere else moves it. | A second turret (another chain, or the same one). |
| Courier | **Wake** | Pick a weapon. Every 80 px you move drops a mine that fires that weapon (with the modifiers held for it) when an enemy comes within 50 px. | A second weapon drops its own mines. |
| Splicer | **Feedback loop** | Pick a chain. When its last trigger fires, the whole chain runs again from slot 1 at 50% power, free, up to 3 loops deep (each half the last). | Loops run at 75%. |
| Broker | **Black market** | A shop of 3 rewards from the other pilots, for gold (200, then 300). Pass and get 100 gold. | Same, with what's left. |
| Rookie | **Retrofit** | Pick a chain and a second rule card for it (Pulse, Rapid, Stride, Anchor, Charge, Reaper). It fires on either, from one battery. | Another chain, or a third rule on the same one. |
| Tinker (later, M7 of plan-v12) | decided with M7 | | |

Numbers are first guesses for the milestones to tune.

### Overcharge, piece by piece

The tripled number is the one that makes the piece what it is. It applies to every copy of the piece, and to the piece
wherever it sits (top level or in a payload). Overcharged pieces show a gold `x3` on their slot and in the analyzer.

| Piece | Overcharged |
|---|---|
| Blaster | Burst of 9 shots instead of 3 |
| Nova | Ring of 18 instead of 6 (plus signature shots, tripled too) |
| Mortar | 3 shells per shot, landing in a spread around the target |
| Chain Bolt | 12 jumps instead of 4, jump range +50% |
| Slam | Shockwave radius x2 (about 4x the area), stun x2 |
| Scatter | 15 copies instead of 5, each at the same 0.4 share |
| Heavy | Shot size and blast area x3 |
| Echo | 3 echoes instead of 1, each at the echo share |
| Sunder | Max stacks x3 (15) |
| Flame | Burn damage x3 |
| Frost | Chill stacks per hit x3 (most enemies freeze in one hit) |
| Storm | Shock jumps x3 |
| On Impact, On Kill, On Hit | The payload runs 3 times each time it triggers (0.1 s apart) |
| Every 3rd | Fires every hit instead of every 3rd |

The chain is where the strategy comes from. A modifier applies only to the next weapon, so an overcharged Scatter in
front of a Heavy Mortar becomes 15 big shells, and an overcharged On Kill under a Nova cascades through a crowd. The pick
is made knowing the chain, so the player plans the order around it.

---

## M1, v0.13.0: remove overclocks; Overclocker back to 3 cards

- `OVERCLOCK_MAX` = `MAX_LEVEL` (5). Remove the Fuse card (`pieceCandidates` stops making `kind: 'fuse'`; a full rig with
  a maxed piece just has fewer piece cards), the workbench `overclock` item and its price, the Overclock lines in the
  compendium and analyzer, and `FULL_UPGRADE_WEIGHT` handling of fuses. Keep `kind: 'fuse'` readable in `applyOffer` as
  a no-op so an old resumed run does not crash.
- Saves: piece levels above 5 clamp to 5 in `save.js` normalize, `run-snapshot.js` restore and history entries.
- Overclocker: drop `offerCount`, `doubleEvery` and the editor's doubled flow (`applyOfferTimes`, `doubleChassis`,
  `doubleLevel`, the `x2` badge, `run.levelsTaken`). Its picker text says "Boss reward: Overcharge (coming)". Its cost
  becomes -15 max HP for now (gate tunes it).
- Measure: replays of Dan's runs before and after (raw dps at 5/8/10 min, boss fight times). Expect the late game to drop;
  write the drop into Results. This is the hole the rewards fill. No number changes to compensate.
- Tests: no fuse offers, no overclock stock, old levels 6-7 load as 5.

## M2, v0.13.1: the boss reward framework and Overcharge

- `src/data/boss-rewards.js`: `REWARDS = { overcharge, emplacement, wake, loop, market, retrofit }`, each
  `{ name, desc(n), pick: 'piece' | 'weapon' | 'chain' | 'chain+rule' | 'shop' }`, and `PILOTS[id].reward` names one.
- `rig.rewards = [{ id, piece?, chain?, rule?, n }]` (n: 1 for the first boss, 2 for the second). Helpers in
  `src/rig/rewards.js`: `rewardOf(rig, id)`, `takeReward(rig, entry)` (pure, returns a new rig), `rewardChoices(rig, id)`.
- When a boss dies, the boss chest's rolls are replaced by the reward. The boss chest's chassis pick stays (chassis marks
  matter). Order: reward screen, then the chassis pick, then the editor (so the chain can be rearranged around the
  reward at once). Sandbox and `?seed=` debug runs get the reward too.
- `src/ui/boss-reward.js`: a full-screen card in the pilot's colour (cyan and white): the reward's name, what it does,
  then the choices (your pieces, weapons or chains, drawn like editor slots). One tap picks, a second confirms. No skip
  except for the Broker.
- Overcharge in `chain.js` `makeNode` / trigger parse: read `def.overcharged` (piece ids, from `rig.rewards`) and apply
  the table above; cost x2 for that piece. Mortar's 3 shells, Echo's 3 echoes and a trigger's 3 payload runs need small
  changes in the behaviors or `rig.js`; keep each under a named constant in `pieces.js` (`OVERCHARGE`).
- HUD strip and editor slot: gold `x3` mark on an overcharged piece. Compendium Pilots tab lists each pilot's reward.
- Tests: reward state survives clone, save, snapshot and resume; the Overclocker's reward is offered after the Warlord
  and the Seer and nowhere else; each table row compiles to the tripled number; cost doubles.
- Measure: `replaybench --reward overcharge:<piece>` for the piece Dan would most likely pick in each run (his most
  levelled weapon, and his Scatter or trigger if he has one). Screenshot one overcharged Scatter and one overcharged Nova
  (`tests/smoke.mjs --shot`) for the Results section.

## M3, v0.13.2: Retrofit (Rookie) and Feedback loop (Splicer)

Both are chain-runtime rules in `rig.js`, so they ship together.

- Retrofit: a chain gets `rules: [rule, ...]` (the chassis rule first). `updateRig` checks each rule's timer or event and
  fires from the one battery. Anchor's "recharges only while still" belongs to the Anchor chassis, not to the Anchor
  rule: a Retrofit Anchor rule fires while still but the chain recharges as its chassis does. The editor shows the extra
  rule badges on the chain header. The pick screen lists rule cards the chain does not have.
- Feedback loop: when the chain's last trigger (the deepest, rightmost one) fires its payload, the chain's top level runs
  again at 50% (75% after the second boss), free, at most 3 deep per activation, each loop half the last. Mark loop runs
  so a loop can't start a new activation's timer. Show a small loop arrow on the chain header.
- Tests: a Retrofit Pulse+Reaper chain fires on its timer and on kills; battery is shared; Feedback loop depth stops at
  3; loop runs cost nothing; both survive a chassis replace.
- Measure: replays with `--pilot rookie --reward retrofit` (Reaper on Dan's main chain) and `--pilot splicer --reward loop`.

## M4, v0.13.3: Wake (Courier)

- A `mine` pool entity (in the run's pools, like shots): position, owner node (the weapon's compiled node with its held
  modifiers), arm time 0.4 s, trigger radius 50 px, life 6 s, at most 16 live (oldest goes). Every 80 px moved
  (reuse Strider's distance counter) drops one per Wake weapon. When an enemy comes in range, it fires the node from the
  mine's position at the nearest enemy, free, then is gone.
- The rig's `fire(inst, run, ctx)` path needs an origin that is not the player: add `ctx.origin { x, y }` and make the
  behaviors use it when present (projectile, nova, mortar, chain, slam). This is the risky part; test each behavior from
  an origin.
- Draw mines as small cyan diamonds with the weapon's piece colour as a dot. Snapshot them like shots.
- Tests: mines drop by distance not time, arm, fire once, expire; a mine fires the node with its modifiers.
- Measure: replay with `--pilot courier --reward wake:<main weapon>`; screenshot a Courier trail.

## M5, v0.13.4: Emplacement (Bulwark)

- A turret is a second copy of a chain's compiled tree, with its own battery (same size and recharge as the chain), fired
  by the chain's rule as if the player stood at the turret (Anchor: always counts as still). Uses `ctx.origin` from M4.
- Bracing (the existing `rig.stillT >= 1`) plants or moves the first turret to the player's spot; with two turrets,
  bracing moves the one farther away. Turrets don't take damage (first version).
- Draw it as a small Bulwark hull outline in cyan with the chain's node colour. Snapshot it.
- Tests: plant on brace, keep firing after the player leaves, move on next brace, own battery, survives chassis replace.
- Measure: replay with `--pilot bulwark --stand --reward emplacement:0`, and once with the normal kiting bot, which
  should now gain from it.

## M6, v0.13.5: Black market (Broker)

- At a boss, the reward screen is a shop: 3 of the other pilots' rewards (random, never one the run already has), price
  200 gold at the first boss and 300 at the second (x0.75 Broker discount already included in these numbers: don't apply
  `shopMult` again). Buy one at most per boss; passing pays 100 gold. A bought reward then runs its own pick screen.
- Emplacement bought by a Broker plants on a 1 s stand-still (there is no brace armor, but the plant works the same).
- Tests: never offers its own or an owned reward; price; pass pays; a bought reward behaves like the owner pilot's.
- Measure: one replay per reward type through the market (short: 1 run each).

## M7, v0.13.6: tidy-up and balance

- One pass over all six with the replay numbers side by side; bring outliers inside x1.5-x3. Overclocker's cost (M1's
  placeholder -15 HP) gets its final value here.
- Update the spec (Pilots section: a Reward column), the compendium texts, and the picker card (one line: "Boss reward:
  Overcharge").
- One 12-seed bot run per pilot (the bot takes its reward by a simple rule: Overcharge its most levelled weapon, Wake
  the same, Emplacement chain 0, Loop the longest chain, Retrofit adds Reaper, Market buys the first it can afford).

### Gate: Dan plays all six pilots through both bosses

He judges whether each reward feels new, not just strong, and whether the boss chest's loss is felt. Then plan-v12's M6
(unlocks) resumes; unlock conditions can now use rewards ("win a run with an Overcharged trigger").

## Results

### M1 (v0.13.0): overclocks removed, 2026-11-12
Dan's last 5 v0.12.5 runs replayed before and after (raw dps at 8 / 10 min): 9905 / 6472 to 9105 / 5711, 9454 / 9264 to 9492 / 11561 (shop rolls differ per run, noise), 8379 / 4960 to 8287 / 4017, the rest unchanged (they had no Lv6-7 pieces). So roughly -3 to -20% late. Seer fights got longer: 20 s to 43 s, 63 s to 120 s, 36 s to 56 s; Warlord 57 s to 76 s in one run. 25 of Dan's 30 recorded runs have Lv6-7 pieces by the end. No numbers compensated, as planned. Overclocker is now 3 cards, -15 max HP, no rule until M2.
Also: tests/resume-smoke.mjs was stale since the picker (M2 of plan-v12); it now boots with ?pilot=rookie and accepts the picker after a corrupt save.

### M2 (v0.13.1): boss reward framework and Overcharge, 2026-11-12
Built as planned: `src/data/boss-rewards.js`, `src/rig/rewards.js` (`rig.rewards`, `takeReward`, `rewardChoices`), `src/ui/boss-reward.js`, and `OVERCHARGE` in `src/rig/pieces.js`. Only the Overclocker has a reward so far; other pilots keep the boss chest until their milestone. The boss chest becomes: reward screen, then the editor (with the chassis cards, if the chest had them). Overcharged pieces show a gold x3 on their editor slot. Changes from the plan: Sunder overcharged adds 3 stacks per hit (cap 15) instead of just a higher cap, since the stacks never reached the old cap; Slam is radius x2; Storm is +2 jumps and Flame +0.6 burn power (tripling their own bonus).
`tools/overchargebench.mjs` (pinned dummies, 10 s, ratio vs plain, fed battery 40 / +24 a second): Blaster x2.7, Nova x3.4, Slam x2.4, Mortar x2.0, Echo x1.7, Scatter x1.2-1.8, Chain Bolt x1.4, On Hit x1.8-2.0, Heavy x1.4, Flame x1.3, Storm x1.2, Sunder x1.0 (before the per-hit change). With a starved early battery (10, +6/s) the doubled energy cancels most of it (On Hit x0.86, Chain Bolt x0.7). Replays on Dan's real rigs (`--reward overcharge[:pieces]`) move raw dps only +0 to +30%, well under the x1.5-3 target, because his chains are mostly energy- and target-limited; the Warlord died 10-30 s sooner in 3 of 5 runs. Weak ones to look at in M7: Storm, Flame, Heavy, Scatter on a Blaster, and the x2 energy cost.

### M3 (v0.13.2): Retrofit and Feedback loop, 2026-11-12
Built: `ruleDue()` in rig.js (each rule card keeps its own timer; `chain.extra` holds Retrofit cards, any card starts the chain, one battery), `chain.loop` and `rig.loops` for the Feedback loop (a free repeat 0.35 s after a chain's last trigger, 12 energy of its own, half power each repeat, at most 3 deep, one repeat spawned per activation so a volley of hits doesn't multiply them). Retrofit takes up to 2 extra cards per chain; extras and loops belong to the chain, so a chassis swap keeps them (an extra equal to the new chassis's own rule is dropped). Screens: chain cards, then rule cards for Retrofit. The editor preview line shows `+ Reaper` / `loops 50%`, the HUD badge `1s +1` / `lp`. Rookie and Splicer have their rewards; Courier, Bulwark and Broker still keep the boss chest (M4-M6).
Replays on Dan's 5 runs (`--reward retrofit` adds Reaper then Rapid to the longest chain; `--reward loop` loops the chain with a trigger): Retrofit raw dps at 5/8/10 min changes -10 to +60% (mostly +10-20%), Warlord fight times within noise. Feedback loop: 2 of 5 runs identical (the chain was an Anchor chain the bot never stands still for, or had no payload that fires), the others +0 to +70% (the best run 2545 to 4342 raw dps at 8 min). Both are small next to Overcharge on a fed battery; the effect that matters (Reaper kills on Rookie, loops under a big payload) depends on the build, which is the point, but M7 should check whether 50% repeats are enough.

### M4 (v0.13.3): Wake (Courier), 2026-11-12
The plan feared a new `ctx.origin` for every behavior; it was not needed: the five weapons already aim from `ctx.x`/`ctx.y`, so a mine just calls `launch()` from its own position with `triggers unarmed` (no payloads from mines). Mines are plain `{ x, y, t, piece }` objects in `run.mines` (snapshots keep them); a mine names its weapon and looks the compiled node up when it fires, so editing the rig does not strand it. `MINE = { every 80, arm 0.4, near 50, life 6, max 16, power 0.7 }` in rig.js. Mines draw as small cyan diamonds (dim until armed), drawn under the shots.
Replays on Dan's 5 runs as Courier (`--reward wake`, the most levelled weapon first, then the next): raw dps at 5/8/10 min up 0 to +110% (the weakest rigs gain most: 1391 to 2428 at 5 min, 1449 to 3076 at 8 min), and the bosses fall faster: Warlord 63 s to 25 s, 20 to 12, 45 to 12, 93 to 53; Seer 46 to 22 and 42 to 15. That is the right range (x1.5-3 on bosses) without touching Courier's stats; the `power: 0.7` knob is the lever if it plays too strong.
