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
