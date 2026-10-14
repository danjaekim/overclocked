// The music row shown on the title and pause screens: an on/off button and a volume slider.
// The slider uses `input` events (live volume) and `change` (saved), so it is bound after the
// overlay is mounted; the overlay helper only knows about data-act clicks.

export function musicControlsHtml({ music, volume }) {
  const pct = Math.round(volume * 100);
  return `<button class="btn" data-act="music">Music: ${music ? 'On' : 'Off'}</button>
     <label class="mvol"><span>Volume</span><input type="range" min="0" max="100" step="5" value="${pct}" aria-label="Music volume"><output>${pct}</output></label>`;
}

export function bindMusicControls(el, { onVolume, onCommit }) {
  const range = el && el.querySelector('input[type=range]');
  if (!range) return;
  const out = el.querySelector('.mvol output');
  range.addEventListener('input', () => {
    if (out) out.textContent = range.value;
    onVolume(range.value / 100);
  });
  range.addEventListener('change', () => onCommit(range.value / 100));
}
