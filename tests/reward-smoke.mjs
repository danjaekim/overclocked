// Browser check of the boss reward screen (optional; needs Playwright): a boss chest gives the Overclocker its Overcharge screen, the pick
// is applied and shown in the editor, and the second boss offers the pieces that are left.
// Usage: node tests/reward-smoke.mjs [outDir]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let chromium; try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire(execSync('npm root -g', { encoding: 'utf8' }).trim() + '/')('playwright')); }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(res); }).listen(0);
const b = await chromium.launch();
const out = process.argv[2] || '';
const fail = (m) => { console.log('FAIL', m); process.exit(1); };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); const errs = [];
page.on('console', (m) => { if (['error'].includes(m.type())) errs.push(m.text()); }); page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
await page.goto(`http://localhost:${server.address().port}/?pilot=overclocker`); await page.waitForTimeout(1500);
// a boss chest: the Overclocker gets the reward screen instead of rolls
await page.evaluate(() => { const r = window.__overclocked.game.run; r.rigState.chains[0].slots = ['scatter', 'blaster', 'on_hit']; r.pendingChests.push(1); });
await page.waitForSelector('.overlay.reward'); await page.waitForTimeout(300);
if (out) await page.screenshot({ path: path.join(out, 'r1-reward.png') });
if ((await page.locator('.rwcard').count()) !== 3) fail('expected 3 choices: ' + (await page.locator('.rwcard').count()));
await page.click('.rwcard[data-act="pick:scatter"]'); await page.waitForTimeout(100);
if (await page.locator('[data-act="go"][disabled]').count()) fail('the confirm button stayed disabled');
await page.click('[data-act="go"]'); await page.waitForTimeout(500);
let s = await page.evaluate(() => { const g = window.__overclocked.game; return { state: g.state, rewards: g.run.rigState.rewards, n: g.run.bossRewards, editor: !!document.querySelector('.overlay.sheet'), oc: document.querySelectorAll('.slot em.oc').length }; });
if (s.state !== 'levelup' || !s.editor || s.n !== 1 || !s.rewards || s.rewards[0].piece !== 'scatter' || s.oc !== 1) fail('after the pick: ' + JSON.stringify(s));
if (out) await page.screenshot({ path: path.join(out, 'r2-editor.png') });
if (await page.locator('[data-act="skip"]').count()) await page.click('[data-act="skip"]');
await page.click('[data-act="done"]:not([disabled])'); await page.waitForTimeout(300);
s = await page.evaluate(() => ({ state: window.__overclocked.game.state }));
if (s.state !== 'run') fail('did not return to the run: ' + JSON.stringify(s));
// the second boss: a second choice, then no more
await page.evaluate(() => { window.__overclocked.game.run.pendingChests.push(1); });
await page.waitForSelector('.overlay.reward'); 
if ((await page.locator('.rwcard').count()) !== 2) fail('the second choice should leave 2 pieces');
// Rookie's Retrofit: a chain, then a rule card
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page2 = await ctx2.newPage();
page2.on('pageerror', (e) => errs.push('pageerror ' + e.message));
await page2.goto(`http://localhost:${server.address().port}/?pilot=rookie`); await page2.waitForTimeout(1500);
await page2.evaluate(() => { window.__overclocked.game.run.pendingChests.push(1); });
await page2.waitForSelector('.overlay.reward');
if (out) await page2.screenshot({ path: path.join(out, 'r3-retrofit-chain.png') });
await page2.click('.rwchain[data-act="pick:0"]'); await page2.click('[data-act="go"]'); await page2.waitForTimeout(300);
if (out) await page2.screenshot({ path: path.join(out, 'r4-retrofit-rule.png') });
if ((await page2.locator('.rwchain').count()) !== 5) fail('Retrofit rule step: ' + (await page2.locator('.rwchain').count()));
await page2.click('.rwchain[data-act="pick:reaper"]'); await page2.click('[data-act="go"]'); await page2.waitForTimeout(500);
const r = await page2.evaluate(() => { const g = window.__overclocked.game; return { state: g.state, extra: g.run.rigState.chains[0].extra, text: document.querySelector('.rpreview') && document.querySelector('.rpreview').textContent }; });
if (r.state !== 'levelup' || !r.extra || r.extra[0] !== 'reaper' || !/Reaper/.test(r.text)) fail('Retrofit: ' + JSON.stringify(r));
if (out) await page2.screenshot({ path: path.join(out, 'r5-retrofit-editor.png') });
console.log('reward smoke ok', JSON.stringify(s));
if (errs.length) { console.log('console errors', errs); process.exit(1); }
await b.close(); server.close();
