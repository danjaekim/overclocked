import { readFileSync } from 'node:fs';
// M45i: compendium entries are structured sections; opened from a run they sort by what you hold and show the delta.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { addWeapon } from '../src/game/weapons.js';
import { addPassive } from '../src/game/passives.js';
import { recipeProgress } from '../src/game/evolution.js';
import { EVOLUTIONS } from '../src/data/evolutions.js';


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





