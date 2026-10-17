// Run history (M17): totals, class / wins filters and an expandable list of past runs, newest first.
// Opened from the title screen. "Same seed" starts a new run on an old run's seed and class.

import { fmtTime } from './overlay.js';
import { fmtNum } from './build.js';
import { filterHistory, classesIn, summarize, className, buildNames } from '../game/history.js';

// Survives closing and reopening within a session.
const state = { cls: null, winsOnly: false, open: new Set() };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const pct = (x) => Math.round(x * 100) + '%';

function dateText(t) {
  try {
    return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function rowHtml(e, canReplay) {
  const open = state.open.has(e.t);
  const head = `<span class="btop"><b>${esc(className(e.cls))}</b><em>${e.won ? 'Won' : 'Fell'} · ${fmtTime(e.time)}</em></span>
    <span class="ccat">${dateText(e.t)} · Lv ${e.level} · ${fmtNum(e.kills)} kills · ${fmtNum(e.dmg)} dmg${e.fusions && e.fusions.length ? ` · ✦ ${e.fusions.length} fusion${e.fusions.length === 1 ? '' : 's'}` : ''}</span>`;
  let body = '';
  if (open) {
    const b = buildNames(e);
    const fact = (label, items, stack = false) => (items.length ? `<div class="cfact"><dt>${label}</dt><dd class="hitems${stack ? ' stack' : ''}">${items.map((x) => `<span>${esc(x)}</span>`).join('')}</dd></div>` : '');
    body = `<div class="cbody">
      <div class="csec"><dl>
        ${fact('Weapons', b.weapons, true)}${fact('Fusions', b.fusions, true)}${fact('Passives', b.passives)}${fact('Techniques', b.perks)}${fact('Titles', b.titles)}
        <div class="cfact"><dt>Run</dt><dd>${fmtNum(e.dps)} avg DPS${e.boss ? ' · Warlord slain' : ''}<br><small class="hseed">seed ${e.seed}</small></dd></div>
      </dl></div>
      ${canReplay ? `<button class="btn small hsame" data-act="hs:${e.t}">Same seed</button>` : ''}
    </div>`;
  }
  // Same shape as a compendium entry: only the title row toggles, and it stays pinned while the details scroll.
  return `<div class="centry hrow ${e.won ? 'won' : 'lost'}${open ? ' open' : ''}" data-id="${e.t}">
    <button class="chead" data-act="hx:${e.t}">${head}</button>${body}
  </div>`;
}

export function showHistory(overlays, { history, totals, isUnlocked, onReplay, onBackup, onClose }) {
  function render() {
    if (state.cls && !history.some((e) => e.cls === state.cls)) state.cls = null;
    const list = filterHistory(history, state);
    const s = summarize(list);
    const classes = classesIn(history);
    const chips = history.length
      ? `<div class="cfacet"><span>Class</span>${classes.map((id) => `<button class="cchip${state.cls === id ? ' on' : ''}" data-act="hc:${id}">${esc(className(id))}</button>`).join('')}
         <button class="cchip${state.winsOnly ? ' on' : ''}" data-act="hw">Wins only</button></div>`
      : '';
    const head = `<div class="bstats">
        <div><span>Runs</span><b>${totals.runs}</b></div>
        <div><span>Wins</span><b>${totals.wins}</b></div>
        <div><span>Best time</span><b>${fmtTime(totals.bests.time)}</b></div>
        <div><span>Best level</span><b>${totals.bests.level}</b></div>
      </div>`;
    const filtered = history.length
      ? `<p class="hint hsum">${state.cls || state.winsOnly ? 'Matching' : `Last ${history.length}`}: ${s.runs} run${s.runs === 1 ? '' : 's'} · ${pct(s.winRate)} won · avg level ${s.avgLevel.toFixed(1)} · best ${fmtNum(s.bestKills)} kills</p>`
      : '';
    const rows = !history.length
      ? '<p class="hint">No runs yet. Finish a run and it shows up here.</p>'
      : list.length
        ? list.map((e) => rowHtml(e, isUnlocked(e.cls))).join('')
        : '<p class="hint">No runs match.</p>';
    overlays.show(
      `<h2>History</h2>
       ${head}
       ${chips}
       ${filtered}
       <div class="clist">${rows}</div>
       <div class="lu-tools"><button class="btn small" data-act="backup">Export / import</button><button class="btn small primary" data-act="close">Close</button></div>`,
      onAct,
      'compendium history'
    );
  }

  function onAct(act) {
    if (act === 'close') return onClose();
    if (act === 'backup') return onBackup();
    if (act === 'hw') {
      state.winsOnly = !state.winsOnly;
      return render();
    }
    const [kind, a] = act.split(':');
    if (kind === 'hc') {
      state.cls = state.cls === a ? null : a;
      render();
    } else if (kind === 'hx') {
      const t = Number(a);
      if (state.open.has(t)) state.open.delete(t); else state.open.add(t);
      const el = document.querySelector('.clist');
      const top = el ? el.scrollTop : 0;
      render();
      const again = document.querySelector('.clist');
      if (again) again.scrollTop = top;
    } else if (kind === 'hs') {
      const e = history.find((x) => x.t === Number(a));
      if (e) onReplay(e);
    }
  }

  render();
}
