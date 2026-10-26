// M17: run history in the save, and export/import codes.
import { test } from './harness.mjs';
import assert from 'node:assert/strict';
import { createSave, normalize, entryFromSummary, HISTORY_CAP, DEFAULTS } from '../src/save/save.js';
import { encodeSave, decodeSave, describeSave } from '../src/save/transfer.js';

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

test('export then import round-trips the whole save', async () => {
  const save = createSave(fakeStorage());
  save.unlock('smith');
  for (let i = 0; i < 30; i++) save.recordRun(summary({ kills: i }), i);
  const code = await encodeSave(save.data);
  assert.match(code, /^OCZ?1\.[0-9a-f]{8}\.[A-Za-z0-9_-]+$/);
  const back = await decodeSave(code);
  assert.deepEqual(back, save.data);
});

test('the code is tolerant of pasted whitespace and line breaks', async () => {
  const save = createSave(fakeStorage());
  save.recordRun(summary(), 1);
  const code = await encodeSave(save.data);
  const messy = '  ' + code.replace(/(.{40})/g, '$1\n') + ' \n';
  assert.deepEqual(await decodeSave(messy), save.data);
});

test('damaged, truncated or foreign text is rejected with a readable message', async () => {
  const code = await encodeSave(createSave(fakeStorage()).data);
  await assert.rejects(decodeSave(''), /does not look like/);
  await assert.rejects(decodeSave('hello world'), /does not look like/);
  await assert.rejects(decodeSave(code.slice(0, -6)), /damaged or cut short/);
  const flipped = code.slice(0, -3) + (code.endsWith('A') ? 'BBB' : 'AAA');
  await assert.rejects(decodeSave(flipped), /damaged or cut short/);
});

test('an import is re-validated: bad fields in a valid-looking code are dropped', async () => {
  const evil = { version: 2, lastClass: 5, unlocked: ['smith', 7], bests: { time: -5, kills: 9, level: 'x' }, runs: 'many', history: [{ cls: 'smith' }], sound: 'yes' };
  const payload = Buffer.from(JSON.stringify(evil)).toString('base64url');
  // plain OC1 code with a correct checksum, built the same way the encoder does
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) { h ^= payload.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const out = await decodeSave(`OC1.${h.toString(16).padStart(8, '0')}.${payload}`);
  assert.equal(out.lastClass, 'archer');
  assert.deepEqual(out.unlocked, ['smith']);
  assert.equal(out.bests.time, 0);
  assert.equal(out.bests.kills, 9);
  assert.equal(out.runs, 0);
  assert.deepEqual(out.history, []);
});

test('replaceAll swaps the save and persists it', async () => {
  const st = fakeStorage();
  const a = createSave(st);
  a.recordRun(summary(), 1);
  const other = createSave(fakeStorage());
  other.unlock('mage');
  other.recordRun(summary({ kills: 99 }), 2);
  other.recordRun(summary({ kills: 98 }), 3);
  a.replaceAll(await decodeSave(await encodeSave(other.data)));
  assert.equal(a.data.history.length, 2);
  assert.deepEqual(a.data.unlocked, ['mage']);
  assert.equal(createSave(st).data.history.length, 2);
  assert.deepEqual(describeSave(a.data), { runs: 2, wins: 2, unlocked: 1, history: 2, bests: a.data.bests });
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

test('history model: filters, summary and display names', async () => {
  const { filterHistory, classesIn, summarize, buildNames, className } = await import('../src/game/history.js');
  const mk = (cls, won, level, t) => entryFromSummary(summary({ classId: cls, won, level, build: { weapons: [['ember_bow', 3]], passives: [['keen_whetstone', 2]], perks: [['wildfire', 1], ['gone_perk', 2]] } }), t);
  const h = [mk('archer', false, 5, 1), mk('smith', true, 9, 2), mk('archer', true, 11, 3)];
  assert.deepEqual(filterHistory(h, {}).map((e) => e.t), [3, 2, 1], 'newest first');
  assert.deepEqual(filterHistory(h, { cls: 'archer' }).map((e) => e.t), [3, 1]);
  assert.deepEqual(filterHistory(h, { cls: 'archer', winsOnly: true }).map((e) => e.t), [3]);
  assert.deepEqual(classesIn(h), ['archer', 'smith']);
  const s = summarize(h);
  assert.equal(s.runs, 3); assert.equal(s.wins, 2); assert.equal(s.bestLevel, 11);
  assert.deepEqual(summarize([]), { runs: 0, wins: 0, winRate: 0, avgLevel: 0, avgKills: 0, bestTime: 0, bestKills: 0, bestLevel: 0 });
  const b = buildNames(h[0]);
  assert.equal(b.weapons[0], 'Ember Bow 3');
  assert.equal(b.perks[1], 'gone_perk 2', 'an id that no longer exists falls back to the raw id');
  assert.equal(className('smith'), 'Smith');
});
