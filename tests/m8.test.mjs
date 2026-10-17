// M8: save, meta unlock, reroll/banish, Berserker, PWA files.

import { readFileSync, existsSync } from 'node:fs';
import { test, assert, approx } from './harness.mjs';
import { createSave, normalize, DEFAULTS } from '../src/save/save.js';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { CLASSES } from '../src/data/classes.js';
import { generateOffers, buildCandidates } from '../src/game/upgrades.js';
import { offerState } from '../src/game/apply-offer.js';
import { createRng } from '../src/core/rng.js';
import { queueDamage } from '../src/systems/damage-queue.js';
import { flushDamage, killEnemy } from '../src/systems/damage.js';
import { validateData } from '../src/data/validate.js';
import { LEVELUP } from '../src/data/progression.js';
import { SOUND_NAMES } from '../src/audio/audio.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = (classId = 'archer', extra = {}) => createRun({ seed: 1, view: VIEW, debug: { god: true }, classId, ...extra });
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };

function fakeStorage(initial) {
  const m = new Map(initial ? [['overforged.save.v1', initial]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), raw: () => m.get('overforged.save.v1') };
}

test('m8 data validates', () => {
  assert.deepEqual(validateData(), []);
});

// ---- save ----------------------------------------------------------------------------------

test('save: starts from defaults, persists changes, and reloads them', () => {
  const st = fakeStorage();
  const a = createSave(st);
  assert.deepEqual(a.data, DEFAULTS);
  a.setLastClass('smith');
  a.setSound(false);
  a.unlock('berserker');
  const b = createSave(st);                                   // a fresh load of the same storage
  assert.equal(b.data.lastClass, 'smith');
  assert.equal(b.data.sound, false);
  assert.deepEqual(b.data.unlocked, ['berserker']);
});

test('save: survives corrupt, hostile or partial data and missing/throwing storage', () => {
  assert.deepEqual(createSave(fakeStorage('{not json')).data, DEFAULTS);
  assert.deepEqual(createSave(fakeStorage('null')).data, DEFAULTS);
  const odd = normalize({ lastClass: 5, unlocked: ['a', 3, null], bests: { time: -4, kills: 'x', level: 9 }, runs: -1, sound: 'yes' });
  assert.equal(odd.lastClass, 'archer');
  assert.deepEqual(odd.unlocked, ['a']);
  assert.deepEqual(odd.bests, { time: 0, kills: 0, level: 9 });
  assert.equal(odd.runs, 0);
  assert.equal(odd.sound, true);
  assert.deepEqual(createSave(null).data, DEFAULTS);          // no storage at all
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const s = createSave(throwing);
  s.setLastClass('smith');                                    // must not throw
  assert.equal(s.data.lastClass, 'smith');
});

test('save: recordRun tracks bests, runs, wins and boss kills', () => {
  const s = createSave(fakeStorage());
  let r = s.recordRun({ time: 120.7, kills: 50, level: 6, won: false, bossKilled: false });
  assert.deepEqual(r.newBests.sort(), ['kills', 'level', 'time']);
  assert.equal(s.data.bests.time, 120);
  r = s.recordRun({ time: 100, kills: 80, level: 5, won: true, bossKilled: true });
  assert.deepEqual(r.newBests, ['kills']);
  assert.equal(s.data.runs, 2);
  assert.equal(s.data.wins, 1);
  assert.equal(s.data.bossKills, 1);
});

test('classes: archer and smith are open, the berserker needs an unlock the save can grant', () => {
  const s = createSave(fakeStorage());
  assert.equal(s.isUnlocked('archer', CLASSES.archer), true);
  assert.equal(s.isUnlocked('berserker', CLASSES.berserker), false);
  assert.equal(s.unlock('berserker'), true);
  assert.equal(s.unlock('berserker'), false, 'only once');
  assert.equal(s.isUnlocked('berserker', CLASSES.berserker), true);
  assert.equal(CLASSES.berserker.unlock.event, 'boss');
});

test('a run exposes bossKilled and class in its summary, set by the boss death', () => {
  const run = newRun('berserker');
  assert.equal(run.summary().bossKilled, false);
  const boss = spawnEnemy(run, 'warlord', 100, 100);
  run.bossAlive = true;
  killEnemy(run, boss);
  const sum = run.summary();
  assert.equal(sum.bossKilled, true);
  assert.equal(sum.classId, 'berserker');
});

// ---- berserker -----------------------------------------------------------------------------

test('berserker: starts with the axe, hits harder when wounded, and heals from damage dealt', () => {
  const run = createRun({ seed: 1, view: VIEW, debug: { god: false }, classId: 'berserker' });
  assert.equal(run.player.weapons[0].weaponId, 'rending_axe');
  const axe = run.player.weapons[0];
  const full = run.player.stats.getFor('damage', axe.tags);
  run.player.hp = run.player.maxHp * 0.3;
  approx(run.player.stats.getFor('damage', axe.tags), full * 1.25, 1e-9);

  // lifesteal: a queued hit heals the player by amount * lifesteal
  const e = spawnEnemy(run, 'brute', 200, 0);
  e.hp = e.maxHp = 1e6;
  run.player.hp = 50;
  const ls = run.player.stats.getFor('lifesteal', axe.tags);
  assert.ok(ls > 0);
  queueDamage(run, e, 100, false, 0, 0, 0, axe);
  flushDamage(run);
  approx(run.player.hp, 50 + 100 * ls, 1e-6);
  // a hit with no source weapon (none exists today, but triggers pass src) heals nothing
  run.player.hp = 50;
  queueDamage(run, e, 100, false, 0, 0, 0, null);
  flushDamage(run);
  assert.equal(run.player.hp, 50);
});

test('other classes have no lifesteal', () => {
  const run = newRun('archer');
  assert.equal(run.player.stats.get('lifesteal'), 0);
});

// ---- reroll and banish ---------------------------------------------------------------------

test('runs start with the configured rerolls and banishes', () => {
  const run = newRun();
  assert.equal(run.rerolls, LEVELUP.rerolls);
  assert.equal(run.banishes, LEVELUP.banishes);
  assert.deepEqual(run.banished, []);
});

test('banished items are never offered again', () => {
  const run = newRun();
  const st = offerState(run);
  const first = buildCandidates(st).find((c) => c.kind === 'passive_new');
  run.banished.push(first.id);
  for (let s = 0; s < 80; s++) {
    for (const o of generateOffers(offerState(run), createRng(s))) assert.notEqual(o.id, first.id);
  }
});

test('banishing everything left still falls back to Rest instead of crashing', () => {
  const run = newRun();
  for (const c of buildCandidates(offerState(run))) run.banished.push(c.id);
  const offers = generateOffers(offerState(run), createRng(1));
  assert.deepEqual(offers.map((o) => o.kind), ['heal']);
});

test('rerolling gives a fresh draw from the same rng stream (deterministic, usually different)', () => {
  const a = createRng(5);
  const st = offerState(newRun());
  const one = generateOffers(st, a).map((o) => o.id).join();
  const two = generateOffers(st, a).map((o) => o.id).join();
  const b = createRng(5);
  assert.equal(generateOffers(st, b).map((o) => o.id).join(), one);
  assert.equal(generateOffers(st, b).map((o) => o.id).join(), two);
});

// ---- sound / sim separation ----------------------------------------------------------------

test('the sim calls run.sfx for events, and runs fine with the default no-op', () => {
  const heard = new Set();
  const run = newRun('smith', { sfx: (n) => heard.add(n) });
  tick(run, 40);
  assert.ok(heard.has('kill'), 'kills make a sound');
  for (const n of heard) assert.ok(SOUND_NAMES.includes(n), `unknown sound "${n}"`);
  const quiet = newRun('smith');                              // default sfx: nothing to assert but no throw
  tick(quiet, 5);
});

test('every sound the sim can emit exists in the audio table', () => {
  for (const n of ['kill', 'gem', 'ore', 'hurt', 'shrine', 'boss', 'levelup', 'forge', 'fail', 'evolve', 'win', 'lose', 'tap']) {
    assert.ok(SOUND_NAMES.includes(n), n);
  }
});

// ---- PWA files -----------------------------------------------------------------------------

test('manifest is valid, portrait, standalone, and its icons exist', () => {
  const m = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.orientation, 'portrait');
  assert.ok(m.start_url.startsWith('.'), 'relative start_url so GitHub Pages subpaths work');
  for (const icon of m.icons) assert.ok(existsSync(new URL('../' + icon.src, import.meta.url)), icon.src);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  assert.ok(existsSync(new URL('../icons/apple-touch-icon.png', import.meta.url)));
});

test('index.html links the manifest and apple icon; the service worker is registered', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('rel="manifest"'));
  assert.ok(html.includes('apple-touch-icon'));
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("addEventListener('fetch'"));
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(main.includes("serviceWorker.register('./sw.js'"), 'main.js registers the worker');
});

test('saves from before the graft-to-fusion rename still load: discovered masterworks and history lines', () => {
  const old = { discovered: { grafts: ['mw_a', 'mw_b'] }, history: [{ t: 1, cls: 'archer', won: true, time: 600, kills: 5, level: 3, grafts: [['a', 'b', 'c', 'Old Name']] }] };
  const out = normalize(old);
  assert.deepEqual(out.discovered.fusions, ['mw_a', 'mw_b']);
  assert.equal(out.history[0].fusions[0][3], 'Old Name');
});
