// Sound effects: small layered WebAudio voices (no audio files). audio.js creates one of these
// once the context exists; the sim only ever calls run.sfx(name). Frequent sounds (kill, gem,
// hurt) are rate limited and kept to a few nodes so a screen full of enemies stays cheap.

export const SFX_NAMES = [
  'hit', 'kill', 'gem', 'ore', 'hurt', 'levelup', 'forge', 'fail', 'shrine',
  'boss', 'chest', 'evolve', 'win', 'lose', 'tap',
];

// minimum seconds between two plays of the same sound
const GAP = {
  hit: 0.05, kill: 0.04, gem: 0.03, ore: 0.05, hurt: 0.15, levelup: 0.3, forge: 0.08, fail: 0.1,
  shrine: 0.3, boss: 0.5, chest: 0.2, evolve: 0.5, win: 0.5, lose: 0.5, tap: 0.02,
};

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];

export function createSfx(ctx, dest) {
  let noiseBuf = null;
  function noiseBuffer() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // One enveloped oscillator: a frequency (optionally gliding to `to`), a decay or sustained note.
  function osc({ t, f, to, dur, vol, type = 'sine', a = 0.004, sustain = false, lp, detune }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    if (detune) o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (sustain) {
      g.gain.setValueAtTime(vol, Math.max(t + a, t + dur - 0.04));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    let src = o;
    if (lp) {
      const f2 = ctx.createBiquadFilter();
      f2.type = 'lowpass'; f2.Q.value = lp.q || 1;
      f2.frequency.setValueAtTime(lp.from, t);
      f2.frequency.exponentialRampToValueAtTime(lp.to, t + dur);
      o.connect(f2); src = f2;
    }
    src.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noise(t, dur, vol, type, freq, q, sweepTo) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); if (q) f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // a struck anvil or bell: a click plus inharmonic partials
  function clink(t, v) {
    noise(t, 0.04, v * 1.6, 'bandpass', 3800, 1.5);
    [1250, 1871, 2514, 3320].forEach((f, i) => osc({ t, f, dur: 0.9 - i * 0.15, vol: v * (1 - i * 0.2) }));
  }

  const kick = (t) => { osc({ t, f: 170, to: 44, dur: 0.26, vol: 0.5 }); noise(t, 0.015, 0.1, 'lowpass', 1500); };

  let lastGem = -10;
  let gemChain = 0;

  // p: a small random pitch factor so repeats do not sound identical
  const FX = {
    hit: (t, p) => { noise(t, 0.04, 0.09, 'highpass', 2500); osc({ t, type: 'square', f: 330 * p, to: 120, dur: 0.07, vol: 0.08 }); },
    kill: (t, p) => { osc({ t, type: 'triangle', f: 300 * p, to: 70, dur: 0.16, vol: 0.16 }); noise(t, 0.09, 0.1, 'bandpass', 1200, 0.8); },
    // consecutive pickups climb a major scale, so a vacuumed pile of gems rings upward
    gem: (t, p) => {
      gemChain = t - lastGem < 0.45 ? Math.min(gemChain + 1, MAJOR.length - 1) : 0;
      lastGem = t;
      const f = 880 * Math.pow(2, MAJOR[gemChain] / 12) * (gemChain ? 1 : p);
      osc({ t, f, dur: 0.1, vol: 0.1 });
      osc({ t: t + 0.05, f: f * 1.5, dur: 0.14, vol: 0.09 });
    },
    ore: (t, p) => { clink(t, 0.05 * p); },
    hurt: (t, p) => { osc({ t, type: 'sawtooth', f: 220 * p, to: 55, dur: 0.22, vol: 0.2, lp: { from: 1800, to: 200 } }); noise(t, 0.14, 0.2, 'lowpass', 800); },
    levelup: (t) => {
      [60, 64, 67, 72, 76, 79].forEach((n, i) => osc({ t: t + i * 0.075, type: 'square', f: hz(n), dur: 0.22, vol: 0.09 }));
      osc({ t: t + 0.45, f: hz(84), dur: 0.7, vol: 0.12 });
      osc({ t: t + 0.45, type: 'triangle', f: hz(72), dur: 0.7, vol: 0.1 });
    },
    forge: (t) => { clink(t, 0.2); osc({ t, f: 110, to: 45, dur: 0.3, vol: 0.5 }); clink(t + 0.28, 0.12); },
    fail: (t) => {
      osc({ t, type: 'sawtooth', f: 240, to: 80, dur: 0.35, vol: 0.14, lp: { from: 1600, to: 150 } });
      osc({ t: t + 0.12, type: 'triangle', f: 180, to: 60, dur: 0.3, vol: 0.14 });
      noise(t, 0.1, 0.1, 'lowpass', 600);
    },
    shrine: (t) => {
      [520, 780, 1040].forEach((f, i) => osc({ t: t + i * 0.06, f, dur: 0.9, vol: 0.09 - i * 0.02, a: 0.12 }));
      osc({ t, type: 'triangle', f: 130, dur: 0.9, vol: 0.12, a: 0.15 });
    },
    boss: (t) => {                                              // two low horn blasts and a rumble
      for (let i = 0; i < 2; i++) {
        osc({ t: t + i * 0.42, type: 'sawtooth', f: 92, to: 62, dur: 0.38, vol: 0.2, lp: { from: 900, to: 220 } });
        osc({ t: t + i * 0.42, type: 'sine', f: 46, dur: 0.38, vol: 0.32 });
      }
      noise(t, 0.9, 0.12, 'lowpass', 300, 1, 120);
    },
    chest: (t) => {
      osc({ t, type: 'triangle', f: 260, to: 1040, dur: 0.35, vol: 0.18 });
      [2093, 2637, 3136, 3520, 4186].forEach((f, i) => osc({ t: t + 0.3 + i * 0.06, f, dur: 0.3, vol: 0.07 }));
    },
    evolve: (t) => {
      osc({ t, type: 'sawtooth', f: 160, to: 1800, dur: 0.75, vol: 0.1, lp: { from: 600, to: 5000 } });
      noise(t, 0.75, 0.1, 'highpass', 3000);
      [60, 64, 67, 72].forEach((n) => {
        osc({ t: t + 0.75, type: 'square', f: hz(n), dur: 1.1, vol: 0.08 });
        osc({ t: t + 0.75, type: 'triangle', f: hz(n - 12), dur: 1.1, vol: 0.12 });
      });
      kick(t + 0.75);
    },
    win: (t) => {                                               // a short fanfare ending on a held major chord
      [60, 64, 67, 72, 67, 72, 76].forEach((n, i) => osc({ t: t + i * 0.11, type: 'square', f: hz(n), dur: 0.16, vol: 0.09 }));
      [60, 64, 67, 72].forEach((n) => {
        osc({ t: t + 0.8, type: 'triangle', f: hz(n), dur: 1.4, vol: 0.11, a: 0.02 });
        osc({ t: t + 0.8, type: 'square', f: hz(n + 12), dur: 1.4, vol: 0.04 });
      });
      kick(t + 0.8);
    },
    lose: (t) => {                                              // falling minor line, then a low sag
      [69, 65, 62, 57].forEach((n, i) => osc({ t: t + i * 0.2, type: 'triangle', f: hz(n), dur: 0.3, vol: 0.14 }));
      osc({ t: t + 0.8, type: 'sawtooth', f: hz(45), to: hz(40), dur: 1, vol: 0.12, lp: { from: 700, to: 120 } });
    },
    tap: (t) => { osc({ t, f: 700, to: 520, dur: 0.04, vol: 0.06 }); noise(t, 0.015, 0.04, 'highpass', 5000); },
  };

  const last = {};
  return {
    // Returns true if the sound started. Rate limited per sound.
    play(name) {
      const fx = FX[name];
      if (!fx) return false;
      const t = ctx.currentTime;
      if (t - (last[name] ?? -1) < (GAP[name] ?? 0.05)) return false;
      last[name] = t;
      fx(t + 0.005, 0.96 + Math.random() * 0.08);
      return true;
    },
  };
}
