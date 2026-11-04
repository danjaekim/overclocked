# Plan: pilots and unlocks (v0.12.0 to v0.12.7)

Dan approved the direction on 2026-11-04 (proposal doc: https://claude.ai/artifact/7xgpKgdCApEKUarGe1SQyV). A pilot is the
class you pick before a run: a run-wide rule, a few stats, a cost, a starting chain and its own sprite. Chassis stay as
they are (per chain, found during the run). Eight milestones, each one push to main. Run them in order and stop at the
two gates (after M4 and after M6).

## Ground rules for whoever runs this

- **Before starting:** read `docs/overclocked-spec.md` (Chassis, Progression), the rig part of `docs/architecture.md`, `src/game/ovrun.js` (how a run is built), `src/rig/chassis.js`, `src/rig/passives.js` and `src/render/neon-art.js`.
- **The one rule that keeps pilots apart from chassis:** a pilot's bonus applies to the whole run and must still work after the starting chassis is replaced. Never write a pilot bonus that only applies to one chassis kind (the one exception is Tinker, M7, whose point is the Standard frame).
- **Keep it simple.** Build what a milestone lists. No new currencies, meta shops or permanent stat upgrades. If something here doesn't fit the code, take the simplest version that meets the acceptance checks and say what you changed in the commit message.
- **Tests:** `node tests/run.mjs` before every push. Milestones that touch UI or saves also run `node tests/smoke.mjs --ui`, `node tests/run-smoke.mjs` and `node tests/resume-smoke.mjs`. Add unit tests for every rule (style of `tests/passives.test.mjs`, `tests/ovrun.test.mjs`).
- **Benchmarking (Dan's rule: minimal):** `node tools/piecebench.mjs` and `node tools/chassisbench.mjs` are the fast tools. The 12-seed bot (`node tools/rigbench.mjs --seeds 12`) runs once per milestone at most, only where the milestone says so. ±2 wins is noise. Tune to Dan's level, not the bot: the bot is a floor.
- **Versioning:** bump `src/version.js`, commit message starts with `vX.Y.Z:`, update `docs/overclocked-spec.md` where a rule changes (add a "Pilots" section in M1). Push to main once tests pass; Dan doesn't need to approve each push.
- **Saves:** old saves, history entries and resumed runs must keep loading. A run or history entry with no pilot is a Rookie run.
- **Colours:** cyan (`PALETTE.rig`) is the player's and nobody else's. Pilot UI accents use cyan and white only.

## The pilots

| id | Name | Starts with | Stats | Rule | Cost | Unlocked by |
|---|---|---|---|---|---|---|
| `rookie` | Rookie | Standard, Blaster | none | none | none | open |
| `courier` | Courier | Strider Mk I, Blaster | +20% move speed, +40% pickup radius | Signature passive **Momentum** at Lv1, can go to Lv4 | -20 max HP | open |
| `bulwark` | Bulwark | Anchor Mk I, Blaster | +50 max HP, +3 armor | Signature passive **Turret Mode** at Lv1, can go to Lv4; while braced (Turret Mode active) +4 armor more | -15% move speed | M6 milestone |
| `splicer` | Splicer | Standard, Blaster + Echo | none | Every chassis has +2 max slots (and +1 starting slot); signature passive **Hair Trigger** at Lv1, can go to Lv4 | Max 2 chains instead of 3 | M6 milestone |
| `broker` | Broker | Standard, Blaster | none | 1 free level-up reroll every level (does not bank); workbench prices x0.75 | -25 max HP; credits from kills x0.8 | M6 milestone |
| `overclocker` | Overclocker | Standard, Blaster | none | Every 4th level-up is **doubled**: whatever card you take is applied twice | Level-ups offer 2 cards instead of 3 | M6 milestone |
| `tinker` | Tinker | Standard, Blaster | none | Never takes a new chassis; chassis cards become **modules** for Standard chains (M7) | No chassis swaps | M7 milestone |

Numbers are first guesses for M4 to tune. Lv4 of a signature passive is a new 4th value used only by that pilot (Momentum 0.6, Turret Mode 0.75, Hair Trigger 2.4 as starting guesses).

---

## M1, v0.12.0: pilot data and run plumbing (no new screen)

**Goal.** A run can start as any of the first four pilots (Rookie, Courier, Bulwark, Splicer) from a URL, and everything downstream (resume, results, history, export, benches) knows the pilot.

**Changes**

- New `src/data/pilots.js`: `PILOTS` keyed by id with `{ name, short, desc, cost, start: { chassis, mk, slots }, mods: [stat mods], passive: { id, lv, max } | null, rules: {} }`, plus `PILOT_IDS` (display order) and `DEFAULT_PILOT = 'rookie'`. Only the four pilots above for now. `desc` and `cost` are short player-facing lines.
- `src/game/ovrun.js`, `createOverclockedRun({ ..., pilotId })`:
  - `run.pilot = PILOTS[pilotId] ? pilotId : DEFAULT_PILOT`.
  - Stat mods added with source `'pilot:'` after `BASE`; recompute `maxHp`/`hp` after.
  - The starting chain comes from `start` (chassis, mk, slots) instead of `START_CHAIN` (keep `START_CHAIN` exported as Rookie's, since replaybench imports it).
  - The signature passive is put in `run.rigState.passives` at its level before `applyRig`.
  - `run.player.classId = run.pilot` (the sprite key, used in M3; until then `neon-art.js` maps the new ids to `RUNNER`).
  - `summary()` returns `pilot` (keep `classId: 'smith'` for old consumers).
- Rules:
  - **Signature passive cap:** `passivePool` in `src/rig/offers.js` uses the pilot's `max` for that passive. Add a 4th entry to `values` in `src/rig/passives.js` for Momentum, Turret Mode and Hair Trigger; `desc(4)` must work. Other pilots still stop at 3.
  - **Bulwark brace armor:** when Turret Mode is active (`rig.stillT >= 1`, the check in `rig.js`) and the pilot has `rules.braceArmor`, add that armor. Do it through a stat mod toggled on and off (source `'pilot:brace'`), not per hit.
  - **Splicer:** `rules.slotsBonus: 2` and `rules.maxChains: 2`. `chassisStats` takes an optional bonus (start +1, max +2). `MAX_CHAINS` reads become `maxChains(rig)` (rig-level, defaulting to `MAX_CHAINS`); find every use (`grep -rn MAX_CHAINS src`), including offers, workbench `canTakeNew` and the editor. The rig state needs to carry the pilot rules so pure rig code can see them: store `rig.pilot = { slotsBonus, maxChains }` in the rig state, and make sure `run-snapshot.js` and save `cleanRig` keep it.
- `src/game/game.js`: `?pilot=<id>` URL param picks the pilot (like `?seed=`); without it, `save.lastPilot` or Rookie.
- `src/game/run-snapshot.js`: snapshot and restore `run.pilot`.
- `src/save/save.js`: `DEFAULTS.lastPilot = 'rookie'`; `entryFromSummary` stores `pilot`; cleaning keeps a known pilot id or drops it (missing = Rookie). Bump the save `version` only if the format needs it.
- Results screen and Past runs show the pilot name next to the result.
- Benches: `tools/rigbench.mjs`, `tools/replaybench.mjs`, `tools/chassisbench.mjs` and `tools/pressurebench.mjs` take `--pilot <id>` (default rookie) and pass it to `createOverclockedRun`. Replaybench with a pilot replays the same rig under the pilot's stats and rules; for Splicer, drop the chain with the lowest raw dps if the rig has 3.

**Acceptance**

- `?pilot=courier` starts on Strider Mk I with Blaster, Momentum Lv1, 110 max HP (100 + 30 from `BASE`, -20), move speed x1.2.
- `?pilot=splicer` starts on a 4-slot Standard (Blaster, Echo); a third chain is never offered; chassis max slots read 8 on a Standard.
- A Courier run paused, closed and resumed is still a Courier run with the same passives. A pre-v0.12 resume save still loads as Rookie.
- An old history entry with no pilot shows as Rookie.
- Tests for each rule above, plus a save round trip with `pilot` and `lastPilot`.

---

## M2, v0.12.1: the pilot picker

**Goal.** You choose your pilot before each run, in one or two taps.

**Changes**

- New `src/ui/pilot-select.js`, an overlay like the results screen (`src/ui/results.js`, `src/ui/overlay.js`), sized for a phone in portrait first.
  - One card per pilot in `PILOT_IDS` order: sprite (the same art the game draws, from `getSprite(id)`), name, the rule line, the cost line (in a muted colour), and the starting chassis.
  - The last pilot used is preselected. A big **Start** button. Tapping a card selects it; tapping the selected card starts.
  - Locked pilots (M6) show as a dark silhouette with the unlock hint. Until M6 every pilot in `PILOTS` is open.
- `src/game/game.js`:
  - Boot: resume a saved run as today; with no saved run, show the picker instead of starting at once.
  - Results "Again" and pause "New run" go to the picker. Keep a one-tap path: the picker's Start is where the button was.
  - `?pilot=`, `?seed=` and god runs skip the picker.
  - `save.lastPilot` is written when a run starts.
- The compendium gets a **Pilots** tab: every pilot's full rules, stats and cost, generated from `PILOTS` so it can't drift.

**Acceptance**

- Fresh boot shows the picker; Start with Rookie gives today's run exactly (same seed, same first minute).
- `node tests/smoke.mjs --ui` covers: picker shows, picking Courier starts a Courier run, Again returns to the picker with Courier preselected.
- Screenshot the picker at phone size (390x844) into `/mnt/project-files/pilots/` for Dan.

---

## M3, v0.12.2: pilot sprites

**Goal.** You can tell which pilot you are at a glance, in the picker and in the fight.

**Art is decided before this milestone, not during it.** The first-pass sheet is `tools/art/pilots-concept.mjs` (render it with `--sheet out.html`; image at `/mnt/project-files/pilots/pilot-sprites-v2.png`; Dan OK'd the looks on 2026-11-04). **Locked 2026-11-04:** Dan approved all seven as drawn in pass 2. Copy them exactly; don't redraw or restyle them.

**Changes**

- Copy the approved SVGs into `src/render/neon-art.js` as `rookie`, `courier`, `bulwark`, `splicer`, `broker`, `overclocker`, `tinker` keys (the Rookie is today's `RUNNER`). Keep the old class ids mapped to `RUNNER`.
- Every pilot keeps the glowing core at the centre and the chain nodes orbiting it (`drawChainNodes` in `src/render/renderer.js`), so it still reads as the player. Only the hull changes. Cyan only.
- Node spacing (Dan asked that the nodes look even on every pilot): every hull in the concept file is scaled to fit within `HULL_MAX` (20 world units) of the core, and the core is the same size on all of them. Set `NODE_ORBIT` in `renderer.js` to the concept file's `NODE_ORBIT` (28, was 25) for every pilot, Rookie included, so all pilots have one orbit. Don't give pilots different orbits. A new or redrawn hull must be measured to fit within `HULL_MAX` too.
- Sprites are rasterized once (`src/render/sprites.js`); check the draw numbers don't move (`node tools/perfbench.mjs`, one run).

**Acceptance**

- A mid-fight screenshot per pilot (`node tests/smoke.mjs --query "god=1&seed=1&pilot=<id>" --at 120 --clean --shot <file>`) into `/mnt/project-files/pilots/`, combined into one sheet for Dan.
- Hurt flash still works on every pilot sprite.

---

## M4, v0.12.3: first balance pass

**Goal.** Rookie, Courier, Bulwark and Splicer are each worth picking, and none is free power.

**Measure (report all three, as usual):**

- Floor: `node tools/rigbench.mjs --seeds 12 --pilot <id>` for each of the four (run them in parallel). Compare time alive, level and kills to Rookie.
- Dan: `node tools/replaybench.mjs --file /mnt/project-files/overclocked/dan-runs-v0115.json --pilot <id>` for each.
- Focused: `node tools/piecebench.mjs` rows for the new Lv4 passive values.

**Targets**

- No pilot below Rookie on the floor by more than about 15% time alive (the bot doesn't brace or kite on purpose, so Bulwark and Courier may read low there; say so rather than overbuffing).
- On Dan's replays, no pilot's late raw dps more than 1.3x Rookie's. If one is, cut its cost side first (HP, then slots), then its signature.
- Splicer must not be strictly worse on replays: two 8-slot chains vs three 6-slot chains should land within ±15%.

Put the before/after table in this file under "Results", and the numbers in the spec.

### Gate 1: Dan plays Rookie, Courier, Bulwark and Splicer

Stop here. The question for Dan: does the pilot change how you build? If Courier and Bulwark only feel like their passive, M5 and later should get stronger unique rules before more pilots are added.

---

## M5, v0.12.4: Broker and Overclocker

**Changes**

- Add both to `PILOTS` (table above).
- **Broker:** `rules.freeReroll: 1`. In `openRigEditor` (`src/game/game.js`), a level-up with offers gets `run.rerolls + 1`; the free one is used first and doesn't carry to the next level. `rules.shopMult: 0.75` in every price helper in `src/rig/workbench.js` (round to whole credits; reroll price too). Credits from kills x0.8 through the `oreGain` stat or `GOLD.perOre` scaling in `systems/damage.js` (kills only, not shrine, elite or boss credits).
- **Overclocker:** `rules.offerCount: 2` passed to `makeOffers`. `rules.doubleEvery: 4`: count level-ups in `run.levelUps` (capacity levels count). On the doubled one, the editor shows an **x2** badge on every card, and taking a card applies it twice:
  - a new piece: placed at Lv2;
  - a level: +2 levels (capped at the max level; spill past it becomes an overclock if the piece is maxed);
  - a stat or passive: taken twice (passive capped at its max);
  - a capacity card: two slots, or a chassis at one mark higher (cap Mk III);
  - a banish or reroll doesn't use up the double.
  Write `applyOfferTimes(rig, offer, n)` in `src/rig/offers.js` and test each kind.
- Picker and compendium get both pilots. Sprites from the approved sheet.

**Acceptance:** tests for the free reroll, the price multiplier, the 2-card deal and each doubled kind. One 12-seed floor run for each new pilot, and replays; same targets as M4.

---

## M6, v0.12.5: unlocks

**Goal.** Rookie and Courier are open on a new save; the others unlock from milestones that teach their playstyle.

**Changes**

- `save.unlocked` (already in `DEFAULTS`) holds pilot ids. A pilot without `unlock` in `PILOTS` is always open. Each locked pilot has `unlock: { hint, check(summary, save) }`:

| Pilot | Milestone (one run) | Needs in the summary |
|---|---|---|
| Bulwark | Kill 400 enemies while standing still | `run.stats.stillKills`: kills credited while `rig.stillT >= 1` |
| Splicer | Have one chain with 7 or more pieces in it | max chain length over the run (`rig.chains[i].slots` filled) |
| Broker | Spend 1,500 credits at workbenches | `run.stats.creditsSpent` |
| Overclocker | Get a piece to level 7 | max piece level in `run.rigState.levels` |
| Tinker (M7) | Win with a Standard chain still in your rig | win + any chain with `chassis: 'standard'` at the end |

- Checked once when a run ends (win or loss), in the same place `newBests` is worked out. Newly unlocked pilots go to `save.unlocked` and the results screen shows "New pilot: Bulwark" with its sprite.
- **Existing players:** on load, a save with any wins unlocks every pilot whose check can be read from history (or simpler: Dan's save already has wins, so a save with 5+ runs starts with everything unlocked except Tinker). Say in the commit which you did.
- Picker: locked cards show the silhouette (sprite drawn in `#2a2738`), the name and the hint, and can't be picked. `?pilot=` and `?unlock=all` (debug) ignore locks.
- Compendium Pilots tab shows the hint for locked pilots.
- **Win marks:** the picker shows a small check on a pilot you've won with (from history). No other reward.
- Not in this milestone: locking pieces, passives or chassis behind unlocks.

**Acceptance:** a unit test per milestone check from a fake summary; a save with none unlocked shows 2 open pilots; the smoke test unlocks Bulwark with a fake summary and the picker opens it.

### Gate 2: Dan plays M5 and M6

Tinker is the most new code and the most likely to be cut; build it only if Dan wants it after this gate.

---

## M7, v0.12.6: Tinker and chassis modules

**Goal.** One pilot where Standard is the point: you never swap chassis, you bolt their quirks onto your Standard frames.

**Changes**

- `PILOTS.tinker.rules = { modules: true }`. Every new chain is Standard. Chassis cards from capacity levels, chests and the workbench become **module cards**: `{ kind: 'module', chassis: id, mk }`, "Kiln module: elements hit as if held 1.5 times".
- A module goes on one Standard chain (the editor asks which, like a chassis card does today). Max 2 modules per chain; a third replaces one (pick which). A chain state gets `modules: [chassisId]`. Mark (`mk`) on a module card is ignored.
- New `MODULES` table in `src/rig/chassis.js`, half-strength versions of each quirk, applied when the chain is compiled (`chainDefOf` in `src/rig/editor.js`):

| Module | Effect on the Standard chain |
|---|---|
| Capacitor | power x1.25 |
| Overdrive | recharge +4/s |
| Kiln | element boost at half (Intensify x0.5 extra), Steam/Plasma/Static cooldowns x0.75 |
| Relay | payload echo at 30% (same delay) |
| Strider | power x1.12 |
| Anchor | power x1.25 and area +25%, only while standing still |
| Reaper | each kill gives 0.15 energy |

  Two of the same module stack to the full chassis quirk.
- Snapshot, save `cleanRig`, run history, results and replaybench all carry `modules`.
- Picker, compendium and sprite (the gear from the sheet).

**Acceptance:** tests for module placement, the third-module swap, each module effect against the chassis it halves (bench row: Standard + 2x Kiln module ≈ Kiln's elemBoost), and a resumed Tinker run. One floor run and replays; Tinker on Dan's replays within ±20% of Rookie.

---

## M8, v0.12.7: tidy-up

- Spec: the Pilots section matches what shipped (numbers from M4-M7).
- `docs/architecture.md`: where pilot rules hook in (ovrun, offers, workbench, chassis, rig).
- Remove `tools/art/pilots-concept.mjs` once all sprites live in `neon-art.js`, or keep it if Dan wants to iterate more.
- Update the version and post one screenshot sheet of the picker with all pilots.

## Results

(M4 onward: before/after tables go here.)
