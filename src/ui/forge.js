// Forge overlay: one card per owned weapon with Enhance / Reforge / Salvage. The run is frozen
// while it is open. Rules live in game/forge.js; this file only shows state and forwards taps.

import { ENHANCE, AFFIXES } from '../data/forge.js';
import { RARITIES } from '../data/rarities.js';
import { WEAPONS } from '../data/weapons.js';
import { recipesFor, checklist, canEvolve, evolve } from '../game/evolution.js';
import { graftOptions, graft } from '../game/graft.js';
import { GRAFT } from '../data/grafts.js';
import { weaponName } from '../game/weapons.js';
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

export function showForge(overlays, run, { onDone, onGraft = () => {}, sfx = () => {} }) {
  let message = '';
  let tone = '';
  let confirming = null;                       // instanceId awaiting a second tap to salvage
  let confirmingGraft = null;                  // 'host:donor' awaiting a second tap to graft
  let tab = 'weapons';                         // 'weapons' | 'graft': grafting has its own tab so it is never off-screen
  let announced = false;

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

    const recipes = recipesFor(inst);
    const branches = recipes.filter((r) => !r.with).length > 1;     // two evolutions to choose between
    const evo = recipes.map((r) => {
      const list = checklist(run, inst, r);
      const ready = canEvolve(run, inst, r);
      return `<div class="fevo${ready ? ' ready' : ''}">
        <div class="fevo-top"><b>${r.with ? `Fuse with ${WEAPONS[r.with === inst.weaponId ? r.from : r.with].name}` : branches && !r.with ? 'Branch' : 'Evolve'}: ${WEAPONS[r.into].name}</b></div>
        <div class="fevo-desc">${WEAPONS[r.into].desc}</div>
        <ul>${list.map((c) => `<li class="${c.ok ? 'ok' : 'no'}">${c.ok ? '✓' : '✗'} ${c.text}</li>`).join('')}</ul>
        ${branches && !r.with ? '<div class="fevo-lock">Combining locks the other branch.</div>' : ''}
        <button class="fbtn evo" data-act="evo:${inst.instanceId}:${r.id}" ${ready ? '' : 'disabled'}>Combine</button>
      </div>`;
    }).join('');

    return `<div class="fcard" style="--c:${color}">
      <div class="ftop"><b>${weaponName(inst)}</b><em>Lv ${inst.level}${inst.enhance ? ` · +${inst.enhance}` : ''}</em></div>
      ${inst.graft ? `<div class="fgraft">Grafted: ${inst.graft.desc}</div>` : ''}
      ${chosen || tags ? `<div class="faff">${chosen}${tags}</div>` : ''}
      ${slots}
      <div class="frow">
        <button class="fbtn" data-act="enh:${inst.instanceId}" ${canEnhance(run, inst) ? '' : 'disabled'}>${inst.pendingTemper ? 'Choose a temper' : enhLabel}</button>
        <button class="fbtn${confirming === inst.instanceId ? ' warn' : ''}" data-act="sal:${inst.instanceId}" ${canSalvage(run) ? '' : 'disabled'}>${salLabel}</button>
      </div>
      ${evo}
    </div>`;
  }

  // The pick lists (reforge options, tempers) open as a panel over the whole forge, so they are on
  // screen the moment they appear however far the weapon list is scrolled.
  function pickModal() {
    for (const inst of run.player.weapons) {
      const name = `<b>${weaponName(inst)}</b>`;
      if (inst.pendingReforge) {
        const opts = inst.pendingReforge.options.map((id, i) => {
          const a = AFFIXES[id];
          return `<button class="fopt" style="--c:${RARITIES[a.rarity].color}" data-act="rfp:${inst.instanceId}:${i}"><b>${a.name}</b><span>${a.desc}</span></button>`;
        }).join('');
        return `<div class="fmodal"><div class="fpick"><div class="fpick-top">${name}: choose an effect</div>${opts}<button class="fbtn" data-act="rfk:${inst.instanceId}">Keep current</button></div></div>`;
      }
      if (inst.pendingTemper) {
        const opts = temperOptions(inst, inst.pendingTemper).map((t, i) => `<button class="fopt" style="--c:#ffb45e" data-act="tmp:${inst.instanceId}:${i}"><b>${t.name}</b><span>${t.desc}</span></button>`).join('');
        return `<div class="fmodal"><div class="fpick temper"><div class="fpick-top">${name}: temper at +${inst.pendingTemper}, choose one</div>${opts}</div></div>`;
      }
    }
    return '';
  }

  // The Graft tab: every pair of evolved weapons you could combine, masterworks first.
  function graftOpts() {
    return graftOptions(run).sort((a, b) => (b.preview.masterwork ? 1 : 0) - (a.preview.masterwork ? 1 : 0));
  }

  function graftPanel(opts) {
    const evolved = run.player.weapons.filter((w) => w.def.rarity === 'evolved').length;
    const head = `<p class="fghint">Merge two evolved weapons into one stronger weapon. The second is consumed, costs ${GRAFT.cost} starsteel, and a weapon can be grafted once. Starsteel ${run.starsteel}.</p>`;
    if (!opts.length) {
      const why = evolved < 2 ? `You have ${evolved} evolved weapon${evolved === 1 ? '' : 's'}; grafting needs two.` : run.starsteel < GRAFT.cost ? 'You need starsteel.' : 'Every evolved weapon has already been grafted, or no pair fits.';
      return `<div class="fgraft-panel">${head}<p class="fgnone">${why}</p></div>`;
    }
    const cards = opts.map((o) => {
      const key = `${o.host.instanceId}:${o.donor.instanceId}`;
      const m = o.preview.masterwork;
      return `<div class="fgopt${m ? ' master' : ''}">
        <div class="fgtop"><b>${m ? '✦ ' : ''}${o.preview.name}</b></div>
        <div class="fgdesc">${o.preview.desc}</div>
        <div class="fgnote">${o.host.def.name} takes in ${o.donor.def.name}, which is consumed. ${GRAFT.cost} starsteel.</div>
        <button class="fbtn${confirmingGraft === key ? ' warn' : ''}" data-act="gft:${o.host.instanceId}:${o.donor.instanceId}" ${o.ok ? '' : 'disabled'}>${confirmingGraft === key ? 'Sure?' : 'Graft'}</button>
      </div>`;
    }).join('');
    return `<div class="fgraft-panel">${head}${cards}</div>`;
  }

  function render() {
    const prev = document.querySelector('.forge-list');
    const scroll = prev ? prev.scrollTop : 0;
    const opts = graftOpts();
    const ready = opts.filter((o) => o.ok).length;                       // grafts you can make right now
    const evoReady = run.player.weapons.some((w) => recipesFor(w).some((r) => canEvolve(run, w, r)));
    if (!announced) {
      announced = true;
      if (ready && !message) { message = ready === 1 ? 'A graft is possible: see the Graft tab.' : `${ready} grafts are possible: see the Graft tab.`; tone = 'good'; }
    }
    const tabs = `<div class="ftabs">
        <button class="ftab${tab === 'weapons' ? ' on' : ''}" data-act="tab:weapons">Weapons${evoReady ? ' <i class="fdot"></i>' : ''}</button>
        <button class="ftab graft${tab === 'graft' ? ' on' : ''}${ready ? ' ready' : ''}" data-act="tab:graft">Graft${ready ? ` <i class="fbadge">${ready}</i>` : ''}</button>
      </div>`;
    const el = overlays.show(
      `<h2>Forge</h2>
       <p class="sub">Ore <b class="ore">${run.ore}</b> · Starsteel <b class="ore">${run.starsteel}</b></p>
       <p class="fmsg ${tone}">${message || '&nbsp;'}</p>
       ${tabs}
       <div class="forge-list">${tab === 'graft' ? graftPanel(opts) : run.player.weapons.map(weaponCard).join('')}</div>
       <button class="btn primary" data-act="done">Return to battle</button>
       ${pickModal()}`,
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
    if (kind === 'tab') {
      tab = id;
      confirming = null;
      confirmingGraft = null;
      return render();
    }
    const inst = find(id);
    if (!inst) return;
    if (kind !== 'sal') confirming = null;
    if (kind !== 'gft') confirmingGraft = null;
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
    } else if (kind === 'gft') {
      const donor = find(extra);
      const key = `${id}:${extra}`;
      if (confirmingGraft !== key) {
        confirmingGraft = key;
        message = `Tap again to graft. ${donor ? donor.def.name : 'The donor'} is consumed.`;
        tone = 'bad';
      } else {
        confirmingGraft = null;
        const r = donor ? graft(run, inst, donor) : { ok: false };
        if (r.ok) { sfx('evolve'); onGraft(r); }
        message = r.ok ? `${r.name}!` : '';
        tone = 'good';
      }
    } else if (kind === 'sal') {
      if (confirming !== inst.instanceId) {
        confirming = inst.instanceId;
        message = `Tap again to salvage ${weaponName(inst)}`;
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
