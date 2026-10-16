// Grafts (docs/design-m26-m28.md §4): the rules for burning one evolved weapon into another at the
// forge. Pure rules, no DOM, like game/forge.js.

import { GRAFT, MASTERWORKS, ELEMENT_ORDER, ELEMENT_NAMES, PAYLOADS, payloadFor, payloadText } from '../data/grafts.js';
import { WEAPONS } from '../data/weapons.js';
import { rebuildAffixes } from './forge.js';
import { markGone } from './run-stats.js';
import { refreshResonance } from './resonance.js';

// The masterwork for this pair of weapon ids, in either order, or null. The masterwork fixes which
// weapon is the host, so both orders give the same result.
export function masterworkFor(idA, idB) {
  return MASTERWORKS.find((m) => (m.host === idA && m.donor === idB) || (m.host === idB && m.donor === idA)) || null;
}

const isGraftable = (inst) => inst.def.rarity === 'evolved' && !inst.graft;

// Element tags a weapon brings as a donor: its own plus any it gained from the forge.
function elementsOf(inst) {
  const tags = new Set([...inst.def.tags, ...inst.addTags]);
  return ELEMENT_ORDER.filter((e) => tags.has(e));
}

// The graft that would result from putting `donor` into `host` (a masterwork if the pair has one, in
// which case the host is the masterwork's own host and `swap` says the pair was given the other way).
export function previewGraft(host, donor) {
  const m = masterworkFor(host.weaponId, donor.weaponId);
  if (m) {
    const swap = m.host !== host.weaponId;
    return { masterwork: m, swap, name: m.name, desc: m.desc };
  }
  const els = elementsOf(donor);
  const payload = payloadFor(donor.def);
  const of = els.length ? els.map((e) => ELEMENT_NAMES[e]).join(' and ') : PAYLOADS[payload].name;
  return { masterwork: null, swap: false, name: `${host.def.name} of ${of}`, payload, desc: payloadText(payload) };
}

export function canGraft(run, host, donor) {
  if (!host || !donor || host === donor) return false;
  if (!isGraftable(host) || !isGraftable(donor)) return false;
  if (!run.player.weapons.includes(host) || !run.player.weapons.includes(donor)) return false;
  return run.starsteel >= GRAFT.cost;
}

// Every graft the player could do right now (or would be able to with more starsteel): one entry per
// ordered pair, masterwork pairs only in their fixed order. [{ host, donor, preview, ok }]
export function graftOptions(run) {
  const ws = run.player.weapons.filter(isGraftable);
  const out = [];
  for (const host of ws) {
    for (const donor of ws) {
      if (host === donor) continue;
      const m = masterworkFor(host.weaponId, donor.weaponId);
      if (m && m.host !== host.weaponId) continue;                  // listed once, from the masterwork's host
      out.push({ host, donor, preview: previewGraft(host, donor), ok: canGraft(run, host, donor) });
    }
  }
  return out;
}

// Does the graft. Returns { ok, graft, host, masterwork } where masterwork is the data entry or null.
export function graft(run, host, donor) {
  if (!canGraft(run, host, donor)) return { ok: false };
  const m = masterworkFor(host.weaponId, donor.weaponId);
  if (m && m.host !== host.weaponId) [host, donor] = [donor, host];      // the masterwork picks the host
  const p = run.player;
  const pv = previewGraft(host, donor);
  run.starsteel -= GRAFT.cost;

  host.quench = (host.quench || 0) + (donor.quench || 0);              // paid-for Quench charges are not lost with the donor
  p.stats.removeBySource(`weapon:${donor.instanceId}:`);               // the donor is consumed
  p.stats.removeBySource(`forge:${donor.instanceId}:`);
  p.weapons.splice(p.weapons.indexOf(donor), 1);
  markGone(run, donor);

  const els = elementsOf(donor);
  host.graft = {
    id: m ? m.id : 'echo',
    name: pv.name,
    desc: pv.desc,
    donorId: donor.weaponId,
    tags: els,
    triggers: m ? m.triggers : [],
    payload: m ? null : pv.payload,                                    // generic grafts: what every attack's first hit also does (effects/payloads.js)
    elements: els,                                                     // the donor's elements, for the payload's status
    light: donor.def.tags.includes('light'),
    hooks: m ? m.hooks : {},
  };
  for (const mod of m ? m.mods : []) {
    p.stats.add({ ...mod, tags: [host.instanceTag], source: `graft:${host.instanceId}:` });
  }
  rebuildAffixes(run, host);                                            // gained tags and triggers
  refreshResonance(run);
  run.grafts.push({ id: host.graft.id, name: host.graft.name, masterwork: !!m, host: host.weaponId, donor: donor.weaponId });
  run.toast = { text: m ? `Masterwork: ${pv.name}!` : `${pv.name} grafted`, ttl: 3.5 };
  return { ok: true, host, masterwork: m, name: pv.name };
}
