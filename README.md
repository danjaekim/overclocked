# Overforged

A mobile-first survivors-style roguelike: auto-attacking weapons, randomized level-up upgrades, and a forge system where you enhance, reforge, and combine gear into run-defining builds.

Inspired by the genre of 20 Minutes Till Dawn, Vampire Survivors, and Magic Survival. All names, characters, and art are original.

## Play

- **On your phone:** open https://danjaekim.github.io/overforged/ in Safari (needs GitHub Pages enabled: Settings → Pages → Deploy from branch → `main` / root). Use Share → Add to Home Screen for a fullscreen app-like launch. Pages can take a minute or two to update after a push, and Safari may cache the old build; if a change doesn't show up, reload or add `?v=2` to the URL.
- **Controls:** drag anywhere on the lower part of the screen to move (a floating joystick appears under your thumb). Weapons fire automatically. Desktop: WASD or arrow keys, Esc to pause.
- **Debug URL flags:** `?debug=1` (fps/entity overlay, a stress button that spawns 500 enemies, `R` ends the run), `?god=1` (no damage), `?seed=N` (reproducible first run). Combine them: `?debug=1&god=1&seed=7`.

Portrait-only, 10-minute runs. A native wrapper (e.g. Capacitor) is a possible later step.

## Architecture

**Read [`docs/architecture.md`](docs/architecture.md) before changing code.** It defines the stat/modifier system, data schemas, the forge, performance budgets, and the milestone order (M0–M8). If an implementation deviates from it, update the doc in the same commit.

## Run locally

Plain ES modules with no build step. They need an HTTP server (they won't load from `file://`):

```sh
python3 -m http.server 8000
# open http://localhost:8000/?debug=1
# on a phone on the same wifi: http://<your computer's local IP>:8000/?debug=1
```

## Tests

```sh
node tests/run.mjs           # unit + headless simulation tests, no dependencies
node tests/smoke.mjs         # optional browser smoke test (needs Playwright); add --stress --shot out.png
```

## Layout

```
index.html        portrait stage, DOM overlay layer, mobile meta tags
src/main.js       boot: wires view, input, game, renderer, loop
src/core/         loop, rng, pool, spatial hash, events, math (pure, no DOM)
src/stats/        StatBlock, stat definitions, conditions (pure)
src/game/         run, world, player, director, weapons, projectiles, state machine
src/behaviors/    weapon behaviors (projectile so far)
src/systems/      per-tick systems: enemy AI, movement, collision, damage
src/render/       view, renderer, entities, fx, HUD
src/ui/           DOM overlays: title, pause, results, rotate prompt
src/input/        joystick + keyboard
src/data/         ALL content as data: weapons, classes, enemies, waves, validation
tests/            unit tests, headless sim tests, browser smoke test
docs/             architecture.md
```

## Design notes

- **Classes (archetypes):** Smith, Archer, Berserker, Mage, Summoner, Saint (only the Archer exists so far).
- **Signature mechanic:** the forge. Enemies drop ore; shrines let you enhance (risk/reward), reforge (reroll modifiers), or combine items into evolved forms.
- **Build depth:** weapon x passive evolution recipes, run-long "titles" as stacking modifiers, set bonuses, meta-progression.
- **Content is data, not code.** New weapons and upgrades are data entries on top of a shared modifier system.

## Status

M0–M3 done: portrait view, state machine, enemies and spawn director, spatial hash, stat/modifier system, the Archer with the Ember Bow, damage numbers and hit feedback. You can play a run and die or survive 10 minutes, but there is no progression yet. Next: M4 (XP gems, level-up choices, passives).
