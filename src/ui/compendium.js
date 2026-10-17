// The compendium overlay (M16): tabs, search, filter chips and expandable entries, all driven by
// game/compendium.js. Opened from the title screen and the pause menu; `onClose` returns there.

import { RARITIES } from '../data/rarities.js';
import { CLASSES } from '../data/classes.js';
import { TABS, buildEntries, facetsFor, filterEntries, sortByStatus, evolutionById, fusionProgress } from '../game/compendium.js';
import { recipeProgress, describe as describeReq } from '../game/evolution.js';
import { WEAPONS } from '../data/weapons.js';
import { MASTERWORKS } from '../data/fusions.js';
import { startPreview, stopPreview, previewLevels } from './weapon-preview.js';

const ELEMENT_COLOR = { fire: '#ff7a3c', frost: '#8fd8ff', storm: '#ffd34d' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Survives closing and reopening within a session, so you land where you left off.
const state = { tab: 'weapons', filters: {}, q: '', open: new Set(), previewId: null, previewLevel: 0, filtersOpen: false };
let entries = null;
let liveRun = null;                              // the run in progress, when opened from one: drives sorting and progress

function chipLabel(key, v) {
  if (key === 'cls') return CLASSES[v] ? CLASSES[v].name : cap(v);
  if (key === 'rarity') return RARITIES[v].name;
  return cap(v);
}

const ICON = { ok: '&#10003;', short: '&#9650;', missing: '&#10007;', plain: '&#8226;' };

function reqRows(rows) {
  return `<ul class="creq">${rows.map((r) => `<li class="${r.state}"><i>${ICON[r.state]}</i><span>${r.text}${r.note ? `<small>${r.note}</small>` : ''}</span></li>`).join('')}</ul>`;
}

function recipeHtml(item) {
  const r = evolutionById(item.id);
  const from = WEAPONS[r.from].name;
  const into = WEAPONS[r.into].name;
  const partner = r.with ? WEAPONS[r.with].name : '';
  const head = item.role === 'made'
    ? (r.with ? `Combine ${from} with ${partner}` : `Evolve ${from}`)
    : (r.with ? `Combine ${from} with ${partner} into ${into}` : `Evolves into ${into}`);
  if (!liveRun) return `<div class="crecipe"><div class="crhead">${head}</div>${reqRows(r.requires.map((q) => ({ text: describeReq(q, r), state: 'plain', note: '' })))}</div>`;
  const pr = recipeProgress(liveRun, r);
  const tone = pr.ready ? ' ready' : pr.own ? ' near' : '';
  const foot = pr.ready ? '<div class="crfoot">Ready: combine it at the forge.</div>' : '';
  return `<div class="crecipe${tone}"><div class="crhead">${head}<em>${pr.met} / ${pr.total}</em></div>${reqRows(pr.rows)}${foot}</div>`;
}

function sectionHtml(sec) {
  const title = sec.title ? `<h4>${sec.title}</h4>` : '';
  if (sec.kind === 'text') return `<p class="ctext">${sec.text}</p>`;
  if (sec.kind === 'facts') {
    return `<div class="csec">${title}<dl>${sec.rows.map(([k, v]) => `<div class="cfact${k ? '' : ' solo'}">${k ? `<dt>${k}</dt>` : ''}<dd>${v}</dd></div>`).join('')}</dl></div>`;
  }
  if (sec.kind === 'levels') {
    return `<div class="csec">${title}<ol class="clv">${sec.rows.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ol></div>`;
  }
  if (sec.kind === 'list') return `<div class="csec">${title}<ul class="cbul">${sec.items.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
  if (sec.kind === 'evolinks') {
    return `<div class="csec">${title}<div class="clinks">${sec.items.map((rid) => {
      const r = evolutionById(rid);
      const into = WEAPONS[r.into].name;
      const tone = liveRun ? (recipeProgress(liveRun, r).ready ? ' ready' : recipeProgress(liveRun, r).own ? ' near' : '') : '';
      const via = r.with ? ` (with ${WEAPONS[r.from === sec.self ? r.with : r.from].name})` : '';
      return `<span class="clink${tone}" role="button" data-act="go:${r.into}">${into}${via} &rsaquo;</span>`;
    }).join('')}</div></div>`;
  }
  if (sec.kind === 'recipes') return `<div class="csec">${title}${sec.items.map(recipeHtml).join('')}</div>`;
  return '';
}

function fusionHtml(e) {
  const m = liveRun && e.fusePair && MASTERWORKS.find((x) => `fusion:${x.id}` === e.id);
  if (!m) return '';
  const pr = fusionProgress(liveRun, m.host, m.donor);
  return `<div class="csec"><h4>Your forge</h4><div class="crecipe${pr.ready ? ' ready' : pr.own ? ' near' : ''}"><div class="crhead">Fuse ${WEAPONS[m.donor].name} into ${WEAPONS[m.host].name}<em>${pr.met} / ${pr.total}</em></div>${reqRows(pr.rows)}${pr.ready ? '<div class="crfoot">Ready: fuse them at the forge.</div>' : ''}</div></div>`;
}

function entryHtml({ entry: e, status: st }) {
  const color = RARITIES[e.rarity].color;
  const dots = e.elements.map((el) => `<i class="cdot" style="background:${ELEMENT_COLOR[el]}" title="${el}"></i>`).join('');
  const open = state.open.has(e.id);
  const sections = e.sections ? e.sections.map((x) => sectionHtml({ ...x, self: e.id })).join('') : e.lines.map((l) => `<p class="ctext">${l}</p>`).join('');
  const body = open
    ? `<div class="cbody">${previewHtml(e)}${sections}${fusionHtml(e)}${e.builds.length ? `<div class="csec"><h4>Used in builds</h4><div class="cchips">${e.builds.map((b) => `<span>${b}</span>`).join('')}</div></div>` : ''}</div>`
    : `${st && st.need ? `<div class="cneed">${st.need}</div>` : ''}<div class="bsub">${e.summary}</div>`;
  const links = st && st.chips && st.chips.length && !open
    ? `<span class="clinks">${st.chips.map((c) => `<span class="clink${c.tone ? ' ' + c.tone : ''}" role="button" data-act="go:${c.id}">${c.label} ${c.progress} &rsaquo;</span>`).join('')}</span>` : '';
  const badge = st && st.badge ? `<span class="cbadge ${st.tone}">${st.badge}</span>` : '';
  const head = `<span class="btop"><b>${e.name}</b><em>${dots}${chipLabel('rarity', e.rarity)}</em></span>
    <span class="ccat">${e.cat}${e.classes.length && e.tab !== 'builds' ? ' &middot; ' + e.classes.map((c) => chipLabel('cls', c)).join(', ') : ''}${badge}</span>`;
  // Open: only the title row toggles (and stays pinned while the body scrolls); the body is not a tap target.
  if (open) {
    return `<div class="centry open${st && st.tone ? ' ' + st.tone : ''}" style="--c:${color}" data-id="${e.id}">
      <button class="chead" data-act="cx:${e.id}">${head}</button>
      ${body}
    </div>`;
  }
  return `<div class="centry${st && st.tone ? ' ' + st.tone : ''}" style="--c:${color}" data-id="${e.id}">
    <button class="chead" data-act="cx:${e.id}">${head}${links}${body}</button>
  </div>`;
}

// A live preview under an open weapon entry (one at a time: the one opened last).
function previewHtml(e) {
  if (e.tab !== 'weapons' && e.tab !== 'evolve' && !e.fusePair) return '';
  if (state.previewId !== e.id) return `<span class="pvgo" role="button" data-act="pv:${e.id}">&#9654; Watch it in action</span>`;
  if (e.fusePair) return `<div class="pv"><canvas class="cprev" data-prev="${e.fusePair[0]}" data-pair="${e.fusePair.join(':')}" data-lv="99" data-act="noop"></canvas><div class="pvbar"><span class="pvlv on">Max, fused</span></div></div>`;
  const levels = previewLevels(e.id);
  const lv = levels.includes(state.previewLevel) ? state.previewLevel : levels[levels.length - 1];
  const chips = levels.map((l, i) => `<span class="pvlv${l === lv ? ' on' : ''}" role="button" data-act="pl:${e.id}:${l}">${i === levels.length - 1 && levels.length > 1 ? 'Max' : 'Lv ' + l}</span>`).join('');
  return `<div class="pv"><canvas class="cprev" data-prev="${e.id}" data-lv="${lv}" data-act="noop"></canvas><div class="pvbar">${chips}</div></div>`;
}

// Starts the preview for whichever entry shows a canvas, or stops it.
function mountPreview() {
  const c = document.querySelector('canvas.cprev');
  if (!c) { stopPreview(); return; }
  startPreview(c, c.dataset.prev, Number(c.dataset.lv), c.dataset.pair ? c.dataset.pair.split(':') : null);
}

function listHtml() {
  const list = filterEntries(entries, { tab: state.tab, ...state.filters, q: state.q });
  if (!list.length) return '<p class="hint">Nothing matches. Clear a filter or the search.</p>';
  const rows = liveRun ? sortByStatus(list, liveRun) : list.map((entry) => ({ entry, status: null }));
  return rows.map(entryHtml).join('');
}

export function showCompendium(overlays, { onClose, discovered, run = null, focus = null }) {
  liveRun = run;
  if (focus) {                                  // open straight onto a weapon's Evolve entry
    state.tab = 'evolve'; state.filters = {}; state.q = ''; state.open.add(focus); state.previewId = focus; state.previewLevel = 0;
  }
  entries = buildEntries(discovered);           // rebuilt on open so new discoveries show

  function render() {
    const facets = facetsFor(state.tab, entries);
    const active = facets.filter((f) => state.filters[f.key]).length;
    const tabs = TABS.map((t) => `<button class="ctab${t.id === state.tab ? ' on' : ''}" data-act="ct:${t.id}">${t.label}</button>`).join('');
    const rows = facets.map((f) => `<div class="cfacet"><span>${f.label}</span>${f.options.map((o) => {
      const on = state.filters[f.key] === o;
      const style = f.key === 'element' ? ` style="--e:${ELEMENT_COLOR[o]}"` : '';
      return `<button class="cchip${on ? ' on' : ''}${f.key === 'element' ? ' el' : ''}"${style} data-act="cf:${f.key}:${o}">${chipLabel(f.key, o)}</button>`;
    }).join('')}</div>`).join('');
    const el = overlays.show(
      `<h2>Compendium</h2>
       <div class="ctabs">${tabs}</div>
       <div class="csrow">
         <input class="csearch" type="search" placeholder="Search" value="${state.q.replace(/"/g, '&quot;')}" autocomplete="off" autocapitalize="off" spellcheck="false">
         ${facets.length ? `<button class="cftoggle${state.filtersOpen ? ' on' : ''}" data-act="ftog">Filters${active ? ` <i>${active}</i>` : ''}</button>` : ''}
       </div>
       ${state.filtersOpen ? `<div class="cfacets">${rows}</div>` : ''}
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

  // Scrolls the list so this entry's top is at the top: the same place whether it was just opened or closed.
  function alignToTop(id) {
    const list = document.querySelector('.clist');
    const entry = list && list.querySelector(`.centry[data-id="${id}"]`);
    if (!entry) return;
    const delta = entry.getBoundingClientRect().top - list.getBoundingClientRect().top;
    const room = list.scrollHeight - list.clientHeight - list.scrollTop;
    list.style.paddingBottom = delta > room ? `${Math.ceil(delta - room)}px` : '';          // near the end of the list: make room so it can still reach the top
    list.scrollTop += delta;
  }

  function redraw() {
    const list = document.querySelector('.clist');
    const top = list ? list.scrollTop : 0;
    if (list) { list.style.paddingBottom = ''; list.innerHTML = listHtml(); list.scrollTop = top; }
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
    } else if (kind === 'ftog') {
      state.filtersOpen = !state.filtersOpen;
      render();
    } else if (kind === 'go') {                                // a chip: jump to that weapon's entry on the Evolve tab
      state.tab = 'evolve';
      state.filters = {};
      state.q = '';
      state.open.add(a);
      state.previewId = a;
      state.previewLevel = 0;
      render();
      alignToTop(a);
    } else if (kind === 'cf') {
      state.filters[a] = state.filters[a] === b ? undefined : b;
      render();
    } else if (kind === 'cx') {
      const id = act.slice(3);
      if (state.open.has(id)) { state.open.delete(id); if (state.previewId === id) state.previewId = null; } else { state.open.add(id); state.previewId = id; state.previewLevel = 0; }
      redraw();
      alignToTop(id);                                                                          // open or close, the entry's title lands at the top of the list
    } else if (kind === 'pv') {
      state.previewId = act.slice(3);
      state.previewLevel = 0;
      redraw();
    } else if (kind === 'pl') {
      state.previewId = a;
      state.previewLevel = Number(b);
      redraw();
    }
  }

  render();
  if (focus) alignToTop(focus);
}
