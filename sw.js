// Service worker: the game loads from the phone's cache, so a slow or missing network never holds up
// the start. docs/architecture.md (M8, offline; v0.11.7 cache-first).
//   build     walks the import graph from main.js and caches every file plus the shell into a fresh
//             cache (no file list to keep in sync). Every file must arrive; a half-finished build is
//             thrown away, so the cache in use is always one whole, consistent version of the game.
//   fetch     cache-first from the cache in use. Only a file missing from it goes to the network
//             (and to any older copy if that fails).
//   update    on each page load, in the background, fetch src/version.js (8 s timeout). If the
//             version differs from the cached one, build the new version into a new cache and switch
//             to it once complete. The page already open keeps running; the next launch gets the new
//             version. So a deploy shows on the second launch after it, not the first.
// Several games can share one origin (github.io/<repo>/ pages do), and caches are per origin, so a worker
// only ever deletes caches that carry its own prefix.

const PREFIX = 'overclocked-';
const META = PREFIX + 'meta';
const SHELL = ['./', './index.html', './manifest.webmanifest', './fonts/ChakraPetch.woff2', './fonts/IBMPlexMono.woff2', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/icon-maskable-512.png'];
const VERSION_FILE = './src/version.js';
const CHECK_TIMEOUT = 8000;

const parseVersion = (text) => (/VERSION\s*=\s*['"]([^'"]+)['"]/.exec(text) || [])[1] || null;
const fresh = (u) => fetch(u, { cache: 'no-cache' });

// { name, ver } of the cache in use, kept in a small meta cache so it survives the worker being stopped.
let current;
async function getCurrent() {
  if (current !== undefined) return current;
  try {
    const r = await (await caches.open(META)).match('./current');
    current = r ? await r.json() : null;
  } catch (e) { current = null; }
  return current;
}
async function setCurrent(cur) {
  await (await caches.open(META)).put('./current', new Response(JSON.stringify(cur), { headers: { 'content-type': 'application/json' } }));
  current = cur;
}

// Drop this game's caches other than the one in use (and the meta cache). With none in use yet, keep
// everything: an older copy is still the best offline fallback.
async function cleanup() {
  const cur = await getCurrent();
  if (!cur) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== META && k !== cur.name).map((k) => caches.delete(k)));
}

// Cache the shell and every module reachable from main.js (static import/export-from and import()).
async function build() {
  const name = PREFIX + 'b' + Date.now();
  try {
    const c = await caches.open(name);
    const put = async (u) => {
      const res = await fresh(u);
      if (!res.ok) throw new Error(u + ' ' + res.status);
      await c.put(u, res.clone());
      return res;
    };
    await Promise.all(SHELL.map(put));
    const seen = new Set(['./src/main.js']);
    let wave = ['./src/main.js'];
    while (wave.length) {
      const next = [];
      await Promise.all(wave.map(async (rel) => {
        const text = await (await put(rel)).text();
        const dir = rel.replace(/[^/]*$/, '');
        for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
          const u = new URL(m[1], new URL(dir, 'http://x/')).pathname.replace(/^\//, './');
          if (!seen.has(u)) { seen.add(u); next.push(u); }
        }
      }));
      wave = next;
    }
    seen.add(VERSION_FILE);
    if (!(await c.match(VERSION_FILE))) await put(VERSION_FILE);
    const ver = parseVersion(await (await c.match(VERSION_FILE)).text());
    await setCurrent({ name, ver });
    await cleanup();
    return ver;
  } catch (e) {
    await caches.delete(name);   // never leave a half-built cache around
    throw e;
  }
}

async function remoteVersion() {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), CHECK_TIMEOUT);
  try {
    const res = await fetch(VERSION_FILE, { cache: 'no-cache', signal: ctl.signal });
    return res.ok ? parseVersion(await res.text()) : null;
  } finally { clearTimeout(t); }
}

let updating = null;
function checkForUpdate() {
  if (!updating) {
    updating = (async () => {
      const cur = await getCurrent();
      const ver = await remoteVersion();
      if (cur && (!ver || ver === cur.ver)) return;
      await build();
    })().catch(() => {}).finally(() => { updating = null; });
  }
  return updating;
}

self.addEventListener('install', (event) => {
  // The first install caches the game; a new sw.js reuses the cache in use when the version matches.
  // Install never fails, so a flaky connection cannot leave the old worker stuck in place.
  event.waitUntil(checkForUpdate().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(cleanup().catch(() => {}).then(() => self.clients.claim()));
});

async function respond(req) {
  const cur = await getCurrent();
  if (cur) {
    const c = await caches.open(cur.name);
    const hit = (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await c.match('./') : null);
    if (hit) return hit;
  }
  try {
    return await fetch(req);
  } catch (e) {
    const old = await caches.match(req, { ignoreSearch: true });
    if (old) return old;
    if (req.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (new URL(req.url).pathname.endsWith('/sw.js')) return;
  event.respondWith(respond(req));
  if (req.mode === 'navigate') event.waitUntil(checkForUpdate());
});
