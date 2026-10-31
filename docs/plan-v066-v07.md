# Plan: weak pieces, trigger jobs and passives (v0.6.6 to v0.7.1)

Dan approved this on 2026-10-31 (proposal: https://claude.ai/artifact/RMThoWRFSy9D8krV7zi1ey). Pierce becomes Sunder.
There are six milestones, and each one is one push to main. Run them in order. Stop at the playtest gate after M4.

## Ground rules for whoever runs this

- **Before starting:**
  - Read `docs/overclocked-spec.md` (the Pieces, Triggers, Chassis and Progression sections) and the rig part of `docs/architecture.md`.
  - The rig lives in `src/rig/`. `chain.js` compiles a chain, `rig.js` runs it, `pieces.js` holds the data, and `offers.js` builds the level-up cards.
- **Keep it simple.** Build exactly what a milestone lists. Don't add pieces, card types, screens or currencies. If something here doesn't fit the code, take the simplest version that meets the acceptance checks, and say what you changed in the commit message.
- **Tests:**
  - `node tests/run.mjs` must pass before every push.
  - Run the browser smokes too when a milestone touches UI or saves: `node tests/smoke.mjs --ui`, `node tests/run-smoke.mjs` and `node tests/resume-smoke.mjs`.
  - Add or extend unit tests for every rule you change. Match the style of `tests/pieces.test.mjs` and `tests/rig.test.mjs`.
- **Benchmarking (Dan's rule: keep it minimal):**
  - Use `node tools/piecebench.mjs` (about 1 s, deterministic) to tune. Paste the relevant before and after rows into the commit message.
  - Run the full bot (`node tools/rigbench.mjs --seeds 12`, about 3 min) only once per milestone, at the end. The baseline is 3 to 4 wins out of 12. A swing of ±2 wins is noise. Flag anything below 2 out of 12.
- **Versioning:**
  - Bump `src/version.js`.
  - The commit message starts with `vX.Y.Z:`.
  - Update `docs/overclocked-spec.md` wherever a rule changes, so the spec stays the truth.
  - Push to main once the tests pass. Dan doesn't need to approve each push.
- **Saves:** old saves and resumed runs must still load. See M2's migration.

---

## M1, v0.6.6: Blaster becomes the cheap many-hit carrier

**Goal.** Blaster becomes the best piece to hang On Hit, elements or a reaction on, because it lands several separate hits per volley.

**Changes**

- `src/rig/pieces.js`, `PIECES.blaster`:
  - `cost` goes from 2 to 1.
  - `def.base.count` goes from 1 to 3 and `def.base.damage` from 16 to 6.
  - Keep `gap: 7` and `spread: 0.02`, so the three shots stay a tight volley on one target.
  - Update `desc` to: "A 3-shot volley at the nearest enemy; each shot is its own hit".
- Keep the signature (`+1 shot` at L3 and L5). It now adds a fourth and a fifth hit.
- Behavior needs no change. `behaviors/projectile.js` already fires `count` shots, and each shot hits separately through collision, which calls On Hit. On Impact stays once per volley, because `launch()` makes one `atk` per copy.
- On Hit payloads stay limited by the battery: each payload run pays energy. Don't add a separate cap unless the bench below shows a runaway.

**Acceptance (piecebench)**

- Bare `blaster` single-target dps is within ±15% of today's 16, and crowd dps is at least 33.
- `storm + blaster` and `flame>storm` on Blaster may rise a lot, since there are more procs. Add a "reactions on Blaster" block to piecebench, mirroring the "reactions on Nova" block. No Blaster reaction row may exceed 1.5x the best non-Blaster weapon with the same reaction in damage per energy. If one does, give that reaction a per-instance proc cooldown, the way `steam` and `plasma` already use `inst.reactAt`, rather than lowering Blaster.
- `blaster on_hit nova` crowd dps is above today's 164.
- Tests:
  - Update any test that hard-codes Blaster's cost or count.
  - Add a test that one Blaster volley against one enemy produces 3 hit events.

---

## M2, v0.6.7: Pierce becomes Sunder

**Goal.** This modifier works on all five weapons and sets up other chains. Every hit stacks a "takes more damage" mark.

**Changes**

- `src/rig/pieces.js`:
  - Replace the `pierce` piece with `sunder`: glyph `Su`, short `Sunder`, name `Sunder`, cost 1, type modifier.
  - Keep `mods: [{ stat: 'pierce', op: 'flat', value: 2 }]`, so shots still pass through 2 more enemies.
  - Add `sunder: true`.
  - New icon (a cracked shield or similar).
  - Description: "Hits sunder: each stack makes the enemy take 8% more damage from everything (up to 5 stacks, 3 s). Shots also pass through 2 more enemies".
- Add `export const SUNDER = { per: 0.08, max: 5, duration: 3 };`.
- `SIGNATURE.sunder = { text: '+1 max stack' }`. Remove `SIGNATURE.pierce`.
- `src/rig/chain.js` `makeNode`: when a held modifier has `sunder`, set `node.sunder = SUNDER.max + sigCount(levels, 'sunder')`. Otherwise `node.sunder = 0`. Add it to the returned node.
- `src/rig/rig.js` `onEvent`: on `ev === 'hit'` with `depth === 0`, `target !== null` and `node.sunder > 0`, add one stack. Use `target.sunderN = Math.min(node.sunder, (target.sunderN || 0) + 1); target.sunderS = SUNDER.duration`.
- Enemy fields:
  - `src/game/world.js`: add `sunderN: 0, sunderS: 0` next to `sunderT`. The existing `sunderT` is Overforged's armor strip, so leave it alone.
  - `src/game/director.js`: reset both fields at spawn.
  - `src/systems/enemy-ai.js`: count `sunderS` down, and when it reaches 0, set `sunderN = 0`.
- `src/systems/damage.js`, next to the `markT` line: `if (e.sunderN > 0) amount *= 1 + SUNDER.per * e.sunderN;`. This applies to every source, burns included.
- Rendering: draw a small violet notch per stack under a sundered enemy, in the enemy draw in `src/render/entities.js`. Keep it cheap: no new allocations per frame.
- **Migration**, because Pierce is in old saves:
  - Map `pierce` to `sunder` in `chains[].slots`, `bench` and the `levels` keys.
  - Do it in `src/save/save.js` (`cleanRig`), and in the resume path (`src/game/run-snapshot.js` restores `run.rigState`; migrate it before `applyRig`).
  - Add a test for each.
- Grep for every remaining `'pierce'` in `src/rig src/ui src/save src/game tools tests` and update it. The stat named `pierce` stays as it is: only the piece is renamed.
- `tools/piecebench.mjs`: replace `pierce` with `sunder` in the modifier list `M`. Add a "Sunder as support" block that runs two chains in the same run, `sunder blaster` plus `slam`, against `slam` alone, and prints Slam's own damage row.

**Acceptance**

- Piecebench crowd results:
  - `sunder + slam` is at least 1.2x `slam`.
  - `sunder + blaster` is at least 1.25x `blaster`.
  - In the two-chain block, Slam's row with a sundering Blaster chain beside it is at least 1.2x Slam alone.
- A unit test shows stacks cap at the max, expire after 3 s, and raise damage by 8% per stack.
- A unit test shows an old save with `pierce` in a slot and in `levels` loads as `sunder` at the same level.

---

## M3, v0.6.8: one job per trigger

**Goal.** Each trigger wins in one situation: On Hit in crowds, On Impact against bosses, On Kill in packs, and Every 3rd when the battery is tight.

**Changes**

- `src/rig/pieces.js`:
  - Replace `TRIGGER_BONUS` and `EVERY_BONUS` with `export const TRIGGER_POWER = { hit: 0.9, impact: 2.5, kill: 1.5, every: 3 };` (starting values; tune them against the targets below).
  - Add `export const CASCADE_MAX = 3;`.
  - Update the four trigger `desc` strings to say their job:
    - On Hit: "Runs the payload from every enemy hit, at reduced power. Best in crowds".
    - On Impact: "Runs the payload once where the attack first lands, at x2.5 power. Best against bosses and elites".
    - On Kill: "Runs the payload from each enemy the attack kills. Kills by the payload set it off again, up to 3 deep".
    - Every 3rd: "Every third time it is reached, runs the payload from you at x3 power, costing no energy".
- `src/rig/chain.js` `parse`: payload power uses `TRIGGER_POWER[piece.on]` in place of `TRIGGER_BONUS * (every ? EVERY_BONUS : 1)`. Everything else in that expression stays as it is: the trigger's level, `sigPower` and `payloadPower`.
- **Every 3rd is free:**
  - In `fireNode` (`src/rig/rig.js`), the `every` branch queues the job with `free: true`.
  - `runNodes` and `fireNode` take a `free` flag. When it's set, skip the dry check and don't subtract `node.cost`.
  - A trigger nested inside a free payload is still paid for normally, and its own later payload is not free.
  - `analyzeChain` should not count an Every 3rd payload's cost in the chain's per-run cost. Show it as "(free)" in `describe`.
- **On Kill cascade:**
  - In `buildChain`, walk each `on: 'kill'` trigger's payload and set `node.cascadeOf = trigger` on every node in it (nested levels included).
  - Jobs carry `gen` (0 for a normal job). `runNodes` and `fireNode` pass `gen` down and set `inst.rigGen = gen`. Echo's delayed shots keep the `gen` of the shot they repeat.
  - In `onEvent`, when `ev === 'kill'` on a node with `cascadeOf`, and `(inst.rigGen || 0) < CASCADE_MAX`, queue `{ trig: node.cascadeOf, act: inst.rigAct, x, y, chain, gen: inst.rigGen + 1 }`.
  - This queue is separate from the node's own trigger, which still works as before.
  - Cascades still pay energy, so the battery limits them.
- Update `analyzeChain`'s `TRIGGER_WORDS` if the wording changes, plus the compendium text (it reads from the data).

**Acceptance (piecebench, Blaster then Nova and Mortar then Nova blocks)**

- Single target: `on_impact` dps is at least 1.5x `on_hit`.
- Crowd: `on_hit` dps is at least 1.3x `on_impact`.
- Crowd: `every_3rd` dps is at least the no-trigger dps, and the chain spends less energy. Count energy from `rig.log`, or add a spent column to the bench.
- On the weak crowd (HP 60): `on_kill` is at least 1.3x the no-trigger version.
- A unit test with a log shows a cascade reaching gen 2, and never above `CASCADE_MAX`.
- A unit test shows an Every 3rd payload doesn't lower the battery.

---

## M4, v0.6.9: make a payload proc feel like an event

**Goal.** You can see and hear when a trigger goes off, and you can see a cascade grow. This is presentation only, with no balance change.

**Changes**

- In the `updateRig` payload loop (`src/rig/rig.js`), push a ping with `big: true` (a larger, white-edged ring) instead of only flashing the slot.
- In `drawRig`, draw big pings at about 1.6x the radius.
- New sfx `proc` in `src/audio/sfx.js`: a short bright blip. Throttle it to at most one per 0.08 s.
- Add `proc` to the volume table on line 12. Call `run.sfx('proc')` from the payload loop.
- For a cascade job with `gen >= 1`, show a small floating label `x2`, `x3` or `x4` at the job's spot. Reuse the damage-number system if it can show text, otherwise a short-lived text fx in `src/render/`.
- Keep it light: no per-frame allocations, and leave the existing cap of 32 pings in place.

**Acceptance**

- `node tests/smoke.mjs --ui` passes, and a screenshot of a chain with On Kill shows the labels.
- Run the bot once now (12 seeds), and report wins, level and kills against v0.6.5.

### Playtest gate

Stop here. Tell Dan v0.6.9 is up and what changed, and wait for his playtest before M5.

---

## M5, v0.7.0: passives that change how you build

**Goal.** Replace the four stat cards' role with 12 passives that each point at the rig. The four stat cards (Swift feet, Tough hide, Magnet, Plating) stay in the pool as filler. Passives are not combo cards, and there are no combo cards.

**Rules for every passive:** one line of text, stacks up to 3 (each stack only raises the number), and it either names a piece, element, trigger, chassis or battery, or changes how you move.

**Data**

- Create a new file, `src/rig/passives.js`, exporting `PASSIVES = { id: { name, desc(n), max: 3, values: [s1, s2, s3], fits(rig) } }`.
- `desc(n)` returns the text for stack `n`.
- `fits(rig)` says whether the passive is useful with what the player owns (see M6).

**State and plumbing**

- `rig.passives = { id: stacks }` sits next to `rig.stats` in the rig state.
  - `src/rig/editor.js`: copy it, and add `takePassive(rig, id)`, capped at `max`.
  - `src/save/save.js` `cleanRig`: keep it.
  - Resume: it rides on `run.rigState`.
- `src/game/sandbox.js` `applyRig` calls a new `applyPassives(run)` after `applyRigStats(run)`. It removes and re-adds stat modifiers under a `passive:` source, sets `run.rules` entries, and leaves `run.rig.passives` for `rig.js` to read.
- `chainDefOf` (`src/rig/editor.js`) passes `passives` into each chain definition, so `compileChain` can apply the compile-time ones.

**The 12** (values are starting guesses; each row says where it hooks in)

| id | Name | Stack 1 / 2 / 3 | Hook |
| --- | --- | --- | --- |
| last_word | Last Word | The last top-level weapon in each chain x1.3 / 1.5 / 1.7 | `compileChain`: after `parse`, multiply the last top-level weapon node's `power` |
| hair_trigger | Hair Trigger | Payloads x1.25 / 1.4 / 1.55; every modifier costs +1 | `parse`: multiply payload `outer`; `makeNode`: +1 per held modifier |
| ricochet | Ricochet | Shots bounce to 1 / 2 / 3 more enemies | stat `ricochet` flat, tags `['projectile']` (Blaster, Nova) |
| pyromaniac | Pyromaniac | A burning enemy that dies passes its burn to the nearest enemies | `run.rules.wildfire`, using the three values from `PERKS.wildfire.rule` in `src/data/perks.js` |
| conductor | Conductor | A shocked enemy that dies fires 2 / 3 / 4 bolts at enemies nearby | `run.rules.thunderclap`, using `PERKS.thunderclap.rule` values |
| permafrost | Permafrost | A frozen enemy that dies bursts for 30 / 45 / 60% of its max HP | `run.rules.shatter`, using `PERKS.shatter.rule` values. Don't add the perk's chill-chance mods. Named Permafrost to avoid a clash with the Shatter reaction |
| siphon | Siphon | Every kill gives every chain 0.15 / 0.25 / 0.35 energy | `updateRig`: add to each `bat.kill` |
| overflow | Overflow | Recharge while the battery is full banks power for its next activation, up to +25 / 40 / 55% | `bat.over += rate*dt` while full; `activate` scale x (1 + min(cap, over / size)); reset on activation |
| redline | Redline | A timed chain under 30% battery runs its timer 25 / 40 / 55% faster | `updateRig`: `chain.t -= dt * mult` for timed rules |
| momentum | Momentum | +30 / 45 / 60% recharge while moving, -20% while still | `updateRig`: multiply `bat.rate * dt` |
| turret | Turret Mode | After standing still for 1 s, rig damage +30 / 45 / 60%; moving resets it | track `p.stillT`; `activate` scale |
| glass_cannon | Glass Cannon | Each stack: max HP x0.7, all damage +30% | stat `maxHp` op `more` -0.3 and `damage` op `more` 0.3 per stack, global |

**Offers (`src/rig/offers.js`)**

- The existing `STAT_CHANCE` slot now picks a passive 70% of the time and a stat card 30%.
- New offer kind `passive`:
  - `applyOffer` calls `takePassive`.
  - `describeOffer` returns the title, tag `passive · n/3` and the next stack's text.
  - The card art uses a new `type: 'passive'` style, with the same layout as stat cards.
- A passive at its max stacks is never offered.

**Acceptance**

- One unit test per passive, proving its rule fires. The test file is `tests/passives.test.mjs`.
- A piecebench `--only passives` block runs a fitting chain with each passive at stack 0, 1 and 3, against the standing crowd and a single target. Targets:
  - Each stack-1 passive gives +10% to +35% on the build it fits.
  - Nothing exceeds +70% at stack 3. Glass Cannon is exempt, because it costs HP.
  - Report the rows in the commit message.
- Old saves without `passives` load fine.

---

## M6, v0.7.1: offers lean toward your build, plus compendium, results and bot

**Changes**

- **Fit weighting** in `offers.js`:
  - A passive whose `fits(rig)` is true is weighted x3.
  - Pyromaniac, Conductor and Permafrost are never offered without their element. An element counts if the player owns the modifier, or Chain Bolt for storm.
  - Other non-fitting passives are weighted x0.5.
  - The `fits` rules:

    | Passive | Fits when the rig has |
    | --- | --- |
    | Ricochet | Blaster or Nova |
    | Hair Trigger | any trigger |
    | Last Word | 2 or more chains |
    | Siphon | Reaper or any On Kill |
    | Momentum | a Strider chassis |
    | Turret Mode | an Anchor chassis |
    | Overflow, Redline | always |
    | Glass Cannon | always |

- **Compendium** (`src/ui/compendium.js` and its data): add a Passives section listing all 12 with their three stack texts, generated from `PASSIVES`.
- **Results screen** (`src/ui/results.js`): list the passives taken, with their stack counts.
- **Bot** (`tools/rigbench.mjs`):
  - Score passive offers so the bot takes a fitting passive over a stat card, and over a level card when its rig is full.
  - Avoid Glass Cannon unless its HP is above 70%.
  - Run 12 seeds once and report the result against M4's.
- Update `docs/overclocked-spec.md` Progression to describe passives, and remove the "Combo cards" line.

**Acceptance**

- A unit test shows the fit weighting: a rig with no Flame never sees Pyromaniac, and a rig with Blaster sees Ricochet more often than one without.
- `node tests/run.mjs`, `node tests/smoke.mjs --ui` and `node tests/resume-smoke.mjs` all pass.
- Tell Dan v0.7.1 is up and ready to play.
