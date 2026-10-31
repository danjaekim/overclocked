import { resultsSceneHtml } from './scenes.js';
import { fmtTime } from './overlay.js';
import { resultsDamageHtml } from './damage.js';
import { PIECES, RULES, CHAIN_COLORS, CHAIN_NAMES } from '../rig/pieces.js';
import { PASSIVES } from '../rig/passives.js';
import { CHASSIS, chassisName } from '../rig/chassis.js';

const BEST_LABEL = { time: 'time', kills: 'kills', level: 'level' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// The run's rig: each chain as a row of its pieces (icon, name, level), so a good build can be read back.
export function rigHtml(rig) {
  if (!rig) return '';
  const cell = (id) => {
    const p = PIECES[id];
    const lv = (rig.levels && rig.levels[id]) || 1;
    return `<span class="rrcell ${p.type}"><svg class="ico${p.filled ? ' filled' : ''}" viewBox="0 0 24 24" width="20" height="20"><path d="${p.icon}"/></svg><b>${esc(p.short)}</b>${lv > 1 ? `<i>L${lv}</i>` : ''}</span>`;
  };
  const rows = rig.chains.map((c, i) => `<div class="rrhead"><span class="rbadge" style="background:${CHAIN_COLORS[i]}">${CHAIN_NAMES[i]}</span><span class="rrrule">${esc(CHASSIS[c.chassis] ? chassisName(c) : RULES[c.rule].name)}</span></div><div class="rrrow">${c.slots.filter(Boolean).map(cell).join('') || '<em>empty</em>'}</div>`).join('');
  const pas = Object.entries(rig.passives || {}).filter(([id, n]) => PASSIVES[id] && n > 0).map(([id, n]) => `<span class="rrcell passive">${esc(PASSIVES[id].name)}${n > 1 ? ' x' + n : ''}</span>`).join('');
  const bench = rig.bench.filter(Boolean);
  return `<div class="rrig"><p class="sub">Your rig</p>${rows}${bench.length ? `<div class="rrhead"><span class="rrrule">Bench</span></div><div class="rrrow">${bench.map(cell).join('')}</div>` : ''}${pas ? `<div class="rrhead"><span class="rrrule">Passives</span></div><div class="rrrow">${pas}</div>` : ''}</div>`;
}

export function showResults(overlays, summary, { onAgain, newBests = [] }) {
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
     ${rigHtml(summary.rig)}
     ${resultsDamageHtml(summary.stats)}
     <p class="hint">Seed ${summary.seed}</p>
     <div class="rbar">
       <button class="btn primary" data-act="again">Play again</button>
     </div>`,
    (act) => {
      if (act === 'again') onAgain();
    },
    'results'
  );
}
