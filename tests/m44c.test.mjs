import { test, assert } from './harness.mjs';
import { MASTERWORKS, FUSION } from '../src/data/fusions.js';


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

