import { resultsSceneHtml } from './scenes.js';
import { fmtTime } from './overlay.js';
import { resultsDamageHtml } from './build.js';
import { WEAPONS } from '../data/weapons.js';

const BEST_LABEL = { time: 'time', kills: 'kills', level: 'level' };

const wname = (id) => (WEAPONS[id] ? WEAPONS[id].name : id);

// One line per fusion: its name and the two weapons that went into it.
function fusionsHtml(summary) {
  const list = summary.fusionList || [];
  if (!list.length) return '';
  return `<div class="rfusions">${list.map((g) => `<p class="unlock">${g.masterwork ? '✦ ' : ''}<b>${g.name}</b> <span class="rg-from">${wname(g.host)} + ${wname(g.donor)}</span></p>`).join('')}</div>`;
}

export function showResults(overlays, summary, { onAgain, onTitle, newBests = [], unlocked = [] }) {
  const title = summary.won ? 'You survived' : 'You fell';
  const stat = (key, label, value) =>
    `<div><span>${label}${newBests.includes(key) ? ' · best!' : ''}</span><b>${value}</b></div>`;
  overlays.show(
    `<h2 class="ribbon ${summary.won ? 'win' : 'lose'}">${title}</h2>
     ${resultsSceneHtml(summary.classId, summary.won)}
     <div class="stats">
       ${stat('time', 'Time', fmtTime(summary.time))}
       ${stat('kills', 'Kills', summary.kills)}
       ${stat('level', 'Level', summary.level)}
     </div>
     ${summary.bossKilled ? '<p class="sub">The Warlord is slain.</p>' : ''}
     ${unlocked.length ? `<p class="unlock">Unlocked: ${unlocked.join(', ')}!</p>` : ''}
     ${fusionsHtml(summary)}
     ${summary.titles.length ? `<p class="sub">Titles: ${summary.titles.join(', ')}</p>` : ''}
     ${resultsDamageHtml(summary.stats)}
     <p class="hint">Seed ${summary.seed}</p>
     <div class="rbar">
       <button class="btn primary" data-act="again">Play again</button>
       <button class="btn" data-act="title">Title</button>
     </div>`,
    (act) => {
      if (act === 'again') onAgain();
      else if (act === 'title') onTitle();
    },
    'results'
  );
}
