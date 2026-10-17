// Level-up offer generation (docs/architecture.md §5.6). PURE: depends only on its arguments
// and the data files, so the same state + same rng state always gives the same offers.
//
// state = {
//   classId,
//   luck,
//   weapons:  [{ weaponId, level, instanceId }],
//   passives: [{ id, level }],
//   perks:    [{ id, level }],     (optional)
//   ownedTags:[tag],               (optional) tags on owned weapon instances, for perk requirements/affinity
//   titles:   [id],                (optional)
//   banished: [id],                (optional) never offered
// }
//
// An offer is { kind, id, name, rarity, toLevel, isNew, desc, instanceId?, evo? } (evo: the weapon an
// evolution in reach would make, when this offer is something it still needs) with kind one of
// 'weapon_new' | 'weapon_up' | 'passive_new' | 'passive_up' | 'perk_new' | 'perk_up' | 'title_new' | 'heal'.

import { WEAPONS } from '../data/weapons.js';
import { PASSIVES } from '../data/passives.js';
import { PERKS } from '../data/perks.js';
import { meetsRequires } from './perks.js';
import { TITLES } from '../data/titles.js';
import { RARITIES } from '../data/rarities.js';
import { SLOTS, LEVELUP } from '../data/progression.js';
import { EVOLUTIONS } from '../data/evolutions.js';

export const EVO_BOOST = 1.8;          // offer weight multiplier for something an evolution still needs
const EVO_CLOSE = 3;                   // a recipe counts as in reach once its weapon is within this many levels

export const HEAL_OFFER = {
  kind: 'heal',
  id: 'rest',
  name: 'Rest',
  rarity: 'common',
  toLevel: 0,
  isNew: false,
  desc: `Recover ${Math.round(LEVELUP.healFraction * 100)}% of your max HP.`,
};

export function buildCandidates(state) {
  const out = [];
  const ownedWeapons = new Map(state.weapons.map((w) => [w.weaponId, w]));
  const ownedPassives = new Map(state.passives.map((p) => [p.id, p]));

  for (const w of state.weapons) {
    const def = WEAPONS[w.weaponId];
    if (w.level >= def.maxLevel) continue;
    out.push({
      kind: 'weapon_up', id: w.weaponId, instanceId: w.instanceId, name: def.name, rarity: def.rarity,
      toLevel: w.level + 1, isNew: false, owned: true, desc: def.levelText[w.level - 1],
    });
  }
  if (state.weapons.length < SLOTS.weapons) {
    for (const [id, def] of Object.entries(WEAPONS)) {
      if (ownedWeapons.has(id) || def.pool === false) continue;
      if (def.class != null && def.class !== state.classId) continue;
      out.push({
        kind: 'weapon_new', id, name: def.name, rarity: def.rarity,
        toLevel: 1, isNew: true, owned: false, desc: def.desc || '',
      });
    }
  }

  for (const p of state.passives) {
    const def = PASSIVES[p.id];
    if (p.level >= def.maxLevel) continue;
    out.push({
      kind: 'passive_up', id: p.id, name: def.name, rarity: def.rarity,
      toLevel: p.level + 1, isNew: false, owned: true, desc: def.levelText[p.level],
    });
  }
  if (state.passives.length < SLOTS.passives) {
    for (const [id, def] of Object.entries(PASSIVES)) {
      if (ownedPassives.has(id)) continue;
      out.push({
        kind: 'passive_new', id, name: def.name, rarity: def.rarity,
        toLevel: 1, isNew: true, owned: false, desc: `${def.desc} ${def.levelText[0]}.`,
      });
    }
  }
  // perks: no slot cap. A new perk is offered only once its requirements hold; affinity (an owned
  // weapon shares one of its tags) makes it 1.5x as likely.
  const ownedTagSet = new Set(state.ownedTags || []);
  const perkLevels = new Map((state.perks || []).map((p) => [p.id, p.level]));
  const ctx = { ownedTags: ownedTagSet, perks: perkLevels, classId: state.classId };
  for (const [id, def] of Object.entries(PERKS)) {
    const have = perkLevels.get(id) || 0;
    const boost = def.affinity.some((t) => ownedTagSet.has(t)) ? 1.5 : 1;
    if (have > 0) {
      if (have >= def.maxLevel) continue;
      out.push({
        kind: 'perk_up', id, name: def.name, rarity: def.rarity, toLevel: have + 1,
        isNew: false, owned: true, boost, desc: def.levelText[have],
      });
    } else if (meetsRequires(def.requires, ctx)) {
      out.push({
        kind: 'perk_new', id, name: def.name, rarity: def.rarity, toLevel: 1,
        isNew: true, owned: false, boost, desc: `${def.desc} ${def.levelText[0]}.`,
      });
    }
  }
  const ownedTitles = new Set(state.titles || []);
  for (const [id, def] of Object.entries(TITLES)) {
    if (def.grant.type !== 'offer' || ownedTitles.has(id)) continue;
    out.push({
      kind: 'title_new', id, name: def.name, rarity: def.rarity,
      toLevel: 1, isNew: true, owned: false, desc: def.desc,
    });
  }
  return out;
}

// What the evolutions in reach still need from a level-up: a map of 'weapon:id' / 'passive:id' /
// 'perk:id' to the name of the weapon it leads to. A recipe is in reach when you own its weapon (both
// for a combo) and it is within EVO_CLOSE levels of the level the recipe asks for. Enhance level,
// starsteel and titles cannot come from a level-up, so they are not listed.
export function evoNeeds(state) {
  const need = new Map();
  const owned = new Map(state.weapons.map((w) => [w.weaponId, w]));
  const passives = new Map(state.passives.map((p) => [p.id, p.level]));
  const perks = new Map((state.perks || []).map((p) => [p.id, p.level]));
  for (const r of EVOLUTIONS) {
    if (owned.has(r.into)) continue;
    const a = owned.get(r.from);
    const b = r.with ? owned.get(r.with) : null;
    if (!a || (r.with && !b)) continue;
    const lvlReq = r.requires.find((q) => q.weaponLevel !== undefined);
    if (lvlReq && Math.min(a.level, b ? b.level : a.level) < lvlReq.weaponLevel - EVO_CLOSE) continue;
    const name = WEAPONS[r.into].name;
    const mark = (key) => need.set(key, need.has(key) && !need.get(key).split(' or ').includes(name) ? `${need.get(key)} or ${name}` : (need.get(key) || name));   // a branch pair names both
    for (const q of r.requires) {
      if (q.weaponLevel !== undefined) {
        if (a.level < q.weaponLevel) mark('weapon:' + r.from);
        if (b && b.level < q.weaponLevel) mark('weapon:' + r.with);
      } else if (q.passive && (passives.get(q.passive) || 0) < (q.minLevel || 1)) mark('passive:' + q.passive);
      else if (q.perk && (perks.get(q.perk) || 0) < (q.minLevel || 1)) mark('perk:' + q.perk);
    }
  }
  return need;
}

// Combos (evolution recipes with `with`) where you hold one half: a map of the MISSING half's weapon id
// to the name of the weapon the pair makes. Only halves you could actually be offered count.
export function comboPartners(state) {
  const out = new Map();
  const owned = new Set(state.weapons.map((w) => w.weaponId));
  for (const r of EVOLUTIONS) {
    if (!r.with || owned.has(r.into)) continue;
    const missing = owned.has(r.from) && !owned.has(r.with) ? r.with : owned.has(r.with) && !owned.has(r.from) ? r.from : null;
    if (!missing) continue;
    const def = WEAPONS[missing];
    if (def.pool === false || (def.class != null && def.class !== state.classId)) continue;
    out.set(missing, WEAPONS[r.into].name);
  }
  return out;
}

export function offerWeight(candidate, luck) {
  const r = RARITIES[candidate.rarity];
  const w = r.weight * (1 + luck * r.luckScale) * (candidate.owned ? 1.5 : 1) * (candidate.boost || 1);
  return w > 0 ? w : 0;
}

export function generateOffers(state, rng, count = LEVELUP.offers) {
  const luck = state.luck || 0;
  const banished = state.banished || [];
  const need = evoNeeds(state);
  const pool = buildCandidates(state).filter((c) => offerWeight(c, luck) > 0 && !banished.includes(c.id));
  for (const c of pool) {                       // mark and favour what an evolution in reach still needs
    const fam = c.kind.startsWith('weapon') ? 'weapon' : c.kind.startsWith('passive') ? 'passive' : c.kind.startsWith('perk') ? 'perk' : null;
    const into = fam && need.get(fam + ':' + c.id);
    if (into) { c.evo = into; c.boost = (c.boost || 1) * EVO_BOOST; }
  }
  const partners = state.weapons.length < SLOTS.weapons ? comboPartners(state) : null;
  if (partners && partners.size) {              // the missing half of a combo: a little more likely, and marked
    for (const c of pool) {
      if (c.kind !== 'weapon_new' || !partners.has(c.id)) continue;
      c.boost = (c.boost || 1) * LEVELUP.comboPartnerBoost;
      if (!c.evo) c.evo = partners.get(c.id);
    }
  }
  const picked = [];
  // First card: when any weapon or passive can be upgraded, one of them leads, so perks never crowd
  // out the levels that evolutions need.
  if (count >= 1) {
    const upgrades = pool.filter((c) => c.kind === 'weapon_up' || c.kind === 'passive_up');
    if (upgrades.length) {
      const c = rng.weighted(upgrades, (x) => offerWeight(x, luck));
      if (c) {
        picked.push(c);
        pool.splice(pool.indexOf(c), 1);
      }
    }
  }
  while (picked.length < count && pool.length) {
    const c = rng.weighted(pool, (x) => offerWeight(x, luck));
    if (!c) break;
    picked.push(c);
    pool.splice(pool.indexOf(c), 1);
  }
  if (picked.length < count) picked.push(HEAL_OFFER);          // nothing left to improve: still offer something
  return picked;
}
