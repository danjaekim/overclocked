// The compendium overlay (M16): tabs, search, filter chips and expandable entries, all driven by
// game/compendium.js. Opened from the title screen and the pause menu; `onClose` returns there.

import { RARITIES } from '../data/rarities.js';
import { CLASSES } from '../data/classes.js';
import { TABS, buildEntries, facetsFor, filterEntries } from '../game/compendium.js';

const ELEMENT_COLOR = { fire: '#ff7a3c', frost: '#8fd8ff', storm: '#ffd34d' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Survives closing and reopening within a session, so you land where you left off.
const state = { tab: 'weapons', filters: {}, q: '', open: new Set() };
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
    ? `<div class="cbody">${e.lines.map((l) => `<p>${l}</p>`).join('')}${e.builds.length ? `<p class="cbuilds">Used in: ${e.builds.join(', ')}</p>` : ''}</div>`
    : `<div class="bsub">${e.summary}</div>`;
  return `<button class="centry${open ? ' open' : ''}" style="--c:${color}" data-act="cx:${e.id}">
    <span class="btop"><b>${e.name}</b><em>${dots}${chipLabel('rarity', e.rarity)}</em></span>
    <span class="ccat">${e.cat}${e.classes.length && e.tab !== 'builds' ? ' · ' + e.classes.map((c) => chipLabel('cls', c)).join(', ') : ''}</span>
    ${body}
  </button>`;
}

function listHtml() {
  const list = filterEntries(entries, { tab: state.tab, ...state.filters, q: state.q });
  if (!list.length) return '<p class="hint">Nothing matches. Clear a filter or the search.</p>';
  return list.map(entryHtml).join('');
}

export function showCompendium(overlays, { onClose }) {
  if (!entries) entries = buildEntries();

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
    const on = el && el.querySelector('.ctab.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
    const input = el && el.querySelector('.csearch');
    if (input) {
      input.addEventListener('input', () => {
        state.q = input.value;
        el.querySelector('.clist').innerHTML = listHtml();
      });
    }
  }

  function onAct(act) {
    if (act === 'close') return onClose();
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
      if (state.open.has(id)) state.open.delete(id); else state.open.add(id);
      const list = document.querySelector('.clist');
      const top = list ? list.scrollTop : 0;
      if (list) { list.innerHTML = listHtml(); list.scrollTop = top; }
    }
  }

  render();
}
