# Plan: enemy pressure and the gold economy (v0.8.0 to v0.8.2)

Dan approved this on 2026-10-31 (proposal: https://claude.ai/artifact/CdXiXZyqf1ERc8Ne9XFpqE). Boss HP that scales with the
build is OK "for now". Dan will playtest how dense the enemies feel. Screen-clearing starts around minute 3, by which point a
good run has two chassis filled. There are three milestones, and each one is one push to main. Run them in order, then stop
at the playtest gate.

## The problem, measured

`node tools/pressurebench.mjs --seed 1 [--dmg 7]` runs the rigbench bot in god mode for the full 10 minutes and prints
enemies alive and on screen per minute, the share of kills that happen off screen, gold earned and how long bosses live.
`--dmg 7` (+700% damage, about 8x) stands in for a strong human build like Dan's. The bot alone is about 1x.

| v0.7.2, seed 1 | Enemies on screen, min 6-9 | Kills off screen, min 6-9 | Warlord lives | Seer lives | Gold per run |
| --- | --- | --- | --- | --- | --- |
| Bot (1x) | 150-210, alive at the 500 cap | 0-5% | 196 s+, often never dies | 113 s+ | 1,259 |
| `--dmg 7` (8x) | 12-15 | 22-30% | 3 s | 2 s | 4,841 |

There are four causes:
1. Weapons aim at anything in range. Blaster reaches 380 px, Mortar 300 and Chain Bolt 240, but the phone view is only
   195 px from the player to the side edge, and enemies spawn at 235 px.
2. Gold comes mostly from kills, at 15 per ore drop. A strong rig earns about 4x more and snowballs at the shop.
3. Spawns run at a fixed rate. A strong rig kills enemies as fast as they arrive, so the screen stays empty.
4. Boss HP is fixed at 1,800 for the Warlord and 3,500 for the Seer.

Also, a rig whose only weapon chain runs on a Reaper chassis never fires again: Reaper fires only on kills, and with no
kills there is nothing to start it. In one bot run it sat at 500 enemies for 5 minutes with a full battery.

## Ground rules for whoever runs this

- **Before starting:**
  - Read `docs/overclocked-spec.md` (the Progression, Workbench and Enemies sections) and `docs/architecture.md` §5.8 (the director).
  - Spawning is `src/game/director.js` with its data in `src/data/waves.js`. One-off events are `src/game/run-events.js`. Enemy AI is `src/systems/enemy-ai.js`. Gold is `GOLD` in `src/systems/damage.js` and `PRICE` in `src/rig/workbench.js`.
- **Keep it simple.** Build exactly what a milestone lists. Don't add enemy types, boss attacks, currencies, screens or difficulty settings. If something here doesn't fit the code, take the simplest version that meets the acceptance checks, and say what you changed in the commit message.
- **Tunable numbers live in data.** Put every number Dan may want to change after his playtest in `src/data/` (waves.js, crates.js, enemies.js) or next to `GOLD` and `PRICE`, with a one-line comment. He will ask for "denser" or "fewer", so it should be a one-line change.
- **Tests:**
  - `node tests/run.mjs` must pass before every push.
  - Run the browser smokes on every milestone: `node tests/smoke.mjs --ui`, `node tests/run-smoke.mjs` and `node tests/resume-smoke.mjs`.
  - Add unit tests for every rule you add, in a new `tests/v08.test.mjs`. Match the style of `tests/m37.test.mjs`, which builds a run and calls the system directly.
  - The director state is saved in run snapshots (`getState` and `setState` in director.js). Anything new you add to the director's closure must go into both, and `tests/resume-smoke.mjs` must still pass.
- **Benchmarking (Dan's rule: keep it minimal):**
  - Use `node tools/pressurebench.mjs --seed 1` and `--seed 1 --dmg 7` (about 20 s each, run them in parallel) to tune. Add `--seed 2` only to confirm a final number. Paste the before and after rows into the commit message.
  - Run the full bot (`node tools/rigbench.mjs --seeds 12`, about 3 min) once per milestone, at the end. The v0.7.2 baseline is 2-3 wins out of 12, level about 19.5. A swing of ±2 wins is noise. Flag anything below 1 out of 12, and in that case lower the new pressure for the 1x bot before pushing rather than shipping it.
- **Versioning:**
  - Bump `src/version.js`.
  - The commit message starts with `vX.Y.Z:`.
  - Update `docs/overclocked-spec.md` wherever a rule changes, so the spec stays the truth.
  - Push to main once the tests pass. Dan doesn't need to approve each push.
- **Saves:** old saves and resumed runs must still load. A resumed v0.7.x run with no new director fields must default them, not crash.

---

## M1, v0.8.0: aim on screen, less runaway gold, Reaper never stalls

**Goal.** Kills happen where you can see them, and a strong rig no longer earns 4x the gold of a weak one.

**1. Weapons aim only at enemies on screen.**
- Add `onScreen(run, o, margin = 20)` in `src/core/` (or next to `randomPerimeterPoint`): true when `o` is within
  `run.view.w / 2 + margin` horizontally and `run.view.h / 2 + margin` vertically of `run.cam`.
- In a rig run (`run.rigRun`), every weapon's target choice must also pass `onScreen`. The rig's weapons use the shared
  behaviors: `behaviors/projectile.js` (Blaster), `nova.js`, `chain.js` (Chain Bolt, the first target only), `mortar.js`
  (its target pick from `queryRadius`) and `slam.js`. Wrap the predicate each passes to `queryNearest`, or filter what
  `mortar.js` collects. Leave the Overforged classes (not a rig run) unchanged, so their tests stay as they are.
- Shots still fly on and hit whatever they meet past the edge. Chain Bolt jumps and payloads such as an On Kill Nova are not
  limited, only the first target choice.
- Supply crates follow the same rule (they are aimable since v0.7.2).
- Tests: a rig run with one goblin at 300 px to the side (off screen) does not fire Blaster. With the goblin at 150 px it does. An Overforged archer run still shoots the 300 px goblin.

**2. Gold.**
- `GOLD.perOre` goes from 15 to 3 (5 was tried first), so a kill's ore drop is worth 3 gold. Gold now lives in `src/data/gold.js`.
- `GOLD.elite` goes from 25 to 40, and `GOLD.boss` stays at 100.
- New `GOLD.shrine = 120` (80 was tried first): reaching a shrine gives 120 gold in a rig run, before the workbench opens (`systems/shrines.js`,
  where `run.forgeReady = true` is set). Show it with the existing toast or label, for example "+80 Gold".
- Rerolls: `rerollPrice(n)` becomes 25, then 50, then 100 within one visit (`25 * 2 ** n`, with `PRICE.reroll = 25`).
- Leave piece, level, slot, charge, cell, chassis and overclock prices as they are. If the targets below aren't met, adjust `perOre` first.
- **Targets (pressurebench, seed 1):** gold per run of 600-800 at 1x and at most 1,300 at `--dmg 7`. Today it is 1,259 and 4,841.

**3. Reaper never stalls.**
- `RULES.reaper` in `src/rig/pieces.js` gets `idle: 3`. In `updateRig` (`src/rig/rig.js`, the `if (rule.on)` branch), a chain
  whose rule has `idle` also fires when it hasn't fired for `idle` seconds, even with no event. Track the time since it
  last fired on the chain, and save it if chains are snapshotted.
- Update the rule's `desc` to "On any kill, at most 4 times a second, and every 3 s if nothing dies", and the chassis `desc` in `src/rig/chassis.js` to match.
- Spite stays event-only. Getting hurt is under your control.
- Test: a rig with only a Reaper chain and one enemy in range (no kills possible: give it huge HP) fires within 3.1 s.

**4. Commit `tools/pressurebench.mjs`** if it isn't already in the repo. It was added with this plan.

**Acceptance**
- `--dmg 7`, seed 1: kills off screen under 5% in minutes 6-9.
- Gold targets above.
- `rigbench --seeds 12`: within ±2 wins of 2-3/12. The bot buys less at the shop now, so a small drop is expected. Below 1/12, raise `GOLD.shrine` before pushing.

---

## M2, v0.8.1: the screen fills up when you clear it

**Goal.** A strong rig faces a crowd from minute 3 on, while a weak rig, which is already swamped, sees about the same game as today.

**1. Minimum enemies alive.**
- New `MIN_ALIVE` in `src/data/waves.js`: a list of `{ from, to, min }` on the authored timeline. Start with:

  | Minute | 0-1 | 1-2 | 2-3 | 3-4 | 4-5 | 5-7 | 7-10 |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | `min` | 10 | 25 | 50 | 90 | 140 | 200 | 300 |

  These are higher in minutes 2-4 than the proposal had, because Dan says clearing starts around minute 3.
- In `director.update`: count live non-prop enemies. When the count is below the current `min`, spawn the shortfall from
  the current segment's `spawns` mix, choosing each enemy in proportion to its current `perSec`. Spawn at most
  `TOPUP_PER_SEC = 25` a second (keep an accumulator, like the wave entries do), at `randomPerimeterPoint`, with the
  segment's `hpScale` and the cap buff. Top-ups don't count toward the wave accumulators.
- The top-up never pushes past `ENEMY_SOFT_CAP`.
- From minute 5, top-ups also draw tougher enemies. Add `toughShare: 0.25` to the last two segments. That share of
  top-ups is picked from the segment's non-goblin entries only. This covers Dan's "larger quantities of tougher enemies".
- Tests: a run with no enemies at minute 6 (set `run.time`, call `director.update` for 1 s of steps) has about 25 new
  enemies, and after 8 s it reaches `min`. With `min` already met, `update` spawns only the normal wave rate.

**2. Three timed hordes.**
- New event `horde` in `RUN_EVENTS` (`src/game/run-events.js`) and three entries in `EVENTS`:
  - `{ at: 180, event: 'horde', count: 60 }`
  - `{ at: 360, event: 'horde', count: 100, elites: 2 }`
  - `{ at: 510, event: 'horde', count: 150, elites: 3 }`

  Keep `EVENTS` sorted by `at`. 510 is also a shrine. Move the horde to 515 if the two collide on screen.
- A horde spawns `count` enemies evenly around a ring centred on the player, at radius `hypot(view.w, view.h) / 2 + 30`, so
  every one starts just off screen on all sides and they close in together. Use the current segment's mix (goblins mostly,
  brutes and shieldbearers by their share), with the current `hpScale`. Then `elites` brute or shieldbearer elites with
  one random affix, the same way `elite()` builds them. A horde's elites drop chests like any elite.
- Toast: "A horde closes in!" and `run.sfx('boss')`.
- A horde ignores `MIN_ALIVE` but respects the enemy pool limit, so `spawnEnemy` returning null ends it quietly.
- Test: the horde at 180 adds 60 enemies, all at the ring distance from the player, give or take 1 px.

**Acceptance**
- `--dmg 7`, seed 1: at least 100 enemies on screen on average in minutes 6-9, and at least 40 in minute 3. Bosses aren't scaled yet, so their lifetimes don't count here.
- Bot (1x), seed 1: on-screen counts within about 20% of M1's from minute 5 on.
- `rigbench --seeds 12`: within ±2 wins of M1. If it falls below 1/12, lower the `MIN_ALIVE` values for minutes 2-5 first.
- `node tests/smoke.mjs --ui` reports fps of at least 55. Also run one god-mode browser run to minute 8 (`?seed=1&god=1`, if
  the smoke supports it, or a short Playwright script) and report its fps in the commit message. 300+ enemies on a phone
  is new territory. If fps drops below 50, say so, and lower the 7-10 `min` to 250.

---

## M3, v0.8.2: bosses that last

**Goal.** A boss fight lasts about 25 s (Warlord) or 40 s (Seer) for a strong rig, and is unchanged for a weak one.

**1. Boss HP from your build.**
- `RUN_EVENTS.boss`: before spawning, measure the rig's damage per second over the last 20 s from `run.stats.sec` (per-second
  damage dealt, `src/game/run-stats.js`): `dps = sum(last 20 entries) / 20`.
- New `fight` (seconds) on each boss def in `src/data/enemies.js`: `warlord: fight: 25`, `seer: fight: 40`, plus `hpMaxMult: 6`.
- Boss HP becomes `clamp(dps * fight, def.hp, def.hp * hpMaxMult)`. A weak rig keeps today's HP.
- Store the multiplier on the boss for the HUD and the results (for example `e.hpMult`), and add it to the run's stats so a run summary can show it.
- Damage dealt in a sparse screen undercounts a strong rig. That's why this milestone comes after M2. If the 8x Warlord
  still dies in under 15 s, measure dps from `run.stats` over the last 20 s and also from the rig's single-target bench,
  then choose the simpler fix (a larger `fight`, or a floor), and say which in the commit message.
- Test: with `run.stats.sec` filled with 500 a second, the Warlord spawns with 12,500 HP. With 10 a second, it spawns with 1,800. With 5,000 a second, it spawns with 10,800 (the 6x cap).

**2. Escorts.**
- When a boss drops below 66% and again below 33% HP, it calls an escort once each time: 20 enemies from the current mix
  plus 2 brutes, from the view edge, with the current `hpScale`. Track which thresholds have fired on the boss entity.
  Check it where the boss is already handled each tick (`run.boss`, see `systems/damage.js` and `game/run-events.js`). Don't
  add a new system for it.
- Toast: "The Warlord calls for help!" (use the boss's name).
- Test: damaging the Warlord to 60% spawns 22 enemies once, and damaging it to 30% spawns 22 more.

**3. Warlord rage.**
- `warlord.charge` gets `rageAt: 0.5` and `windupRage: 0.6`. In `systems/enemy-ai.js` (boss charge, around line 25), the
  windup is `windupRage` when `e.hp <= e.maxHp * rageAt`. The Seer already has its rage (`rageAt`, `rageSpeed`, `countRage`).
  Leave it as it is.
- Test: the Warlord's windup is 0.9 s at full HP and 0.6 s at 40%.

**Acceptance**
- `--dmg 7`, seed 1: the Warlord lives 20-35 s and the Seer 30-50 s.
- Bot (1x), seed 1: the boss HP multiplier is 1.0 to 1.3 for both bosses.
- `rigbench --seeds 12`: within ±2 wins of M2.
- The boss HP bar still reads correctly with the larger HP. Check `render/hud.js`, which should use `maxHp`.

---

## Playtest gate

Stop after M3 and post to Dan:
- The pressurebench rows at 1x and 8x for v0.7.2 and v0.8.2, side by side (on screen, off-screen kills, gold, boss lifetimes).
- The 12-seed bot result for each milestone.
- The tunable knobs and where they live: `MIN_ALIVE`, `TOPUP_PER_SEC` and the horde entries in `src/data/waves.js`, `GOLD` in `src/systems/damage.js`, `PRICE.reroll` in `src/rig/workbench.js`, and `fight` and `hpMaxMult` on the bosses in `src/data/enemies.js`.

Wait for Dan's playtest before anything else. These were held back on purpose: new enemy types (only if a full screen
still feels samey, and then one type built to punish screen-clearing), boss attack changes beyond the Warlord's rage, and
passive trims (only if one combination stands far above the rest).

---

## After the plan: testing against real builds (v0.8.4)

The bot builds far worse than a human, so it is the floor, not the target. Since v0.8.4 each run records its rig once a
minute (`run.timeline`, game/ovrun.js), the newest 30 history entries keep it, and Past runs has a "Copy run data" button.
`node tools/replaybench.mjs --file runs.json [--calibrate]` replays those builds minute by minute on the current version
(bot movement, your rig) and prints crowd, gold, boss lifetimes and survival next to your real result. `--calibrate` prints
the `--dmg` for pressurebench that matches your raw dps. Report three numbers per balance change: floor (rigbench), you
(replaybench) and pressure (pressurebench at the calibrated `--dmg`).
