# Fork plan: a second game on Overforged's core

Status: parked as of v0.45.17. Written so a fresh session can pick it up without this thread's history. The assessment comes from the import graph and file sizes, not a full audit; confirm it before committing to a refactor.

## The concept (Dan's words, condensed)

A survivors-like with an auto-shooting character, but with completely different advancement and damage mechanics. It is not skill or weapon based. The player arranges blocks on a grid, and adjacency decides the effect: a fire block next to a shotgun weapon adds a fire effect to it. Kept from Overforged:

- a character that auto-shoots at enemies
- levels
- elites and bosses dropping chests with variable rewards
- a compendium that explains things
- the same polish and tooling expectations

Open design questions for the brainstorm: what a grid placement actually costs and unlocks, what level-up grants (blocks, grid space, something else), what chests contain, how the grid is edited on a phone (drag and drop, tap to place), and what the compendium needs to explain.

## What is reusable as-is (about two thirds of the code)

- **Core:** `src/core` (fixed-step loop, RNG, pool, spatial hash, events, math) and `src/input`.
- **Systems:** `src/systems` movement, collision, enemy AI, pickups, damage queue, status, hazards, enemy shots and boss zones. They barely reference weapons or perks (checked: only `status`, `damage` and `hazards` touch the weapon/rules side lightly).
- **Spawning and enemies:** `src/game/director.js`, `src/data/waves.js`, enemy and elite data and art, and the sprite pipeline (`tools/make-sprites.py`, which also accepts hand-drawn `tools/art/<id>.svg` overrides).
- **Rendering:** `src/render` renderer, fx, the procedural ground (`ground.js`, chunk-cached forest floor and others), shield bubble, HUD, auras.
- **Audio and save:** `src/audio`, `src/save`, the volume controls.
- **UI shell:** overlay system, title, results, history, settings, and the compendium framework (section builders, cross-links, Back trail, live status). The compendium needs new entry sources, not a new framework.
- **Tooling and process:** the test harness, `tests/offline.mjs`, `tests/smoke.mjs`, the bench and bot tools, the service worker, the Pages deploy, the docs conventions.

## Overforged-specific (rewritten or dropped)

Weapons, evolutions, fusions, Starforge, the forge, perks, passives, classes and class traits, the level-up offers and apply logic, the build screen, the compendium content and the run snapshot.

## The grey zone

Weapon behaviors (`src/behaviors`, about 1,750 lines), `src/effects/payloads.js` and the burn, chill and shock statuses. A grid layout should compile down to these existing pieces: a weapon instance plus a list of payloads. The new game's main new code is the grid model, its adjacency rules and the touch UI.

## The real coupling

`src/game/run.js` hard-codes the tick order and imports weapon, class, forge, chest and trait logic directly. Making the core modular means giving it a small game-module interface covering roughly:

- create the player
- what a level-up offers and applies
- what a chest drops
- what is drawn in the world
- the end-of-run summary
- the compendium entries

The 500+ tests also mix engine checks with Overforged data checks, and would need splitting.

## Options

1. **Fork and strip.** Copy the repo, delete the Overforged content, build the grid mechanic. Fastest to playable; the copies drift apart.
2. **Extract `src/engine/` first.** Move the shared parts with no behavior change, and add a test that the engine never imports game code. Both games build on it. A few focused sessions of refactoring up front.
3. **Fork now, extract later.** Start the new game as a fork and pull the shared parts out once both games show where the seam really is.

Leaning: option 3. Choose option 2 first if bug fixes will need to land in both games. A framework designed before the second game exists tends to get the seam wrong.

## Rough size (guesses, not measurements)

- A character auto-shooting at enemies with a simple draggable grid: one or two long sessions.
- A polished loop with chests, bosses and a compendium: several more.
- The main new risk is the grid editor's drag and drop on a phone.

## Working agreements to carry over

- Small labeled commits pushed to `main`. Every game-changing commit bumps `src/version.js`, and the message starts `vX.Y.Z:`.
- Update `docs/architecture.md` and `docs/roadmap.md` in the same commit as the code.
- Before committing: `node tests/run.mjs`, `node tests/offline.mjs` and `node tests/smoke.mjs --ui --music`.
- UI-visible work: screenshot first, show Dan, ship on his "ship it".
- Balance changes: post a bench table first.
- **Confirm with Dan before any extended simulation or benchmarking run.** He wants credit-heavy work done less often and more deliberately.
- Offline play is essential: no build step, ES modules and Canvas 2D.
- Commit trailers: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and the session link.

## Suggested first message for the new thread

"Read `docs/fork-plan.md`, then let's brainstorm the grid mechanic before touching code."
