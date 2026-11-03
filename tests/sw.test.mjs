// The service worker only deletes caches that carry its own prefix. Games published under the same
// github.io origin share cache storage, so a worker that wiped "every other cache" would delete the
// other game's offline copy. It also keeps its meta cache and the cache in use.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, assert } from './harness.mjs';

function load(currentName) {
  const listeners = {};
  const deleted = [];
  const caches = {
    keys: async () => ['overclocked-v2', 'overclocked-b1', 'overclocked-b2', 'overclocked-meta', 'overforged-v3', 'someone-elses-v1'],
    delete: async (k) => { deleted.push(k); return true; },
    open: async () => ({ match: async () => (currentName ? { json: async () => ({ name: currentName, ver: '1' }) } : undefined) }),
  };
  const self = {
    location: { origin: 'http://x' },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), { self, caches, fetch: async () => ({}), URL, Response, AbortController, setTimeout, clearTimeout });
  return { listeners, deleted };
}

test('sw activate drops this game\'s old caches and leaves other games\' caches alone', async () => {
  const { listeners, deleted } = load('overclocked-b2');
  let waited;
  listeners.activate({ waitUntil: (p) => { waited = p; } });
  await waited;
  assert.deepEqual(deleted, ['overclocked-v2', 'overclocked-b1']);
});

test('sw with no complete cache yet keeps older copies as an offline fallback', async () => {
  const { listeners, deleted } = load(null);
  let waited;
  listeners.activate({ waitUntil: (p) => { waited = p; } });
  await waited;
  assert.deepEqual(deleted, []);
});
