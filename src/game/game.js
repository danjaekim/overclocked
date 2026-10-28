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
import { makeOffers, CAPACITY_LEVELS, describeOffer, passOffers } from '../rig/offers.js';
import { openRigChest } from '../rig/chests.js';
import { mountSandboxPanel } from '../ui/sandbox-panel.js';
import { showWorkbench } from '../ui/workbench.js';
import { showCompendium } from '../ui/compendium.js';
import { REACTION_INFO } from '../rig/pieces.js';
import { stockUp } from '../rig/workbench.js';
import { snapshotRun, restoreRun } from './run-snapshot.js';

export function createGame({ view, input, overlays, rotate, debug, params, save, runSave = null, audio, sandboxHost }) {
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
    run.discover = (id) => {                                   // a reaction seen for the first time goes in the compendium
      if (save.discoverReaction(id)) run.toast = { text: `New reaction: ${REACTION_INFO[id].name}`, ttl: 3 };
    };
    scene('run');
    if (audio) audio.music.duck(false);
    game.state = 'run';
  }

  const takeSeed = () => {
    const seed = nextSeed != null ? nextSeed : randomSeed();
    nextSeed = null;                       // a ?seed= applies to the first run only
    return seed;
  };

  // The run in progress is written to the run save whenever the game stops at a menu (pause, level-up, chest, workbench),
  // and dropped when the run ends or a new one starts, so closing the app and coming back lands in the same run.
  // Debug (god) runs and the sandbox never save.
  function saveRun() {
    const run = game.run;
    if (!runSave || !run || run.sandbox || run.over || debug.god) return;
    try {
      if (!runSave.save(snapshotRun(run))) runSave.clear();
    } catch (e) {
      runSave.clear();                                         // a run that cannot be frozen is not offered again
    }
  }

  // The full run: ten minutes, elites and a boss, a one-chain rig that you grow.
  function startRun() {
    if (runSave) runSave.clear();
    begin(createOverclockedRun({ seed: takeSeed(), view, debug, sfx }));
    if (sandboxHost) panel = mountSandboxPanel(sandboxHost, { onEdit: () => openRigEditor(false) });
  }

  // Boot: pick up a saved run at its pause menu, or start a new one (also when the save cannot be read: a changed version, say).
  function resumeOrStart() {
    const snap = nextSeed == null && runSave && !debug.god ? runSave.load() : null;
    if (snap) {
      try {
        begin(restoreRun(snap, { view, debug, sfx }));
        if (sandboxHost) panel = mountSandboxPanel(sandboxHost, { onEdit: () => openRigEditor(false) });
        pause();
        return;
      } catch (e) {
        console.warn('could not resume the saved run', e);
        runSave.clear();
      }
    }
    startRun();
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

  // The rig editor (ui/rig-editor.js) over a paused game. A level-up opens it with three offers; the Rig tab opens it without;
  // a chest with a chassis in it opens it with those (`extra`, which no level-up pays for and no reroll redeals).
  // It reuses the level-up state, so the run is frozen like any other pause.
  function openRigEditor(withOffers, extra = null) {
    const run = game.run;
    if (game.state === 'levelup' || game.state === 'results' || game.state === 'workbench') return;     // an editor is already open (the panel's Rig button stays reachable above it)
    game.state = 'levelup';
    input.reset();
    saveRun();
    if (withOffers) sfx('levelup');
    run.cam.y = run.player.y + view.h * 0.2;                   // the sheet covers the lower part: lift the player into the clear top
    const level = run.player.level - (run.pendingLevelUps - 1);
    const capacity = withOffers && !extra && !run.sandbox && CAPACITY_LEVELS.includes(level);
    const deal = (banished) => makeOffers(run.rng, run.rigState, { banished: [...run.banished, ...banished], capacity });
    showRigEditor(overlays, {
      rig: run.rigState,
      offers: extra || (withOffers ? deal([]) : null),
      deal: withOffers && !capacity && !extra ? deal : null,
      upgrades: run.sandbox ? null : (r) => passOffers(run.rng, r),
      rerolls: withOffers && !extra && !run.sandbox ? run.rerolls : 0,
      banishes: withOffers && !extra && !run.sandbox ? run.banishes : 0,
      onDone(rig, used) {
        run.rigState = rig;
        applyRig(run);
        if (withOffers && !extra) {
          run.pendingLevelUps--;
          run.rerolls = used.rerolls;
          run.banishes = used.banishes;
          run.banished.push(...used.banished);
        }
        if (run.pendingLevelUps > 0 && withOffers) { game.state = 'run'; openRigEditor(true); return; }     // a big gem can give two levels: show them back to back
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
    saveRun();
    if (audio) audio.music.duck(true);
    const show = () => showPause(overlays, {
      ...musicUi(show),
      onResume: resume,
      onCompendium: () => showCompendium(overlays, { save, onBack: show }),
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
    if (runSave) runSave.clear();
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
    saveRun();                                                 // before the chest is taken off the list
    const tier = run.pendingChests.shift();
    game.state = 'treasure';
    input.reset();
    const result = openRigChest(run.rng, run.rigState, tier, run.chestsOpened === 0);
    run.chestsOpened++;
    run.rigState = result.rig;
    applyRig(run);
    const placed = result.rolls.some((r) => r.placed);
    const chassis = result.chassis;
    showTreasure(overlays, {
      ...result,
      rolls: chassis.length ? [...result.rolls, { kind: 'chassis', title: 'A chassis', tag: chassis.length > 1 ? `pick 1 of ${chassis.length}` : 'optional', desc: `${chassis.map((o) => describeOffer(run.rigState, o).title).join(' or ')}. You choose next, or skip it.`, placed: null }] : result.rolls,
      pick: chassis.length > 0,
      boss: tier === 1,
      sfx,
      onDone() {
        overlays.hide();
        if (chassis.length) { openRigEditor(false, chassis); return; }     // pick where the chassis goes (or pass on it)
        if (placed) { openRigEditor(false); return; }
        run.player.iframes = Math.max(run.player.iframes, LEVELUP.iframesAfter);
        game.state = 'run';
      },
    });
  }

  // The workbench at a shrine (run frozen): spend gold (run.ore) on a piece, a level or a rule card.
  function openWorkbench() {
    const run = game.run;
    saveRun();                                                 // while the shrine is still waiting
    run.forgeReady = false;
    game.state = 'workbench';
    input.reset();
    run.cam.y = run.player.y + view.h * 0.2;
    const restock = () => stockUp(run.rng, run.rigState, run.banished, { slotBuys: run.slotBuys || 0 });
    showWorkbench(overlays, {
      rig: run.rigState,
      gold: run.ore,
      stock: restock(),
      restock,
      onChange(rig, gold, item) { run.rigState = rig; run.ore = gold; if (item && item.kind === 'slot') run.slotBuys = (run.slotBuys || 0) + 1; applyRig(run); },
      onDone(placed) {
        overlays.hide();
        if (placed) { game.state = 'run'; openRigEditor(false); return; }
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
    else if (run.forgeReady) openWorkbench();
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

  if (params.sandbox) startSandbox(); else resumeOrStart();
  return game;
}
