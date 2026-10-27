// Browser check of the rig editor (optional; needs Playwright): open it from the Rig tab, select and move pieces,
// take a level-up offer, press Done. Usage: node tests/editor-smoke.mjs [outDir]   (writes e1.png ... there when given)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let chromium; try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire(execSync('npm root -g', { encoding: 'utf8' }).trim() + '/')('playwright')); }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(res); }).listen(0);
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); const errs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); }); page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
const out = process.argv[2] || '';
const shot = async (n) => { if (out) await page.screenshot({ path: out + n }); };
const info = () => page.evaluate(() => { const o = window.__overclocked; const r = o.game.run; return { state: o.game.state, t: +r.time.toFixed(2), slots: r.rigState.chains.map((c) => c.slots.join(',')), bench: r.rigState.bench.join(','), pending: r.pendingLevelUps }; });
const fail = (m) => { console.log('FAIL', m); process.exit(1); };
await page.goto(`http://localhost:${server.address().port}/?seed=3`);
await page.waitForTimeout(2500);
await page.click('.sbx-edit');
await page.waitForSelector('.overlay.sheet');
const a = await info(); if (a.state !== 'levelup') fail('editor did not pause the game: ' + a.state);
await page.waitForTimeout(500); const a2 = await info(); if (a2.t !== a.t) fail('game kept running under the editor');
await shot('e1-open.png');
await page.click('[data-act="slot:0:1"]');                       // select the Mortar in chain A
await shot('e2-selected.png');
await page.click('[data-act="gap:0:0"]');                        // insert it at the start
const m = await page.evaluate(() => document.querySelector('.rpreview').textContent);
await shot('e3-moved.png');
await page.click('[data-act="done"]');
await page.waitForTimeout(300);
const d = await info(); if (d.state !== 'run') fail('Done did not resume: ' + d.state);
if (!d.slots[0].startsWith('mortar,flame')) fail('the move was not applied: ' + d.slots[0]);
await page.click('.sbx-tab'); await page.click('[data-level]');   // a level-up with offers
await page.waitForSelector('.rcard');
await shot('e4-offers.png');
await page.click('[data-act="offer:0"]');
await shot('e5-placed.png');
await page.click('[data-act="done"]'); await page.waitForTimeout(300);
const f = await info(); if (f.state !== 'run') fail('offer Done did not resume');
console.log('ok', JSON.stringify(f), m);
if (errs.length) { console.log('console errors', errs); process.exit(1); }
await b.close(); server.close();
