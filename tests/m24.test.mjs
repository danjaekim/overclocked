// M24: evolution hints on level-up offers, and the pacing changes.
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { createRng } from '../src/core/rng.js';
import { evoNeeds, generateOffers, EVO_BOOST } from '../src/game/upgrades.js';
import { ENEMIES } from '../src/data/enemies.js';
import { WAVES } from '../src/data/waves.js';

const base = { classId: 'smith', luck: 0, passives: [], perks: [], ownedTags: [], titles: [], banished: [] };

test('evoNeeds lists the passive an in-reach evolution still needs, and not far-off ones', () => {
  // Ember Bow level 6 is within 3 levels of the 8 the recipe asks for; it needs Wind Sigil
  const near = evoNeeds({ ...base, weapons: [{ weaponId: 'ember_bow', level: 6, instanceId: 1 }] });
  assert.equal(near.get('passive:wind_sigil'), 'Storm Volley');
  assert.equal(near.get('weapon:ember_bow'), 'Storm Volley');
  const far = evoNeeds({ ...base, weapons: [{ weaponId: 'ember_bow', level: 2, instanceId: 1 }] });
  assert.equal(far.size, 0);
});

test('a satisfied requirement is not listed, and an already-evolved weapon is skipped', () => {
  const have = evoNeeds({ ...base, weapons: [{ weaponId: 'ember_bow', level: 8, instanceId: 1 }], passives: [{ id: 'wind_sigil', level: 1 }] });
  assert.equal(have.size, 0);
  const done = evoNeeds({ ...base, weapons: [{ weaponId: 'ember_bow', level: 6, instanceId: 1 }, { weaponId: 'storm_volley', level: 1, instanceId: 2 }] });
  assert.equal(done.size, 0);
});

test('generateOffers marks needed offers and favours them without forcing them', () => {
  const state = { ...base, weapons: [{ weaponId: 'ember_bow', level: 6, instanceId: 1 }] };
  let marked = 0, withMark = 0, runs = 400;
  for (let s = 1; s <= runs; s++) {
    const offers = generateOffers(state, createRng(s));
    for (const o of offers) if (o.evo) { assert.equal(o.evo, 'Storm Volley'); marked++; }
    if (offers.some((o) => o.id === 'wind_sigil')) withMark++;
  }
  assert.ok(marked > 0);
  assert.ok(withMark > 0 && withMark < runs, 'the passive it needs shows up often but is not forced onto every screen');
  // no evolution in reach: nothing is marked
  const none = generateOffers({ ...base, weapons: [{ weaponId: 'ember_bow', level: 2, instanceId: 1 }] }, createRng(5));
  assert.ok(none.every((o) => !o.evo));
  assert.ok(EVO_BOOST > 1 && EVO_BOOST <= 2.5, 'a slight preference, not a lock');
});

test('pacing: goblins are slower than before and late spawn rates ramp up', () => {
  assert.ok(ENEMIES.goblin.speed <= 62);
  const last = WAVES[WAVES.length - 1].spawns.find((s) => s.enemy === 'goblin');
  assert.ok(last.perSecEnd >= 7);
});

test('per-weapon DPS counts from its first hit, and stops when it is salvaged', async () => {
  const { createStats, recordDamage, markGone, statsSnapshot } = await import('../src/game/run-stats.js');
  const run = { time: 100, stats: createStats() };
  const late = { instanceId: 1, def: { name: 'Late' } }, old = { instanceId: 2, def: { name: 'Old' } };
  run.time = 10; recordDamage(run, old, 0, 100, false);
  run.time = 60; recordDamage(run, late, 0, 100, false);
  run.time = 70; markGone(run, old);
  run.time = 110;
  const snap = statsSnapshot(run);
  const by = Object.fromEntries(snap.weapons.map((w) => [w.name, w.dps]));
  assert.equal(by.Late, 100 / 50);          // owned 50 s
  assert.equal(by.Old, 100 / 60);           // 10 s to 70 s
});
