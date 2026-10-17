// M45k: history rows use the compendium entry layout (padded title row, label/value facts).

import { test, assert } from './harness.mjs';
import { readFileSync } from 'node:fs';

test('history rows have a padded title row and facts, not bare text on the card edge', () => {
  const ui = readFileSync(new URL('../src/ui/history.js', import.meta.url), 'utf8');
  assert.ok(/class="chead" data-act="hx:/.test(ui) && /class="cfact"/.test(ui));
  assert.ok(!/class="centry hrow[^"]*" data-act=/.test(ui));
});
