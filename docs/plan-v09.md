# Plan: chassis that play differently (v0.9.0 to v0.9.3)

Dan approved this on 2026-11-01 (proposal: https://claude.ai/artifact/PMWT9KPFzWSsZS6KFDWznB). He's OK to cut Long and
Spite, and wants a distance-based Strider and Anchor as a turret. There are four milestones, and each one is one push to
main. Run them in order, then stop at the playtest gate.

## The problem, measured

- **Four chassis are one chassis.** Standard, Long, Kiln and Relay all pulse every 1 s. They differ only in slots and cost
  discounts: Kiln makes element modifiers free, Relay makes payload pieces free. Charge and cell upgrades remove the energy
  limit by mid-run, and after that all four fire the same chain at the same rate for the same damage.
- **Rate chassis win.** Overdrive (0.6 s, x1.3), Strider (0.5 s while moving, and players always move) and Reaper (up to 4
  a second in a crowd) multiply every piece and upgrade in the chain.
- **Picks.** In Dan's 9 runs with chassis data: Reaper 8, Overdrive 6, Strider 3, Capacitor 3, Relay 3, Long 2, Kiln 1,
  Standard 1, Anchor 0, Spite 0.
- **Late swap test.** `node tools/chassisswap.mjs` replays Dan's newest run and, from 4:00, puts his relay chain (heavy
  slam on_kill scatter heavy nova) on each chassis in turn. On v0.8.4 every chassis landed within run noise (about ±15%)
  of the others, and removing the chain entirely scored the same as Anchor. So the chassis choice barely matters late.

**The rule for every quirk:** it must change how a chain fires or what it amplifies, and it must still matter when the rig
is fully upgraded. No cost discounts.

## Target lineup (8 chassis)

| Chassis | Rule | Slots | Battery | Recharge | Quirk after v0.9.3 |
| --- | --- | --- | --- | --- | --- |
| Standard (start) | Pulse 1 s | 3-6 | 10 | 6/s | None |
| Capacitor | Charge | 4-6 | 24 | 5/s | x1.5 power (unchanged) |
| Overdrive | Rapid 0.6 s | 3-4 | 8 | 8/s | Pieces cost 1 more; power x1.3 becomes x1.0 |
| Kiln | Pulse 1 s | 4-6 | 12 | 6/s | Element amplifier: statuses as if each element were held twice, reactions twice as often |
| Relay | Pulse 1 s | 5-6 | 14 | 6/s | Payload doubler: each payload runs again 0.15 s later at 60%, for free |
| Strider | Stride: every 80 px moved | 4-6 | 10 | 7/s, only while moving | Fires by distance, so move speed is fire rate |
| Anchor | Anchor 0.6 s, only still | 4-6 | 16 | 8/s, only while still | Turret: x1.6 power and +50% area |
| Reaper | On kill, gap 0.5 s | 4-5 | 12 | 5/s | Each kill adds 0.3 energy (was 0.5); idle fire after 3 s stays |

Long and Spite are cut.

## Ground rules for whoever runs this

- **Before starting:**
  - Read `docs/overclocked-spec.md` (the Chassis, Elements and Triggers sections).
  - The code:
    - Chassis data is `src/rig/chassis.js` and rule cards are `RULES` in `src/rig/pieces.js`.
    - The chain compiler is `src/rig/chain.js`. It reads the quirk in `parse` and `makeNode`.
    - The runtime is `src/rig/rig.js`: `buildChain`, `makeInstance`, `fireNode`, `activate`, `updateRig`, and the payload queue at the end of `updateRig`.
    - Reactions are `src/rig/reactions.js`.
    - Saves are `migrateRig` in `src/rig/editor.js` (run snapshots) and `cleanRig` in `src/save/save.js` (run history).
- **Keep it simple.** Build exactly what a milestone lists. Don't add chassis, pieces, passives, screens or settings. If something here doesn't fit the code, take the simplest version that meets the acceptance checks, and say what you changed in the commit message.
- **Tunable numbers live in data.** Every number below goes in `src/rig/chassis.js` (in the quirk, or a named export next to `MK_MAX`) or `RULES`, with a one-line comment. Dan will ask for "stronger" or "weaker" after he plays, so each should be a one-line change.
- **Tests:**
  - `node tests/run.mjs` must pass before every push.
  - Run the browser smokes on every milestone: `node tests/smoke.mjs --ui`, `node tests/run-smoke.mjs` and `node tests/resume-smoke.mjs`.
  - Add unit tests for every rule you add, in a new `tests/v09.test.mjs`. Match the style of `tests/v08.test.mjs` and `tests/pieces.test.mjs`, which install a rig with `installRig(run, [{ rule, slots, energy, quirk }], { log: true })` and read `rig.log`.
  - Existing tests that name Long or Spite: change them to another chassis (Kiln or Capacitor) or delete the ones that only tested Spite (`tests/pieces.test.mjs`, `tests/ovrun.test.mjs`, `tests/rig.test.mjs`).
- **Benchmarking (Dan's rule: keep it minimal):**
  - **Main check, once per milestone:** the chassis swap test, `node tools/chassisswap.mjs` (Dan's real rig, about 20 s a chassis).
    - Also run it once with `--chain 0` (his reaper chain) when the milestone touches a rate chassis.
    - Paste the before and after table into the commit message.
  - **Supporting check:** `node tools/piecebench.mjs --only chassis` (about 1 s), the fixed-scenario dps per chassis on three test chains.
    - Strider and Anchor need the bench's movement handling updated in M3. Read the TODO there.
  - **Bot floor:** run `node tools/rigbench.mjs --seeds 12` (about 3 min) once, at the end of M4 only.
    - The v0.8.5 baseline is about 1 win out of 12.
    - Flag anything at 0 out of 12, but don't tune the game to the bot. Dan's rule is to tune to a real player and use the bot as a floor.
  - Don't chain many benchmark runs. If a number is surprising, run one more seed (`--seed 2`), then decide.
- **Versioning:**
  - Bump `src/version.js`.
  - The commit message starts with `vX.Y.Z:`.
  - Update `docs/overclocked-spec.md` (the Chassis table and notes) and the chassis `desc` strings wherever a rule changes.
  - Push to main once the tests pass. Dan doesn't need to approve each push.
- **Saves:** old saves and resumed runs must still load. A chain on `long` or `spite` becomes a `standard` chain (rule `pulse`), keeping its mark, pieces, charge and cell.

---

## M1, v0.9.0: cut Long and Spite, trim Overdrive and Reaper

**Goal.** Eight chassis. The two rate chassis that win every run are pulled back toward the rest.

**1. Cut Long and Spite.**
- Delete `long` and `spite` from `CHASSIS`. Standard's `max` goes from 5 to 6, so a Mk III Standard starts at 5 and grows to 6 (Long's job).
- Delete `RULES.spite`, `SPITE_HEAL`, the `heal`/`scales` handling in `updateRig`, and `hurtCharge` (quirk, `bat.hurt`, `rig.hurts`). `rigEvent(run, 'hurt')` in `src/systems/damage.js` can go too if nothing else listens for it (check with grep).
- Delete `spite` from `BY_RULE`. `chassisForRule('spite')` then falls back to Standard.
- Migration. Add one helper `migrateChassis(chain)` in `chassis.js`: `long` or `spite` becomes `standard` with rule `pulse`, and everything else on the chain stays.
  - Call it from `migrateRig` (editor.js) for run snapshots.
  - Call it from `cleanRig` in save.js for run history, so Past runs and the results screen still name a chassis.
  - Call it from `rigFrom` in `tools/replaybench.mjs`.
  - `src/ui/results.js` reads `RULES[c.rule].name` with no fallback. Give it the same `|| { name: c.rule }` fallback that compendium.js has.
- Tests:
  - A snapshot rig with a `spite` chain and a `long` chain loads as two Standard chains with the same pieces, mark, charge and cell.
  - `chassisCards` never offers `long` or `spite`.

**2. Overdrive power x1.3 becomes x1.0.** Keep `costAdd: 1` and the 0.6 s rate. Update its `desc`.

**3. Reaper.**
- `RULES.reaper.gap` goes from 0.25 to 0.5, and `killCharge` from 0.5 to 0.3.
- Update the rule `desc` to "On any kill, at most twice a second". The editor analyzer test reads that string, so update the test as well.
- Update the chassis `desc` too.

**Acceptance.**
- 8 chassis in the compendium's Chassis list.
- The swap test shows Overdrive and Reaper lower than on v0.8.5, with nothing else changed.
- The swap test on `--chain 0` (Dan's reaper chain) shows Reaper below Standard + 30%. If it's still well above, lower `gap` further toward 0.6 before pushing, and say so.

---

## M2, v0.9.1: Kiln amplifies elements, Relay doubles payloads

**Goal.** Kiln and Relay change what a chain does instead of what it costs.

**1. Kiln: element amplifier.**
- The quirk becomes `{ elemBoost: true }`. Drop `elementFree` and `elemPower` (and their code in `chain.js` if nothing else uses them).
- In `makeNode`, set `node.boost = true` when the quirk has `elemBoost` and the node has at least one element.
- In `makeInstance` (rig.js), a boosted node also gets the `INTENSIFY` mods (reactions.js) of each of its elements, exactly as if each element were held twice. Burn power is doubled, chill gets +1 stack, and storm gets +2 jumps.
  - If the node already has `intensify_<el>` as its reaction, it still gets the extra mods once more, which is fine.
- Reactions fire twice as often on a boosted node. Steam, Plasma and Static have an `every` cooldown in `reactOnHit`: use `every * KILN_REACT` with `KILN_REACT = 0.5` in chassis.js.
  - Shatter and Overload have no cooldown, since they spend the status. Leave them; the doubled statuses already feed them.
- `desc`: "Elements on this chain hit as if held twice (stronger burn, chill and shock), and reactions fire twice as often".
- Tests:
  - A Kiln chain `['flame', 'blaster']` applies a burn about twice as strong as the same chain on Standard. Compare `target.burnDps` or whatever the burn status stores; read `systems/status.js`.
  - A Kiln `['flame', 'frost', 'nova']` (Steam) node makes clouds at most every 0.25 s.

**2. Relay: payload doubler.**
- The quirk becomes `{ payloadEcho: RELAY_ECHO }` with `RELAY_ECHO = { delay: 0.15, mult: 0.6 }` in chassis.js. Drop `payloadFree`.
- When a payload job runs (the queue loop at the end of `updateRig`) on a chain whose quirk has `payloadEcho`, and the job isn't itself an echo:
  - Push a delayed copy that runs the same payload from the same point after `delay` seconds.
  - The copy runs at `mult` power and costs no energy (`free = true` in `runNodes`).
  - Mark it `echo: true` so it's never echoed again.
- `runNodes` and `fireNode` need a power multiplier for this. Add a `mult = 1` parameter that multiplies into `fireNode`'s `mult`, and pass it through. Use `rig.delayed` or a small second list, whichever is simpler.
- Cascades:
  - The copy's kills may cascade like any payload's (`cascadeOf`, `CASCADE_MAX` and the pool check stay as they are).
  - A cascade job that a copy's kill started isn't an echo, so it can be echoed. That's intended. `CASCADE_MAX` and the battery still end it.
  - If a bench or test shows the queue hitting `MAX_QUEUE` every tick, make cascade jobs from echo copies also `echo: true`, and say so.
- `desc`: "Every payload goes off twice: again 0.15 s later at 60%, for free".
- Tests:
  - A Relay chain `['blaster', 'on_hit', 'nova']` logs two `payload` runs per hit, the second at 0.6 power and spending 0 energy.
  - The same chain on Standard logs one.

**Acceptance.**
- `piecebench --only chassis`: on the trigger chain (heavy blaster on_kill echo nova slam), Relay is clearly first among the pulse chassis.
- On the flame mortar chain, Kiln is clearly first among the pulse chassis.
- "Clearly" means at least 1.3x Standard.
- The swap test: Relay on Dan's relay chain is at least 1.3x Standard at 9-10 min. That is the "still matters late" check.
- Nothing is above about 2x Standard. If something is, lower `mult` or `KILN_REACT` toward 1 first.

---

## M3, v0.9.2: Strider fires by distance, Anchor is a turret

**Goal.** Strider rewards speed, and standing still on Anchor is worth the risk.

**1. Strider: every 80 px moved.**
- `RULES.stride` becomes `{ name: 'Stride', dist: STRIDE_DIST, first: 0.3, while: 'moving', desc: 'Every 80 px you move', short: 'move' }`, with `STRIDE_DIST = 80` in pieces.js.
  - Base move speed is 150 px/s, which is about 1.9 activations a second (was 2.0).
  - With +40% speed it's about 2.6 activations a second.
- In `updateRig`, a rule with `dist` adds the distance the player moved this tick to `chain.dist`:
  - The distance is `Math.hypot(p.x - rig.px, p.y - rig.py)`. Keep `rig.px` and `rig.py` from the last tick, and skip ticks where the move is bigger than 50 px, which is a teleport or a respawn.
  - Fire when `chain.dist >= dist`, then subtract `dist`. Fire at most once a tick and cap the carried distance at `dist`.
  - `first` still delays the very first activation.
- Battery and recharge stay "only while moving".
- Snapshot: `chain.dist` restarts at 0 on resume. That's fine; just make sure nothing reads it as undefined.
- Tests:
  - A Strider chain with the player moving at 150 px/s fires 9 to 10 times in 5 s.
  - At 300 px/s it fires 18 to 19 times.
  - Standing still, it fires 0 times.

**2. Anchor: turret.**
- The quirk becomes `{ still: ANCHOR_TURRET }` with `ANCHOR_TURRET = { power: 1.6, area: 0.5 }` in chassis.js.
  - It only ever fires while still (rule `anchor`), so the bonus is always on when it fires. That's intended: the cost is standing still.
- Power: apply `power` in `compileChain` like Capacitor's `power`.
  - Don't make it conditional on standing still: the rule already makes it so.
- Area: in `makeInstance`, an Anchor chain's instances get `{ stat: 'area', op: 'inc', value: 0.5 }`. Area covers radius, range, arc width and jump in `weapon-params.js`.
  - Aiming is limited to on-screen targets (`src/game/aim.js`), so the range part mostly shows up as bigger Nova, Slam and Mortar blasts. That is the point.
- Leave the Turret Mode passive as it is; it stacks.
- `desc`: "Fires only while you stand still, at x1.6 power and +50% area".
- Tests:
  - An Anchor chain `['nova']` hits enemies at 1.5x the radius of the same chain on Standard.
  - Its activations are logged with power 1.6.

**3. Benches.**
- `tools/piecebench.mjs` (the `chassis()` rows) moves the player for Strider only. Give it a fixed pattern that matters for both:
  - Strider and the rest: walk back and forth at base speed.
  - Anchor: stand still.
  - Say in the bench header that Anchor's rows are "while still".
- `tools/pressurebench.mjs` / `tools/rigbench.mjs`: the bot never stands still, so an Anchor chain never fires in bot runs and in the swap test.
  - Don't change the bot's movement in this plan. Note in the commit message that Anchor's swap-test row reads as "empty chain", and judge Anchor by piecebench only.

**Acceptance.**
- `piecebench --only chassis`: Anchor (still) at least 1.4x Standard on the flame mortar chain.
- Strider within ±20% of Standard at base speed. Faster only with speed.
- The swap test on `--chain 0` and the default chain shows Strider no longer above every pulse chassis.

---

## M4, v0.9.3: one tuning pass, the docs, and the floor

**Goal.** Numbers settle, and everything the player reads matches what each chassis does.

1. Run the swap test once on each of Dan's two runs: `--run 0 --chain 1`, and `--run 1 --chain 0` (his reaper run).
   - Each chassis should be somewhere between 0.8x and 2x Standard.
   - The chassis that fits the chain should be on top: Relay on trigger chains, Kiln on element chains, Reaper in crowds.
   - Move at most one number per chassis to get there, and record the table in the commit message.
2. The compendium's Chassis list (`rulesHtml` in compendium.js) and the chassis card text (`describeChassis` in offers.js) show the new `desc` strings. Check that each fits on one phone line pair. Shorten a `desc` rather than wrap to three lines.
3. Update `docs/overclocked-spec.md`:
   - The Chassis table matches "Target lineup" above with the final numbers.
   - The notes say Long and Spite were cut in v0.9.0 and why (no picks, quirks that didn't matter late).
4. Passives that name a cut chassis:
   - grep `passives.js` for `fits:` lines naming chassis. Momentum fits Strider and Turret Mode fits Anchor, which is fine.
   - Make sure none names `long` or `spite`.
5. The bot floor, once: `node tools/rigbench.mjs --seeds 12`. Report wins and level next to the v0.8.5 baseline (about 1 of 12).
6. Update `src/version.js` to 0.9.3. Push.

## Playtest gate

Stop here. Dan plays and reports whether the chassis now feel different. Ask him to copy his run data (Past runs > "Copy
run data") after two or three runs, so the next tuning pass uses his real rigs: `tools/replaybench.mjs --file <it>` and
`tools/chassisswap.mjs --file <it>`.
