import { fmtTime } from './overlay.js';

export function showTitle(overlays, { onPlay, onCompendium, onToggleSound, sound, bests, runs }) {
  const best = runs > 0
    ? `<p class="hint">Best: ${fmtTime(bests.time)} · ${bests.kills} kills · level ${bests.level}</p>`
    : '<p class="hint">Drag anywhere to move. Weapons fire automatically.</p>';
  overlays.show(
    `<h1>OVERFORGED</h1>
     <p class="sub">Forge your build. Survive the horde.</p>
     <button class="btn primary" data-act="play">Play</button>
     <button class="btn" data-act="guide">Compendium</button>
     <button class="btn" data-act="sound">Sound: ${sound ? 'On' : 'Off'}</button>
     ${best}`,
    (act) => {
      if (act === 'play') onPlay();
      else if (act === 'guide') onCompendium();
      else if (act === 'sound') onToggleSound();
    },
    'title'
  );
}
