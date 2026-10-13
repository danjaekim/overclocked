// Chest rolls (docs/design-m10-m13.md §6.2). The count and item choice are pure functions of
// (state, rng), like level-up offers, so the same seed and state give the same chest.
// openChest applies the rolls to the run and returns descriptors for the treasure screen.

import { CHEST } from '../data/elites.js';
import { WEAPONS } from '../data/weapons.js';
import { SLOTS } from '../data/progression.js';
import { buildCandidates, offerWeight } from './upgrades.js';
import { offerState, applyOffer } from './apply-offer.js';
import { recipesFor, canEvolve, evolve } from './evolution.js';
import { findPassive } from './passives.js';

// How many rolls this chest gives: one of 1 / 3 / 5, weighted by tier; luck favours the bigger ones.
export function chestCount(rng, tier, luck) {
  const w = tier === 1 ? CHEST.boss : CHEST.elite;
  const boost = 1 + CHEST.luckScale * luck;
  const weights = [w[0], w[1] * boost, w[2] * boost];
  const counts = [1, 3, 5];
  return rng.weighted(counts, (c) => weights[counts.indexOf(c)]);
}

// Items whose next level would unblock an evolution you can nearly make:
// 'weapon_up:<instanceId>' and 'passive_up:<id>' keys.
export function evolutionBlockers(run) {
  const keys = new Set();
  for (const inst of run.player.weapons) {
    for (const recipe of recipesFor(inst)) {
      for (const req of recipe.requires) {
        if (req.weaponLevel !== undefined && inst.level < req.weaponLevel) keys.add(`weapon_up:${inst.instanceId}`);
        if (req.passive) {
          const p = findPassive(run.player, req.passive);
          if (p && p.level < (req.minLevel || 1)) keys.add(`passive_up:${req.passive}`);
        }
      }
    }
  }
  return keys;
}

const keyOf = (c) => (c.kind === 'weapon_up' ? `weapon_up:${c.instanceId}` : `${c.kind}:${c.id}`);

// One roll. Mostly an upgrade of something you own; with wantNew, a new weapon (class filter, rarity,
// luck and banishes as in level-up offers; x1.5 if it shares an element tag with an owned weapon).
// Pure: state is offerState(run), blockers is evolutionBlockers(run). Returns an offer or null.
export function pickChestItem(state, rng, blockers, wantNew) {
  const banished = state.banished || [];
  const luck = state.luck || 0;
  const cands = buildCandidates(state).filter((c) => !banished.includes(c.id));

  if (wantNew) {
    const owned = new Set(state.ownedTags || []);
    const news = cands.filter((c) => c.kind === 'weapon_new');
    if (news.length) {
      const weight = (c) => {
        const shares = WEAPONS[c.id].tags.some((t) => (t === 'fire' || t === 'frost' || t === 'storm') && owned.has(t));
        return offerWeight(c, luck) * (shares ? CHEST.newWeaponTagBoost : 1);
      };
      return rng.weighted(news, weight);
    }
  }
  const ups = cands.filter((c) => CHEST.weights[c.kind] !== undefined);
  if (!ups.length) return null;
  return rng.weighted(ups, (c) => CHEST.weights[c.kind] * (blockers.has(keyOf(c)) ? CHEST.blockerMult : 1));
}

// A ready evolution (every requirement met, starsteel included), if any weapon has one.
function findJackpot(run) {
  for (const inst of run.player.weapons) {
    for (const recipe of recipesFor(inst)) if (canEvolve(run, inst, recipe)) return { inst, recipe };
  }
  return null;
}

export function openChest(run, tier) {
  const p = run.player;
  let count = chestCount(run.rng, tier, p.stats.get('luck'));
  if (tier === 0 && run.chestsOpened === 0 && count < CHEST.firstEliteMin) count = CHEST.firstEliteMin;
  run.chestsOpened++;

  const rolls = [];
  const jp = findJackpot(run);
  if (jp) {
    const r = evolve(run, jp.inst, jp.recipe);
    if (r.ok) rolls.push({ kind: 'evolve', name: r.into.name, rarity: 'evolved', isNew: true, desc: 'Evolved! A chest forged it for you.' });
  }
  let gaveNew = false;
  while (rolls.length < count) {
    const idx = rolls.length;
    const wantNew = !gaveNew && count >= 5 && idx >= 1 && p.weapons.length < SLOTS.weapons && run.rng.next() < CHEST.newWeaponChance;
    const offer = pickChestItem(offerState(run), run.rng, evolutionBlockers(run), wantNew);
    if (!offer) {
      run.ore += CHEST.oreFallback;
      rolls.push({ kind: 'ore', name: `+${CHEST.oreFallback} ore`, rarity: 'common', isNew: false, desc: 'Nothing left to improve.' });
      continue;
    }
    if (offer.kind === 'weapon_new') gaveNew = true;
    applyOffer(run, offer);
    rolls.push({
      kind: offer.kind, id: offer.id, name: offer.name, rarity: offer.rarity, isNew: offer.isNew,
      toLevel: offer.toLevel, desc: offer.desc,
    });
  }
  return { count, rolls };
}
