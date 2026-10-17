// Top-level state machine: title -> run <-> paused -> results -> title/run.
// Simulation only advances while state === 'run' and the device is not blocked by the
// rotate prompt. Menus are DOM overlays; gameplay is canvas.

import { createRun } from './run.js';
import { randomSeed } from '../core/rng.js';
import { showTitle } from '../ui/title.js';
import { showClassSelect } from '../ui/class-select.js';
import { CLASSES, DEFAULT_CLASS } from '../data/classes.js';
import { showPause } from '../ui/pause.js';
import { showBuild, buildHtml, ownedLine } from '../ui/build.js';
import { showCompendium } from '../ui/compendium.js';
import { showResults } from '../ui/results.js';
import { showLevelUp } from '../ui/levelup.js';
import { showForge } from '../ui/forge.js';
import { showTreasure } from '../ui/treasure.js';
import { openChest } from './chests.js';
import { unlockMet } from './unlocks.js';
import { spawnChest } from '../systems/pickups.js';
import { spawnShrine } from '../systems/shrines.js';
import { RUN_EVENTS } from './run-events.js';
import { generateOffers } from './upgrades.js';
import { offerState, applyOffer } from './apply-offer.js';
import { xpToNext, gainXp } from './xp.js';
import { LEVELUP } from '../data/progression.js';
import { showHistory } from '../ui/history.js';
import { showBackup } from '../ui/backup.js';
import { encodeSave, decodeSave, describeSave } from '../save/transfer.js';
import { snapshotRun, restoreRun } from './run-snapshot.js';

export function createGame({ view, input, overlays, rotate, debug, params, save, runSave, audio }) {
  const game = { state: 'title', run: null };
  let nextSeed = params.seed;
  const sfx = (name) => audio && audio.play(name);

  // The last class played is remembered in the save (which may be a no-op without storage).
  const open = (id) => CLASSES[id] && (params.unlockAll || save.isUnlocked(id, CLASSES[id]));
  let lastClass = open(save.data.lastClass) ? save.data.lastClass : DEFAULT_CLASS;
  if (params.classId && open(params.classId)) lastClass = params.classId;

  // What the title and pause screens pass for the music row.
  const musicUi = (redraw) => ({
    music: { music: save.data.music, volume: save.data.musicVolume },
    onToggleMusic() {
      save.setMusic(!save.data.music);
      if (audio) audio.setMusicEnabled(save.data.music);
      redraw();
    },
    onMusicVolume: (v) => { if (audio) audio.setMusicVolume(v); },
    onMusicCommit: (v) => save.setMusicVolume(v),
  });
  const scene = (id) => { if (audio) audio.music.play(id); };

  function toggleSound(redraw) {
    const on = !save.data.sound;
    save.setSound(on);
    if (audio) audio.setEnabled(on);
    redraw();
  }

  function toTitle() {
    game.state = 'title';
    game.run = null;
    scene('title');
    if (audio) audio.music.duck(false);
    showTitle(overlays, {
      ...musicUi(toTitle),
      onPlay: params.classId ? () => startRun() : toClassSelect,
      onCompendium: () => showCompendium(overlays, { onClose: toTitle, discovered: save.data.discovered }),
      onHistory: openHistory,
      onToggleSound: () => toggleSound(toTitle),
      sound: save.data.sound,
      bests: save.data.bests,
      runs: save.data.runs,
    });
  }

  function openHistory() {
    showHistory(overlays, {
      history: save.data.history,
      totals: { runs: save.data.runs, wins: save.data.wins, bests: save.data.bests },
      isUnlocked: open,
      onReplay: (e) => { nextSeed = e.seed; startRun(e.cls); },
      onBackup: openBackup,
      onClose: toTitle,
    });
  }

  function applyAudioSettings() {
    if (!audio) return;
    audio.setEnabled(save.data.sound);
    audio.setMusicEnabled(save.data.music);
    audio.setMusicVolume(save.data.musicVolume);
  }

  function openBackup() {
    showBackup(overlays, {
      getCode: () => encodeSave(save.data),
      preview: async (code) => { const data = await decodeSave(code); return { data, info: describeSave(data) }; },
      current: () => describeSave(save.data),
      apply: (data) => {
        save.replaceAll(data);
        lastClass = open(save.data.lastClass) ? save.data.lastClass : DEFAULT_CLASS;
        applyAudioSettings();
      },
      onClose: openHistory,
    });
  }

  function toClassSelect() {
    showClassSelect(overlays, {
      last: lastClass,
      isUnlocked: open,
      onPick: (id) => startRun(id),
      onBack: toTitle,
    });
  }

  function startRun(classId = lastClass) {
    lastClass = classId;
    save.setLastClass(classId);
    const seed = nextSeed != null ? nextSeed : randomSeed();
    nextSeed = null;                       // a ?seed= applies to the first run only
    input.reset();
    overlays.hide();
    if (runSave) runSave.clear();
    game.run = createRun({ seed, view, debug, classId, sfx });
    scene('run');
    if (audio) audio.music.duck(false);
    game.state = 'run';
  }

  // Writes the run in progress to the run save so closing the app does not lose it (game/run-snapshot.js).
  // Debug (god) runs are never saved. A snapshot taken in the forge reopens it on resume.
  function persistRun() {
    const run = game.run;
    if (!runSave || !run || run.over || debug.god) return;
    const wasForge = game.state === 'forge';
    try {
      if (wasForge) run.forgeReady = true;
      runSave.save(snapshotRun(run));
    } catch (e) {
      runSave.clear();                                  // a stale snapshot is worse than none
    } finally {
      if (wasForge) run.forgeReady = false;
    }
  }

  function pause(openBuild = false) {
    if (game.state !== 'run') return;
    game.state = 'paused';
    persistRun();
    openPause(openBuild);
  }

  function openPause(openBuild = false) {
    input.reset();
    if (audio) audio.music.duck(true);
    const show = () => showPause(overlays, {
      ...musicUi(show),
      onResume: resume,
      onBuild: () => showBuild(overlays, game.run, { onBack: show, backLabel: 'Back' }),
      onCompendium: () => showCompendium(overlays, { onClose: show, discovered: save.data.discovered }),
      onQuit: () => { if (runSave) runSave.clear(); toTitle(); },
      onToggleSound: () => toggleSound(show),
      sound: save.data.sound,
    });
    if (openBuild) showBuild(overlays, game.run, { onBack: show, backLabel: 'Back' });
    else show();
  }

  // On boot: a saved run comes back on its pause screen. Anything unreadable is dropped.
  function resumeSaved() {
    if (!runSave || params.seed != null || params.classId || debug.god) return false;
    const snap = runSave.load();
    if (!snap) return false;
    try {
      const run = restoreRun(snap, { view, debug, sfx });
      if (run.over) throw new Error('finished run');
      game.run = run;
    } catch (e) {
      console.warn('saved run dropped:', e.message);
      runSave.clear();
      return false;
    }
    game.state = 'paused';
    scene('run');
    openPause();
    return true;
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
    if (runSave) runSave.clear();
    const summary = game.run.summary();
    if (audio) audio.music.stop();
    sfx(summary.won ? 'win' : 'lose');
    // god-mode (debug) runs never touch the save
    const { newBests } = debug.god ? { newBests: [] } : save.recordRun(summary);
    // class unlocks: a class whose unlock event happened this run
    const unlocked = [];
    for (const [id, c] of Object.entries(CLASSES)) {
      if (!debug.god && unlockMet(c.unlock, summary) && save.unlock(id)) unlocked.push(c.name);
    }
    showResults(overlays, summary, { onAgain: () => startRun(), onTitle: toTitle, newBests, unlocked });
  }

  // Opens the level-up screen for one pending level. The run is frozen while it is open;
  // further pending levels (from a big gem pickup) are shown back to back.
  function openLevelUp() {
    const run = game.run;
    game.state = 'levelup';
    input.reset();
    sfx('levelup');
    let offers = generateOffers(offerState(run), run.rng);
    const level = run.player.level - (run.pendingLevelUps - 1);
    const show = () => showLevelUp(overlays, {
      level,
      getBuild: () => buildHtml(run),
      onCompendium: (back) => showCompendium(overlays, { onClose: back, discovered: save.data.discovered }),
      owned: ownedLine(run),
      offers,
      rerolls: run.rerolls,
      banishes: run.banishes,
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
      onReroll() {
        if (run.rerolls <= 0) return;
        run.rerolls--;
        offers = generateOffers(offerState(run), run.rng);
        show();
      },
      onBanish(offer) {
        if (run.banishes <= 0) return;
        run.banishes--;
        run.banished.push(offer.id);
        offers = generateOffers(offerState(run), run.rng);
        show();
      },
    });
    show();
  }

  // Opens the next collected chest (run frozen). Level-ups go first; the forge goes after.
  function openTreasure() {
    const run = game.run;
    const tier = run.pendingChests.shift();
    game.state = 'treasure';
    input.reset();
    const result = openChest(run, tier);
    showTreasure(overlays, {
      ...result,
      boss: tier === 1,
      sfx,
      onDone() {
        overlays.hide();
        run.player.iframes = Math.max(run.player.iframes, LEVELUP.iframesAfter);
        game.state = 'run';
      },
    });
  }

  // Opens the forge (run frozen) after a shrine was channelled. Level-ups always go first.
  function openForge() {
    const run = game.run;
    run.forgeReady = false;
    game.state = 'forge';
    input.reset();
    showForge(overlays, run, {
      sfx,
      onBuild: (back) => showBuild(overlays, run, { onBack: back, backLabel: 'Back to forge' }),
      onCompendium: (back) => showCompendium(overlays, { onClose: back, discovered: save.data.discovered }),
      onFusion(res) {                                           // a masterwork found for the first time gets a banner
        if (res.masterwork && save.discoverFusion(res.masterwork.id)) {
          run.toast = { text: `Masterwork discovered: ${res.name}!`, ttl: 4.5 };
          sfx('evolve');
        }
      },
      onDone() {
        overlays.hide();
        run.player.iframes = Math.max(run.player.iframes, LEVELUP.iframesAfter);
        game.state = 'run';
      },
    });
  }

  game.openBuild = () => { if (game.state === 'run') pause(true); };
  game.togglePause = () => (game.state === 'run' ? pause() : game.state === 'paused' ? resume() : undefined);
  game.isSimulating = () => game.state === 'run' && !rotate.blocked;

  game.update = (dt) => {
    const run = game.run;
    if (!run) return;
    run.update(dt, input.getMove());
    scene(run.bossAlive ? 'boss' : 'run');
    if (run.over) finishRun();
    else if (run.pendingLevelUps > 0) openLevelUp();
    else if (run.pendingChests.length > 0) openTreasure();
    else if (run.forgeReady) openForge();
  };

  // Out of view: pause (which saves the run). In a level-up, chest or forge screen the run is
  // already frozen, so just save it; it comes back on the pause screen.
  const onHidden = () => {
    if (game.state === 'run') pause();
    else if (game.state === 'levelup' || game.state === 'treasure' || game.state === 'forge') persistRun();
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) onHidden(); });
  window.addEventListener('pagehide', onHidden);

  if (debug.enabled) {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' && game.state === 'run') finishRun();   // debug: end the run now
      if (e.key === 'l' && game.state === 'run') gainXp(game.run, xpToNext(game.run.player.level));   // debug: level up
      if (e.key === 'o' && game.state === 'run') game.run.ore += 20;                                  // debug: +20 ore
      if (e.key === 'f' && game.state === 'run') spawnShrine(game.run);                               // debug: a shrine now
      if (e.key === 'b' && game.state === 'run') RUN_EVENTS.boss(game.run, { enemy: 'warlord' });     // debug: the boss now
      if (e.key === 'c' && game.state === 'run') spawnChest(game.run, game.run.player.x + 40, game.run.player.y, 0);   // debug: an elite chest at your feet
      if (e.key === 'e' && game.state === 'run') RUN_EVENTS.elite(game.run, { enemy: 'brute' });                       // debug: an elite now
      if (e.key === 'x' && game.state === 'run') game.run.starsteel += 2;                             // debug: +2 starsteel
    });
  }

  if (!resumeSaved()) toTitle();
  return game;
}
