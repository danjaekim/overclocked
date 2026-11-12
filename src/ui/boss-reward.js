// The boss reward screen (docs/plan-v13-boss-rewards.md): after the Warlord and the Seer, the pilot picks its reward.
//   pick 'piece'       a piece you own (Overcharge)
//   pick 'chain'       a chain (Feedback loop)
//   pick 'chain+rule'  a chain, then a rule card for it (Retrofit)
// Tap a card to select it, tap it again (or the button) to confirm.

import { PIECES, OVERCHARGE, RULES, CHAIN_NAMES, CHAIN_COLORS } from '../rig/pieces.js';
import { REWARDS } from '../data/boss-rewards.js';
import { retrofitRules } from '../rig/rewards.js';
import { chassisName } from '../rig/chassis.js';
import { icon } from './rig-editor.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// opts: { reward: id, n: 1 | 2, rig, choices: [piece ids | chain indexes], onPick({ piece?, chain?, rule? }) }
export function showBossReward(overlays, { reward, n = 1, rig, choices, onPick }) {
  const def = REWARDS[reward];
  let step = def.pick === 'piece' ? 'piece' : 'chain';
  let chain = null;                         // the chain chosen so far (Retrofit's second step)
  let sel = null;

  const pieceCard = (id) => {
    const p = PIECES[id];
    return `<button class="rcard ${p.type} rwcard${id === sel ? ' sel' : ''}" data-act="pick:${id}">${icon(p, 30)}<b>${esc(p.name)}</b><span>${esc(p.type)}</span><em>${esc(def.note ? def.note(id) : OVERCHARGE[id].text)}</em></button>`;
  };
  const chainCard = (i) => {
    const c = rig.chains[i];
    const pieces = c.slots.filter(Boolean).map((id) => PIECES[id].short).join(' ');
    const has = [...(c.extra || []).map((r) => `+${RULES[r].name}`), ...(c.loop ? ['loop'] : [])].join(' ');
    return `<button class="rcard rwchain${String(i) === String(sel) ? ' sel' : ''}" data-act="pick:${i}" style="border-color:${CHAIN_COLORS[i]}"><b>${CHAIN_NAMES[i]} · ${esc(chassisName(c))}</b><span>${esc(RULES[c.rule].name)}${has ? ' ' + esc(has) : ''}</span><em>${esc(pieces || 'empty')}</em></button>`;
  };
  const ruleCard = (r) => `<button class="rcard rwchain${r === sel ? ' sel' : ''}" data-act="pick:${r}"><b>${esc(RULES[r].name)}</b><span>rule card</span><em>${esc(RULES[r].desc)}</em></button>`;

  const lists = () => {
    if (step === 'piece') return { items: choices.map(pieceCard), valid: choices, label: 'Pick a piece', verb: (v) => `${def.verb || def.name} ${PIECES[v].name}`, cols: 3 };
    if (step === 'chain') return { items: choices.map(chainCard), valid: choices.map(String), label: 'Pick a chain', verb: (v) => `${def.name}: chain ${CHAIN_NAMES[v]}`, cols: 1 };
    const rules = retrofitRules(rig, chain);
    return { items: rules.map(ruleCard), valid: rules, label: 'Pick a rule card', verb: (v) => `Add ${RULES[v].name} to chain ${CHAIN_NAMES[chain]}`, cols: 1 };
  };

  let el = null;
  const finish = (v) => {
    if (step === 'piece') { onPick({ piece: v }); return; }
    if (step === 'chain' && def.pick === 'chain') { onPick({ chain: Number(v) }); return; }
    if (step === 'chain') { chain = Number(v); step = 'rule'; sel = null; render(); return; }
    onPick({ chain, rule: v });
  };
  const render = () => {
    const l = lists();
    const intro = step === 'rule' ? `Chain ${CHAIN_NAMES[chain]}: which rule card does it take?` : `${n === 1 ? 'The Warlord is down.' : 'The Seer is down.'} ${def.desc}`;
    el = overlays.show(
      `<h2 class="ribbon">${esc(def.name)}</h2>
       <p class="rwdesc">${esc(intro)}</p>
       <div class="rwlist cols${l.cols}">${l.items.join('')}</div>
       <div class="pbar"><button class="btn primary" data-act="go"${sel === null ? ' disabled' : ''}>${sel === null ? esc(l.label) : esc(l.verb(sel))}</button></div>`,
      (act) => {
        const cur = lists();
        if (act === 'go') { if (sel !== null) finish(sel); return; }
        if (!act.startsWith('pick:')) return;
        const v = act.slice(5);
        if (!cur.valid.map(String).includes(v)) return;
        if (String(sel) === v) { finish(v); return; }
        sel = v;
        for (const c of el.querySelectorAll('.rcard')) c.classList.toggle('sel', c.dataset.act === `pick:${v}`);
        const b = el.querySelector('[data-act="go"]');
        b.disabled = false;
        b.textContent = cur.verb(v);
      },
      'reward'
    );
  };
  render();
  return el;
}
