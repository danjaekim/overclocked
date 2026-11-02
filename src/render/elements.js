// Element colours for drawing a weapon's own effects (swings, craters, blades, shells, chain bolts).
// A weapon's element comes from its tags (`inst.tags`, which includes forge infusions like Rime-touched),
// so an Ember-touched axe swings in fire colours. First match wins: frost, fire, storm, arcane.
// `accentOf` is the second element of a two-element weapon (Stormshell Mortar: fire, with storm as accent).
// Projectiles use their own batched version of this in render/entities.js.

import { PALETTE as P } from '../data/palette.js';

export const ELEMENTS = {
  frost:  { id: 'frost',  main: P.frost, light: '#eef1ff', dark: '#1a1c4a', puff: '#cdd6ff', arc: P.frost },
  fire:   { id: 'fire',   main: P.fire, light: '#ffe3a3', dark: '#4a1a08', puff: '#ff9a3c', arc: P.fire },
  storm:  { id: 'storm',  main: P.storm, light: '#fffde0', dark: '#463a08', puff: '#fff7a0', arc: P.storm },
  arcane: { id: 'arcane', main: P.violet, light: '#efe0ff', dark: '#2a1646', puff: P.violet, arc: '#d9b0ff' },
};
const ORDER = ['frost', 'fire', 'storm', 'arcane'];
const cache = new WeakMap();                          // inst.tags -> [first, second]; tags are replaced when they change

function lookup(inst) {
  const tags = inst.tags;
  if (!tags || !tags.set) return NONE;
  let r = cache.get(tags);
  if (!r) {
    const found = ORDER.filter((id) => tags.set.has(id));
    r = [ELEMENTS[found[0]] || null, ELEMENTS[found[1]] || null];
    cache.set(tags, r);
  }
  return r;
}
const NONE = [null, null];

export const elementOf = (inst) => lookup(inst)[0];
export const accentOf = (inst) => lookup(inst)[1];

// Colour of a chain bolt (render/fx.js addArc) fired by this weapon: its element's, yellow when it has none.
export const arcColor = (inst) => {
  const el = lookup(inst)[0];
  return el ? el.arc : P.rig;
};
