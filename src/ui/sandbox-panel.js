// The chain picker for the sandbox: a small tab at the bottom-left that opens one row of test chains per
// chain slot. Tapping a chain loads it at once; the arena keeps running. It stays as a debug panel after M2.

import { TEST_CHAINS } from '../rig/presets.js';

export function mountSandboxPanel(host, { getKeys, onPick, onEdit, onLevel }) {
  host.innerHTML = '';
  const tab = document.createElement('button');
  tab.className = 'sbx-tab';
  tab.textContent = 'Chains';
  const panel = document.createElement('div');
  panel.className = 'sbx-panel';
  panel.hidden = true;
  const edit = document.createElement('button');
  edit.className = 'sbx-tab sbx-edit';
  edit.textContent = 'Rig';
  host.append(panel, tab, edit);

  function render() {
    const keys = getKeys();
    panel.innerHTML = keys.map((cur, i) => `
      <div class="sbx-row"><span class="sbx-label">${'AB'[i]}</span>${Object.entries(TEST_CHAINS).map(([k, c]) =>
        `<button class="sbx-btn${k === cur ? ' on' : ''}" data-chain="${i}" data-key="${k}">${c.name}</button>`).join('')}</div>`).join('')
      + `<div class="sbx-note">${keys.map((k, i) => `${'AB'[i]}: ${k ? TEST_CHAINS[k].note : 'Custom: edited in the rig editor'}`).join('<br>')}</div>`
      + '<div class="sbx-row"><button class="sbx-btn" data-level="1">Level up now (debug)</button></div>';
  }

  tab.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) render();
  });
  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-level]')) { panel.hidden = true; onLevel(); return; }
    const b = e.target.closest('[data-chain]');
    if (!b) return;
    onPick(Number(b.dataset.chain), b.dataset.key);
    render();
  });
  edit.addEventListener('click', () => { panel.hidden = true; onEdit(); });
  host.style.display = 'block';

  return {
    unmount() {
      host.innerHTML = '';
      host.style.display = 'none';
    },
  };
}
