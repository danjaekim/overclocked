// M17: run history in the save, and export/import codes.
import { test } from './harness.mjs';
import assert from 'node:assert/strict';
import { createSave, normalize, entryFromSummary, HISTORY_CAP, DEFAULTS } from '../src/save/save.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), raw: m };
}

const summary = (over = {}) => ({
  time: 612.7, kills: 480, seed: 1234, won: true, bossKilled: true, classId: 'smith', level: 17, titleIds: ['bruiser'],
  weapons: ['Forge Hammer'],
  build: { weapons: [['forge_hammer', 5], ['static_rod', 2]], passives: [['keen_whetstone', 3]], perks: [['wildfire', 2]] },
  stats: { total: 123456.7, avgDps: 201.4 },
  ...over,
});

test('entryFromSummary stores ids, levels and rounded numbers', () => {
  const e = entryFromSummary(summary(), 1000);
  assert.deepEqual(
    { t: e.t, cls: e.cls, won: e.won, time: e.time, kills: e.kills, level: e.level, seed: e.seed, boss: e.boss, dmg: e.dmg, dps: e.dps },
    { t: 1000, cls: 'smith', won: true, time: 612, kills: 480, level: 17, seed: 1234, boss: true, dmg: 123457, dps: 201 }
  );
  assert.deepEqual(e.weapons, [['forge_hammer', 5], ['static_rod', 2]]);
  assert.deepEqual(e.perks, [['wildfire', 2]]);
  assert.deepEqual(e.titles, ['bruiser']);
});

test('recordRun appends to the history and persists it', () => {
  const st = fakeStorage();
  const save = createSave(st);
  save.recordRun(summary(), 5);
  save.recordRun(summary({ won: false, kills: 10 }), 6);
  assert.equal(save.data.history.length, 2);
  assert.equal(save.data.history[1].won, false);
  assert.equal(save.data.runs, 2);
  const again = createSave(st);
  assert.equal(again.data.history.length, 2, 'survives a reload');
  assert.equal(again.data.version, 3);
});

test('the history is capped at the newest HISTORY_CAP runs while the counters keep counting', () => {
  const save = createSave(fakeStorage());
  for (let i = 0; i < HISTORY_CAP + 7; i++) save.recordRun(summary({ kills: i }), i);
  assert.equal(save.data.history.length, HISTORY_CAP);
  assert.equal(save.data.history[0].kills, 7, 'the oldest seven were dropped');
  assert.equal(save.data.history.at(-1).kills, HISTORY_CAP + 6);
  assert.equal(save.data.runs, HISTORY_CAP + 7);
});

test('a v1 save (no history) loads with an empty history and keeps its progress', () => {
  const st = fakeStorage();
  st.setItem('overclocked.save.v1', JSON.stringify({ version: 1, lastClass: 'smith', unlocked: ['smith'], bests: { time: 90, kills: 50, level: 5 }, runs: 4, wins: 1, bossKills: 1, sound: false }));
  const save = createSave(st);
  assert.deepEqual(save.data.history, []);
  assert.deepEqual(save.data.unlocked, ['smith']);
  assert.equal(save.data.runs, 4);
});

test('normalize drops malformed history entries and clamps the list', () => {
  const good = entryFromSummary(summary(), 1);
  const out = normalize({ history: [good, null, 5, { cls: 'x' }, { ...good, time: -1 }, { ...good, kills: 'many' }, { ...good, weapons: 'nope', perks: [[1, 2], ['ok', 3]] }] });
  assert.equal(out.history.length, 2);
  assert.deepEqual(out.history[1].weapons, []);
  assert.deepEqual(out.history[1].perks, [['ok', 3]]);
});

test('god-mode style: a save with no history defaults are untouched', () => {
  assert.deepEqual(DEFAULTS.history, []);
});






test('run.summary carries the build ids for the history', async () => {
  const { createRun } = await import('../src/game/run.js');
  const run = createRun({ seed: 3, view: { w: 480, h: 800, insetTop: 0 }, debug: { god: false }, classId: 'archer', sfx: () => {} });
  const s = run.summary();
  assert.ok(s.build.weapons.length >= 1 && typeof s.build.weapons[0][0] === 'string');
  assert.ok(Array.isArray(s.titleIds));
  const e = entryFromSummary(s, 1);
  assert.equal(e.cls, 'archer');
});

