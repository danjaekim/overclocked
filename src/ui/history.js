// Run history (M17): totals, class / wins filters and an expandable list of past runs, newest first.
// Opened from the title screen. "Same seed" starts a new run on an old run's seed and class.

import { fmtTime } from './overlay.js';
import { fmtNum } from './build.js';
import { filterHistory, classesIn, summarize, className, buildNames, weaponTiles } from '../game/history.js';

// Survives closing and reopening within a session.
const state = { cls: null, winsOnly: false, open: new Set() };

// Weapon type icons: a sword for close range, an arrow for ranged, a paw for summons. Tier sets the colour.
const ICON = {
  close: '<g transform="rotate(45 12 12)"><path d="M12 1.5 L14.2 4 V14 H9.8 V4Z"/><rect x="6" y="14" width="12" height="2.2" rx="1"/><rect x="10.8" y="16" width="2.4" height="4"/><circle cx="12" cy="21" r="1.6"/></g>',
  ranged: '<path class="s" d="M8 2.5 Q22 12 8 21.5"/><path class="s sl" d="M8 2.5 L8 21.5"/><path class="s" d="M3 12 H18"/><path d="M20 12 L15.5 9 V15Z"/>',
  summon: '<path d="M12 2.5 C7 2.5 4 6 4 10.5 C4 13.5 5.5 15 7 16 V20.5 H17 V16 C18.5 15 20 13.5 20 10.5 C20 6 17 2.5 12 2.5Z"/><circle class="eye" cx="8.8" cy="11" r="2.2"/><circle class="eye" cx="15.2" cy="11" r="2.2"/><path class="eye" d="M12 13.5 L10.8 16 H13.2Z"/><path class="s eyes" d="M10 17.5 V20.5 M12 17.5 V20.5 M14 17.5 V20.5"/>',
};
const TIER_COLOR = { common: '#9aa0b0', uncommon: '#5bc07a', rare: '#4f9bff', epic: '#b56bff', evolved: '#ff9a3c', fused: '#b56bff' };
const ELEMENT_COLOR = { fire: '#ff7a3c', frost: '#8fd8ff', storm: '#ffd34d' };

function weaponLine(w) {
  const c = TIER_COLOR[w.tier] || TIER_COLOR.common;
  const marks = `${w.enhance ? `<b class="hm enh">+${w.enhance}</b>` : ''}${w.star ? '<b class="hm star" title="Starforged">&#10022;</b>' : ''}${w.legendary ? '<b class="hm lgd" title="Legendary">&#9733;</b>' : ''}`;
  const dots = w.elements.map((el) => `<i class="cdot" style="background:${ELEMENT_COLOR[el]}"></i>`).join('');
  return `<div class="hw"><span class="hwi" style="--t:${c}" title="${w.tier} ${w.type}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[w.type]}</svg></span>
    <span class="hwn">${esc(w.name)} <small>Lv ${w.lvl}</small>${dots}</span>${marks ? `<span class="hwm">${marks}</span>` : ''}</div>`;
}

const icon = (type, c) => `<span class="hwi" style="--t:${c}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[type]}</svg></span>`;
// One-line key for the weapon tiles in open rows.
const LEGEND = `<div class="hleg">
  <span>${icon('close', '#9aa0b0')}Close</span><span>${icon('ranged', '#9aa0b0')}Ranged</span><span>${icon('summon', '#9aa0b0')}Summon</span>
  <span class="hleg-t"><i style="background:${TIER_COLOR.common}"></i><i style="background:${TIER_COLOR.uncommon}"></i><i style="background:${TIER_COLOR.rare}"></i><i style="background:${TIER_COLOR.epic}"></i><i style="background:${TIER_COLOR.evolved}"></i>Tier</span>
  <span><b class="hm enh">+N</b>Forged</span><span><b class="hm star">&#10022;</b>Starforged</span><span><b class="hm lgd">&#9733;</b>Legendary</span>
</div>`;

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
    const factHtml = (label, html) => `<div class="cfact"><dt>${label}</dt><dd class="hitems">${html}</dd></div>`;
    const fact = (label, items, stack = false) => (items.length ? `<div class="cfact"><dt>${label}</dt><dd class="hitems${stack ? ' stack' : ''}">${items.map((x) => `<span>${esc(x)}</span>`).join('')}</dd></div>` : '');
    body = `<div class="cbody">
      <div class="csec"><h4>Weapons</h4>${weaponTiles(e).map(weaponLine).join('')}</div>
      <div class="csec"><dl>
        ${fact('Fusions', b.fusions, true)}${fact('Passives', b.passives)}${fact('Techniques', b.perks)}${fact('Titles', b.titles)}
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
       ${history.length ? LEGEND : ''}
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
