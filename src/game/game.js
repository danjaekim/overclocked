// Top-level state machine: title -> run <-> paused -> results -> title/run.
// Simulation only advances while state === 'run' and the device is not blocked by the
// rotate prompt. Menus are DOM overlays; gameplay is canvas.

import { createRun } from './run.js';
import { randomSeed } from '../core/rng.js';
import { showTitle } from '../ui/title.js';
import { showClassSelect } from '../ui/class-select.js';
import { CLASSES, DEFAULT_CLASS } from '../data/classes.js';
import { showPause } from '../ui/pause.js';
import { showResults } from '../ui/results.js';
import { showLevelUp } from '../ui/levelup.js';
import { generateOffers } from './upgrades.js';
import { offerState, applyOffer } from './apply-offer.js';
import { xpToNext, gainXp } from './xp.js';

export function createGame({ view, input, overlays, rotate, debug, params }) {
  const game = { state: 'title', run: null };
  let nextSeed = params.seed;

  // The last class played is remembered on this device (storage can be unavailable: ignore).
  let lastClass = DEFAULT_CLASS;
  try {
    const saved = localStorage.getItem('overforged.class');
    if (saved && CLASSES[saved] && CLASSES[saved].unlocked) lastClass = saved;
  } catch (e) { /* no storage */ }
  if (params.classId && CLASSES[params.classId]) lastClass = params.classId;

  function toTitle() {
    game.state = 'title';
    game.run = null;
    showTitle(overlays, { onPlay: params.classId ? () => startRun() : toClassSelect });
  }

  function toClassSelect() {
    showClassSelect(overlays, { last: lastClass, onPick: (id) => startRun(id), onBack: toTitle });
  }

  function startRun(classId = lastClass) {
    lastClass = classId;
    try { localStorage.setItem('overforged.class', classId); } catch (e) { /* no storage */ }
    const seed = nextSeed != null ? nextSeed : randomSeed();
    nextSeed = null;                       // a ?seed= applies to the first run only
    input.reset();
    overlays.hide();
    game.run = createRun({ seed, view, debug, classId });
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
    showResults(overlays, game.run.summary(), { onAgain: () => startRun(), onTitle: toTitle });
  }

  // Opens the level-up screen for one pending level. The run is frozen while it is open;
  // further pending levels (from a big gem pickup) are shown back to back.
  function openLevelUp() {
    const run = game.run;
    game.state = 'levelup';
    input.reset();
    const offers = generateOffers(offerState(run), run.rng);
    showLevelUp(overlays, {
      level: run.player.level - (run.pendingLevelUps - 1),
      offers,
      onPick(offer) {
        applyOffer(run, offer);
        run.pendingLevelUps--;
        if (run.pendingLevelUps > 0) {
          openLevelUp();
        } else {
          overlays.hide();
          game.state = 'run';
        }
      },
    });
  }

  game.togglePause = () => (game.state === 'run' ? pause() : game.state === 'paused' ? resume() : undefined);
  game.isSimulating = () => game.state === 'run' && !rotate.blocked;

  game.update = (dt) => {
    const run = game.run;
    if (!run) return;
    run.update(dt, input.getMove());
    if (run.over) finishRun();
    else if (run.pendingLevelUps > 0) openLevelUp();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  if (debug.enabled) {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' && game.state === 'run') finishRun();   // debug: end the run now
      if (e.key === 'l' && game.state === 'run') gainXp(game.run, xpToNext(game.run.player.level));   // debug: level up
    });
  }

  toTitle();
  return game;
}
