import { musicControlsHtml, bindMusicControls } from './music-controls.js';
import { VERSION } from '../version.js';

export function showPause(overlays, { onResume, onRig, onSandbox, onQuit, onToggleSound, sound, music, onToggleMusic, onMusicVolume, onMusicCommit, onSfxVolume, onSfxCommit, sandbox = false }) {
  const el = overlays.show(
    `<h2>Paused</h2>
     <button class="btn primary" data-act="resume">Resume</button>
     <button class="btn" data-act="rig">Edit rig</button>
     <button class="btn" data-act="sound">Sound: ${sound ? 'On' : 'Off'}</button>
     ${musicControlsHtml(music)}
     ${onSandbox ? '<button class="btn" data-act="sandbox">Chain sandbox (debug)</button>' : ''}
     <button class="btn" data-act="quit">${sandbox ? 'Back to the run' : 'New run'}</button>
     <p class="ver">v${VERSION}</p>`,
    (act) => {
      if (act === 'resume') onResume();
      else if (act === 'rig') onRig();
      else if (act === 'sandbox') onSandbox();
      else if (act === 'sound') onToggleSound();
      else if (act === 'music') onToggleMusic();
      else if (act === 'quit') onQuit();
    }
  );
  bindMusicControls(el, { onVolume: onMusicVolume, onCommit: onMusicCommit, onSfxVolume, onSfxCommit });
}
