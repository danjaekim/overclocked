import { readFileSync } from 'node:fs';
// M45i: compendium entries are structured sections; opened from a run they sort by what you hold and show the delta.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { addWeapon } from '../src/game/weapons.js';
import { addPassive } from '../src/game/passives.js';
import { buildEntries, liveStatus, sortByStatus, filterEntries } from '../src/game/compendium.js';
import { recipeProgress } from '../src/game/evolution.js';
import { EVOLUTIONS } from '../src/data/evolutions.js';

test('every entry has sections of a known kind', () => {
  for (const e of buildEntries()) {
    assert.ok(e.sections && e.sections.length, e.id);
    for (const s of e.sections) assert.ok(['text', 'facts', 'levels', 'list', 'recipes', 'evolinks'].includes(s.kind), `${e.id} ${s.kind}`);
  }
});

test('recipeProgress separates met, short and missing', () => {
  const run = createRun({ seed: 3, view: { w: 480, h: 1040 }, classId: 'archer' });
  const r = EVOLUTIONS.find((x) => x.id === 'storm_volley');
  let pr = recipeProgress(run, r);
  assert.equal(pr.rows[0].state, 'ok');                                  // the Archer starts with Ember Bow
  assert.equal(pr.rows[1].state, 'short');                               // level 1 of 6
  assert.equal(pr.rows[1].note, 'yours is 1');
  assert.equal(pr.rows[2].state, 'missing');                             // no Wind Sigil
  assert.equal(pr.ready, false);
  run.player.weapons[0].level = 6; addPassive(run, 'wind_sigil'); run.starsteel = 1;
  pr = recipeProgress(run, r);
  assert.ok(pr.ready && pr.met === pr.total);
});

test('with a run, owned weapons and evolutions you can build sort to the top; without, order is unchanged', () => {
  const run = createRun({ seed: 3, view: { w: 480, h: 1040 }, classId: 'smith' });
  const entries = buildEntries();
  const weapons = filterEntries(entries, { tab: 'weapons' });
  const sorted = sortByStatus(weapons, run);
  assert.equal(sorted.length, weapons.length);
  assert.equal(sorted[0].entry.id, run.player.weapons[0].weaponId);
  assert.ok(/Lv|Owned/.test(sorted[0].status.badge));
  const evo = sortByStatus(filterEntries(entries, { tab: 'evolve' }), run);
  assert.ok(evo[0].status && evo[0].status.need.length > 0);              // the evolution of what you own comes first, with what is missing
  assert.equal(liveStatus(weapons.find((e) => !run.player.weapons.some((w) => w.weaponId === e.id) && !(e.recipeIds || []).length) || weapons[weapons.length - 1], run), null);
});

test('a weapon with two evolutions gets one link chip each, and no requirement lines, on the Weapons tab', () => {
  const run = createRun({ seed: 3, view: { w: 480, h: 1040 }, classId: 'smith' });
  const hammer = buildEntries().find((e) => e.id === 'forge_hammer');
  const st = liveStatus(hammer, run);
  assert.equal(st.chips.length, 2);
  assert.equal(st.need, '');
  assert.ok(!/Lv Lv/.test(st.badge));
});

test('open compendium entries toggle only from the pinned title row', () => {
  const ui = readFileSync(new URL('../src/ui/compendium.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(/class="chead" data-act="cx:/.test(ui) && !/class="cbody"[^>]*data-act/.test(ui));
  assert.ok(/\.centry\.open > \.chead \{ position: sticky/.test(css));
});

import { buildHtml } from '../src/ui/build.js';

test('the build screen shows one evolution chip per evolution a weapon can take', () => {
  const run = createRun({ seed: 3, view: { w: 480, h: 1040 }, classId: 'smith' });
  const html = buildHtml(run);
  assert.equal((html.match(/data-act="bgo:/g) || []).length, 2);          // the Forge Hammer: Colossus Maul and Quakebreaker
  assert.ok(/Colossus Maul \d\/\d/.test(html));
});
