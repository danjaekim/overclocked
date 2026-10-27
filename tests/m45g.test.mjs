// M45g: Summoner regen; Build and Compendium reachable from the level-up and forge screens.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { CLASSES } from '../src/data/classes.js';
import { readFileSync } from 'node:fs';

test('Summoner: 0.3 regen, text says so', () => {
  const r = createRun({ seed: 2, view: { w: 480, h: 1040 }, classId: 'summoner' });
  assert.ok(r.player.stats.get('regen') >= 0.3);
  assert.ok(CLASSES.summoner.trait.text.some((t) => /regenerates/.test(t)));
});



import { createSave, normalize } from '../src/save/save.js';

test('a run recorded twice counts once; an existing duplicate is cleaned on load', () => {
  const mem = {}; const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  const save = createSave(storage);
  const sum = { classId: 'archer', won: true, time: 600, kills: 5300, level: 32, seed: 17, bossKilled: true, stats: { total: 227000, avgDps: 379 }, build: {}, titleIds: [] };
  save.recordRun(sum, 1000); save.recordRun(sum, 1001);
  assert.equal(save.data.runs, 1); assert.equal(save.data.history.length, 1);
  save.recordRun({ ...sum, seed: 18 }, 2000);
  assert.equal(save.data.history.length, 2);
  const raw = JSON.parse(JSON.stringify(save.data)); raw.history.push({ ...raw.history[0], t: 5 }); raw.runs++; raw.wins++; raw.bossKills++;
  const n = normalize(raw);
  assert.equal(n.history.length, 2); assert.equal(n.runs, 2); assert.equal(n.wins, 2); assert.equal(n.bossKills, 2);
});
