// Offline check: load once online, let the service worker cache the game, go offline, reload.
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
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => {
  let p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (p.endsWith('/')) p += 'index.html';
  if (!fs.existsSync(p)) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', TYPES[path.extname(p)] || 'application/octet-stream');
  r.end(fs.readFileSync(p));
}).listen(0);
const url = `http://localhost:${srv.address().port}/`;
const b = await chromium.launch();
const ctx = await b.newContext();
const pg = await ctx.newPage();
await pg.goto(url);
await pg.waitForFunction(() => window.__overclocked);
await pg.evaluate(() => navigator.serviceWorker.ready);
await pg.waitForTimeout(1500);
const cached = await pg.evaluate(async () => (await (await caches.open('overclocked-v1')).keys()).length);
await ctx.setOffline(true);
const pg2 = await ctx.newPage();
await pg2.goto(url);
await pg2.waitForTimeout(2500);
const booted = await pg2.evaluate(() => !!window.__overclocked);
await b.close();
srv.close();
if (cached < 50 || !booted) { console.error(`offline FAILED (cached ${cached}, booted ${booted})`); process.exit(1); }
console.log(`offline ok (${cached} files cached, booted with no network)`);
