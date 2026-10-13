// Level-up offer generation (docs/architecture.md §5.6). PURE: depends only on its arguments
// and the data files, so the same state + same rng state always gives the same offers.
//
// state = {
//   classId,
//   luck,
//   weapons:  [{ weaponId, level, instanceId }],
//   passives: [{ id, level }],
// }
//
// An offer is { kind, id, name, rarity, toLevel, isNew, desc, instanceId? } with kind one of
// 'weapon_new' | 'weapon_up' | 'passive_new' | 'passive_up' | 'heal'.

import { WEAPONS } from '../data/weapons.js';
import { PASSIVES } from '../data/passives.js';
import { RARITIES } from '../data/rarities.js';
import { SLOTS, LEVELUP } from '../data/progression.js';

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
  return out;
}

export function offerWeight(candidate, luck) {
  const r = RARITIES[candidate.rarity];
  const w = r.weight * (1 + luck * r.luckScale) * (candidate.owned ? 1.5 : 1);
  return w > 0 ? w : 0;
}

export function generateOffers(state, rng, count = LEVELUP.offers) {
  const luck = state.luck || 0;
  const pool = buildCandidates(state).filter((c) => offerWeight(c, luck) > 0);
  const picked = [];
  while (picked.length < count && pool.length) {
    const c = rng.weighted(pool, (x) => offerWeight(x, luck));
    if (!c) break;
    picked.push(c);
    pool.splice(pool.indexOf(c), 1);
  }
  if (picked.length < count) picked.push(HEAL_OFFER);          // nothing left to improve: still offer something
  return picked;
}
