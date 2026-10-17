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

import { buildEntries } from '../src/game/compendium.js';

test('compendium cross-links: every link target is a real entry', () => {
  const entries = buildEntries({ fusions: ['thunderscythe'] });
  const ids = new Set(entries.map((e) => e.id));
  const refs = [];
  for (const e of entries) {
    for (const r of e.buildRefs || []) refs.push([e.id, r.id]);
    for (const s of e.sections || []) {
      for (const r of s.refs || []) refs.push([e.id, r.id]);
      for (const row of s.rows || []) if (Array.isArray(row[1])) for (const r of row[1]) refs.push([e.id, r.id]);
    }
  }
  assert.ok(refs.length > 30, `${refs.length} links`);
  for (const [from, to] of refs) assert.ok(ids.has(to), `${from} links to missing ${to}`);
  const axe = entries.find((e) => e.id === 'reaper_axe');                            // an evolved weapon links the fusion rules and a found masterwork it takes part in
  const fusion = axe.sections.find((s) => s.kind === 'chips' && s.title === 'Fusion');
  assert.deepEqual(fusion.refs.map((r) => r.id), ['fusion:rules', 'fusion:thunderscythe']);
  const hidden = buildEntries({ fusions: [] }).find((e) => e.id === 'reaper_axe').sections.find((s) => s.title === 'Fusion');
  assert.deepEqual(hidden.refs.map((r) => r.id), ['fusion:rules']);                  // an undiscovered masterwork is not given away
});
