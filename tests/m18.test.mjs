// M18: music. The three songs parse (right token counts), play a full loop against a fake
// WebAudio context without throwing, switch scenes, and respect enable/volume; the save keeps
// the music settings.
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { createMusic, MUSIC_IDS, MUSIC_SONGS, midi } from '../src/audio/music.js';
import { createSave, normalize, DEFAULTS } from '../src/save/save.js';

function param() {
  return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} };
}
function node(extra = {}) {
  return { connect() {}, disconnect() {}, start() {}, stop() {}, ...extra };
}
function fakeCtx() {
  const made = { osc: 0, noise: 0 };
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: 'running', made,
    createOscillator() { made.osc++; return node({ frequency: param(), detune: param(), setPeriodicWave() {} }); },
    createGain() { return node({ gain: param() }); },
    createBiquadFilter() { return node({ frequency: param(), Q: param() }); },
    createBufferSource() { made.noise++; return node({}); },
    createDelay() { return node({ delayTime: param() }); },
    createConvolver() { return node({}); },
    createDynamicsCompressor() { return node({}); },
    createPeriodicWave() { return {}; },
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; },
    destination: node(),
  };
  return ctx;
}

// Runs a music instance with a captured interval so a whole loop can be driven instantly.
function drive(music, ctx, seconds) {
  const real = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  const ticks = new Set();
  globalThis.setInterval = (fn) => { ticks.add(fn); return fn; };
  globalThis.clearInterval = (fn) => ticks.delete(fn);
  const run = () => { for (let t = 0; t < seconds; t += 0.025) { ctx.currentTime += 0.025; [...ticks].forEach((f) => f()); } };
  return { run, restore() { globalThis.setInterval = real; globalThis.clearInterval = realClear; } };
}

test('every song line has the right token count', () => {
  for (const id of MUSIC_IDS) {
    const sg = MUSIC_SONGS[id];
    assert.equal(sg.lead.length, sg.bars, id + ' lead bars');
    sg.lead.forEach((l, i) => { if (l !== '.') assert.equal(l.trim().split(/\s+/).length, 16 / sg.res, `${id} lead bar ${i}`); });
    for (const lane of sg.lanes || []) {
      assert.equal(lane.lines.length, sg.bars, id + ' lane bars');
      lane.lines.forEach((l, i) => assert.equal(l.trim().split(/\s+/).length, 16 / lane.res, `${id} lane bar ${i}`));
    }
    assert.equal(sg.chords.length, sg.bars);
    assert.equal(sg.roots.length, sg.bars);
  }
  assert.equal(midi('A4'), 69);
});

test('each song plays a full loop on a fake context', () => {
  for (const id of MUSIC_IDS) {
    const ctx = fakeCtx();
    const music = createMusic();
    const sg = MUSIC_SONGS[id];
    const loop = (60 / sg.bpm / 4) * sg.bars * 16;
    const d = drive(music, ctx, loop + 1);
    try {
      music.attach(ctx, ctx.destination);
      music.play(id);
      assert.equal(music.playing, id);
      d.run();
      assert.ok(ctx.made.osc > 200, id + ' made ' + ctx.made.osc + ' oscillators');
    } finally { d.restore(); }
  }
});

test('play before attach starts once the context exists; scenes switch; stop and disable silence it', () => {
  const ctx = fakeCtx();
  const music = createMusic();
  const d = drive(music, ctx, 0);
  try {
    music.play('title');
    assert.equal(music.playing, null);               // no context yet
    music.attach(ctx, ctx.destination);
    assert.equal(music.playing, 'title');
    music.play('title');
    assert.equal(music.playing, 'title');
    music.play('boss');
    assert.equal(music.playing, 'boss');
    music.setEnabled(false);
    assert.equal(music.playing, null);
    assert.equal(music.scene, 'boss');               // remembered, so it returns when re-enabled
    music.setEnabled(true);
    assert.equal(music.playing, 'boss');
    music.setVolume(0);
    assert.equal(music.playing, null);
    music.setVolume(0.5);
    assert.equal(music.playing, 'boss');
    music.stop();
    assert.equal(music.playing, null);
  } finally { d.restore(); }
});

test('save keeps music settings and clamps bad values', () => {
  assert.equal(DEFAULTS.music, true);
  assert.equal(DEFAULTS.musicVolume, 0.6);
  assert.equal(normalize({ music: false, musicVolume: 0.25 }).music, false);
  assert.equal(normalize({ music: false, musicVolume: 0.25 }).musicVolume, 0.25);
  assert.equal(normalize({ musicVolume: 7 }).musicVolume, 1);
  assert.equal(normalize({ musicVolume: -2 }).musicVolume, 0);
  assert.equal(normalize({ musicVolume: 'loud', music: 'yes' }).musicVolume, 0.6);
  const mem = {};
  const store = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  const s = createSave(store);
  s.setMusic(false); s.setMusicVolume(0.3);
  const again = createSave(store);
  assert.equal(again.data.music, false);
  assert.equal(again.data.musicVolume, 0.3);
});

test('every sound effect plays on a fake context, is rate limited, and gems climb', async () => {
  const { createSfx, SFX_NAMES } = await import('../src/audio/sfx.js');
  const ctx = fakeCtx();
  const sfx = createSfx(ctx, ctx.destination);
  for (const n of SFX_NAMES) {
    ctx.currentTime += 1;
    const before = ctx.made.osc + ctx.made.noise;
    assert.equal(sfx.play(n), true, n + ' starts');
    assert.ok(ctx.made.osc + ctx.made.noise > before, n + ' makes sound');
  }
  assert.equal(sfx.play('nope'), false);
  ctx.currentTime += 1;
  assert.equal(sfx.play('kill'), true);
  assert.equal(sfx.play('kill'), false, 'a second kill in the same instant is dropped');
  // a run of gems within 0.45 s keeps working (the chain climbs), a gap resets it
  ctx.currentTime += 1;
  let ok = 0;
  for (let i = 0; i < 10; i++) { ctx.currentTime += 0.05; if (sfx.play('gem')) ok++; }
  assert.ok(ok >= 8);
});

test('every class and enemy has sprite art, well-formed, with no baked-in hounds', async () => {
  const { SPRITE_ART } = await import('../src/render/sprite-art.js');
  const { CLASSES } = await import('../src/data/classes.js');
  const { ENEMIES } = await import('../src/data/enemies.js');
  const LOOT = ['gem0', 'gem1', 'gem2', 'gem3', 'ore_iron', 'ore_starsteel', 'chest', 'bosschest', 'shrine'];
  for (const id of [...Object.keys(CLASSES), ...Object.keys(ENEMIES), ...LOOT]) {
    const svg = SPRITE_ART[id];
    assert.ok(svg && svg.startsWith('<svg') && svg.endsWith('</svg>'), id + ' has art');
    assert.ok(!svg.includes('<use'), id + ' has no <use> leftovers');
    for (const tag of ['g', 'defs', 'filter']) {
      assert.equal((svg.match(new RegExp('<' + tag + '[ >]', 'g')) || []).length, (svg.match(new RegExp('</' + tag + '>', 'g')) || []).length, id + ' balanced <' + tag + '>');
    }
  }
  const { getSprite, spriteUrl } = await import('../src/render/sprites.js');
  assert.equal(getSprite('smith'), null);                       // no DOM here: the renderer falls back to the disc
  assert.ok(spriteUrl('smith').startsWith('data:image/svg+xml'));
});

test('title and results scenes use real sprites and differ for win and loss', async () => {
  const { titleSceneHtml, resultsSceneHtml } = await import('../src/ui/scenes.js');
  const t = titleSceneHtml();
  assert.equal((t.match(/<img/g) || []).length, 7);               // anvil + six heroes
  const win = resultsSceneHtml('archer', true), lose = resultsSceneHtml('archer', false);
  assert.ok(win.includes('class="scene rscene win"') && lose.includes('class="scene rscene lose"'));
  assert.ok(win.includes('glow') && !lose.includes('glow'));
  assert.ok(!win.includes('src=""') && !lose.includes('src=""'));
});
