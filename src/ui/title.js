export function showTitle(overlays, { onPlay }) {
  overlays.show(
    `<h1>OVERFORGED</h1>
     <p class="sub">Forge your build. Survive the horde.</p>
     <button class="btn primary" data-act="play">Play</button>
     <p class="hint">Drag anywhere to move. Weapons fire automatically.</p>`,
    (act) => { if (act === 'play') onPlay(); },
    'title'
  );
}
