// Element colours for drawing a weapon's own effects (swings, craters, blades, shells, chain bolts).
// A weapon's element comes from its tags (`inst.tags`, which includes forge infusions like Rime-touched),
// so an Ember-touched axe swings in fire colours. First match wins: frost, fire, storm, arcane.
// `accentOf` is the second element of a two-element weapon (Stormshell Mortar: fire, with storm as accent).
// Projectiles use their own batched version of this in render/entities.js.

export const ELEMENTS = {
  frost:  { id: 'frost',  main: '#7fcfff', light: '#ecf8ff', dark: '#12304a', puff: '#bfeaff', arc: '#9fdcff' },
  fire:   { id: 'fire',   main: '#ff8a2e', light: '#ffe3a3', dark: '#4a1a08', puff: '#ff9a3c', arc: '#ff9a3c' },
  storm:  { id: 'storm',  main: '#ffd23a', light: '#fffbe0', dark: '#463a08', puff: '#ffe066', arc: '#ffe066' },
  arcane: { id: 'arcane', main: '#c58bff', light: '#efe0ff', dark: '#2a1646', puff: '#c58bff', arc: '#d9b0ff' },
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
  return el ? el.arc : '#ffe066';
};
