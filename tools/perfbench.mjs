// Frame-cost probe (docs/plan-v011-perf.md). Replays Dan's winning run from tools/data/dan-runs-v084.json in headless
// Chromium at phone size (god mode, his rig swapped in minute by minute), then at each checkpoint times N frames of
// sim and draw separately, counts canvas calls per frame and lists the functions that took the most CPU. It also times
// the one-off jobs that block the main thread (song bake scheduling, a screen of new floor, a status-tinted sprite,
// the run save). Headless canvas is not iPhone Safari: compare numbers before and after a change, never across machines.
//   node tools/perfbench.mjs [--at 120,300,480,590] [--frames 240] [--cpu] [--once]
// About 1-2 minutes for the four default checkpoints. --cpu adds the top functions by self time; --once adds the one-off jobs.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  ({ chromium } = createRequire(execSync('npm root -g', { encoding: 'utf8' }).trim() + '/')('playwright'));
}

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const flag = (n) => args.includes(n);
const AT = opt('--at', '120,300,480,590').split(',').map(Number);
const FRAMES = Number(opt('--frames', 240));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' });
  fs.createReadStream(f).pipe(res);
}).listen(0);

const runs = JSON.parse(fs.readFileSync(path.join(root, 'tools/data/dan-runs-v084.json'), 'utf8')).runs;
const dan = runs.filter((r) => r.won).pop();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:${server.address().port}/?god=1&seed=1`);
await page.waitForTimeout(2500);
const cdp = await ctx.newCDPSession(page);

for (const at of AT) {
  await page.evaluate(async ({ at, timeline }) => {                     // fast-forward with Dan's rig as it was at each minute
    const { newRig } = await import('/src/rig/editor.js');
    const { CHASSIS, migrateChassis } = await import('/src/rig/chassis.js');
    const { applyRig } = await import('/src/game/sandbox.js');
    const o = window.__overclocked; const r = o.game.run; r.debug.god = true; o.game.state = 'run';
    const apply = (rr) => {
      const rig = newRig(rr.chains.map((c) => migrateChassis({ ...c })).map((c) => ({ chassis: CHASSIS[c.chassis] ? c.chassis : undefined, rule: c.rule, mk: c.mk || 1, charge: c.charge || 0, cell: c.cell || 0, slots: c.slots, size: 6 })));
      rig.levels = { ...(rr.levels || {}) }; rig.passives = { ...(rr.passives || {}) }; rig.stats = { ...(rr.stats || {}) };
      r.rigState = rig; applyRig(r);
    };
    let applied = -1;
    while (r.time < at) {
      let idx = -1;
      for (let i = 0; i < timeline.length; i++) if (timeline[i].t <= r.time + 60) idx = i;
      if (idx !== applied && idx >= 0) { apply(timeline[idx].rig); applied = idx; }
      r.update(1 / 60, { x: Math.sin(r.time * 0.7), y: Math.cos(r.time * 0.5) }); r.pendingLevelUps = 0;
    }
  }, { at, timeline: dan.timeline });

  if (flag('--cpu')) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const res = await page.evaluate(async (N) => {
    const o = window.__overclocked; const r = o.game.run;
    const { createRenderer } = await import('/src/render/renderer.js');
    const canvas = document.getElementById('game');
    const c2 = canvas.getContext('2d');
    const counts = {}; const orig = {};
    for (const k of ['drawImage', 'fillText', 'strokeText', 'fill', 'stroke', 'fillRect', 'save', 'createRadialGradient', 'createLinearGradient']) {
      orig[k] = c2[k]; c2[k] = function (...a) { counts[k] = (counts[k] || 0) + 1; return orig[k].apply(this, a); };
    }
    if (!o.__bench) o.__bench = createRenderer(canvas, o.view);
    const sim = [], draw = [];
    for (let i = 0; i < N; i++) {
      const t0 = performance.now();
      r.update(1 / 60, { x: Math.sin(r.time * 0.7), y: Math.cos(r.time * 0.5) }); r.pendingLevelUps = 0;
      const t1 = performance.now();
      o.__bench.draw(r, o.input, o.debug);
      sim.push(t1 - t0); draw.push(performance.now() - t1);
    }
    for (const k in orig) c2[k] = orig[k];
    const st = (a) => { const s = [...a].sort((x, y) => x - y); return { avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), max: +s[s.length - 1].toFixed(1) }; };
    for (const k in counts) counts[k] = Math.round(counts[k] / N);
    const w = r.world;
    return { t: Math.round(r.time), sim: st(sim), draw: st(draw), live: { enemies: w.enemies.count, shots: w.projectiles.count, pickups: w.pickups.count, fx: w.fx.count }, perFrame: counts };
  }, FRAMES);
  console.log(JSON.stringify(res));

  if (flag('--cpu')) {
    const prof = (await cdp.send('Profiler.stop')).profile;
    const byId = new Map(prof.nodes.map((n) => [n.id, n])); const self = new Map();
    for (const s of prof.samples) {
      const n = byId.get(s); const u = n.callFrame.url.split('/src/')[1];
      const k = `${n.callFrame.functionName || '(anon)'}${u ? ` ${u}:${n.callFrame.lineNumber + 1}` : ''}`;
      self.set(k, (self.get(k) || 0) + 1);
    }
    const tot = prof.samples.length;
    console.log('  cpu: ' + [...self].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${(100 * v / tot).toFixed(0)}% ${k}`).join(' | '));
  }

  if (flag('--once')) {
    const once = await page.evaluate(async () => {
      const o = window.__overclocked; const r = o.game.run; const out = {};
      const { snapshotRun } = await import('/src/game/run-snapshot.js');
      let t = performance.now();
      try { const js = JSON.stringify(snapshotRun(r)); out.saveKB = Math.round(js.length / 1024); } catch (e) { out.saveError = e.message; }
      out.saveMs = +(performance.now() - t).toFixed(1);
      const m = await import('/src/audio/music.js');
      out.songScheduleMs = {};
      for (const id of Object.keys(m.MUSIC_SONGS)) {
        const oc = new OfflineAudioContext(2, 24000 * 40, 24000);
        t = performance.now(); m.renderSong(oc, oc.destination, id); out.songScheduleMs[id] = Math.round(performance.now() - t);
      }
      const sp = await import('/src/render/sprites.js'); const { ST } = await import('/src/data/statuses.js');
      t = performance.now(); let n = 0;
      for (const id of sp.SPRITE_IDS) if (sp.getSprite(id, false, ST.BURN | ST.SHOCK | ST.CHILL)) n++;
      out.tintMsEach = +((performance.now() - t) / Math.max(1, n)).toFixed(1);
      const g = await import('/src/render/ground.js'); const c = { drawImage() {}, fillRect() {}, set fillStyle(v) {} };   // a stub: only the painting of the chunk is timed
      t = performance.now();
      for (let k = 0; k < 4; k++) g.drawGround(c, { x: 1e5 + k * 3000 + r.time, y: 5000 }, { w: 480, h: 1040, scale: 2 }, 'neon', 0);   // a frame paints at most one chunk (v0.11.4), so this is the cost of one
      out.floorChunkMs = +((performance.now() - t) / 4).toFixed(1);
      return out;
    });
    console.log('  once: ' + JSON.stringify(once));
  }
}
await browser.close();
server.close();
