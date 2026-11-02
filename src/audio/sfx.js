// Sound effects: small layered WebAudio voices (no audio files), in the same dark industrial voice
// as the music: distorted kicks and growls, metallic pings, noise. audio.js creates one of these once
// the context exists; the sim only ever calls run.sfx(name). Frequent sounds (kill, gem, hurt) are
// rate limited and kept to a few nodes so a screen full of enemies stays cheap.
import { hz, graph, voices } from './synth.js';

export const SFX_NAMES = [
  'hit', 'kill', 'gem', 'ore', 'hurt', 'levelup', 'forge', 'fail', 'shrine',
  'boss', 'chest', 'evolve', 'win', 'lose', 'tap', 'heal', 'crate', 'magnet', 'quench', 'proc',
];

// minimum seconds between two plays of the same sound
const GAP = {
  hit: 0.05, kill: 0.04, gem: 0.03, ore: 0.05, hurt: 0.15, levelup: 0.3, forge: 0.08, fail: 0.1,
  shrine: 0.3, boss: 0.5, chest: 0.2, evolve: 0.5, win: 0.5, lose: 0.5, tap: 0.02, heal: 0.25, crate: 0.1, magnet: 0.3, quench: 0.2, proc: 0.08,
};

// Per-sound level trims, measured offline against the previous effects so the mix keeps its balance
// (tools/audiolevel.mjs prints them).
export const SFX_TRIM = {"hit":3.78,"kill":0.57,"gem":2.18,"ore":0.85,"hurt":0.46,"levelup":0.73,"forge":0.65,"fail":0.38,"shrine":0.73,"boss":0.76,"chest":1.26,"evolve":0.55,"win":0.59,"lose":0.81,"tap":1.6,"heal":1.19,"crate":0.72,"magnet":0.45,"quench":1.09,"proc":1.54};

// consecutive gem pickups climb an E minor pentatonic run, so a vacuumed pile rings upward
const PENT = [0, 3, 5, 7, 10, 12, 15, 17];

export function createSfx(ctx, dest) {
  const g = graph(ctx, dest, { echoTime: 0.17, echoFb: 0.3, rumble: false, revGain: 0.5, revSecs: 1 });
  g.duck.gain.value = 1;
  const v = voices(g);
  const O = (o) => v.osc(Object.assign({ out: 'out' }, o));
  const N = (o) => v.noise(Object.assign({ out: 'out' }, o));
  let lastGem = -10, chain = 0;
  function gemStep(t) { chain = t - lastGem < 0.45 ? Math.min(chain + 1, PENT.length - 1) : 0; lastGem = t; return PENT[chain]; }

  // p: a small random pitch factor so repeats do not sound identical
  const FX = {
    hit: (t, p) => { N({ t, dur: 0.05, vol: 0.12, bp: { from: 1800 * p, q: 1.2 } }); },
    kill: (t, p) => { N({ t, dur: 0.06, vol: 0.18, bp: { from: 1500 * p, to: 700, q: 1.5 } }); O({ t, f: 130 * p, to: 50, dur: 0.1, vol: 0.3 }); },
    gem: (t) => { v.ping(t, hz(74 + gemStep(t)), { dur: 0.12, vol: 0.06, click: 0, n: 1 }); },
    ore: (t) => { v.ping(t, 1050, { dur: 0.1, vol: 0.08, n: 3 }); v.ping(t + 0.06, 1400, { dur: 0.3, vol: 0.07, rev: 0.2, n: 3 }); },
    hurt: (t, p) => { N({ t, dur: 0.18, vol: 0.3, lp: { from: 2400, to: 300 }, dist: 6 }); O({ t, type: 'square', f: 70 * p, to: 40, dur: 0.2, vol: 0.2, dist: 6, lp: { from: 900 } }); },
    proc: (t, p) => { v.ping(t, 900 * p, { dur: 0.08, vol: 0.06, n: 1, click: 0 }); },
    levelup: (t) => {
      N({ t, dur: 0.3, vol: 0.14, a: 0.28, bp: { from: 500, to: 4000, q: 4 }, dist: 3 });
      v.chord(t + 0.3, [50, 57, 62, 69], { type: 'sawtooth', dur: 0.8, vol: 0.06, dist: 4, lp: { from: 3200, to: 500, q: 2 }, rev: 0.5, out: 'out' });
      v.metal(t + 0.3, { f: 1200, q: 3, dur: 0.6, vol: 0.12, rev: 0.6 });
      O({ t: t + 0.3, f: 120, to: 40, dur: 0.3, vol: 0.4, dist: 3 });
    },
    forge: (t) => {                                            // a heavy hammer blow, then a smaller echo of it
      v.kick(t, { vol: 0.55, dist: 4, duck: false, click: 0.3 });
      v.metal(t, { f: 1100, q: 4, dur: 0.5, vol: 0.18, dist: 3, rev: 0.4 });
      v.ping(t + 0.02, 1500, { dur: 0.6, vol: 0.08, rev: 0.4 });
      v.metal(t + 0.28, { f: 1300, q: 4, dur: 0.3, vol: 0.1, dist: 3, rev: 0.3 });
    },
    fail: (t) => {
      O({ t, type: 'sawtooth', f: hz(52), to: hz(40), dur: 0.4, vol: 0.16, dist: 5, lp: { from: 1400, to: 150 } });
      N({ t, dur: 0.12, vol: 0.12, lp: { from: 600 } });
      O({ t: t + 0.12, f: 80, to: 40, dur: 0.35, vol: 0.3, dist: 2 });
    },
    shrine: (t) => {
      v.chord(t, [52, 59, 64], { type: 'sawtooth', dur: 1.1, vol: 0.04, a: 0.15, lp: { from: 600, to: 1800, q: 2 }, rev: 0.5, dist: 1.5, out: 'out' });
      v.ping(t + 0.1, hz(88), { dur: 0.8, vol: 0.05, rev: 0.6 });
      O({ t, f: 80, dur: 1, vol: 0.2, a: 0.1 });
    },
    boss: (t) => {
      for (let i = 0; i < 3; i++) { O({ t: t + i * 0.28, f: 140, to: 40, dur: 0.25, vol: 0.4, dist: 6 }); v.metal(t + i * 0.28, { f: 700, q: 4, dur: 0.4, vol: 0.14, dist: 4, rev: 0.5 }); }
      O({ t: t + 0.84, type: 'sawtooth', f: hz(38), dur: 1.3, vol: 0.12, dist: 5, lp: { from: 1500, to: 120, q: 4 }, rev: 0.4, vib: { rate: 7, depth: 30 } });
    },
    chest: (t) => {
      N({ t, dur: 0.25, vol: 0.12, a: 0.22, bp: { from: 600, to: 5000, q: 6 } });
      [0, 5, 7, 12, 17].forEach((d, i) => v.ping(t + 0.25 + i * 0.05, hz(74 + d), { dur: 0.3, vol: 0.06, echo: 0.25, click: 0, n: 3 }));
    },
    evolve: (t) => {                                           // a rising sweep into a hoover stab and a kick
      v.sweep(t, 0.75, 0.1, 300, 5000, { q: 4, out: 'out' });
      [-25, 0, 25].forEach((dt) => [50, 57, 62].forEach((n) => O({ t: t + 0.75, type: 'sawtooth', f: hz(n + 7), to: hz(n), glide: 0.1, detune: dt, dur: 1, vol: 0.02, lp: { from: 2400, to: 500, q: 2 }, dist: 4, rev: 0.4 })));
      v.kick(t + 0.75, { vol: 0.7, dist: 4, duck: false });
    },
    win: (t) => {
      [[50, 57, 62], [46, 53, 58], [48, 55, 60], [50, 57, 62, 66]].forEach((c, i) => {
        v.chord(t + i * 0.3, c, { type: 'sawtooth', dur: i === 3 ? 1.8 : 0.28, vol: 0.05, dist: 3, sustain: i === 3, rel: 0.6, lp: { from: 2600, to: 900 }, rev: 0.5, out: 'out' });
        O({ t: t + i * 0.3, f: 140, to: 45, dur: 0.25, vol: 0.35, dist: 4 });
      });
    },
    lose: (t) => {
      [0, 0.2, 0.4].forEach((d, i) => v.metal(t + d, { f: 900 - i * 200, q: 5, dur: 0.4, vol: 0.12, dist: 3, rev: 0.5 }));
      O({ t: t + 0.6, type: 'sawtooth', f: hz(38), to: hz(26), glide: 1.6, dur: 1.7, vol: 0.14, dist: 6, lp: { from: 1200, to: 80, q: 3 }, rev: 0.3 });
    },
    tap: (t) => { v.ping(t, 1500, { dur: 0.03, vol: 0.04, n: 1 }); },
    heal: (t) => { v.chord(t, [62, 69, 74], { type: 'triangle', dur: 0.55, vol: 0.07, a: 0.1, rev: 0.4, out: 'out' }); N({ t, dur: 0.5, vol: 0.04, a: 0.2, hp: { from: 5000 } }); },
    crate: (t) => { v.metal(t, { f: 900, q: 2, dur: 0.12, vol: 0.12, dist: 4 }); N({ t, dur: 0.08, vol: 0.08, bp: { from: 500, q: 1 }, dist: 4 }); },
    magnet: (t) => { O({ t, type: 'sawtooth', f: 60, to: 360, dur: 0.5, vol: 0.12, dist: 4, lp: { from: 300, to: 2000, q: 5 } }); },
    quench: (t) => {                                           // hot metal dipped in cold water: a hiss, then two pings
      N({ t, dur: 0.3, vol: 0.1, hp: { from: 4000 } });
      v.ping(t + 0.12, 1100, { dur: 0.5, vol: 0.07, rev: 0.3 });
      v.ping(t + 0.2, 1650, { dur: 0.4, vol: 0.05, rev: 0.3 });
    },
  };

  // A screen full of enemies fires kills, gems and hits many times a second, and every sound is a handful
  // of audio nodes. Frequent sounds share a budget per 100 ms (smaller when playback is struggling, see
  // setLite), and are thinned out in lite mode; the rare, important sounds always play.
  const CHEAP = new Set(['hit', 'kill', 'gem', 'ore', 'proc', 'crate', 'tap', 'magnet']);
  const BUDGET = [6, 4, 2];
  let lite = 0, recent = [], skip = 0;
  const last = {};
  return {
    setLite(n) { lite = Math.max(0, Math.min(2, n | 0)); },
    // Returns true if the sound started. Rate limited per sound.
    play(name) {
      const fx = FX[name];
      if (!fx) return false;
      const t = ctx.currentTime;
      if (t - (last[name] ?? -1) < (GAP[name] ?? 0.05)) return false;
      if (CHEAP.has(name)) {
        if (lite >= 1 && (name === 'hit' || name === 'proc')) return false;
        if (lite >= 1 && (name === 'kill' || name === 'gem') && (skip++ % (lite + 1)) !== 0) return false;
        recent = recent.filter((x) => t - x < 0.1);
        if (recent.length >= BUDGET[lite]) return false;
        recent.push(t);
      }
      last[name] = t;
      g.vmul = SFX_TRIM[name] || 1;
      fx(t + 0.005, 0.96 + Math.random() * 0.08);
      g.vmul = 1;
      return true;
    },
  };
}
