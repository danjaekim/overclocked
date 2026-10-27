// Top-level state machine: run <-> paused / rig editor / chest -> results -> run.
// Simulation only advances while state === 'run' and the device is not blocked by the
// rotate prompt. Menus are DOM overlays; gameplay is canvas.
//
// The default boot is the full run (game/ovrun.js). The chain sandbox (game/sandbox.js) is a debug mode, opened
// from the pause menu.

import { createOverclockedRun } from './ovrun.js';
import { randomSeed } from '../core/rng.js';
import { showPause } from '../ui/pause.js';
import { showResults } from '../ui/results.js';
import { showTreasure } from '../ui/treasure.js';
import { spawnChest } from '../systems/pickups.js';
import { RUN_EVENTS } from './run-events.js';
import { xpToNext, gainXp } from './xp.js';
import { LEVELUP } from '../data/progression.js';
import { createSandboxRun, loadChain, applyRig, chainKeys } from './sandbox.js';
import { showRigEditor } from '../ui/rig-editor.js';
import { makeOffers, CAPACITY_LEVELS } from '../rig/offers.js';
import { openRigChest } from '../rig/chests.js';
import { mountSandboxPanel } from '../ui/sandbox-panel.js';

export function createGame({ view, input, overlays, rotate, debug, params, save, audio, sandboxHost }) {
  const game = { state: 'run', run: null };
  let nextSeed = params.seed;
  const sfx = (name) => audio && audio.play(name);

  // What the pause screen passes for the music row.
  const musicUi = (redraw) => ({
    music: { music: save.data.music, volume: save.data.musicVolume, sfxVolume: save.data.sfxVolume },
    onToggleMusic() {
      save.setMusic(!save.data.music);
      if (audio) audio.setMusicEnabled(save.data.music);
      redraw();
    },
    onMusicVolume: (v) => { if (audio) audio.setMusicVolume(v); },
    onMusicCommit: (v) => save.setMusicVolume(v),
    onSfxVolume: (v) => { if (audio) audio.setSfxVolume(v); },
    onSfxCommit: (v) => { save.setSfxVolume(v); if (audio) audio.play('gem'); },      // a blip on release, so you hear the level
  });
  const scene = (id) => { if (audio) audio.music.play(id); };

  function toggleSound(redraw) {
    const on = !save.data.sound;
    save.setSound(on);
    if (audio) audio.setEnabled(on);
    redraw();
  }

  let panel = null;
  const unmountPanel = () => { if (panel) { panel.unmount(); panel = null; } };

  function begin(run) {
    unmountPanel();
    input.reset();
    overlays.hide();
    game.run = run;
    scene('run');
    if (audio) audio.music.duck(false);
    game.state = 'run';
  }

  const takeSeed = () => {
    const seed = nextSeed != null ? nextSeed : randomSeed();
    nextSeed = null;                       // a ?seed= applies to the first run only
    return seed;
  };

  // The full run: ten minutes, elites and a boss, a one-chain rig that you grow.
  function startRun() {
    begin(createOverclockedRun({ seed: takeSeed(), view, debug, sfx }));
    if (sandboxHost) panel = mountSandboxPanel(sandboxHost, { onEdit: () => openRigEditor(false) });
  }

  // The chain sandbox (game/sandbox.js): an endless arena with test chains, for trying things.
  function startSandbox() {
    begin(createSandboxRun({ seed: takeSeed(), view, debug, sfx }));
    if (sandboxHost) panel = mountSandboxPanel(sandboxHost, {
      getKeys: () => chainKeys(game.run),
      onPick: (i, key) => loadChain(game.run, i, key),
      onEdit: () => openRigEditor(false),
      onLevel: () => { game.run.pendingLevelUps++; },
    });
  }

  // The rig editor (ui/rig-editor.js) over a paused game. A level-up opens it with three offers; the Rig tab opens it without.
  // It reuses the level-up state, so the run is frozen like any other pause.
  function openRigEditor(withOffers) {
    const run = game.run;
    game.state = 'levelup';
    input.reset();
    if (withOffers) sfx('levelup');
    run.cam.y = run.player.y + view.h * 0.2;                   // the sheet covers the lower part: lift the player into the clear top
    const level = run.player.level - (run.pendingLevelUps - 1);
    const capacity = withOffers && !run.sandbox && CAPACITY_LEVELS.includes(level);
    const deal = (banished) => makeOffers(run.rng, run.rigState, { banished: [...run.banished, ...banished], capacity });
    showRigEditor(overlays, {
      rig: run.rigState,
      offers: withOffers ? deal([]) : null,
      deal: withOffers && !capacity ? deal : null,
      rerolls: withOffers && !run.sandbox ? run.rerolls : 0,
      banishes: withOffers && !run.sandbox ? run.banishes : 0,
      onDone(rig, used) {
        run.rigState = rig;
        applyRig(run);
        if (withOffers) {
          run.pendingLevelUps--;
          run.rerolls = used.rerolls;
          run.banishes = used.banishes;
          run.banished.push(...used.banished);
        }
        if (run.pendingLevelUps > 0 && withOffers) { openRigEditor(true); return; }     // a big gem can give two levels: show them back to back
        overlays.hide();
        run.player.iframes = Math.max(run.player.iframes, LEVELUP.iframesAfter);
        game.state = 'run';
      },
    });
  }

  function pause(openRig = false) {
    if (game.state !== 'run') return;
    game.state = 'paused';
    openPause(openRig);
  }

  function openPause() {
    input.reset();
    if (audio) audio.music.duck(true);
    const show = () => showPause(overlays, {
      ...musicUi(show),
      onResume: resume,
      onRig: () => { overlays.hide(); if (audio) audio.music.duck(false); openRigEditor(false); },
      onSandbox: game.run.sandbox ? null : () => startSandbox(),
      onQuit: () => startRun(),
      sandbox: game.run.sandbox,
      onToggleSound: () => toggleSound(show),
      sound: save.data.sound,
    });
    show();
  }

  function resume() {
    if (game.state !== 'paused') return;
    overlays.hide();
    game.state = 'run';
    if (audio) audio.music.duck(false);
  }

  function finishRun() {
    game.state = 'results';
    input.reset();
    unmountPanel();
    const summary = game.run.summary();
    if (audio) audio.music.stop();
    sfx(summary.won ? 'win' : 'lose');
    const { newBests } = debug.god ? { newBests: [] } : save.recordRun(summary);   // god-mode (debug) runs never touch the save
    showResults(overlays, summary, { onAgain: startRun, newBests });
  }

  // Opens the next collected chest (run frozen): the rolls are already applied to the rig; this reveals them, and
  // then opens the editor if a piece landed somewhere, so you can see where it went and move it.
  function openTreasure() {
    const run = game.run;
    const tier = run.pendingChests.shift();
    game.state = 'treasure';
    input.reset();
    const result = openRigChest(run.rng, run.rigState, tier, run.chestsOpened === 0);
    run.chestsOpened++;
    run.rigState = result.rig;
    applyRig(run);
    const placed = result.rolls.some((r) => r.placed);
    showTreasure(overlays, {
      ...result,
      boss: tier === 1,
      sfx,
      onDone() {
        overlays.hide();
        if (placed) { openRigEditor(false); return; }
        run.player.iframes = Math.max(run.player.iframes, LEVELUP.iframesAfter);
        game.state = 'run';
      },
    });
  }

  game.openBuild = () => { if (game.state === 'run') pause(); };
  game.togglePause = () => (game.state === 'run' ? pause() : game.state === 'paused' ? resume() : undefined);
  game.isSimulating = () => game.state === 'run' && !rotate.blocked;

  game.update = (dt) => {
    const run = game.run;
    if (!run) return;
    run.update(dt, input.getMove());
    scene(run.bossAlive ? 'boss' : 'run');
    if (run.over) finishRun();
    else if (run.pendingLevelUps > 0) openRigEditor(true);
    else if (run.pendingChests.length > 0) openTreasure();
  };

  // Out of view: pause, so the run waits. In the editor or a chest the run is already frozen.
  const onHidden = () => { if (game.state === 'run') pause(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) onHidden(); });
  window.addEventListener('pagehide', onHidden);

  if (debug.enabled) {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' && game.state === 'run') finishRun();   // debug: end the run now
      if (e.key === 'l' && game.state === 'run') gainXp(game.run, xpToNext(game.run.player.level));   // debug: level up
      if (e.key === 'b' && game.state === 'run') RUN_EVENTS.boss(game.run, { enemy: 'warlord' });     // debug: the boss now
      if (e.key === 'c' && game.state === 'run') spawnChest(game.run, game.run.player.x + 40, game.run.player.y, 0);   // debug: an elite chest at your feet
      if (e.key === 'e' && game.state === 'run') RUN_EVENTS.elite(game.run, { enemy: 'brute' });                       // debug: an elite now
    });
  }

  if (params.sandbox) startSandbox(); else startRun();
  return game;
}
