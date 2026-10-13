# Overforged

A mobile-first survivors-style roguelike: auto-attacking weapons, randomized level-up upgrades, and a forge system where you enhance, reforge, and combine gear into run-defining builds.

Inspired by the genre of 20 Minutes Till Dawn, Vampire Survivors, and Magic Survival. All names, characters, and art are original.

## Platform

HTML5 canvas, plain ES modules, no build step. Target is iPhone Safari via "Add to Home Screen" (fullscreen), with desktop support (WASD / arrows) for fast testing. A native wrapper (e.g. Capacitor) is a possible later step.

## Run locally

ES modules need an HTTP server (they won't load from `file://`):

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Architecture

**Read [`docs/architecture.md`](docs/architecture.md) before changing code.** It defines the stat/modifier system, data schemas, the forge, performance budgets, and the milestone order (M0–M8).

## Layout

```
index.html        canvas shell + mobile meta tags
src/main.js       fixed-timestep loop, camera, rendering
src/input.js      virtual joystick + keyboard
src/data/         (planned) data-driven weapons, upgrades, classes, enemies
```

## Design notes

- **Classes (archetypes):** Smith, Archer, Berserker, Mage, Summoner, Saint.
- **Signature mechanic:** the forge. Enemies drop ore; between waves you enhance (risk/reward), reforge (reroll modifiers), or combine items into evolved forms.
- **Build depth:** weapon x passive evolution recipes, run-long "titles" as stacking modifiers, set bonuses, meta-progression.
- **Content is data, not code.** New weapons and upgrades should be added as data entries on top of a shared modifier system.

## Status

M0 (scaffold) done. Next: M1, core runtime refactor. See the milestone table in `docs/architecture.md` §10.
