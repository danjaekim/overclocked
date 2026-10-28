// Browser check of run resume: pause a run, reload the page (the app closing), and land back in the same run at its pause menu.
// node tests/resume-smoke.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let chromium; try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire(execSync('npm root -g', { encoding: 'utf8' }).trim() + '/')('playwright')); }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(res); }).listen(0);
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); const errs = [];
page.on('console', (m) => { if (['error'].includes(m.type())) errs.push(m.text()); }); page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
const fail = (m) => { console.log('FAIL', m); process.exit(1); };
const info = () => page.evaluate(() => { const g = window.__overclocked.game; const r = g.run; return { state: g.state, t: +r.time.toFixed(2), kills: r.kills, lv: r.player.level, chains: r.rigState.chains.map((c) => c.chassis + ':' + c.slots.filter(Boolean).join(',')), saved: !!localStorage.getItem('overclocked.run.v1'), insts: r.rig.insts.length }; });
const url = `http://localhost:${server.address().port}/`;
await page.goto(url); await page.waitForTimeout(1500);
// a rig worth saving, a few seconds of play, then a pause
await page.evaluate(() => { const r = window.__overclocked.game.run; r.rigState.chains[0].slots = ['blaster', 'flame', 'mortar']; r.rigState.levels = { blaster: 3 }; r.player.level = 5; r.pendingChests.push(0); });
await page.waitForSelector('.card.reveal'); await page.waitForTimeout(2200);
let s = await info(); if (s.state !== 'treasure' || !s.saved) fail('the chest screen did not save the run: ' + JSON.stringify(s));
await page.click('[data-act="done"]:not([disabled])'); await page.waitForTimeout(300);
if (await page.locator('.overlay.sheet').count()) {                // the editor, maybe with a chassis on offer (skip it)
  if (await page.locator('[data-act="skip"]').count()) await page.click('[data-act="skip"]');
  await page.click('[data-act="done"]:not([disabled])');
}
await page.waitForTimeout(3500);
await page.mouse.click(360, 40);                                  // pause
await page.waitForSelector('[data-act="resume"]');
const before = await info(); if (before.state !== 'paused' || !before.saved || before.t < 3) fail('pause did not save: ' + JSON.stringify(before));
// the app closes and opens again
await page.reload(); await page.waitForTimeout(1500);
const after = await info();
if (after.state !== 'paused') fail('did not come back to the pause menu: ' + JSON.stringify(after));
if (after.t !== before.t || after.kills !== before.kills || after.chains.join() !== before.chains.join() || after.insts !== before.insts) fail('not the same run: ' + JSON.stringify([before, after]));
await page.waitForSelector('[data-act="resume"]');
await page.click('[data-act="resume"]'); await page.waitForTimeout(2500);
const played = await info(); if (played.state !== 'run' || played.t < after.t + 1.5) fail('the resumed run did not play on: ' + JSON.stringify(played));
// quitting to a new run forgets the saved one
await page.mouse.click(360, 40); await page.waitForSelector('[data-act="quit"]');
await page.click('[data-act="quit"]'); await page.waitForTimeout(800);
s = await info(); if (s.saved || s.t > 2) fail('a new run should not leave the old save: ' + JSON.stringify(s));
await page.reload(); await page.waitForTimeout(1200);        // leaving the page paused and saved the new run, so it comes back paused
s = await info(); if (s.state !== 'paused' || s.t > 3) fail('the new run should be what resumes: ' + JSON.stringify(s));
// a corrupt save is dropped and a fresh run starts
await page.close();
const p2 = await ctx.newPage();
p2.on('pageerror', (e) => errs.push('pageerror ' + e.message));
await p2.addInitScript(() => localStorage.setItem('overclocked.run.v1', '{"format":2,"nodes":[1]}'));
await p2.goto(url); await p2.waitForTimeout(1200);
const fresh = await p2.evaluate(() => { const g = window.__overclocked.game; return { state: g.state, t: g.run.time, saved: !!localStorage.getItem('overclocked.run.v1') }; });
if (fresh.state !== 'run' || fresh.t > 3 || fresh.saved) fail('a corrupt save should be dropped: ' + JSON.stringify(fresh));
console.log('ok', JSON.stringify({ before, after, played }));
if (errs.length) { console.log('console errors', errs); process.exit(1); }
await b.close(); server.close();
