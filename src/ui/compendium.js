// The compendium overlay (M16): tabs, search, filter chips and expandable entries, all driven by
// game/compendium.js. Opened from the title screen and the pause menu; `onClose` returns there.

import { RARITIES } from '../data/rarities.js';
import { CLASSES } from '../data/classes.js';
import { TABS, buildEntries, facetsFor, filterEntries } from '../game/compendium.js';
import { startPreview, stopPreview, previewLevels } from './weapon-preview.js';

const ELEMENT_COLOR = { fire: '#ff7a3c', frost: '#8fd8ff', storm: '#ffd34d' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Survives closing and reopening within a session, so you land where you left off.
const state = { tab: 'weapons', filters: {}, q: '', open: new Set(), previewId: null, previewLevel: 0 };
let entries = null;

function chipLabel(key, v) {
  if (key === 'cls') return CLASSES[v] ? CLASSES[v].name : cap(v);
  if (key === 'rarity') return RARITIES[v].name;
  return cap(v);
}

function entryHtml(e) {
  const color = RARITIES[e.rarity].color;
  const dots = e.elements.map((el) => `<i class="cdot" style="background:${ELEMENT_COLOR[el]}" title="${el}"></i>`).join('');
  const open = state.open.has(e.id);
  const body = open
    ? `<div class="cbody">${previewHtml(e)}${e.lines.map((l) => `<p>${l}</p>`).join('')}${e.builds.length ? `<p class="cbuilds">Used in: ${e.builds.join(', ')}</p>` : ''}</div>`
    : `<div class="bsub">${e.summary}</div>`;
  return `<button class="centry${open ? ' open' : ''}" style="--c:${color}" data-act="cx:${e.id}">
    <span class="btop"><b>${e.name}</b><em>${dots}${chipLabel('rarity', e.rarity)}</em></span>
    <span class="ccat">${e.cat}${e.classes.length && e.tab !== 'builds' ? ' · ' + e.classes.map((c) => chipLabel('cls', c)).join(', ') : ''}</span>
    ${body}
  </button>`;
}

// A live preview under an open weapon entry (one at a time: the one opened last).
function previewHtml(e) {
  if (e.tab !== 'weapons' && e.tab !== 'evolve') return '';
  if (state.previewId !== e.id) return `<span class="pvgo" role="button" data-act="pv:${e.id}">&#9654; Watch it in action</span>`;
  const levels = previewLevels(e.id);
  const lv = levels.includes(state.previewLevel) ? state.previewLevel : levels[levels.length - 1];
  const chips = levels.map((l, i) => `<span class="pvlv${l === lv ? ' on' : ''}" role="button" data-act="pl:${e.id}:${l}">${i === levels.length - 1 && levels.length > 1 ? 'Max' : 'Lv ' + l}</span>`).join('');
  return `<div class="pv"><canvas class="cprev" data-prev="${e.id}" data-lv="${lv}" data-act="noop"></canvas><div class="pvbar">${chips}</div></div>`;
}

// Starts the preview for whichever entry shows a canvas, or stops it.
function mountPreview() {
  const c = document.querySelector('canvas.cprev');
  if (!c) { stopPreview(); return; }
  startPreview(c, c.dataset.prev, Number(c.dataset.lv));
}

function listHtml() {
  const list = filterEntries(entries, { tab: state.tab, ...state.filters, q: state.q });
  if (!list.length) return '<p class="hint">Nothing matches. Clear a filter or the search.</p>';
  return list.map(entryHtml).join('');
}

export function showCompendium(overlays, { onClose, discovered }) {
  entries = buildEntries(discovered);           // rebuilt on open so new discoveries show

  function render() {
    const facets = facetsFor(state.tab, entries);
    const tabs = TABS.map((t) => `<button class="ctab${t.id === state.tab ? ' on' : ''}" data-act="ct:${t.id}">${t.label}</button>`).join('');
    const rows = facets.map((f) => `<div class="cfacet"><span>${f.label}</span>${f.options.map((o) => {
      const on = state.filters[f.key] === o;
      const style = f.key === 'element' ? ` style="--e:${ELEMENT_COLOR[o]}"` : '';
      return `<button class="cchip${on ? ' on' : ''}${f.key === 'element' ? ' el' : ''}"${style} data-act="cf:${f.key}:${o}">${chipLabel(f.key, o)}</button>`;
    }).join('')}</div>`).join('');
    const el = overlays.show(
      `<h2>Compendium</h2>
       <div class="ctabs">${tabs}</div>
       <input class="csearch" type="search" placeholder="Search" value="${state.q.replace(/"/g, '&quot;')}" autocomplete="off" autocapitalize="off" spellcheck="false">
       <div class="cfacets">${rows}</div>
       <div class="clist">${listHtml()}</div>
       <button class="btn" data-act="close">Close</button>`,
      onAct,
      'compendium'
    );
    mountPreview();
    const on = el && el.querySelector('.ctab.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
    const input = el && el.querySelector('.csearch');
    if (input) {
      input.addEventListener('input', () => {
        state.q = input.value;
        el.querySelector('.clist').innerHTML = listHtml();
        mountPreview();
      });
    }
  }

  function redraw() {
    const list = document.querySelector('.clist');
    const top = list ? list.scrollTop : 0;
    if (list) { list.innerHTML = listHtml(); list.scrollTop = top; }
    mountPreview();
  }

  function onAct(act) {
    if (act === 'close') { stopPreview(); return onClose(); }
    if (act === 'noop') return;
    const [kind, a, b] = act.split(':');
    if (kind === 'ct') {
      state.tab = a;
      state.filters = {};
      state.q = '';
      render();
    } else if (kind === 'cf') {
      state.filters[a] = state.filters[a] === b ? undefined : b;
      render();
    } else if (kind === 'cx') {
      const id = act.slice(3);
      if (state.open.has(id)) { state.open.delete(id); if (state.previewId === id) state.previewId = null; } else { state.open.add(id); state.previewId = id; state.previewLevel = 0; }
      redraw();
      const opened = document.querySelector(`.centry.open[data-act="cx:${id}"]`);
      if (opened && opened.scrollIntoView) opened.scrollIntoView({ block: 'nearest' });       // keep the preview and its buttons in view
    } else if (kind === 'pv') {
      state.previewId = a;
      state.previewLevel = 0;
      redraw();
    } else if (kind === 'pl') {
      state.previewId = a;
      state.previewLevel = Number(b);
      redraw();
    }
  }

  render();
}
