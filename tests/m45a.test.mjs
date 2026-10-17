// M45a: the generic temper pairs exist, validate, and Honed is 30% more damage.
import { test, assert } from './harness.mjs';
import { ENHANCE } from '../src/data/forge.js';
import { validateData } from '../src/data/validate.js';

test('generic tempers: +5 honed/hasted, +10 mighty/vast; honed is 30% more damage', () => {
  assert.deepEqual(validateData(), []);
  assert.deepEqual(ENHANCE.tempers[5].map((t) => t.id), ['honed', 'hasted']);
  assert.deepEqual(ENHANCE.tempers[10].map((t) => t.id), ['mighty', 'vast']);
  assert.equal(ENHANCE.tempers[5][0].mods[0].value, 0.3);
  assert.match(ENHANCE.tempers[5][0].desc, /30%/);
});
