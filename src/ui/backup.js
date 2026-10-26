// Export / import of progress (M17), opened from the History screen. Export shows the save as a code to
// copy; import takes a pasted code, shows what it contains next to what you have, and only replaces
// your progress after you confirm. All the encoding lives in save/transfer.js.

import { fmtTime } from './overlay.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function summaryHtml(label, d) {
  return `<div class="bstats"><div><span>${label}</span><b>${d.runs} runs</b></div><div><span>Wins</span><b>${d.wins}</b></div><div><span>Unlocked</span><b>${d.unlocked}</b></div><div><span>Best time</span><b>${fmtTime(d.bests.time)}</b></div></div>`;
}

async function copyText(text, area) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the selection fallback */ }
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

export function showBackup(overlays, { getCode, preview, current, apply, onClose }) {
  let message = '';
  let pending = null;          // a decoded save waiting for the player to confirm
  let importText = '';

  function main() {
    overlays.show(
      `<h2>Export / import</h2>
       <div class="clist backup">
         <p class="hint">Your progress lives only in this browser (the Safari tab and the home-screen app are separate). Export a code to back it up or move it to another device.</p>
         <button class="btn" data-act="export">Show my code</button>
         <h3>Import</h3>
         <textarea class="bcode" id="import-code" rows="4" placeholder="Paste a code here" autocomplete="off" autocapitalize="off" spellcheck="false">${esc(importText)}</textarea>
         <button class="btn" data-act="check">Check code</button>
         ${message ? `<p class="bmsg">${esc(message)}</p>` : ''}
       </div>
       <button class="btn primary" data-act="close">Back</button>`,
      onAct,
      'compendium history'
    );
  }

  async function showExport() {
    const code = await getCode();
    overlays.show(
      `<h2>Your code</h2>
       <div class="clist backup">
         <p class="hint">Copy this whole code and keep it somewhere safe (notes, email to yourself). Paste it into Import on any device.</p>
         <textarea class="bcode" id="export-code" rows="7" readonly>${esc(code)}</textarea>
         <button class="btn primary" data-act="copy">Copy code</button>
         <p class="bmsg" id="copy-msg"></p>
       </div>
       <button class="btn" data-act="main">Back</button>`,
      async (act) => {
        if (act === 'main') { message = ''; return main(); }
        if (act === 'copy') {
          const area = document.getElementById('export-code');
          const ok = await copyText(code, area);
          document.getElementById('copy-msg').textContent = ok ? 'Copied.' : 'Could not copy automatically. Press and hold the code, choose Select All, then Copy.';
        }
      },
      'compendium history'
    );
  }

  function confirm() {
    overlays.show(
      `<h2>Replace progress?</h2>
       <div class="clist backup">
         ${summaryHtml('This code', pending.info)}
         <p class="hint">${pending.info.history} runs in its history.</p>
         ${summaryHtml('You now', current())}
         <p class="hint">Importing replaces what you have now. This cannot be undone.</p>
       </div>
       <button class="btn primary" data-act="apply">Replace my progress</button>
       <button class="btn" data-act="cancel">Cancel</button>`,
      (act) => {
        if (act === 'apply') {
          apply(pending.data);
          pending = null;
          importText = '';
          message = 'Imported. Your progress was replaced.';
          main();
        } else if (act === 'cancel') {
          pending = null;
          message = '';
          main();
        }
      },
      'compendium history'
    );
  }

  async function onAct(act) {
    if (act === 'close') return onClose();
    if (act === 'export') return showExport();
    if (act === 'check') {
      const area = document.getElementById('import-code');
      importText = area ? area.value : '';
      try {
        const info = await preview(importText);
        pending = info;
        confirm();
      } catch (e) {
        message = e && e.message ? e.message : 'The code could not be read.';
        main();
      }
    }
  }

  main();
}
