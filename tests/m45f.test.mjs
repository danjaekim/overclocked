// M45f: the Archer gets sustain (+20 max HP, 0.3 regen) after the bot sweep showed it bled out around 8:00.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { CLASSES } from '../src/data/classes.js';
import { validateData } from '../src/data/validate.js';
import { VERSION } from '../src/version.js';

test('version bumped', () => assert.ok(/^0\.(45\.([5-9]|\d\d)|4[6-9]\.|[5-9]\d\.)/.test(VERSION), VERSION));

test('Archer: +20 max HP and 0.3 regen over a classless run; the text says so', () => {
  assert.deepEqual(validateData(), []);
  const archer = createRun({ seed: 2, view: { w: 480, h: 1040 }, classId: 'archer' });
  const none = createRun({ seed: 2, view: { w: 480, h: 1040 }, classId: 'berserker' });
  assert.ok(archer.player.stats.get('maxHp') >= 120 && archer.player.stats.get('regen') >= 0.3);
  assert.equal(none.player.stats.get('regen'), 0);
  assert.ok(CLASSES.archer.trait.text.some((t) => /regeneration/.test(t)));
});
