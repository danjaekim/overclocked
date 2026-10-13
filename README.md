# Overforged

A mobile-first survivors-style roguelike: auto-attacking weapons, randomized level-up upgrades, and a forge system where you enhance, reforge, and combine gear into run-defining builds.

Inspired by the genre of 20 Minutes Till Dawn, Vampire Survivors, and Magic Survival. All names, characters, and art are original.

## Play

- **On your phone:** open https://danjaekim.github.io/overforged/ in Safari (needs GitHub Pages enabled: Settings → Pages → Deploy from branch → `main` / root). Use Share → Add to Home Screen for a fullscreen app-like launch; after one visit it also loads offline. Pages can take a minute or two to update after a push, and Safari may cache the old build; if a change doesn't show up, reload or add `?v=2` to the URL.
- **Controls:** drag anywhere on the lower part of the screen to move (a floating joystick appears under your thumb). Weapons fire automatically. Desktop: WASD or arrow keys, Esc to pause.
- **Debug URL flags:** `?debug=1` (fps/entity overlay, a stress button that spawns 500 enemies, `L` gives a level-up, `F` spawns a shrine, `O` gives 20 ore, `B` spawns the boss, `X` gives 2 starsteel, `R` ends the run), `?god=1` (no damage), `?seed=N` (reproducible first run), `?class=smith` (skip class select), `?unlock=all` (show locked classes as open; not saved). Combine them: `?debug=1&god=1&seed=7&class=smith`.

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
src/game/         run, world, player, director, weapons, passives, upgrades, xp, state machine
src/behaviors/    weapon behaviors (projectile, arc, orbit, aura)
src/effects/      trigger effects (explode, shield)
src/systems/      per-tick systems: enemy AI, movement, collision, damage
src/render/       view, renderer, entities, fx, HUD
src/save/         versioned localStorage save (bests, unlocks, settings)
src/audio/        synthesized sound blips
icons/, manifest.webmanifest, sw.js   PWA files; sw.js is a retired self-unregistering stub (icons made by tools/make-icons.py)
src/ui/           DOM overlays: title, class select, level-up, forge, pause, results, rotate prompt
src/input/        joystick + keyboard
src/data/         ALL content as data: weapons, classes, enemies, waves, validation
tests/            unit tests, headless sim tests, browser smoke test
docs/             architecture.md
```

## Design notes

- **Classes (archetypes):** Smith, Archer, Berserker, Mage, Summoner, Saint (Archer, Smith and the unlockable Berserker are playable).
- **Signature mechanic:** the forge. Enemies drop ore; shrines let you enhance (risk/reward), reforge (reroll modifiers), or combine items into evolved forms.
- **Build depth:** weapon x passive evolution recipes, run-long "titles" as stacking modifiers, set bonuses, meta-progression.
- **Content is data, not code.** New weapons and upgrades are data entries on top of a shared modifier system.

## Status

M0–M8 done: the core loop (move, auto-attack, gems, level-up choices, six passives) plus two classes (Archer, Smith), class select, five weapons across four behaviors (projectile, arc, orbit, aura), the trigger system (explode, shield), and the forge: ore drops, anvil shrines you channel to open it, and enhance / reforge / salvage on your weapons. Evolve two weapons at the forge with starsteel from the Warlord boss (5:00), and earn titles. Plus install-to-home-screen, sound, a local save with bests, rerolls and banishes, and the Berserker (unlocked by killing the Warlord). The prototype milestones are complete; the plan after that is in [`docs/roadmap.md`](docs/roadmap.md) (M9 onward).

Balance benchmark: `node tools/bench.mjs` (see docs/roadmap.md, M9).
