// Zero-dependency test runner:  node tests/run.mjs
// Each tests/*.test.mjs file default-exports nothing and calls test(name, fn) from ./harness.mjs.

import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { results } from './harness.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort();

for (const f of files) {
  console.log(`\n${f}`);
  await import(pathToFileURL(path.join(dir, f)).href);
  await results.flush();
}

console.log(`\n${results.passed} passed, ${results.failed} failed`);
process.exit(results.failed ? 1 : 0);
