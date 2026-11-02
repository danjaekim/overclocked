// Offline loudness check for the synthesized audio. Renders every song for a whole loop and every sound effect on an OfflineAudioContext in
// headless Chromium and prints RMS in dB next to the target, plus the trim that would hit it.
//   node tools/audiolevel.mjs            (needs `playwright`: NODE_PATH=$(npm root -g) node ...)
// Targets are the levels of the effects and songs this audio replaced (v0.10.8), so the mix balance
// and the player's volume settings stay where they were. Apply music trims to `trim` in
// src/audio/music.js and effect trims to SFX_TRIM in src/audio/sfx.js. Effects are measured with
// SFX_TRIM emptied, so the numbers do not depend on what is set now.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SFX_TARGET = {                       // dB RMS of the old effects; big moments sit 2 dB higher
  hit: -49.7, kill: -44.6, gem: -45.4, ore: -45.4, hurt: -42.6, levelup: -32.2, forge: -27.3, fail: -40.3, shrine: -33.8,
  boss: -28, chest: -37.3, evolve: -26.8, win: -25.7, lose: -33.6, tap: -55.9, heal: -38.3, crate: -48.6, magnet: -46.2, quench: -40.2, proc: -50,
};
const MUSIC_TARGET = { title: -23, run: -24.8, boss: -24.8 };

const mime = { '.js': 'text/javascript', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/blank.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>level</title>'); return; }
  const f = path.join(root, url);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => { console.error('page error:', e.message); });
await page.goto(base + '/blank.html');
const res = await page.evaluate(async (b) => {
  const { renderSong, MUSIC_SONGS, MUSIC_IDS } = await import(b + '/src/audio/music.js');
  const { createSfx, SFX_NAMES, SFX_TRIM } = await import(b + '/src/audio/sfx.js');
  for (const k of Object.keys(SFX_TRIM)) delete SFX_TRIM[k];
  const rms = (buf) => { const d = buf.getChannelData(0); let s = 0; for (const x of d) s += x * x; return 10 * Math.log10(s / d.length); };
  const SR = 44100, out = { music: {}, sfx: {} };
  for (const id of MUSIC_IDS) {
    const sg = MUSIC_SONGS[id], secs = (60 / sg.bpm / 4) * sg.bars * 16 + 2;
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
    const bus = ctx.createGain(); bus.gain.value = 0.5; bus.connect(ctx.destination);   // the game's music volume stage at full volume
    const saved = sg.trim; sg.trim = 1;
    renderSong(ctx, bus, id);
    sg.trim = saved;
    out.music[id] = rms(await ctx.startRendering());
  }
  for (const n of SFX_NAMES) {
    const ctx = new OfflineAudioContext(2, SR * 3, SR);
    const sfx = createSfx(ctx, ctx.destination, { bake: false }); sfx.play(n);
    out.sfx[n] = rms(await ctx.startRendering());
  }
  return out;
}, base);
await browser.close(); server.close();

const trimOf = (have, want) => Math.min(4, Math.max(0.15, Math.pow(10, (want - have) / 20)));
console.log('music (trim to apply in MUSIC_SONGS):');
for (const [id, db] of Object.entries(res.music)) console.log(`  ${id.padEnd(6)} ${db.toFixed(1)} dB  target ${MUSIC_TARGET[id]}  trim ${trimOf(db, MUSIC_TARGET[id]).toFixed(2)}`);
const t = {};
console.log('effects:');
for (const [n, db] of Object.entries(res.sfx)) { t[n] = +trimOf(db, SFX_TARGET[n]).toFixed(2); console.log(`  ${n.padEnd(8)} ${db.toFixed(1)} dB  target ${SFX_TARGET[n]}  trim ${t[n]}`); }
console.log('SFX_TRIM =', JSON.stringify(t));
