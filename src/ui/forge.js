// Forge overlay: one card per owned weapon with Enhance / Reforge / Salvage. The run is frozen
// while it is open. Rules live in game/forge.js; this file only shows state and forwards taps.

import { ENHANCE, AFFIXES } from '../data/forge.js';
import { RARITIES } from '../data/rarities.js';
import { WEAPONS } from '../data/weapons.js';
import { recipesFor, checklist, canEvolve, evolve } from '../game/evolution.js';
import {
  enhance, enhanceCost, enhanceChance, canEnhance, downgradeChance,
  rollReforge, applyReforge, keepCurrent, reforgeCost, reforgeSlots, canReforge,
  temperOptions, chooseTemper, salvage, salvageValue, canSalvage,
} from '../game/forge.js';

function outcomeText(r) {
  if (!r.ok) return '';
  if (r.outcome === 'success') return `Enhanced to +${r.level}!`;
  if (r.outcome === 'downgrade') return `Failed. Dropped to +${r.level}.`;
  return `Failed. ${r.cost} ore lost.`;
}

export function showForge(overlays, run, { onDone, sfx = () => {} }) {
  let message = '';
  let tone = '';
  let confirming = null;                       // instanceId awaiting a second tap to salvage

  function weaponCard(inst) {
    const def = inst.def;
    const color = RARITIES[def.rarity].color;
    const pending = inst.pendingReforge;
    const rcost = reforgeCost(inst);
    const slots = reforgeSlots(inst).map((sl) => {
      const a = sl.affixId ? AFFIXES[sl.affixId] : null;
      const busy = pending && pending.slot === sl.index;
      const reachable = sl.index <= inst.affixes.length;       // fill slots in order
      return `<div class="fslot${busy ? ' busy' : ''}">
        <span class="fslot-text">${a ? `<b style="color:${RARITIES[a.rarity].color}">${a.name}</b> ${a.desc}` : '<i>Empty slot</i>'}</span>
        <button class="fbtn small" data-act="rfs:${inst.instanceId}:${sl.index}" ${canReforge(run, inst) && reachable ? '' : 'disabled'}>${a ? 'Reforge' : 'Forge'}<small>${rcost} ore</small></button>
      </div>`;
    }).join('');
    const options = pending ? `<div class="fpick">
        <div class="fpick-top"><b>Choose an effect</b></div>
        ${pending.options.map((id, i) => {
          const a = AFFIXES[id];
          return `<button class="fopt" style="--c:${RARITIES[a.rarity].color}" data-act="rfp:${inst.instanceId}:${i}"><b>${a.name}</b><span>${a.desc}</span></button>`;
        }).join('')}
        <button class="fbtn" data-act="rfk:${inst.instanceId}">Keep current</button>
      </div>` : '';
    const tempers = inst.pendingTemper ? `<div class="fpick temper">
        <div class="fpick-top"><b>Temper at +${inst.pendingTemper}</b> choose one</div>
        ${temperOptions(inst, inst.pendingTemper).map((t, i) => `<button class="fopt" style="--c:#ffb45e" data-act="tmp:${inst.instanceId}:${i}"><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}
      </div>` : '';
    const chosen = Object.entries(inst.tempers).map(([lvl, t]) => `+${lvl} ${t.name}`).join(' · ');
    const tags = inst.addTags.length ? ` · ${inst.addTags.join(' + ')}` : '';

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
        <div class="fevo-top"><b>${r.with ? `Fuse with ${WEAPONS[r.with === inst.weaponId ? r.from : r.with].name}` : 'Evolve'}: ${WEAPONS[r.into].name}</b></div>
        <ul>${list.map((c) => `<li class="${c.ok ? 'ok' : 'no'}">${c.ok ? '✓' : '✗'} ${c.text}</li>`).join('')}</ul>
        <button class="fbtn evo" data-act="evo:${inst.instanceId}:${r.id}" ${ready ? '' : 'disabled'}>Combine</button>
      </div>`;
    }).join('');

    return `<div class="fcard" style="--c:${color}">
      <div class="ftop"><b>${def.name}</b><em>Lv ${inst.level}${inst.enhance ? ` · +${inst.enhance}` : ''}</em></div>
      ${chosen || tags ? `<div class="faff">${chosen}${tags}</div>` : ''}
      ${tempers}
      ${slots}
      ${options}
      <div class="frow">
        <button class="fbtn" data-act="enh:${inst.instanceId}" ${canEnhance(run, inst) ? '' : 'disabled'}>${inst.pendingTemper ? 'Choose a temper' : enhLabel}</button>
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
      if (r.ok && r.outcome === 'success' && inst.pendingTemper) message = `Enhanced to +${r.level}! Choose a temper.`;
      tone = r.outcome === 'success' ? 'good' : 'bad';
      if (r.ok) sfx(r.outcome === 'success' ? 'forge' : 'fail');
    } else if (kind === 'rfs') {
      const r = rollReforge(run, inst, Number(extra));
      if (r.ok) sfx('forge');
      message = r.ok ? 'Pick one of the three, or keep what you have.' : '';
      tone = 'good';
    } else if (kind === 'rfp') {
      const r = applyReforge(run, inst, Number(extra));
      if (r.ok) sfx('forge');
      message = r.ok ? `${AFFIXES[r.affix].name}: ${AFFIXES[r.affix].desc}` : '';
      tone = 'good';
    } else if (kind === 'rfk') {
      keepCurrent(inst);
      message = 'Kept the current effect.';
      tone = '';
    } else if (kind === 'tmp') {
      const r = chooseTemper(run, inst, Number(extra));
      if (r.ok) sfx('evolve');
      message = r.ok ? `${r.temper.name}: ${r.temper.desc}` : '';
      tone = 'good';
    } else if (kind === 'evo') {
      const recipe = recipesFor(inst).find((r) => r.id === extra);
      const r = recipe ? evolve(run, inst, recipe) : { ok: false };
      if (r.ok) sfx('evolve');
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
