// Applies a chosen level-up offer to the run (the pure offer generation lives in upgrades.js).

import { addWeapon, levelUpWeapon } from './weapons.js';
import { addPassive, findPassive, levelUpPassive } from './passives.js';
import { LEVELUP } from '../data/progression.js';

// Snapshot of the player in the shape generateOffers() expects.
export function offerState(run) {
  const p = run.player;
  return {
    classId: p.classId,
    luck: p.stats.get('luck'),
    weapons: p.weapons.map((w) => ({ weaponId: w.weaponId, level: w.level, instanceId: w.instanceId })),
    passives: p.passives.map((x) => ({ id: x.id, level: x.level })),
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
    case 'heal':
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * LEVELUP.healFraction);
      break;
    default:
      throw new Error(`Unknown offer kind "${offer.kind}"`);
  }
  p.iframes = Math.max(p.iframes, LEVELUP.iframesAfter);   // a breather when the run resumes
}
