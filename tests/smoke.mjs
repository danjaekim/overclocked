// Browser smoke test (optional; needs Playwright installed): boots the game in headless
// Chromium at phone size, starts a run, plays for a few seconds, and fails on any console
// error. Usage:  node tests/smoke.mjs [--stress] [--shot out.png] [--query "debug=1&seed=3"]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// ESM ignores NODE_PATH, so fall back to the global npm root when Playwright is installed globally.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    ({ chromium } = createRequire(globalRoot + '/')('playwright'));
  } catch {
    console.log('Playwright is not installed; skipping the browser smoke test.');
    process.exit(0);
  }
}

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' });
  fs.createReadStream(f).pipe(res);
}).listen(0);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(`http://localhost:${server.address().port}/?${opt('--query', 'debug=1&god=1&seed=1&title=1')}`);
if (flag('--history')) {                                         // run history + export/import, from the title screen
  const shotH = (n) => opt('--shot') && page.screenshot({ path: opt('--shot').replace(/\.png$/, `-${n}.png`) });
  await page.evaluate(() => {
    const { save } = window.__overclocked;
    const mk = (i, cls, won) => ({
      time: 200 + i * 60, kills: 100 + i * 40, seed: 100 + i, won, bossKilled: won, classId: cls, level: 8 + i, titleIds: [],
      build: { weapons: [[cls === 'smith' ? 'forge_hammer' : 'ember_bow', 3 + i]], passives: [], perks: [['wildfire', 2]] },
      stats: { total: 20000 * (i + 1), avgDps: 90 + i * 10 },
    });
    save.recordRun(mk(0, 'archer', false), Date.now() - 86400000);
    save.recordRun(mk(1, 'smith', true), Date.now() - 3600000);
    save.recordRun(mk(2, 'archer', true), Date.now() - 60000);
  });
  await page.reload();
  await page.tap('[data-act=history]');
  await page.waitForSelector('.overlay.history');
  console.log('history rows:', await page.locator('.hrow').count());
  await shotH('history');
  await page.tap('.hrow >> nth=0');
  await shotH('history-open');
  await page.tap('[data-act="hc:smith"]');
  console.log('smith rows:', await page.locator('.hrow').count());
  await page.tap('[data-act=hw]');
  console.log('smith wins rows:', await page.locator('.hrow').count());
  await page.tap('[data-act=backup]');
  await page.tap('[data-act=export]');
  await page.waitForSelector('#export-code');
  const code = await page.inputValue('#export-code');
  console.log('code:', code.slice(0, 16) + '…', code.length, 'chars');
  await shotH('backup-export');
  await page.tap('[data-act=main]');
  await page.fill('#import-code', code.slice(0, -5));
  await page.tap('[data-act=check]');
  console.log('bad code message:', await page.textContent('.bmsg'));
  await page.fill('#import-code', code);
  await page.tap('[data-act=check]');
  await page.waitForSelector('[data-act=apply]');
  await shotH('backup-confirm');
  await page.tap('[data-act=apply]');
  console.log('after import:', await page.textContent('.bmsg'));
  await page.tap('[data-act=close]');
  await page.waitForSelector('.hrow');
  console.log('history rows after import:', await page.locator('.hrow').count());
  await page.tap('[data-act=close]');
  await page.waitForSelector('[data-act=play]');
}
if (flag('--guide')) {                                           // the compendium, from the title screen
  await page.tap('[data-act=guide]');
  await page.waitForSelector('.overlay.compendium');
  const shotG = (n) => opt('--shot') && page.screenshot({ path: opt('--shot').replace(/\.png$/, `-${n}.png`) });
  await shotG('guide-weapons');
  await page.tap('[data-act="cf:element:fire"]');
  console.log('fire weapons:', await page.locator('.centry').count());
  await page.tap('.centry >> nth=0');
  await shotG('guide-open');
  await page.tap('[data-act="ct:techniques"]');
  await page.fill('.csearch', 'chain');
  console.log('techniques matching chain:', await page.locator('.centry').count());
  await shotG('guide-search');
  await page.tap('[data-act="ct:builds"]');
  await shotG('guide-builds');
  await page.tap('[data-act=close]');
  await page.waitForSelector('[data-act=play]');
}
if (flag('--music')) {                                           // music scenes, the settings row and the save
  const mus = () => page.evaluate(() => window.__overclocked.audio.music.playing);
  const shotM = (n) => opt('--shot') && page.screenshot({ path: opt('--shot').replace(/\.png$/, `-${n}.png`) });
  await page.tap('[data-act=music]');                             // a tap is also the audio-unlock gesture
  await page.tap('[data-act=music]');
  await page.waitForTimeout(400);
  console.log('title music:', await mus(), 'audio:', await page.evaluate(() => window.__overclocked.audio.state));
  await shotM('music-title');
  await page.evaluate(() => { const r = document.querySelector('input[data-vol=music]'); r.value = 30; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); });
  console.log('saved volume:', await page.evaluate(() => window.__overclocked.save.data.musicVolume));
  await page.tap('[data-act=play]');
  await page.tap('[data-act="class:smith"]');
  await page.waitForTimeout(1200);
  console.log('run music:', await mus());
  await page.keyboard.press('b');                                 // debug: the boss now
  await page.waitForTimeout(500);
  console.log('boss music:', await mus());
  await page.keyboard.press('Escape');
  await page.waitForSelector('.overlay');
  await shotM('music-pause');
  await page.tap('[data-act=music]');
  console.log('music off:', await mus(), 'saved:', await page.evaluate(() => window.__overclocked.save.data.music));
  await page.tap('[data-act=music]');
  console.log('music back on:', await mus());
  await page.tap('[data-act=resume]');
  await browser.close();
  server.close();
  if (errors.length) { console.log('console errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('music smoke ok');
  process.exit(0);
}
await page.tap('[data-act=play]');
if (flag('--ui') && opt('--shot')) {
  const shot = (name) => page.screenshot({ path: opt('--shot').replace(/\.png$/, `-${name}.png`) });
  await shot('classes');
}
await page.tap(`[data-act="class:${opt('--class', 'archer')}"]`);       // class select
if (flag('--ui') && opt('--shot')) {
  const shot = (name) => page.screenshot({ path: opt('--shot').replace(/\.png$/, `-${name}.png`) });
  await page.waitForTimeout(6000);                                // let some damage happen for the build stats
  await page.keyboard.press('l');                                 // debug: level up
  await page.waitForSelector('.overlay.levelup');
  await page.waitForTimeout(500);
  await shot('levelup');
  await page.tap('[data-act=build]');                             // the build panel, from the level-up screen
  await page.waitForSelector('.overlay.build');
  await shot('levelup-build');
  await page.tap('[data-act=back]');
  await page.waitForSelector('.overlay.levelup');
  await page.tap('[data-act=banish]');
  await shot('banish');
  await page.tap('[data-act^="pick:"]');                          // banish the first offer
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => ({ b: window.__overclocked.game.run.banished, bl: window.__overclocked.game.run.banishes }));
  console.log('banished:', JSON.stringify(info));
  await page.tap('[data-act=reroll]');
  await page.waitForTimeout(500);
  await page.tap('[data-act^="pick:"]');                          // take whatever is offered
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await shot('pause');
  await page.tap('[data-act=build]');
  await page.waitForSelector('.overlay.build');
  await shot('pause-build');
  await page.tap('[data-act=back]');
  await page.tap('[data-act=sound]');
  console.log('sound saved:', await page.evaluate(() => window.__overclocked.save.data.sound));
  await page.tap('[data-act=resume]');
  await page.tap('canvas', { position: { x: 60, y: 40 } });          // a tap on the HUD opens the build view
  await page.waitForSelector('.overlay.build', { timeout: 2000 });
  await shot('hud-build');
  await page.tap('[data-act=back]');
  await page.waitForSelector('[data-act=resume]');
  await page.tap('[data-act=resume]');
}
if (flag('--results')) {                                         // end screen with the damage breakdown
  await page.waitForTimeout(8000);
  await page.keyboard.press('r');
  await page.waitForSelector('[data-act=again]');
  if (opt('--shot')) await page.screenshot({ path: opt('--shot').replace(/\.png$/, '-results.png') });
  console.log('results damage block:', await page.locator('.build-wrap.results').count());
}
if (flag('--loadout')) await page.evaluate(() => window.__overclocked.game.run.debugLoadout());
if (flag('--boss')) await page.evaluate(() => { const o = window.__overclocked; o.game.run.debug.god = true; import('/src/game/run-events.js').then((m) => m.RUN_EVENTS.boss(o.game.run, { enemy: 'warlord' })); });
if (flag('--forge')) {
  // drive the shrine -> forge -> back-to-battle flow
  await page.evaluate(() => {
    const r = window.__overclocked.game.run;
    r.ore = 40;
    const sh = window.__overclocked.game.run.shrines;
    const w = r.world; w.enemies.releaseAll();
    r.debug.god = true;
    import('/src/systems/shrines.js').then((m) => { const s = m.spawnShrine(r); r.player.x = s.x; r.player.y = s.y; });
  });
  await page.waitForSelector('.overlay.forge', { timeout: 5000 });
  if (opt('--shot')) await page.screenshot({ path: opt('--shot').replace(/\.png$/, '-forge.png') });
  await page.tap('[data-act^="enh:"]');
  await page.tap('[data-act^="rfs:"]');
  if (opt('--shot')) await page.screenshot({ path: opt('--shot').replace(/\.png$/, '-reforge.png') });
  await page.tap('[data-act^="rfp:"]');
  const msg = await page.textContent('.fmsg');
  console.log('forge message:', msg);
  await page.tap('[data-act=done]');
  await page.waitForTimeout(500);
}
if (flag('--chest')) {
  // drive an elite -> chest pickup -> treasure screen -> back-to-battle flow
  await page.evaluate(() => {
    const r = window.__overclocked.game.run;
    r.debug.god = true;
    r.world.enemies.releaseAll();
    import('/src/systems/pickups.js').then((m) => { m.spawnChest(r, r.player.x, r.player.y, 1); });
  });
  await page.waitForSelector('.chest-count', { timeout: 5000 });
  await page.waitForTimeout(3200);
  if (opt('--shot')) await page.screenshot({ path: opt('--shot').replace(/\.png$/, '-chest.png') });
  console.log('treasure cards:', await page.locator('.card.reveal').count());
  await page.click('[data-act=done]');
  await page.waitForTimeout(500);
  console.log('state after chest:', await page.evaluate(() => window.__overclocked.game.state));
}
if (flag('--stress')) await page.evaluate(() => window.__overclocked.game.run.stress());
await page.waitForTimeout(4000);

const audioState = await page.evaluate(() => window.__overclocked.audio.state);
console.log('audio state:', audioState);
const info = await page.evaluate(() => {
  const o = window.__overclocked;
  const r = o.game.run;
  return { state: o.game.state, time: +r.time.toFixed(1), kills: r.kills, enemies: r.world.enemies.count,
    fps: +o.debug.fps.toFixed(0), simMs: +o.debug.simMs.toFixed(2) };
});
console.log(JSON.stringify(info));
if (opt('--shot')) await page.screenshot({ path: opt('--shot') });
await browser.close();
server.close();

if (errors.length) { console.log('console errors:\n' + errors.join('\n')); process.exit(1); }
if ((info.state !== 'run' && !flag('--results')) || info.time < 2) { console.log('run did not progress'); process.exit(1); }
console.log('smoke ok');
