// Top-level state machine: title -> run <-> paused -> results -> title/run.
// Simulation only advances while state === 'run' and the device is not blocked by the
// rotate prompt. Menus are DOM overlays; gameplay is canvas.

import { createRun } from './run.js';
import { randomSeed } from '../core/rng.js';
import { showTitle } from '../ui/title.js';
import { showPause } from '../ui/pause.js';
import { showResults } from '../ui/results.js';

export function createGame({ view, input, overlays, rotate, debug, params }) {
  const game = { state: 'title', run: null };
  let nextSeed = params.seed;

  function toTitle() {
    game.state = 'title';
    game.run = null;
    showTitle(overlays, { onPlay: startRun });
  }

  function startRun() {
    const seed = nextSeed != null ? nextSeed : randomSeed();
    nextSeed = null;                       // a ?seed= applies to the first run only
    input.reset();
    overlays.hide();
    game.run = createRun({ seed, view, debug });
    game.state = 'run';
  }

  function pause() {
    if (game.state !== 'run') return;
    game.state = 'paused';
    input.reset();
    showPause(overlays, { onResume: resume, onQuit: toTitle });
  }

  function resume() {
    if (game.state !== 'paused') return;
    overlays.hide();
    game.state = 'run';
  }

  function finishRun() {
    game.state = 'results';
    input.reset();
    showResults(overlays, game.run.summary(), { onAgain: startRun, onTitle: toTitle });
  }

  game.togglePause = () => (game.state === 'run' ? pause() : game.state === 'paused' ? resume() : undefined);
  game.isSimulating = () => game.state === 'run' && !rotate.blocked;

  game.update = (dt) => {
    const run = game.run;
    if (!run) return;
    run.update(dt, input.getMove());
    if (run.over) finishRun();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  if (debug.enabled) {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' && game.state === 'run') finishRun();   // debug: end the run now
    });
  }

  toTitle();
  return game;
}
