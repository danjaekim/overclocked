# Overclocked

A mobile-first survivors-style roguelike where you program your power. Your character fires on its own, and what it fires comes from a **rig**: short **chains** that start with a rule card (when it runs) and continue with weapons, modifiers and triggers read left to right. Move a piece and the same pieces play differently.

Overclocked is built on the engine of [Overforged](https://github.com/danjaekim/overforged) and started as a copy of it (v0.45.17). The default boot is the full run (M4): a ten-minute survivors-like where the rig of chains is your only build. Overforged's title, class, forge and compendium screens are gone; some of its weapon, perk and status code stays underneath as engine. **The plan, the rules and the milestones are in [`docs/overclocked-spec.md`](docs/overclocked-spec.md).** Read it before changing code.

## Status

M0 (setup): the app identity, storage keys and service worker are renamed so Overclocked and Overforged can share a browser. The game itself still plays like Overforged until M1 and M2 land.

## Play

- **On your phone:** open https://danjaekim.github.io/overclocked/ in Safari (needs GitHub Pages enabled: Settings → Pages → Deploy from branch → `main` / root). Use Share → Add to Home Screen for a fullscreen app-like launch; after one visit it also loads offline. Pages can take a minute or two to update after a push, and Safari may cache the old build; if a change doesn't show up, reload or add `?v=2` to the URL.
- **Controls:** drag anywhere on the lower part of the screen to move (a floating joystick appears under your thumb). Weapons fire automatically. Desktop: WASD or arrow keys, Esc to pause.
- **Debug URL flags**: `?debug=1` (fps/entity overlay, a stress button that spawns 500 enemies, `L` gives a level-up, `E` spawns an elite, `C` drops an elite chest, `B` spawns the boss, `R` ends the run), `?god=1` (no damage), `?seed=N` (reproducible first run), `?sandbox=1` (boot the chain sandbox; players reach it from the pause menu). Combine them: `?debug=1&god=1&seed=7`. Bot runs for balance: `node tools/rigbench.mjs --seeds 20`.

Portrait-only, 10-minute runs.

## Run locally

Plain ES modules with no build step. They need an HTTP server (they won't load from `file://`):

```sh
python3 -m http.server 8000
# open http://localhost:8000/?debug=1
# on a phone on the same wifi: http://<your computer's local IP>:8000/?debug=1
```

## Tests

```sh
node tests/run.mjs                   # unit + headless simulation tests, no dependencies
node tests/offline.mjs               # loads online, goes offline, reloads (needs Playwright)
node tests/smoke.mjs --ui --music    # browser smoke test (needs Playwright); add --stress --shot out.png
```

## Layout

```
index.html        portrait stage, DOM overlay layer, mobile meta tags
src/main.js       boot: wires view, input, game, renderer, loop
src/core/         loop, rng, pool, spatial hash, events, math (pure, no DOM)
src/stats/        StatBlock, stat definitions, conditions (pure)
src/game/         run, world, player, director, weapons, passives, upgrades, xp, state machine
src/behaviors/    weapon behaviors (projectile, arc, orbit, aura, mortar, nova and more)
src/effects/      trigger effects and fusion payloads
src/systems/      per-tick systems: enemy AI, movement, collision, damage, status
src/render/       view, renderer, entities, fx, HUD
src/save/         versioned localStorage save (bests, unlocks, settings)
src/audio/        synthesized sound blips
src/ui/           DOM overlays: rig editor, chest reveal, pause, results, rotate prompt
src/input/        joystick + keyboard
src/data/         content as data: weapons, classes, enemies, waves, validation
icons/, manifest.webmanifest, sw.js   PWA files; sw.js gives offline play (placeholder icons made by tools/make-icons.py)
tests/            unit tests, headless sim tests, browser smoke and offline tests
tools/            sprite pipeline, icons, balance bench and bots
docs/             overclocked-spec.md (the plan), architecture.md and the rest are Overforged's
```

## Working agreements

- Small labeled commits pushed to `main`. Every game-changing commit bumps `src/version.js` and its message starts `vX.Y.Z:`.
- Update `docs/architecture.md` and `docs/roadmap.md` in the same commit as the code.
- Before committing, run the three test commands above.
- No build step: ES modules and Canvas 2D, and offline play stays essential.
