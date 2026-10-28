// Browser check of the full run (optional; needs Playwright): boots to the run, takes a level-up offer, opens a chest, a capacity
// level-up and the results screen. Usage: node tests/run-smoke.mjs [outDir]   (writes r1.png ... there when given)
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
const fail = (m) => { console.log('FAIL', m); process.exit(1); };
const info = () => page.evaluate(() => { const g = window.__overclocked.game; const r = g.run; return { state: g.state, t: +r.time.toFixed(2), lv: r.player.level, over: r.over, chains: r.rigState.chains.map((c) => c.slots.length + ':' + c.slots.filter(Boolean).join(',')), levels: r.rigState.levels, rigRun: r.rigRun }; });
await page.goto(`http://localhost:${server.address().port}/?seed=3`);
await page.waitForTimeout(2500);
let s = await info();
if (s.state !== 'run' || !s.rigRun) fail('did not boot to the run: ' + JSON.stringify(s));
if (s.chains.join() !== '3:blaster') fail('start rig: ' + s.chains);
await shot('r1-run.png');
// a level-up: pick the first card
await page.evaluate(() => { window.__overclocked.game.run.pendingLevelUps++; });
await page.waitForSelector('.rcard'); await shot('r2-levelup.png');
await page.click('.rcard >> nth=0'); await shot('r3-picked.png');
await page.click('[data-act="done"]'); await page.waitForTimeout(300);
s = await info(); if (s.state !== 'run') fail('level-up Done did not resume: ' + s.state);
// a capacity level-up (level 10 gives two chassis and a slot while a chain is free)
await page.evaluate(() => { const r = window.__overclocked.game.run; r.player.level = 10; r.pendingLevelUps++; });
await page.waitForSelector('.rcard.chassis'); await shot('r4-capacity.png');
const chs = await page.locator('.rcard.chassis').count(); if (chs !== 2) fail('chassis cards: ' + chs);
await page.click('.rcard.chassis >> nth=0'); await page.click('[data-act="done"]'); await page.waitForTimeout(300);
s = await info(); if (s.chains.length !== 2) fail('the chassis did not add a chain: ' + s.chains);
// boss chests: the reveal, then the editor offers their chassis. The first fills the third chain, the second replaces one.
for (let k = 0; k < 2; k++) {
  await page.evaluate(() => { window.__overclocked.game.run.pendingChests.push(1); });
  await page.waitForSelector('.card.reveal'); await page.waitForTimeout(2600); await shot(`r5-chest${k}.png`);
  await page.click('[data-act="done"]'); await page.waitForTimeout(300);
  if ((await info()).state === 'treasure') fail('Collect did not leave the chest screen');
  await page.waitForSelector('.rcard.chassis');
  await page.click('.rcard.chassis >> nth=0');
  if (k === 1) { await page.waitForSelector('[data-act="swap:1"]'); await shot('r6-swap.png'); await page.click('[data-act="swap:1"]'); }
  await page.click('[data-act="done"]'); await page.waitForTimeout(300);
}
s = await info(); if (s.chains.length !== 3 || s.state !== 'run') fail('after the chests: ' + JSON.stringify(s));
// pause: the menu has the debug sandbox
await page.mouse.click(360, 40);                                 // the pause button
await page.waitForSelector('[data-act="sandbox"]'); await shot('r7-pause.png');
await page.click('[data-act="resume"]'); await page.waitForTimeout(200);
// the end: the results screen shows the rig
await page.evaluate(() => { const r = window.__overclocked.game.run; r.player.hp = 0; r.over = true; r.won = false; });
await page.waitForSelector('.rrig'); await page.waitForTimeout(300); await shot('r8-results.png');
const rigText = await page.locator('.rrig').innerText();
if (!/Blaster/.test(rigText)) fail('the results do not show the rig: ' + rigText);
await page.click('[data-act="again"]'); await page.waitForTimeout(500);
s = await info(); if (s.state !== 'run' || s.t > 2) fail('Play again did not start a new run: ' + JSON.stringify(s));
console.log('ok', JSON.stringify(s));
if (errs.length) { console.log('console errors', errs); process.exit(1); }
await b.close(); server.close();
