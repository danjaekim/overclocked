// Offline / bad-connection check for sw.js:
//   1. load once online, wait for the service worker to cache the game
//   2. offline: reload boots from the cache
//   3. very slow network (every response held 15 s): reload still boots in a couple of seconds
//   4. a new deploy (version.js changes): the next load still runs the cached version and builds the
//      new one in the background; the load after that runs the new version
// Usage: node tests/offline.mjs   (needs playwright, found the same way as smoke.mjs)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright'));
}
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/json', '.woff2': 'font/woff2' };
let delay = 0, deployed = null;   // deployed: a fake newer version string served from src/version.js
const srv = http.createServer((q, r) => {
  const rel = decodeURIComponent(q.url.split('?')[0]);
  let p = path.join(root, rel);
  if (p.endsWith('/')) p += 'index.html';
  if (!fs.existsSync(p)) { r.statusCode = 404; return r.end(); }
  let body = fs.readFileSync(p);
  if (deployed && rel.endsWith('/src/version.js')) body = Buffer.from(body.toString().replace(/VERSION = '[^']+'/, `VERSION = '${deployed}'`));
  r.setHeader('content-type', TYPES[path.extname(p)] || 'application/octet-stream');
  setTimeout(() => { try { r.end(body); } catch { /* closed */ } }, rel.endsWith('/sw.js') ? 0 : delay);
}).listen(0);
const url = `http://localhost:${srv.address().port}/`;
const b = await chromium.launch();
const ctx = await b.newContext();
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
const swState = (pg) => pg.evaluate(async () => {
  const cur = await (await (await caches.open('overclocked-meta')).match('./current'))?.json();
  if (!cur) return { files: 0 };
  const keys = await (await caches.open(cur.name)).keys();
  return { ver: cur.ver, files: keys.length, fonts: keys.filter((r) => r.url.endsWith('.woff2')).length };
});
const until = async (pg, fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await pg.waitForTimeout(200); } return false; };
const ver = async (pg) => pg.evaluate(async () => (await import('./src/version.js')).VERSION);
const boot = async (label) => {
  const pg = await ctx.newPage();
  const t = Date.now();
  await pg.goto(url, { timeout: 60000 }).catch(() => {});
  const ok = await pg.waitForFunction(() => window.__overclocked, null, { timeout: 10000 }).then(() => true, () => false);
  return { pg, ok, ms: Date.now() - t, label };
};

// 1. first visit
const p1 = await boot('first');
await p1.pg.evaluate(() => navigator.serviceWorker.ready);
await until(p1.pg, async () => (await swState(p1.pg)).files > 50);
const s1 = await swState(p1.pg);
check(s1.files > 50 && s1.fonts === 2, `first visit cached ${s1.files} files, ${s1.fonts} fonts (version ${s1.ver})`);

// 2. offline
await ctx.setOffline(true);
const p2 = await boot('offline');
check(p2.ok, `offline reload boots (${p2.ms} ms)`);
await ctx.setOffline(false);

// 3. very slow network
delay = 15000;
const p3 = await boot('slow');
check(p3.ok && p3.ms < 5000, `reload with every response held 15 s boots in ${p3.ms} ms`);
delay = 0;
await p3.pg.waitForTimeout(9000);   // let that load's background version check time out

// 4. new deploy
deployed = '9.9.9';
const p4 = await boot('deploy-1');
check(p4.ok && (await ver(p4.pg)) === s1.ver, `first load after a deploy runs the cached ${s1.ver}`);
const built = await until(p4.pg, async () => (await swState(p4.pg)).ver === '9.9.9');
check(built, 'new version built in the background');
const p5 = await boot('deploy-2');
check(p5.ok && (await ver(p5.pg)) === '9.9.9', 'next load runs the new version');
const caches = await p5.pg.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('overclocked-')).length);
check(caches === 2, `old cache dropped (${caches} overclocked caches: meta + current)`);

await b.close();
srv.close();
if (fails.length) { console.error(`offline FAILED: ${fails.join('; ')}`); process.exit(1); }
console.log('offline ok');
