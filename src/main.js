// Overclocked: boot. Wires the view, input, game state machine, renderer and loop.

import { createLoop } from './core/loop.js';
import { createView } from './render/view.js';
import { createRenderer } from './render/renderer.js';
import { createInput } from './input/input.js';
import { createOverlays } from './ui/overlay.js';
import { createRotatePrompt } from './ui/rotate-prompt.js';
import { createGame } from './game/game.js';
import { createDebug, readParams } from './debug/debug.js';
import { setNumberStyle } from './render/fx.js';
import { validateData } from './data/validate.js';
import { createSave, browserStorage } from './save/save.js';
import { createRunSave } from './save/run-save.js';
import { createAudio } from './audio/audio.js';
import { preloadSprites } from './render/sprites.js';

const dataProblems = validateData();
if (dataProblems.length) {
  const msg = 'Data problems:\n' + dataProblems.join('\n');
  if (new URLSearchParams(location.search).get('debug') === '1') throw new Error(msg);
  console.error(msg);
}
const stage = document.getElementById('stage');
const canvas = document.getElementById('game');
const params = readParams();
const debug = createDebug(params);

const view = createView(stage, canvas);
const rotate = createRotatePrompt(view);
const sandboxEl = document.getElementById('sandbox');
const overlays = createOverlays(document.getElementById('ui'), { onChange: (open) => { sandboxEl.style.visibility = open ? 'hidden' : 'visible'; } });   // the sandbox tabs hide under any menu
const renderer = createRenderer(canvas, view);

preloadSprites();

let game;
const input = createInput(canvas, { onPause: () => game && game.togglePause(), onBuild: () => game && game.openBuild() });
const save = createSave(browserStorage());
const audio = createAudio({ enabled: save.data.sound, music: save.data.music, musicVolume: save.data.musicVolume, sfxVolume: save.data.sfxVolume });
debug.audioState = () => audio.state;
game = createGame({ view, input, overlays, rotate, debug, params, save, runSave: createRunSave(browserStorage()), audio, sandboxHost: sandboxEl });

// a soft tick on every menu button
document.getElementById('ui').addEventListener('click', (e) => {
  if (e.target.closest('[data-act]')) audio.play('tap');
});

// Offline play: cache the game on the first online visit (needs https or localhost; failure is harmless)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}

const loop = createLoop({
  update: (dt) => game.update(dt),
  render: () => renderer.draw(game.run, input, debug),
  isPaused: () => !game.isSimulating(),
  onFrameStats: debug.onFrameStats,
});
loop.start();

// Handy for poking around in a desktop console or automated tests.
setNumberStyle(params.numScale, params.numFx);
window.__overclocked = { game, view, debug, input, save, audio, setNumberStyle };
