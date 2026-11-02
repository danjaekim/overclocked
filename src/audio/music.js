// Music: three synthesized tracks (no audio files), played by a small look-ahead step sequencer
// on the shared WebAudio context. Dark industrial rave: hard half-time drums, short distorted growl
// stabs on a 3-3-2 rhythm, a deep sub that the kick ducks, and a low "hoover" riff (stacked saws that
// dive onto each note) in E phrygian, with the top end capped at 9 kHz.
//   title: "Static Cathedral"  118 bpm  menus (kick every other beat, pads, a sparse hoover)
//   run:   "Hoover Riot"       138 bpm  during a run
//   boss:  "Kill Switch"       146 bpm  while a boss is alive
// The sim never touches this. game.js picks the scene (audio.music.play(id)). Everything here is
// inert until audio.js attaches a context (after the first user gesture on iOS).
//
// A song is 16 bars of 16 steps. Its `step(v, bar, s, t, sd)` schedules everything that sounds on
// one sixteenth: `v` is the voice kit from synth.js, `t` the start time, `sd` the step length.

import { midi, hz, parseLine, graph, voices } from './synth.js';

export { midi, parseLine };
export const MUSIC_IDS = ['title', 'run', 'boss'];

// Bar roots and chord thirds for the 16-bar loop: E pedal, F (the phrygian second) for two bars,
// then E again, a G and F turn, and a B at the end to pull back to E.
const ROOTS = [40, 40, 40, 40, 41, 41, 40, 40, 40, 40, 40, 40, 43, 41, 40, 35];
const THIRD = [3, 3, 3, 3, 4, 4, 3, 3, 3, 3, 3, 3, 4, 4, 3, 4];

// Hoover riff: step -> [semitones above the bar root + 12, length in steps]. A plays in the first
// half, B (more movement, a tritone) in the second half and all through the boss.
const HV_A = { 0: [0, 2], 3: [0, 2], 6: [1, 1.5], 8: [0, 2], 11: [3, 2], 14: [-2, 1.5] };
const HV_B = { 0: [0, 2], 3: [0, 1.5], 6: [1, 1.5], 8: [7, 2], 10: [6, 1], 11: [7, 2], 14: [3, 2] };
export const HOOVER_RIFFS = { A: HV_A, B: HV_B };

// Growl stabs on the 3-3-2 rhythm: step -> [semitones above the root, length in steps, 1 = with a synth stab]
const GROWL = { 0: [0, 2, 1], 3: [0, 2], 6: [12, 2, 1], 8: [0, 1.5], 11: [7, 2], 14: [12, 1.5, 1] };
const GROWL_BOSS = { 2: [0, 1], 13: [7, 1.5] };

function hoover(v, bar, s, t, sd, r, riff, gain) {
  const e = riff[s];
  if (!e || (v.lite >= 2 && s % 8)) return;                    // lite 2: only the stabs on the 1 and the 3
  const m = r + 12 + e[0], d = e[1] * sd;
  v.stack({ t, oscs: [-25, 0, 25].map((dt) => ({ f: hz(m + 7), to: hz(m), detune: dt })), glide: 0.09, dur: d, vol: gain / 2, a: 0.004, lp: { from: 2300, to: 800, time: d, q: 3 }, dist: 4, echo: v.lite ? 0 : 0.2 });
}

// Risers, impacts and fills shared by the songs.
function fx(v, bar, s, t, sd, boss) {
  if (v.lite >= 2) return;
  if (bar % 8 === 7 && s === 0) v.sweep(t, sd * 16, boss ? 0.13 : 0.1, 200, 7000, { q: 2, peak: 0.98 });
  if (bar % 8 === 0 && s === 0) v.noise({ t, dur: 1.5, vol: 0.07, hp: { from: 3500 }, out: 'out', rev: 0.5 });
  if (bar % 4 === 3 && s === 8 && !v.lite) v.sweep(t, sd * 8, 0.05, 500, 3000, { q: 3, out: 'out', rev: 0.4 });
  if (bar % 8 === 7 && s >= 12) v.osc({ t, f: 250 - (s - 12) * 28, to: 80, dur: 0.18, vol: 0.28, dist: 1 });
}

function runStep(boss) {
  return function (v, bar, s, t, sd) {
    const r = ROOTS[bar], th = THIRD[bar];
    if (s === 0 || s === 6 || s === 10 || (boss && (s === 3 || s === 14))) v.kick(t, { f0: 165, f1: 45, pd: 0.05, hold: 0.03, dur: 0.42, vol: 1, dist: 4.5, lp: 3000, depth: 0.08, rel: sd * 2.6, click: 0.5, rumble: 0.4 });
    if (s === 8) { v.snare(t, { vol: 0.4, f: 180, nf: 2300, dur: 0.2, rev: v.lite ? 0 : 0.3, gate: 0.18, dist: 2.5 }); if (v.lite < 2) v.clap(t, { vol: 0.2, f: 1500, rev: v.lite ? 0 : 0.3 }); }
    if (bar % 4 === 3 && s >= (boss ? 8 : 12)) v.snare(t, { vol: 0.1 + (s - 8) * 0.025, f: 190, dur: 0.08 });
    if (s % 4 === 2 || !v.lite) v.hat(t, { dur: s % 4 === 2 ? 0.1 : 0.022, vol: s % 4 === 2 ? 0.06 : s % 2 ? 0.025 : 0.04, hp: 8000 });
    if (s % 4 === 3 && !v.lite) v.osc({ t, type: 'triangle', f: 1700, to: 1100, dur: 0.02, vol: 0.03 });
    const gp = v.lite >= 2 && (s === 3 || s === 11) ? null : GROWL[s] || (boss && !v.lite && GROWL_BOSS[s]);
    if (gp) {
      v.growl(t, r + gp[0], gp[1] * sd, 0.27, { from: 3000, to: 280, q: 12, dist: 7.5 });
      if (gp[2] && !v.lite) v.chord(t, [r + 12, r + 12 + th, r + 19], { type: 'sawtooth', dur: sd * 1.6, vol: 0.032, spread: 12, dist: 3, lp: { from: 2200, to: 700, q: 2 } });
    }
    if (s === 0) v.osc({ t, f: hz(r), dur: sd * 16, vol: 0.2, a: 0.01, sustain: true, rel: 0.05 });
    if (s === 0 && bar % 2 === 0 && v.lite < 2) v.chord(t, [r + 12, r + 12 + th, r + 19], { type: 'sawtooth', dur: sd * 32, vol: 0.016, spread: 14, a: 0.6, sustain: true, rel: 0.8, lp: { from: 500, to: 900, time: sd * 24, q: 1 }, rev: 0.5, out: 'out' });
    if (bar >= 2 || boss) hoover(v, bar, s, t, sd, r, bar >= 8 || boss ? HV_B : HV_A, boss ? 0.065 : 0.055);
    fx(v, bar, s, t, sd, boss);
  };
}

// The menu track: the same sound world at half the weight. A slow kick, pads, the sub, a hat and a
// quiet hoover on the first beats of every other bar from bar 5; growl stabs join in the second half.
function titleStep(v, bar, s, t, sd) {
  const r = ROOTS[bar], th = THIRD[bar];
  if (s % 8 === 0) v.kick(t, { f0: 150, f1: 44, pd: 0.07, hold: 0.04, dur: 0.4, vol: 0.8, dist: 3, lp: 2800, depth: 0.2, rel: sd * 5, click: 0.3, rumble: 0.4 });
  if (s % 4 === 2) v.hat(t, { dur: 0.1, vol: 0.04, hp: 8000, rev: v.lite ? 0 : 0.2 });
  if (bar >= 4 && s % 2 === 1 && !v.lite) v.hat(t, { dur: 0.022, vol: 0.015, hp: 9000 });
  if (s === 0) v.osc({ t, f: hz(r), dur: sd * 16, vol: 0.18, a: 0.01, sustain: true, rel: 0.05 });
  if (s === 0 && bar % 2 === 0) v.chord(t, [r + 12, r + 12 + th, r + 19, r + 24], { type: 'sawtooth', dur: sd * 32, vol: 0.026, spread: 14, a: 0.8, sustain: true, rel: 1, lp: { from: 450, to: 1000, time: sd * 28, q: 1 }, rev: 0.6, out: 'out' });
  if (bar >= 4 && bar % 2 === 0 && (s === 0 || s === 8)) hoover(v, bar, s, t, sd, r, { 0: [0, 3], 8: [bar % 4 === 0 ? 1 : 0, 3] }, 0.04);
  if (bar >= 8 && bar % 2 === 0 && s === 0 && v.lite < 2) v.growl(t, r, sd * 4, 0.2, { from: 2400, to: 260, q: 10, dist: 6, rumble: 0.15 });
  if (bar % 8 === 7 && s === 0 && !v.lite) v.sweep(t, sd * 16, 0.07, 200, 5000, { q: 2, peak: 0.98 });
  if (bar % 8 === 0 && s === 0 && !v.lite) v.noise({ t, dur: 1.6, vol: 0.05, hp: { from: 3500 }, out: 'out', rev: 0.5 });
}

const GRAPH = { run: { echoBeats: 0.5, echoFb: 0.3, rumble: false, revGain: 0.4 }, title: { echoBeats: 0.75, echoFb: 0.4, rumble: false, revGain: 0.5 } };
// `trim` levels each song to the same loudness (measured offline, see tools/audiolevel.mjs).
const SONGS = {
  title: { title: 'Static Cathedral', bpm: 118, bars: 16, trim: 0.72, graph: GRAPH.title, step: titleStep },
  run: { title: 'Hoover Riot', bpm: 138, bars: 16, trim: 0.38, graph: GRAPH.run, step: runStep(false) },
  boss: { title: 'Kill Switch', bpm: 146, bars: 16, trim: 0.31, graph: GRAPH.run, step: runStep(true) },
};
export const MUSIC_SONGS = SONGS;

// One song's mix graph, levelled and ready for voices.
function songGraph(ctx, dest, sg) {
  const cfg = sg.graph;
  const gr = graph(ctx, dest, { echoTime: (60 / sg.bpm) * cfg.echoBeats, echoFb: cfg.echoFb, rumble: cfg.rumble, revGain: cfg.revGain, tone: 9000, revSecs: 1.2, rumbleSecs: 0.5 });
  gr.out.gain.value = sg.trim;
  return gr;
}

// Schedules `bars` bars of a song into `dest` all at once from t = 0.05 (for an OfflineAudioContext;
// the level tool and tests use it). Returns the length in seconds.
export function renderSong(ctx, dest, id, bars = SONGS[id].bars, lite = 0) {
  const sg = SONGS[id], v = voices(songGraph(ctx, dest, sg));
  v.lite = lite;
  const sd = 60 / sg.bpm / 4;
  for (let i = 0; i < bars * 16; i++) sg.step(v, Math.floor(i / 16) % sg.bars, i % 16, 0.05 + i * sd, sd);
  return 0.05 + bars * 16 * sd;
}

// --- The player --------------------------------------------------------------------------------
//
// A song is synthesized ONCE, offline, into a looping AudioBuffer (24 kHz stereo, the reverb and echo
// tails folded back onto the start so the loop is seamless); playing it is then a single buffer source,
// which costs a phone nothing. The live synthesis below is the fallback: it plays (at its lightest) while
// the first bake runs, and wherever there is no OfflineAudioContext, such as the tests.

const BAKE_RATE = 24000, BAKE_TAIL = 2.5;
const loopSecs = (sg) => (60 / sg.bpm / 4) * sg.bars * 16;

export function createMusic() {
  let ctx = null;
  let comp = null;        // shared compressor -> out
  let out = null;         // volume node (set by attach)

  let wanted = null;      // scene the game asked for
  let enabled = true;
  let volume = 0.6;
  let ducked = false;
  let cur = null;         // { id, step, next, timer, graph, v } live, or { id, buffer: true, src, gain } baked
  let lite = 0;           // live synthesis only: 0 full, 1 and 2 drop optional layers (audio.js raises it when playback lags)

  // ---- baked songs ----
  const baked = {};       // id -> AudioBuffer
  const queue = [];       // ids waiting to be rendered
  const failed = {};
  let baking = false;
  const OAC = () => typeof globalThis !== 'undefined' && (globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext);

  function renderBuffer(id) {
    const sg = SONGS[id], loop = loopSecs(sg), N = Math.ceil((loop + BAKE_TAIL + 0.2) * BAKE_RATE);
    const oc = new (OAC())(2, N, BAKE_RATE);
    renderSong(oc, oc.destination, id, sg.bars, 0);                       // steps start at t = 0.05
    const finish = (r) => {
      const off = Math.round(0.05 * BAKE_RATE), len = Math.round(loop * BAKE_RATE);
      const buf = ctx.createBuffer(2, len, BAKE_RATE);
      for (let c = 0; c < 2; c++) {
        const src = r.getChannelData(c), dst = buf.getChannelData(c);
        for (let i = 0; i < len; i++) dst[i] = src[off + i];
        for (let i = off + len, j = 0; i < src.length; i++, j++) dst[j % len] += src[i];   // the tail wraps onto the start
      }
      return buf;
    };
    return new Promise((resolve, reject) => {
      const r = oc.startRendering();
      if (r && r.then) r.then((b) => resolve(finish(b)), reject);
      else oc.oncomplete = (e) => resolve(finish(e.renderedBuffer));
    });
  }

  function pump() {
    if (baking || !queue.length || !ctx || !OAC()) return;
    const id = queue.shift();
    if (baked[id] || failed[id]) { pump(); return; }
    baking = true;
    let p;
    try { p = renderBuffer(id); } catch (e) { p = Promise.reject(e); }
    p.then((buf) => {
      baked[id] = buf; baking = false;
      if (cur && cur.id === id && !cur.buffer && effective()) swapToBuffer();
      setTimeout(pump, 1500);                                              // the next one after a breather
    }, () => { failed[id] = true; baking = false; setTimeout(pump, 1500); });
  }

  function want(id) {
    if (!OAC() || baked[id] || failed[id] || queue.includes(id)) return;
    queue.push(id);
    pump();
  }

  function startBuffer(id, offset = 0) {
    const src = ctx.createBufferSource();
    src.buffer = baked[id]; src.loop = true;
    const gain = ctx.createGain();
    src.connect(gain); gain.connect(comp);
    src.start(ctx.currentTime + 0.02, offset % baked[id].duration);
    cur = { id, buffer: true, src, gain };
  }

  // The first bake of the song that is playing live has finished: carry on from the same spot.
  function swapToBuffer() {
    const sg = SONGS[cur.id], sd = 60 / sg.bpm / 4;
    const pos = (cur.step - (cur.next - ctx.currentTime) / sd) * sd;       // seconds into the loop now
    const id = cur.id;
    stopSong(0.12);
    startBuffer(id, Math.max(0, pos) + 0.02);
  }

  function stopSong(fade = 0.25) {
    if (!cur) return;
    const t = ctx.currentTime, c = cur;
    cur = null;
    if (c.buffer) {
      c.gain.gain.cancelScheduledValues(t);
      c.gain.gain.setValueAtTime(c.gain.gain.value, t);
      c.gain.gain.linearRampToValueAtTime(0, t + fade);
      setTimeout(() => { try { c.src.stop(); c.src.disconnect(); c.gain.disconnect(); } catch (e) { /* gone */ } }, (fade + 0.2) * 1000);
      return;
    }
    clearInterval(c.timer);
    const gr = c.graph;
    gr.out.gain.cancelScheduledValues(t);
    gr.out.gain.setValueAtTime(gr.out.gain.value, t);
    gr.out.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => gr.dispose(), (fade + 3) * 1000);
  }

  function startLive(id) {
    const sg = SONGS[id];
    const gr = songGraph(ctx, comp, sg);
    const v = voices(gr);
    v.lite = OAC() ? 2 : lite;                       // while a bake is coming, the lightest live version
    const sd = 60 / sg.bpm / 4;
    const total = sg.bars * 16;
    const c = { id, step: 0, next: ctx.currentTime + 0.08, graph: gr, timer: 0, v };
    cur = c;
    const tick = () => {
      if (cur !== c) return;
      try {
        if (c.next < ctx.currentTime - 0.4) c.next = ctx.currentTime + 0.05;   // woke from a stall: do not burst
        while (c.next < ctx.currentTime + 0.2) {
          sg.step(v, Math.floor(c.step / 16), c.step % 16, c.next, sd);
          c.next += sd;
          c.step = (c.step + 1) % total;
        }
      } catch (e) {                                  // a sound error must never loop forever or reach the game: skip ahead
        c.next += sd; c.step = (c.step + 1) % total;
      }
    };
    c.timer = setInterval(tick, 25);
    tick();
  }

  function startSong(id) {
    if (baked[id]) startBuffer(id);
    else { startLive(id); want(id); }
  }

  function effective() { return enabled && volume > 0.001; }

  function applyVolume() {
    if (!out) return;
    const v = Math.pow(volume, 1.6) * 0.5 * (ducked ? 0.35 : 1);
    out.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }

  // Brings the running song in line with what was asked for.
  function sync() {
    if (!ctx) return;
    const id = effective() ? wanted : null;
    if (cur && cur.id === id) return;
    if (cur) stopSong();
    if (id && SONGS[id]) startSong(id);
  }

  return {
    // Called by audio.js once the context exists. `dest` is where the music should be mixed.
    attach(context, dest) {
      if (ctx) return;
      ctx = context;
      out = ctx.createGain();
      comp = ctx.createDynamicsCompressor();
      comp.connect(out); out.connect(dest);
      out.gain.value = Math.pow(volume, 1.6) * 0.5 * (ducked ? 0.35 : 1);
      sync();
      MUSIC_IDS.forEach(want);                                              // then the other songs, one at a time
    },
    play(id) { wanted = id; sync(); },                    // same scene again does nothing
    stop() { wanted = null; sync(); },
    setEnabled(v) { enabled = !!v; sync(); },
    setVolume(v) { volume = Math.min(1, Math.max(0, Number(v) || 0)); applyVolume(); sync(); },
    duck(on) { ducked = !!on; applyVolume(); },
    setLite(n) { lite = Math.max(0, Math.min(2, n | 0)); if (cur && cur.v && !OAC()) cur.v.lite = lite; },
    get lite() { return lite; },
    get playing() { return cur ? cur.id : null; },
    get scene() { return wanted; },
    get bakedIds() { return Object.keys(baked); },                          // songs rendered so far (debug, soak tests)
    get mode() { return cur ? (cur.buffer ? 'baked' : 'live') : null; },
  };
}
