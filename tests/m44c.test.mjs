import { test, assert } from './harness.mjs';
import { buildEntries } from '../src/game/compendium.js';
import { MASTERWORKS, FUSION } from '../src/data/fusions.js';

test('a found masterwork fusion carries its host and donor for a live preview; an undiscovered one does not', () => {
  const m = MASTERWORKS[0];
  const entries = buildEntries({ fusions: [m.id] }).filter((e) => e.tab === 'fusions');
  const found = entries.find((e) => e.id === `fusion:${m.id}`);
  assert.deepEqual(found.fusePair, [m.host, m.donor]);
  const hidden = entries.find((e) => e.id === `fusion:${MASTERWORKS[1].id}`);
  assert.equal(hidden.fusePair, null, 'a secret stays secret: no preview before it is found');
  assert.ok(entries.find((e) => e.id === 'fusion:rules'));
});

test('every masterwork can be fused the way the preview does it: both at max level, one starsteel, host takes the effect', async () => {
  const { createRun } = await import('../src/game/run.js');
  const { addWeapon, levelUpWeapon } = await import('../src/game/weapons.js');
  const { fuse } = await import('../src/game/fusion.js');
  for (const m of MASTERWORKS) {
    const run = createRun({ seed: 7, view: { w: 480, h: 300, scale: 1, insetTop: 0, isTouch: false }, debug: { god: true }, classId: 'smith' });
    run.player.weapons.length = 0;
    const host = addWeapon(run, m.host);
    const donor = addWeapon(run, m.donor);
    for (const i of [host, donor]) while (i.level < i.def.maxLevel) levelUpWeapon(run, i);
    run.starsteel = FUSION.cost;
    const r = fuse(run, host, donor);
    assert.ok(r.ok && r.masterwork, m.id);
    assert.equal(run.player.weapons.length, 1);
  }
});

test('builds: every finished build is reachable by its class: its weapons, evolutions, passives and fusion all line up', async () => {
  const { BUILDS } = await import('../src/data/builds.js');
  const { WEAPONS } = await import('../src/data/weapons.js');
  const { CLASSES } = await import('../src/data/classes.js');
  const { EVOLUTIONS } = await import('../src/data/evolutions.js');
  const { masterworkFor } = await import('../src/game/fusion.js');
  const ok = (id, cls) => WEAPONS[id].class == null || WEAPONS[id].class === cls;
  for (const b of BUILDS) {
    const held = new Set([CLASSES[b.cls].startWeapon, ...b.weapons]);
    assert.ok(held.has(CLASSES[b.cls].startWeapon), b.id);
    for (const id of b.weapons) assert.ok(ok(id, b.cls), `${b.id}: ${id} is not offered to ${b.cls}`);
    assert.ok(b.end && b.end.weapons.length >= 2, `${b.id} has a finished build`);
    for (const id of b.end.weapons) {
      assert.ok(WEAPONS[id], `${b.id}: ${id}`);
      if (held.has(id)) continue;                                           // an unevolved weapon you simply keep
      const recipe = EVOLUTIONS.find((r) => r.into === id && held.has(r.from) && (!r.with || held.has(r.with)));
      assert.ok(recipe, `${b.id}: ${id} cannot be evolved from ${[...held].join(', ')}`);
      for (const q of recipe.requires) {
        if (q.perk) assert.ok(b.perks.includes(q.perk), `${b.id}: ${id} needs the ${q.perk} technique`);
        if (q.passive) assert.ok(b.passives.includes(q.passive), `${b.id}: ${id} needs the ${q.passive} passive`);
      }
    }
    for (const id of held) assert.ok(b.end.weapons.includes(id) || EVOLUTIONS.some((r) => (r.from === id || r.with === id) && b.end.weapons.includes(r.into)), `${b.id}: ${id} vanishes from the finished build`);
    if (b.end.fuse) {
      assert.ok(b.end.fuse.every((id) => b.end.weapons.includes(id)), `${b.id}: fusion parts must be in the finished build`);
      assert.ok(masterworkFor(b.end.fuse[0], b.end.fuse[1]), `${b.id}: ${b.end.fuse.join(' + ')} is not a masterwork`);
    }
  }
});

test('every class has at least three builds', async () => {
  const { BUILDS } = await import('../src/data/builds.js');
  const { CLASSES } = await import('../src/data/classes.js');
  for (const c of Object.keys(CLASSES)) assert.ok(BUILDS.filter((b) => b.cls === c).length >= 3, c);
});

test('every masterwork can be made by at least one class (no pair needs weapons from two different classes)', async () => {
  const { WEAPONS } = await import('../src/data/weapons.js');
  const { CLASSES } = await import('../src/data/classes.js');
  const { EVOLUTIONS } = await import('../src/data/evolutions.js');
  const okw = (id, c) => WEAPONS[id].class == null || WEAPONS[id].class === c;
  const reach = (id, c) => (WEAPONS[id].rarity !== 'evolved' ? okw(id, c)
    : EVOLUTIONS.some((r) => r.into === id && reach(r.from, c) && (!r.with || reach(r.with, c))));
  for (const m of MASTERWORKS) {
    assert.ok(Object.keys(CLASSES).some((c) => reach(m.host, c) && reach(m.donor, c)), `${m.id}: no class can make ${m.host} + ${m.donor}`);
  }
});

test('builds that end in a masterwork are hidden until it is found, and never leak through weapon entries or text', async () => {
  const { BUILDS } = await import('../src/data/builds.js');
  const none = buildEntries({ fusions: [] });
  const shown = none.filter((e) => e.tab === 'builds');
  assert.equal(shown.length, BUILDS.filter((b) => !b.end.fuse).length);
  const text = none.filter((e) => e.tab === 'builds' || e.builds.length).map((e) => [e.name, ...e.lines, ...e.builds].join(' ')).join(' ').toLowerCase();
  for (const m of MASTERWORKS) assert.ok(!text.includes(m.name.toLowerCase()), `${m.name} leaks into the builds before it is found`);
  for (const b of BUILDS.filter((x) => x.end.fuse)) {
    assert.ok(!none.some((e) => e.id === `build:${b.id}`), b.id);
    assert.ok(!none.some((e) => e.builds.includes(b.name)), `${b.name} listed under a weapon`);
  }
  const m = MASTERWORKS.find((x) => x.id === 'comet');
  const some = buildEntries({ fusions: ['comet'] });
  const comet = BUILDS.find((b) => b.id === 'comet');
  assert.ok(some.some((e) => e.id === 'build:comet'), 'found: the build appears');
  assert.ok(some.some((e) => e.builds.includes(comet.name)), 'and its weapons list it');
  assert.equal(buildEntries({ fusions: MASTERWORKS.map((x) => x.id) }).filter((e) => e.tab === 'builds').length, BUILDS.length);
});
