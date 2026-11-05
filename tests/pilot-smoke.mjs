// Browser check of the pilot picker (optional; needs Playwright): a plain boot shows it, a pick starts that pilot, Play again
// returns to it with the last pilot selected, ?seed= and ?pilot= skip it, and the compendium lists the pilots.
// Usage: node tests/pilot-smoke.mjs [outDir]   (writes p1-picker.png ... there when given)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let chromium; try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire(execSync('npm root -g', { encoding: 'utf8' }).trim() + '/')('playwright')); }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(res); }).listen(0);
const b = await chromium.launch();
const out = process.argv[2] || '';
const fail = (m) => { console.log('FAIL', m); process.exit(1); };
const base = `http://localhost:${server.address().port}/`;
const open = async (query = '') => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); }); page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await page.goto(base + (query ? '?' + query : '')); await page.waitForTimeout(1500);
  return { page, errs, ctx };
};
const info = (page) => page.evaluate(() => { const g = window.__overclocked.game; return { state: g.state, pilot: g.run.pilot, chassis: g.run.rigState.chains[0].chassis, t: +g.run.time.toFixed(2), picker: !!document.querySelector('.overlay.pilots'), sel: [...document.querySelectorAll('.pcard.sel')].map((c) => c.dataset.id) }; });

let { page, errs } = await open();
let s = await info(page);
if (s.state !== 'picker' || !s.picker) fail('a plain boot did not show the picker: ' + JSON.stringify(s));
if (s.sel.join() !== 'rookie') fail('first selection: ' + s.sel);
const cards = await page.locator('.pcard').count(); if (cards !== 6) fail('cards: ' + cards);
const drawn = await page.evaluate(() => [...document.querySelectorAll('.pcard canvas')].every((c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0)));
if (!drawn) fail('a pilot sprite was not drawn');
if (out) await page.screenshot({ path: out + 'p1-picker.png' });
await page.waitForTimeout(600); if ((await info(page)).t !== 0) fail('the game ticked behind the picker');
await page.click('.pcard[data-id="courier"]');                         // first tap selects
s = await info(page); if (s.sel.join() !== 'courier' || !s.picker || s.state !== 'picker') fail('first tap should only select: ' + JSON.stringify(s));
if (!(await page.textContent('[data-act="start"]')).includes('Courier')) fail('Start label');
if (out) await page.screenshot({ path: out + 'p2-courier.png' });
await page.click('[data-act="start"]'); await page.waitForTimeout(800);
s = await info(page); if (s.state !== 'run' || s.pilot !== 'courier' || s.chassis !== 'strider' || s.picker) fail('Start did not begin a Courier run: ' + JSON.stringify(s));
if ((await page.evaluate(() => window.__overclocked.save.data.lastPilot)) !== 'courier') fail('lastPilot not saved');
// New run from the pause menu: back to the picker with Courier selected; tapping the selected card starts
await page.evaluate(() => window.__overclocked.game.togglePause()); await page.waitForSelector('[data-act="quit"]');
await page.click('[data-act="quit"]'); await page.waitForSelector('.overlay.pilots');
s = await info(page); if (s.state !== 'picker' || s.sel.join() !== 'courier') fail('New run: ' + JSON.stringify(s));
await page.click('.pcard[data-id="bulwark"]'); await page.click('.pcard[data-id="bulwark"]'); await page.waitForTimeout(600);   // select, then tap again
s = await info(page); if (s.state !== 'run' || s.pilot !== 'bulwark') fail('second tap did not start: ' + JSON.stringify(s));
// Play again after a loss goes through the picker too
await page.evaluate(() => { const g = window.__overclocked.game; g.run.over = true; });
await page.waitForSelector('[data-act="again"]', { timeout: 8000 });
await page.click('[data-act="again"]'); await page.waitForSelector('.overlay.pilots');
s = await info(page); if (s.sel.join() !== 'bulwark') fail('Play again should preselect the last pilot: ' + JSON.stringify(s));
// a resumed run is not asked again: reload mid-run, the pause menu comes back with the same pilot
await page.click('.pcard[data-id="splicer"]'); await page.click('[data-act="start"]'); await page.waitForTimeout(1500);
await page.evaluate(() => window.__overclocked.game.togglePause()); await page.waitForTimeout(300);
await page.reload(); await page.waitForTimeout(1500);
s = await info(page); if (s.state !== 'paused' || s.pilot !== 'splicer') fail('resume: ' + JSON.stringify(s));
// the compendium has the pilots
await page.click('[data-act="compendium"]'); await page.click('[data-act="tab:pilots"]');
const comp = await page.textContent('.cmpbody'); if (!['Rookie', 'Courier', 'Bulwark', 'Splicer', 'Momentum', 'Hair Trigger'].every((w) => comp.includes(w))) fail('compendium: ' + comp.slice(0, 200));
if (out) await page.screenshot({ path: out + 'p3-compendium.png' });
if (errs.length) fail('console errors: ' + errs.join(' | '));
// skips: ?seed=, ?pilot=, god
for (const [q, pilot] of [['seed=3', 'rookie'], ['pilot=splicer', 'splicer'], ['god=1&seed=2&pilot=bulwark', 'bulwark'], ['god=1', 'rookie']]) {
  const c = await open(q);
  const t = await info(c.page).catch((e) => fail(`?${q} did not boot: ${c.errs.join(' | ')}`));
  if (t.state !== 'run' || t.pilot !== pilot || t.picker) fail(`?${q}: ` + JSON.stringify(t));
  if (c.errs.length) fail(`?${q} errors: ` + c.errs.join(' | '));
  await c.ctx.close();
}
console.log('pilot smoke ok');
await b.close(); server.close();
