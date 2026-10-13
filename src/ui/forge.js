// Forge overlay: one card per owned weapon with Enhance / Reforge / Salvage. The run is frozen
// while it is open. Rules live in game/forge.js; this file only shows state and forwards taps.

import { ENHANCE, AFFIXES } from '../data/forge.js';
import { RARITIES } from '../data/rarities.js';
import { WEAPONS } from '../data/weapons.js';
import { recipesFor, checklist, canEvolve, evolve } from '../game/evolution.js';
import {
  enhance, enhanceCost, enhanceChance, canEnhance, downgradeChance,
  reforge, reforgeCost, canReforge, salvage, salvageValue, canSalvage,
} from '../game/forge.js';

function outcomeText(r) {
  if (!r.ok) return '';
  if (r.outcome === 'success') return `Enhanced to +${r.level}!`;
  if (r.outcome === 'downgrade') return `Failed. Dropped to +${r.level}.`;
  return `Failed. ${r.cost} ore lost.`;
}

export function showForge(overlays, run, { onDone }) {
  let message = '';
  let tone = '';
  let confirming = null;                       // instanceId awaiting a second tap to salvage

  function weaponCard(inst) {
    const def = inst.def;
    const color = RARITIES[def.rarity].color;
    const affixes = inst.affixes.length
      ? inst.affixes.map((id) => `<span title="${AFFIXES[id].desc}">${AFFIXES[id].name}</span>`).join(' · ')
      : 'No affixes';
    const affixDesc = inst.affixes.map((id) => AFFIXES[id].desc).join(', ');

    const maxed = inst.enhance >= ENHANCE.maxLevel;
    const risk = downgradeChance(run, inst) > 0 ? ' <i>risk</i>' : '';
    const enhLabel = maxed
      ? 'Max'
      : `Enhance +${inst.enhance + 1}<small>${enhanceCost(run, inst)} ore · ${Math.round(enhanceChance(inst) * 100)}%${risk}</small>`;
    const salLabel = confirming === inst.instanceId
      ? 'Sure?'
      : `Salvage<small>+${salvageValue(inst)} ore</small>`;

    const evo = recipesFor(inst).map((r) => {
      const list = checklist(run, inst, r);
      const ready = canEvolve(run, inst, r);
      return `<div class="fevo${ready ? ' ready' : ''}">
        <div class="fevo-top"><b>Evolve: ${WEAPONS[r.into].name}</b></div>
        <ul>${list.map((c) => `<li class="${c.ok ? 'ok' : 'no'}">${c.ok ? '✓' : '✗'} ${c.text}</li>`).join('')}</ul>
        <button class="fbtn evo" data-act="evo:${inst.instanceId}:${r.id}" ${ready ? '' : 'disabled'}>Combine</button>
      </div>`;
    }).join('');

    return `<div class="fcard" style="--c:${color}">
      <div class="ftop"><b>${def.name}</b><em>Lv ${inst.level}${inst.enhance ? ` · +${inst.enhance}` : ''}</em></div>
      <div class="faff">${affixes}</div>
      ${affixDesc ? `<div class="fdesc">${affixDesc}</div>` : ''}
      <div class="frow">
        <button class="fbtn" data-act="enh:${inst.instanceId}" ${canEnhance(run, inst) ? '' : 'disabled'}>${enhLabel}</button>
        <button class="fbtn" data-act="ref:${inst.instanceId}" ${canReforge(run, inst) ? '' : 'disabled'}>Reforge<small>${reforgeCost(inst)} ore</small></button>
        <button class="fbtn${confirming === inst.instanceId ? ' warn' : ''}" data-act="sal:${inst.instanceId}" ${canSalvage(run) ? '' : 'disabled'}>${salLabel}</button>
      </div>
      ${evo}
    </div>`;
  }

  function render() {
    const prev = document.querySelector('.forge-list');
    const scroll = prev ? prev.scrollTop : 0;
    const el = overlays.show(
      `<h2>Forge</h2>
       <p class="sub">Ore <b class="ore">${run.ore}</b></p>
       <p class="fmsg ${tone}">${message || '&nbsp;'}</p>
       <div class="forge-list">${run.player.weapons.map(weaponCard).join('')}</div>
       <button class="btn primary" data-act="done">Return to battle</button>`,
      onAct,
      'forge'
    );
    const list = el && el.querySelector('.forge-list');
    if (list) list.scrollTop = scroll;
  }

  function find(id) {
    return run.player.weapons.find((w) => w.instanceId === Number(id));
  }

  function onAct(act) {
    if (act === 'done') return onDone();
    const [kind, id, extra] = act.split(':');
    const inst = find(id);
    if (!inst) return;
    if (kind !== 'sal') confirming = null;
    if (kind === 'enh') {
      const r = enhance(run, inst);
      message = outcomeText(r);
      tone = r.outcome === 'success' ? 'good' : 'bad';
    } else if (kind === 'ref') {
      const r = reforge(run, inst);
      message = r.ok ? `Reforged: ${r.affixes.map((a) => AFFIXES[a].name).join(', ') || 'nothing'}` : '';
      tone = 'good';
    } else if (kind === 'evo') {
      const recipe = recipesFor(inst).find((r) => r.id === extra);
      const r = recipe ? evolve(run, inst, recipe) : { ok: false };
      message = r.ok ? `${r.into.name} forged!` : '';
      tone = 'good';
    } else if (kind === 'sal') {
      if (confirming !== inst.instanceId) {
        confirming = inst.instanceId;
        message = `Tap again to salvage ${inst.def.name}`;
        tone = 'bad';
      } else {
        const r = salvage(run, inst);
        confirming = null;
        message = r.ok ? `Salvaged for ${r.ore} ore` : '';
        tone = 'good';
      }
    }
    render();
  }

  render();
}
