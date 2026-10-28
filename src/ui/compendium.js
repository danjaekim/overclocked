// The compendium (docs/overclocked-spec.md, "Compendium"): how chains run, every piece and rule card, the element
// reactions (filled in as you see them happen in a run) and the rigs of your past runs. Opened from the pause menu.

import { PIECES, RULES, REACTION_INFO, SIGNATURE, SIG_LEVELS, EVERY } from '../rig/pieces.js';
import { fmtTime } from './overlay.js';
import { icon } from './rig-editor.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const TABS = [['how', 'How it works'], ['pieces', 'Pieces'], ['rules', 'Rule cards'], ['reactions', 'Reactions'], ['runs', 'Past runs']];

const HOW = [
  ['Read left to right', 'A chain is a rule card and a row of slots. When the rule card fires, the chain runs its pieces from the left, one after another.'],
  ['Modifiers wait for a weapon', 'A modifier is held and applies to the next weapon only, then it is spent. Several in a row all apply, and the order of elements decides the reaction.'],
  ['Triggers own what follows', `A trigger attaches to the weapon just before it. Everything to its right is its payload, which runs later, from where the event happens. A payload hits harder (x1.3) and costs a little less. Every ${EVERY}rd runs it every ${EVERY}rd time.`],
  ['Energy ends chain reactions', 'Every piece costs energy each time it runs. A payload pays from the same pool as the activation that started it. When the pool is empty the chain stops until its next activation.'],
  ['Levels', 'Each level adds 10% damage. Levels 3 and 5 add an effect of the piece\'s own.'],
];

function piecesHtml() {
  const group = (type, label) => `<h3>${label}</h3>` + Object.entries(PIECES).filter(([, p]) => p.type === type).map(([id, p]) => {
    const sig = SIGNATURE[id];
    return `<div class="cmp"><span class="cmpi ${p.type}">${icon(p, 26)}</span><span><b>${esc(p.name)}</b> <small>${p.cost} energy</small><br>${esc(p.desc)}${sig ? `<br><em>Levels ${SIG_LEVELS.join(' and ')}: ${esc(sig.text)}</em>` : ''}</span></div>`;
  }).join('');
  return group('weapon', 'Weapons') + group('modifier', 'Modifiers') + group('trigger', 'Triggers');
}

const rulesHtml = () => Object.values(RULES).map((r) => `<div class="cmp"><span><b>${esc(r.name)}</b><br>${esc(r.desc)}</span></div>`).join('');

function reactionsHtml(found) {
  const ids = Object.keys(REACTION_INFO);
  const n = ids.filter((id) => found.includes(id)).length;
  return `<p class="sub">${n} of ${ids.length} found. A reaction is found the first time it happens in a run.</p>` + ids.map((id) => {
    const r = REACTION_INFO[id];
    return found.includes(id)
      ? `<div class="cmp"><span><b>${esc(r.name)}</b> <small>${esc(r.recipe)}</small><br>${esc(r.desc)}</span></div>`
      : `<div class="cmp dim"><span><b>???</b><br>Two element modifiers next to each other. Keep trying.</span></div>`;
  }).join('');
}

function runsHtml(history) {
  const rows = history.filter((e) => e.rig).slice(-12).reverse();
  if (!rows.length) return '<p class="sub">Finish a run and its rig shows up here.</p>';
  return rows.map((e) => {
    const chains = e.rig.chains.map((c, i) => `<div class="cmprow"><b>${'ABCD'[i]}</b> <small>${esc((RULES[c.rule] || { name: c.rule }).name)}</small> ${c.slots.map((id) => (PIECES[id] ? `<i class="${PIECES[id].type}">${esc(PIECES[id].short)}${e.rig.levels[id] > 1 ? ' ' + e.rig.levels[id] : ''}</i>` : '')).join('')}</div>`).join('');
    return `<div class="cmp col"><span><b>${e.won ? 'Survived' : 'Fell'}</b> <small>${fmtTime(e.time)} · level ${e.level} · ${e.kills} kills</small></span>${chains}</div>`;
  }).join('');
}

export function showCompendium(overlays, { save, onBack }) {
  let tab = 'how';
  const body = () => {
    if (tab === 'how') return HOW.map(([h, t], i) => `<div class="cmp"><span><b>${i + 1}. ${esc(h)}</b><br>${esc(t)}</span></div>`).join('');
    if (tab === 'pieces') return piecesHtml();
    if (tab === 'rules') return rulesHtml();
    if (tab === 'reactions') return reactionsHtml(save.data.discovered.reactions);
    return runsHtml(save.data.history);
  };
  const render = () => overlays.show(`
    <h2>Compendium</h2>
    <div class="cmptabs">${TABS.map(([k, l]) => `<button class="rbtn${k === tab ? ' primary' : ''}" data-act="tab:${k}">${l}</button>`).join('')}</div>
    <div class="cmpbody">${body()}</div>
    <button class="btn" data-act="back">Back</button>`,
  (act) => {
    if (act === 'back') onBack();
    else if (act.startsWith('tab:')) { tab = act.slice(4); render(); }
  }, 'compendium');
  render();
}
