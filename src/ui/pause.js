import { musicControlsHtml, bindMusicControls } from './music-controls.js';

export function showPause(overlays, { onResume, onBuild, onCompendium, onQuit, onToggleSound, sound, music, onToggleMusic, onMusicVolume, onMusicCommit, onSfxVolume, onSfxCommit }) {
  const el = overlays.show(
    `<h2>Paused</h2>
     <button class="btn primary" data-act="resume">Resume</button>
     <button class="btn" data-act="build">Build &amp; stats</button>
     <button class="btn" data-act="guide">Compendium</button>
     <button class="btn" data-act="sound">Sound: ${sound ? 'On' : 'Off'}</button>
     ${musicControlsHtml(music)}
     <button class="btn" data-act="quit">Quit run</button>`,
    (act) => {
      if (act === 'resume') onResume();
      else if (act === 'build') onBuild();
      else if (act === 'guide') onCompendium();
      else if (act === 'sound') onToggleSound();
      else if (act === 'music') onToggleMusic();
      else if (act === 'quit') onQuit();
    }
  );
  bindMusicControls(el, { onVolume: onMusicVolume, onCommit: onMusicCommit, onSfxVolume, onSfxCommit });
}
