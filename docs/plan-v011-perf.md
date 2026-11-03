# Plan: smooth big fights and a cooler phone (v0.11.0 to v0.11.5)

Dan approved the perf fixes on 2026-11-03. Background and the iOS path: https://claude.ai/artifact/QVHRSnj9YdAdYSA2bFpjRA

What Dan sees: stutter **mid to late game in big fights**, and since the music change (v0.10.9) his phone's screen dims as he
plays, which is iOS throttling an overheating phone. So the order below is: measure, then the steady per-frame draw cost
(which is what big fights and heat are made of), then the power savings, then the one-off hitches.

There are six milestones. Each one is one push to main. Run them in order. Stop at the playtest gate after M6.

## What we already know (2026-11-03 profile, `node tools/perfbench.mjs --cpu --once`)

Dan's winning Smith run replayed in headless Chromium at 390x844, dpr 2. Headless canvas is not iPhone Safari, so only
compare before and after on the same machine.

| Checkpoint | Sim per step | Draw per frame (avg / p95) | Live: enemies, shots, pickups | Per frame: drawImage, text, stroke |
| --- | --- | --- | --- | --- |
| 2 min | 0.04 ms | 11 / 7 ms | 57, 15, 88 | 96, 59, 35 |
| 5 min | 0.21 ms | 25 / 209 ms | 89, 272, 516 | 272, 139, 88 |
| 8 min | 0.36 ms | 29 / 323 ms | 78, 792, 599 | 228, 163, 95 |
| 10 min | 0.19 ms | 25 / 284 ms | 126, 800 (cap), 600 (cap) | 230, 98, 77 |

- **The game logic is not the problem.** Sim is under 0.4 ms a step. GC is under 1% of samples (the pools work).
- **Drawing is over 95% of frame time**, and `drawImage` alone is 60-80% of CPU samples late game. Every sprite (enemies,
  gems, ore, chests) is a 192x192 canvas (`src/render/sprites.js`, `SIZE`) shrunk to about 30-110 px each time it is drawn.
- Damage numbers are stroke + fill text every frame (`src/render/fx.js`, `drawFx`), and the HUD (`src/render/hud.js`,
  `src/render/rig-hud.js`) redraws about 25 text runs and its panels every frame.
- The renderer keeps drawing at 60 fps while the game is paused or a menu (level-up, chest, workbench) is open
  (`src/core/loop.js`: `render()` runs whether or not `isPaused()`). That is pure heat.
- One-off main-thread blocks: scheduling a song for its offline bake (`renderSong` in `src/audio/music.js`) takes
  title 35-140 ms, run 80-340 ms, boss 400-500 ms; a screen of new floor chunks (`src/render/ground.js`, `chunkFor`)
  80-130 ms; the first status-tinted copy of a sprite (`tinted` in `sprites.js`) about 5 ms each; the run save
  (`snapshotRun` + `JSON.stringify`) 6-13 ms and 600 KB by minute 10, every 15 s.
- **Bug:** after a rig edit (`applyRig` builds new weapon instances), burning enemies (`e.burnSrc`) and in-flight shots
  (`p.inst`) still point at the old instances. `snapshotRun` can't index them, walks into them, hits `inst.onRig` and
  throws `snapshot: function at world.projectiles.inst.onRig`; `saveRun` in `src/game/game.js` then calls
  `runSave.clear()`, which **wipes the resume save**. It is intermittent (it needs a burning enemy or a live shot from
  before the edit), and the profile hit it on 3 of 4 late checkpoints in one session.

## Ground rules for whoever runs this

- **Before starting:** read `docs/architecture.md` (render and loop parts), `src/render/renderer.js`, `src/core/loop.js`
  and `src/render/sprites.js`. The sim and the renderer are separate: the sim never reads wall-clock time and never draws.
  Keep it that way. Nothing in this plan may change what the sim does (the bot and the replays must give the same
  results before and after every milestone except M1's save fix).
- **Keep it simple.** Build exactly what a milestone lists. No WebGL, no new libraries, no build step. If something here
  doesn't fit the code, take the simplest version that meets the acceptance checks and say what you changed in the commit.
- **Look must not change** unless a milestone says so. Take a before and after screenshot of a busy scene and compare them:
  `node tests/smoke.mjs --query "god=1&seed=1" --at 330 --clean --shot out.png`. Small resampling differences are fine;
  missing or shifted things are not. Put the pair in `/mnt/project-files/perf/` (`vX.Y.Z-before.png`, `-after.png`).
- **Tests:** `node tests/run.mjs` must pass before every push. Run `node tests/smoke.mjs`, `node tests/run-smoke.mjs` and
  `node tests/resume-smoke.mjs` when a milestone touches rendering, menus or saves.
- **Measuring (Dan's rule: keep it minimal):** run `node tools/perfbench.mjs` (about 40 s) once before and once after each
  milestone and paste both outputs' draw lines into the commit message. Add `--cpu` when you need to know where time goes,
  `--once` for the one-off jobs. Don't run the 12-seed bot: nothing here touches balance. Exception: M1 changes saves, so
  run `node tests/resume-smoke.mjs`.
- **Versioning:** bump `src/version.js`; the commit message starts with `vX.Y.Z:`; bump `CACHE` in `sw.js` so phones pick
  up the new files; push to main once the tests pass. Dan doesn't need to approve each push.
- **Saves:** old saves and resumed runs must still load.

---

## M1, v0.11.0: on-phone frame readout, and stop the autosave wiping the resume

**Goal.** Dan's phone can tell us where the time goes, and the resume save stops disappearing.

**Changes**

- **Per-layer timing in the debug overlay** (`?debug=1`, `src/debug/debug.js` + `src/render/renderer.js`):
  - In `draw()`, time these spans with `performance.now()`, only when `debug.enabled`: ground, world (`run.drawWorld`),
    player + weapons, fx (`run.drawFx`), HUD. Also split `drawWorld` (in `src/game/run.js`) into gems/ore/chests,
    enemies, shots (`drawEnemyShots` + `drawProjectiles`) and hazards/zones by passing a small timing hook; keep the
    hook a no-op when debug is off so it costs nothing.
  - Show one line of smoothed averages (same 0.05 smoothing as `onFrameStats`), e.g.
    `ground 0.4  ents 3.1  shots 2.0  fx 1.2  hud 0.9`.
  - Keep a ring of the 10 slowest frames of the last 30 s and show the worst one's breakdown on a second line, so a
    screenshot of a hitch says which layer caused it.
  - Add one more line: `music <baked|live> lite <n>  sfx baked <n>/<total>` from `audio.music.mode`, `audio.lite` and the
    sfx bank (`sfx.baked`). If Dan's phone shows `live` after the first 15 s of a run, the music bake failed there and the
    live synth is running all game; that would explain the heat since v0.10.9. Report it to Dan if it happens in your
    own test runs.
- **Fix the save bug** (`src/game/run-snapshot.js`):
  - In `val()`, an object that looks like a weapon instance (it has `onRig` or `weaponId`) but is not in `instIdx` is
    an orphan from before a rig edit. Write it as `null` instead of walking into it.
  - Skip any projectile whose `inst` is an orphan when building `pools.projectiles`, so a resumed run doesn't get a shot
    with no weapon. The shot was about to expire anyway.
  - Check the restore side tolerates `burnSrc: null` (it is already reset to `null` in `director.js` and `world.js`, so
    it should) and a missing projectile.
  - Unit test in `tests/resume.test.mjs`: start a run, apply a rig, set some enemies burning and fire some shots, apply
    a changed rig (new insts), then `snapshotRun` must not throw and the restored run must step 600 frames without errors.
- **Make the 15 s autosave cheaper in a fight** (`src/game/game.js`): keep 15 s, but don't save while more than 200 shots
  are live or while a boss is alive; try again 3 s later. Saves at pause, level-up, chest, workbench, `pagehide` and
  `visibilitychange` stay as they are, so nothing is lost when the phone suspends the page.

**Acceptance**

- `?debug=1` on a phone-size window shows the layer line, the worst-frame line and the audio line.
- With debug off, `perfbench` draw numbers are within noise of before.
- The new resume test passes; `node tests/resume-smoke.mjs` passes.

---

## M2, v0.11.1: sprites rasterized at the size they are drawn

**Goal.** The biggest steady win for big fights: less pixel data per `drawImage`.

**Changes** (`src/render/sprites.js`)

- Give each sprite id its own raster size instead of the fixed `SIZE = 192`: about 2.5x its largest on-screen width in
  world units (the canvas is at most 2 device pixels per world unit, plus headroom for the hurt flash and outlines),
  rounded up to a multiple of 8, between 32 and 192.
  - Enemies: largest width = `def.r * SPRITE_K / PAD` (`SPRITE_K` in `src/render/entities.js`, `PAD` in `sprites.js`),
    over every enemy def that uses that sprite, including elites (`elite-art.js`) and bosses (`boss-art.js`). Bosses
    will stay near 192; goblin-sized enemies drop to about 64-96.
  - Gems and ore: `r * LOOT_K` from `GEM.tiers` / `ORES` (`LOOT_K` in `entities.js`). These are the most numerous and
    will drop to about 32-48.
  - Chests, shrines and the player sprite: use their drawn widths from `entities.js`, `shrines.js` and `renderer.js`.
  - Put the size table in one exported function (`rasterSize(id)`) next to `SPRITE_IDS`, computed once at load from
    the data, so a new enemy gets a size automatically. Anything not found falls back to 192.
- The hurt-flash and tinted copies (`flash`, `tinted`) use the same per-id size. Scale `EDGE` (the outline thickness in
  raster pixels) by `size / 192` so outlines look the same on screen.
- Draw calls don't change: `drawImage(spr, x, y, w, h)` already scales to world size.

**Acceptance**

- Before/after screenshots of a busy scene and of a boss (`--boss`) look the same at phone size.
- `perfbench` late-game draw average drops. Report the numbers. (Expect a clear drop on a phone; headless may show less.)

---

## M3, v0.11.2: damage numbers and the HUD from cached images

**Goal.** Cut the per-frame text work, which Safari is slow at.

**Changes**

- **Damage numbers** (`src/render/fx.js`):
  - Build a glyph sheet once (after `document.fonts.ready`, since Chakra Petch is a web font): the characters
    `0-9 . K M B T Q a i` in the two sizes used (plain 12 px, crit 16 px; and the `numBig` sizes when
    `setNumberStyle` turns it on), each already stroked with the black outline and filled white, at 2x resolution.
  - Coloured numbers (`f.c2` non-empty) and crits (gold): build one tinted copy of the sheet per colour the first time
    it is needed (`source-atop` fill, the way `sprites.js` tints), cached by colour.
  - Draw a number as one `drawImage` per character, centred like `textAlign = 'center'` did. Keep the alpha fade.
  - Labels (`addLabel`, cascade words) are rare: leave them as text.
- **HUD** (`src/render/hud.js`, `src/render/rig-hud.js`):
  - Draw the static parts (panels, chamfered frames, slot boxes, piece icons, chain names) into an offscreen canvas and
    only rebuild it when the rig, the layout (`view.w`, `view.h`, `insetTop`) or the class changes. Keep a cheap key
    (e.g. a string of chain rules + slots + levels + view size) and compare it each frame.
  - Keep drawing the live parts every frame on top: HP fill, XP bar, battery pips, piece flash, timer, kills, gold.
  - The timer, kill and gold texts only change a few times a second: cache each as a small canvas keyed by its string.
- `chamfer()` in `rig-hud.js` showed up in allocation samples; once the panels are cached that goes away by itself.

**Acceptance**

- Screenshots match before (numbers may differ by a pixel in placement).
- `perfbench --cpu` shows `fillText`/`strokeText` mostly gone from the top list late game. Report per-frame text counts.

---

## M4, v0.11.3: power. Don't draw what didn't change, and a graphics setting

**Goal.** Less heat over a 10-minute run. This is the milestone for the dimming screen.

**Changes**

- **No redraw while paused** (`src/core/loop.js`, `src/main.js`): when `isPaused()` is true and the previous frame was
  also paused, skip `render()` unless something asked for a redraw. Add `loop.invalidate()` and call it on resize/layout
  (`view.js`), when the rig editor or workbench changes the rig behind a menu, and when the game state changes. Draw one
  frame when a pause starts so the frozen scene behind the menu is current. The HTML menus are DOM, so they keep working
  without canvas frames. Keep the loop running (`requestAnimationFrame` each frame) so resume is instant.
- **Graphics setting in the pause menu** (`src/ui/pause.js`, saved in `src/save/save.js` like `musicVolume`):
  - `Sharp` = up to 2 device pixels per CSS pixel (today), `Balanced` = 1.5, `Battery` = 1. Applies in `view.js`
    (`const dpr = Math.min(window.devicePixelRatio || 1, 2)` becomes the setting's cap) and calls `layout()`.
  - Default: `Balanced` on touch devices (`view.isTouch`), `Sharp` elsewhere. That cuts the pixels drawn per frame by
    about 44% on a phone. Mention it in the commit so Dan knows to try `Sharp` and compare.
  - Ground chunks are keyed by resolution already (`chunkFor` key includes `res`), so they rebuild correctly.
- **30 fps option** in the same menu row (`Frame rate: 60 / 30`, default 60): render on every other animation frame.
  The fixed 60 Hz sim catches up on its own (the accumulator already handles it), so gameplay speed doesn't change.

**Acceptance**

- With the pause menu open, `perfbench`-style timing (or the debug overlay) shows no draw time.
- Switching Graphics resizes the canvas without a reload and the setting survives a reload.
- At 30 fps a 60 s god run ends at the same `run.time` and kill count as at 60 fps (same seed, same input).

---

## M5, v0.11.4: remove the one-off hitches

**Goal.** No more single long frames from background jobs.

**Changes**

- **Songs** (`src/audio/music.js`, `renderBuffer`): schedule the song's steps in slices instead of one loop. Do one bar
  (16 steps) per slice, yield with `setTimeout(…, 0)` between slices, and call `oc.startRendering()` after the last.
  Make `renderBuffer` return its promise the same way. Keep `renderSong` working for the tools and tests (they call it
  synchronously). Also wait to start the first bake until the run has been going for 2 s, so it doesn't land on the
  tap that starts the run.
- **Sound effects** (`src/audio/sfx.js`): the bake queue already runs one name at a time with 60 ms gaps. Measure one
  bake in `perfbench --once` style; if any single one is over 8 ms, give it the same slicing.
- **Floor** (`src/render/ground.js`):
  - Paint at most one new chunk per frame. When a visible chunk isn't ready, draw the theme's flat `bg` colour for it
    that frame (the floor is dark, so a one-frame gap is invisible) and queue it.
  - Each frame, also queue the ring of chunks just outside the view in the direction the camera moved last, so they're
    usually ready before they show.
  - Paint the neon floor at resolution 1 instead of `min(2, scale)`: it is dark and soft-edged, so 2x buys little and costs
    4x the paint. Compare screenshots; if the floor's lines visibly blur, use 1.5.
  - Replace the eviction's `[...chunks.entries()].sort(...)` with a simple scan for the least recently used.
- **Status tints** (`src/render/sprites.js`): at run start, queue the tinted copies for each enemy sprite that can spawn
  in this run and each status mix the game can show (the masks in `LOOKS`, with frozen replacing chill). Build at most
  one per frame (or 2 ms of work per frame) during the run's first seconds. `tinted()` still builds on demand if one is
  missing.

**Acceptance**

- `perfbench --once`: no single song slice over 10 ms; `newFloorScreenMs` no longer meaningful (one chunk a frame), so
  report the time of one chunk paint at the new resolution (target under 8 ms).
- Walking in a straight line at full speed for 60 s in the debug overlay shows no ground spikes.
- Music still loops seamlessly (`node tests/smoke.mjs --music`, and listen to the boss loop seam once).

---

## M6, v0.11.5: trims from the numbers

**Goal.** Spend half a day on whatever M1's overlay and `perfbench --cpu` now say is the biggest remaining layer.
Do only items that are cheap and invisible. Candidates, in the likely order:

- **Enemies** (`src/render/entities.js`): replace per-enemy `save/translate/scale/restore` with a single
  `setTransform` per sprite (or `drawImage` with a negative width for the flip), and draw enemies grouped by sprite id
  so the same image is drawn back to back.
- **Gems far from the player**: past 150 gems on screen, draw the rest as one batched path per tier colour (the old
  fallback path in `drawGems` already does this) instead of one `drawImage` each.
- **Shots** (`src/render/shots.js`): the pool sits at its cap (800) late game. Check how many are on screen; if the
  draw cost is real, batch by colour into one path per colour the way `drawFx` batches chain bolts.

**Acceptance:** each change shows a measured drop in its own layer; screenshots match.

---

## Playtest gate (after M6)

Ask Dan to play a full run on his phone with `?debug=1` once, screenshot the overlay in the biggest fight, and then play
normally and say whether the stutter and the dimming are better. Post the M1-M6 perfbench numbers next to each other.

Decide with him then:

- If late-game draw on his phone is still over about 10 ms, the next step is a WebGL renderer (PixiJS or a small custom
  sprite batcher) replacing `src/render` only. Write that as its own plan; don't start it from this one.
- The Capacitor wrapper for the App Store is separate and can happen any time (see the doc above).
