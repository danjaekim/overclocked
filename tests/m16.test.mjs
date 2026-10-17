// M16: the compendium model is generated from the data and the shared builds are playable.

import { test, assert } from './harness.mjs';
import { WEAPONS } from '../src/data/weapons.js';
import { PERKS } from '../src/data/perks.js';
import { PASSIVES } from '../src/data/passives.js';
import { AFFIXES } from '../src/data/forge.js';
import { RESONANCE } from '../src/data/resonance.js';
import { BUILDS } from '../src/data/builds.js';
import { CLASSES } from '../src/data/classes.js';
import { meetsRequires } from '../src/game/perks.js';
import { instanceTagSet } from '../src/game/weapons.js';
import { buildEntries, filterEntries, facetsFor, requiresText, TABS } from '../src/game/compendium.js';
import { validateData } from '../src/data/validate.js';

const entries = buildEntries();
const ids = (tab) => new Set(entries.filter((e) => e.tab === tab).map((e) => e.id));

test('every weapon, technique, passive, effect and resonance set has an entry', () => {
  for (const [id, w] of Object.entries(WEAPONS)) assert.ok(ids(w.pool === false ? 'evolve' : 'weapons').has(id), id);
  for (const id of Object.keys(PERKS)) assert.ok(ids('techniques').has(id), id);
  for (const id of Object.keys(PASSIVES)) assert.ok(ids('passives').has(id), id);
  for (const id of Object.keys(AFFIXES)) assert.ok(ids('forge').has(`affix:${id}`), id);
  for (const id of Object.keys(RESONANCE)) assert.ok(ids('forge').has(`resonance:${id}`), id);
  assert.equal(ids('builds').size, BUILDS.length);
  for (const t of TABS) assert.ok(ids(t.id).size > 0, `${t.id} is not empty`);
});

test('entries have unique ids per tab, a name, rarity and some detail text', () => {
  const seen = new Set();
  for (const e of entries) {
    const key = `${e.tab}/${e.id}`;
    assert.ok(!seen.has(key), key);
    seen.add(key);
    assert.ok(e.name && e.rarity && e.lines.length > 0 && e.summary, key);
    assert.ok(!e.lines.some((l) => /undefined|NaN|\[object/.test(l)), `${key} has a broken line`);
  }
});

test('evolved weapons say how to make them; weapons list what they evolve into', () => {
  assert.ok(entries.find((e) => e.id === 'vapor_wheel').lines.some((l) => l.startsWith('Made by combining')));
  assert.ok(entries.find((e) => e.id === 'reaper_axe').lines.some((l) => l.includes('Keen Eye')));
  assert.ok(entries.find((e) => e.id === 'rending_axe').lines.some((l) => l.startsWith('Evolves into Reaper Axe')));
});

test('technique requirements read as sentences, alloys are categorised and elemental', () => {
  const quench = entries.find((e) => e.id === 'quench');
  assert.equal(quench.cat, 'Alloy');
  assert.deepEqual(quench.elements, ['fire', 'frost']);
  assert.equal(requiresText([['tag:fire', 'perk:kindling'], ['tag:frost']]), 'a Fire weapon or Kindling, and a Frost weapon');
  assert.equal(requiresText([]), 'Always available');
  assert.equal(entries.find((e) => e.id === 'kindling').cat, 'Enabler');
  assert.equal(entries.find((e) => e.id === 'headsman').cat, 'Execute');
});

test('filters: element, class, rarity, category and search combine', () => {
  const fire = filterEntries(entries, { tab: 'weapons', element: 'fire' });
  assert.ok(fire.length > 0 && fire.every((e) => e.elements.includes('fire')));
  const saint = filterEntries(entries, { tab: 'weapons', cls: 'saint' });
  assert.deepEqual(saint.map((e) => e.id), ['halo']);
  assert.ok(filterEntries(entries, { tab: 'techniques', cat: 'Alloy' }).length === 3);
  assert.ok(filterEntries(entries, { tab: 'techniques', rarity: 'epic' }).every((e) => e.rarity === 'epic'));
  assert.deepEqual(filterEntries(entries, { tab: 'techniques', q: 'WILDFIRE' }).map((e) => e.id), ['wildfire']);
  assert.equal(filterEntries(entries, { tab: 'techniques', element: 'fire', q: 'zzzz' }).length, 0);
  assert.ok(filterEntries(entries, { tab: 'builds', element: 'storm' }).length >= 3);
});

test('facets only offer values that exist on the tab', () => {
  for (const t of TABS) {
    for (const f of facetsFor(t.id, entries)) {
      for (const o of f.options) {
        const key = f.key === 'element' ? 'element' : f.key;
        assert.ok(filterEntries(entries, { tab: t.id, [key]: o }).length > 0, `${t.id} ${f.key} ${o}`);
      }
    }
  }
});

test('builds: valid ids, a real class, and every technique can be offered in order', () => {
  assert.deepEqual(validateData(), []);
  for (const b of BUILDS) {
    assert.ok(CLASSES[b.cls], b.id);
    assert.ok(b.idea.length > 10 && b.tips.length > 10, `${b.id} has text`);
    const tags = new Set();
    const owned = new Map();
    for (const w of b.weapons) { assert.ok(WEAPONS[w], w); for (const t of instanceTagSet({ def: WEAPONS[w], addTags: [], instanceTag: 'x' }).set) tags.add(t); }
    const startTags = WEAPONS[CLASSES[b.cls].startWeapon].tags;
    for (const t of startTags) tags.add(t);
    for (const p of b.perks) {
      assert.ok(PERKS[p], p);
      assert.ok(meetsRequires(PERKS[p].requires, { ownedTags: tags, perks: owned, classId: b.cls }), `${b.id}: ${p} is not offered with the build so far`);
      owned.set(p, 1);
    }
  }
});
