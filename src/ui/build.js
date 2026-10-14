// The build panel: everything you own and how it is performing. One renderer shared by the
// pause menu, the level-up screen (so upgrades can be judged against the build) and the end
// screen's damage breakdown. Pure HTML strings; the caller mounts them in an overlay.

import { RARITIES } from '../data/rarities.js';
import { AFFIXES } from '../data/forge.js';
import { RESONANCE } from '../data/resonance.js';
import { reforgeSlots } from '../game/forge.js';
import { statsSnapshot } from '../game/run-stats.js';

export function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return Math.round(n / 1e3) + 'k';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

const pct = (v) => Math.round(v * 100) + '%';

function keyStats(run) {
  const s = run.player.stats;
  const cdr = 1 / s.get('cooldown');
  const rows = [
    ['Health', `${Math.ceil(run.player.hp)}/${Math.round(s.get('maxHp'))}`],
    ['Damage', pct(s.get('damage'))],
    ['Speed', cdr.toFixed(2) + 'x'],
    ['Crit', `${pct(s.get('critChance'))} · ${s.get('critMult').toFixed(2)}x`],
    ['Area', pct(s.get('area'))],
    ['Move', Math.round(s.get('moveSpeed'))],
    ['Armor', Math.round(s.get('armor'))],
    ['Luck', Math.round(s.get('luck'))],
  ];
  return `<div class="bstats">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
}

function weaponRow(inst, rec, time) {
  const color = RARITIES[inst.def.rarity].color;
  const tags = ['fire', 'frost', 'storm', 'close'].filter((t) => inst.tags.set.has(t));
  const extra = [
    ...Object.entries(inst.tempers).map(([lvl, t]) => `+${lvl} ${t.name}`),
    ...reforgeSlots(inst).filter((sl) => sl.affixId).map((sl) => AFFIXES[sl.affixId].name),
  ];
  const perf = rec
    ? `<div class="bperf"><b>${fmtNum(rec.dmg)}</b> dmg · <b>${fmtNum(rec.dmg / Math.max(1, time))}</b>/s · ${rec.kills} kills</div>`
    : '<div class="bperf">no damage yet</div>';
  return `<div class="brow" style="--c:${color}">
    <div class="btop"><b>${inst.def.name}</b><em>Lv ${inst.level}${inst.enhance ? ` · +${inst.enhance}` : ''}</em></div>
    <div class="bsub">${tags.join(' · ')}${extra.length ? (tags.length ? ' · ' : '') + extra.join(', ') : ''}</div>
    ${perf}
  </div>`;
}

function itemRow(item, text) {
  const color = RARITIES[item.def.rarity].color;
  return `<div class="brow slim" style="--c:${color}"><div class="btop"><b>${item.def.name}</b><em>Lv ${item.level}</em></div><div class="bsub">${text}</div></div>`;
}

function causeBars(causes, total) {
  if (!causes.length || total <= 0) return '';
  return causes.map((c) => `<div class="bbar"><span>${c.name}</span><i style="--w:${Math.max(2, Math.round((c.dmg / total) * 100))}%"></i><b>${pct(c.dmg / total)}</b></div>`).join('');
}

// Everything in the run so far. `withDamage` adds the DPS lines and the damage-by-source bars.
export function buildHtml(run, { withDamage = true } = {}) {
  const p = run.player;
  const snap = withDamage ? statsSnapshot(run) : null;
  const byId = snap ? new Map([...run.stats.src.entries()]) : new Map();
  const weapons = p.weapons.map((w) => weaponRow(w, byId.get(w.instanceId), run.time)).join('');
  const passives = p.passives.map((it) => itemRow(it, it.def.levelText[it.level - 1] || it.def.desc)).join('');
  const perks = p.perks.map((it) => itemRow(it, it.def.levelText[it.level - 1] || it.def.desc)).join('');
  const titles = run.titles.map((t) => `<div class="brow slim"><div class="btop"><b>${t.def.name}</b></div><div class="bsub">${t.def.desc}</div></div>`).join('');
  const res = run.resonance.map((r) => {
    const def = RESONANCE[r.tag];
    return `<div class="brow slim"><div class="btop"><b>${r.name} ${r.tier === 2 ? 'II' : 'I'}</b></div><div class="bsub">${def.text.slice(0, r.tier).join('; ')}</div></div>`;
  }).join('');
  const sec = (h, body) => (body ? `<h3>${h}</h3>${body}` : '');
  const dmg = snap
    ? `<div class="bdps"><div><span>DPS now</span><b>${fmtNum(snap.recentDps)}</b></div><div><span>Average</span><b>${fmtNum(snap.avgDps)}</b></div><div><span>Peak</span><b>${fmtNum(snap.peakDps)}</b></div><div><span>Total</span><b>${fmtNum(snap.total)}</b></div></div>${causeBars(snap.causes, snap.total)}`
    : '';
  return `${keyStats(run)}
    ${dmg ? sec('Damage', dmg) : ''}
    ${sec('Weapons', weapons)}
    ${sec('Passives', passives)}
    ${sec('Techniques', perks)}
    ${sec('Resonance', res)}
    ${sec('Titles', titles)}`;
}

// The end-of-run breakdown, from the summary snapshot (the run is gone by then).
export function resultsDamageHtml(stats) {
  if (!stats || stats.total <= 0) return '';
  const rows = stats.weapons.map((w) => `<div class="bbar wide"><span>${w.name}${w.gone ? ' (salvaged)' : ''}<small>${w.kills} kills · ${fmtNum(w.dps)} dps</small></span><i style="--w:${Math.max(2, Math.round((w.dmg / stats.total) * 100))}%"></i><b>${fmtNum(w.dmg)}</b></div>`).join('');
  return `<div class="build-wrap results">
    <h3>Damage</h3>
    <div class="bdps"><div><span>Average</span><b>${fmtNum(stats.avgDps)}</b></div><div><span>Peak</span><b>${fmtNum(stats.peakDps)}</b></div><div><span>Total</span><b>${fmtNum(stats.total)}</b></div></div>
    <h3>By weapon</h3>${rows}
    <h3>By source</h3>${causeBars(stats.causes, stats.total)}
  </div>`;
}

export function showBuild(overlays, run, { onBack, backLabel = 'Back' }) {
  overlays.show(
    `<h2>Your build</h2>
     <div class="build-wrap">${buildHtml(run)}</div>
     <button class="btn primary" data-act="back">${backLabel}</button>`,
    (act) => { if (act === 'back') onBack(); },
    'build'
  );
}

// One compact line of what you own with levels, for the level-up screen ("Ember Bow 3 · Keen Whetstone 2 ...").
export function ownedLine(run) {
  const p = run.player;
  const part = (list) => list.map((it) => `<b>${it.def.name}</b> ${it.level}`);
  return [...part(p.weapons), ...part(p.passives), ...part(p.perks)].join(' · ');
}
