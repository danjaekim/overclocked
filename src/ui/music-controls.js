// The sound rows shown on the title and pause screens: a volume slider for sound effects, then the
// music on/off button with its own slider. Sliders use `input` events (live volume) and `change`
// (saved), so they are bound after the overlay is mounted; the overlay helper only knows data-act clicks.

const slider = (label, value, kind) => {
  const pct = Math.round(value * 100);
  return `<label class="mvol"><span>${label}</span><input type="range" min="0" max="100" step="5" value="${pct}" data-vol="${kind}" aria-label="${label} volume"><output>${pct}</output></label>`;
};

export function musicControlsHtml({ music, volume, sfxVolume = 1 }) {
  return `${slider('Effects', sfxVolume, 'sfx')}
     <button class="btn" data-act="music">Music: ${music ? 'On' : 'Off'}</button>
     ${slider('Music', volume, 'music')}`;
}

export function bindMusicControls(el, { onVolume, onCommit, onSfxVolume, onSfxCommit }) {
  if (!el) return;
  const handlers = { music: [onVolume, onCommit], sfx: [onSfxVolume, onSfxCommit] };
  for (const range of el.querySelectorAll('input[type=range][data-vol]')) {
    const [live, commit] = handlers[range.dataset.vol] || [];
    const out = range.parentElement.querySelector('output');
    range.addEventListener('input', () => {
      if (out) out.textContent = range.value;
      if (live) live(range.value / 100);
    });
    range.addEventListener('change', () => { if (commit) commit(range.value / 100); });
  }
}
