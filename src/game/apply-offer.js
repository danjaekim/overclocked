// Applies a chosen level-up offer to the run (the pure offer generation lives in upgrades.js).

import { addWeapon, levelUpWeapon } from './weapons.js';
import { addPassive, findPassive, levelUpPassive } from './passives.js';
import { addPerk, findPerk, levelUpPerk } from './perks.js';
import { grantTitle } from './titles.js';
import { LEVELUP } from '../data/progression.js';

// Snapshot of the player in the shape generateOffers() expects.
// Every tag on every owned weapon INSTANCE (so forge infusions count), minus the per-instance
// `weapon:N` tags. Used for perk requirements and offer affinity.
function ownedTags(p) {
  const out = [];
  for (const w of p.weapons) for (const t of w.tags.set) if (!t.startsWith('weapon:') && !out.includes(t)) out.push(t);
  return out;
}

export function offerState(run) {
  const p = run.player;
  return {
    classId: p.classId,
    luck: p.stats.get('luck'),
    weapons: p.weapons.map((w) => ({ weaponId: w.weaponId, level: w.level, instanceId: w.instanceId })),
    passives: p.passives.map((x) => ({ id: x.id, level: x.level })),
    perks: p.perks.map((x) => ({ id: x.id, level: x.level })),
    ownedTags: ownedTags(p),
    titles: run.titles.map((t) => t.id),
    banished: run.banished,
  };
}

export function applyOffer(run, offer) {
  const p = run.player;
  switch (offer.kind) {
    case 'weapon_new':
      addWeapon(run, offer.id);
      break;
    case 'weapon_up':
      levelUpWeapon(run, p.weapons.find((w) => w.instanceId === offer.instanceId));
      break;
    case 'passive_new':
      addPassive(run, offer.id);
      break;
    case 'passive_up':
      levelUpPassive(run, findPassive(p, offer.id));
      break;
    case 'perk_new':
      addPerk(run, offer.id);
      break;
    case 'perk_up':
      levelUpPerk(run, findPerk(p, offer.id));
      break;
    case 'title_new':
      grantTitle(run, offer.id);
      break;
    case 'heal':
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * LEVELUP.healFraction);
      break;
    default:
      throw new Error(`Unknown offer kind "${offer.kind}"`);
  }
  p.iframes = Math.max(p.iframes, LEVELUP.iframesAfter);   // a breather when the run resumes
}
