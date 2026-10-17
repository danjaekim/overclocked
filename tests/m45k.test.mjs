// M45k: history rows use the compendium entry layout (padded title row, label/value facts).

import { test, assert } from './harness.mjs';
import { readFileSync } from 'node:fs';

test('history rows have a padded title row and facts, not bare text on the card edge', () => {
  const ui = readFileSync(new URL('../src/ui/history.js', import.meta.url), 'utf8');
  assert.ok(/class="chead" data-act="hx:/.test(ui) && /class="cfact"/.test(ui));
  assert.ok(!/class="centry hrow[^"]*" data-act=/.test(ui));
});

import { entryFromSummary, normalize } from '../src/save/save.js';
import { weaponTiles } from '../src/game/history.js';

test('history keeps per-weapon forge marks and shows tier, type and marks; old entries still render', () => {
  const sum = { classId: 'smith', won: true, time: 600, kills: 10, level: 5, seed: 1, stats: { total: 1, avgDps: 1 }, titleIds: [],
    build: { weapons: [['forge_hammer', 5], ['bone_call', 2], ['colossus_maul', 1]], gear: [[10, 1, 2, 1, 1], [0, 0, 0, 0, 0], [3, 0, 1, 0, 0]], passives: [], perks: [], fusions: [] } };
  const entry = normalize({ history: [entryFromSummary(sum, 5)] }).history[0];
  assert.deepEqual(entry.gear[0], [10, 1, 2, 1, 1]);
  const t = weaponTiles(entry);
  assert.deepEqual([t[0].tier, t[0].type, t[0].enhance, t[0].star, t[0].legendary], ['common', 'close', 10, true, true]);
  assert.equal(t[1].type, 'summon');
  assert.equal(t[2].tier, 'evolved');
  const old = normalize({ history: [{ ...entry, gear: undefined }] }).history[0];
  assert.equal(weaponTiles(old)[0].star, false);
});
