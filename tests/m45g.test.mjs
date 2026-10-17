// M45g: Summoner regen; Build and Compendium reachable from the level-up and forge screens.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { CLASSES } from '../src/data/classes.js';
import { readFileSync } from 'node:fs';

test('Summoner: 0.3 regen, text says so', () => {
  const r = createRun({ seed: 2, view: { w: 480, h: 1040 }, classId: 'summoner' });
  assert.ok(r.player.stats.get('regen') >= 0.3);
  assert.ok(CLASSES.summoner.trait.text.some((t) => /regenerates/.test(t)));
});

test('level-up and forge screens wire Build and Compendium', () => {
  const lu = readFileSync(new URL('../src/ui/levelup.js', import.meta.url), 'utf8');
  const fg = readFileSync(new URL('../src/ui/forge.js', import.meta.url), 'utf8');
  assert.ok(/data-act="guide"/.test(lu) && /data-act="build"/.test(lu));
  assert.ok(/data-act="guide"/.test(fg) && /data-act="build"/.test(fg));
});

test('Return to battle asks first while something is affordable', () => {
  const fg = readFileSync(new URL('../src/ui/forge.js', import.meta.url), 'utf8');
  assert.ok(/You can still afford/.test(fg) && /Leave anyway/.test(fg));
});
