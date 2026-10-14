// Music: three synthesized techno tracks (no audio files), played by a small look-ahead step
// sequencer on the shared WebAudio context.
//   title: "Forge Gate"          118 bpm  menus
//   run:   "Furnace Floor"       132 bpm  during a run
//   boss:  "Warlord Overdrive"   150 bpm  while a boss is alive
// The sim never touches this. game.js picks the scene (audio.music.play(id)). Everything here is
// inert until audio.js attaches a context (after the first user gesture on iOS).
//
// A song is 8 bars of 16 steps. Melody lines hold one token per `res` steps: a note name,
// "-" (hold) or "." (rest). Parts that should pump with the kick go through `duckBus`.

export const MUSIC_IDS = ['title', 'run', 'boss'];

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midi(n) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(n);
  if (!m) throw new Error('bad note ' + n);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function parseLine(str, bar, res) {
  const ev = [];
  str.split(/\s+/).forEach((tk, i) => {
    if (tk === '.') return;
    if (tk === '-') { if (ev.length) ev[ev.length - 1].len += res; return; }
    ev.push({ step: bar * 16 + i * res, midi: midi(tk), len: res });
  });
  return ev;
}

const AM = [[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62], [57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const AM_ROOTS = [33, 33, 29, 31, 33, 33, 29, 31];

// --- Songs (data plus a per-step `custom` part for bass, stabs and pads) -----------------------

const SONGS = {
  run: {
    inst: 'tlead', bpm: 132, bars: 8, res: 2,
    lead: ['.', '.', '.', '.', 'E5 . . A5 . . C6 .', 'E5 . . A5 . . G5 .', 'F5 . . A5 . . C6 .', 'D6 . . B5 . . G5 .'],
    chords: AM, roots: AM_ROOTS,
    lanes: [{
      name: 'acid', res: 1, from: 2, lines: [
        'A2 A3 . A2 C3 . A2 . G2 . A2 A3 . C3 . E3', 'A2 A3 . A2 C3 . A2 . G2 . A2 A3 . C3 . E3',
        'F2 F3 . F2 A2 . F2 . E2 . F2 F3 . A2 . C3', 'G2 G3 . G2 B2 . G2 . F2 . G2 G3 . B2 . D3',
        'A2 A3 . A2 C3 . A2 . G2 . A2 A3 . C3 . E3', 'A2 A3 . A2 C3 . A2 . G2 . A2 A3 . C3 . E3',
        'F2 F3 . F2 A2 . F2 . E2 . F2 F3 . A2 . C3', 'G2 G3 . G2 B2 . G2 . F2 . G2 G3 . B2 . D3'],
    }],
    custom(m, sg, bar, s, t, sd) {
      const r = sg.roots[bar];
      if (s % 4 !== 0) m.osc({ t, type: 'sawtooth', f: hz(r), dur: sd * 0.9, vol: 0.2, out: m.duckBus, lp: { from: 420, to: 420, q: 4 } });
      if (bar >= 4 && s % 4 === 2) {
        sg.chords[bar].forEach((n, i) => {
          m.osc({ t, type: 'sawtooth', f: hz(n + 12), dur: sd * 1.4, vol: 0.03, detune: (i - 1) * 14, out: m.duckBus, echo: 0.35, lp: { from: 3000, to: 900, time: 0.18 } });
        });
      }
      if (bar === 7 && s === 8) m.noiseSweep(t, sd * 8, 0.22, 400, 9000);
    },
    drums(bar, s) {
      const d = [];
      if (s % 4 === 0) d.push('K');
      if (s % 4 === 2) d.push('o');
      if (s % 2 === 1) d.push('q');
      if (bar >= 2 && (s === 4 || s === 12)) d.push('p');
      if (s === 0 && bar % 4 === 0) d.push('x');
      if (bar === 7 && s >= 8 && s % 2 === 0) d.push('p');
      return d;
    },
  },

  title: {
    inst: 'bell', bpm: 118, bars: 8, res: 2,
    lead: ['E5 - - - A5 - - -', 'G5 - - - E5 - - -', 'A5 - - - C6 - - -', 'B5 - - - D6 - - -',
           'E6 - - - C6 - - -', 'A5 - E5 - A5 - C6 -', 'C6 - A5 - F5 - A5 -', 'D6 - B5 - G5 - - -'],
    chords: AM, roots: AM_ROOTS,
    custom(m, sg, bar, s, t, sd) {
      const r = sg.roots[bar];
      if (s === 0) {
        sg.chords[bar].forEach((n) => m.organTone(t, hz(n), sd * 16 * 0.97, 0.026, 0.6));
        m.osc({ t, type: 'sine', f: hz(r), dur: sd * 16, vol: 0.28, a: 0.05, sustain: true, rel: 0.3, out: m.duckBus });
      }
      if (bar >= 4 && s % 2 === 0) m.osc({ t, type: 'sawtooth', f: hz(r + (s % 8 === 6 ? 12 : 0)), dur: sd * 1.5, vol: 0.12, out: m.duckBus, lp: { from: 380, to: 380, q: 3 } });
      if (bar === 7 && s === 8) m.noiseSweep(t, sd * 8, 0.18, 500, 8000);
    },
    drums(bar, s) {
      const d = [];
      if (bar >= 1 && s % 8 === 0) d.push('K');
      if (bar >= 3 && s % 8 === 4) d.push('K');
      if (s % 2 === 1) d.push('q');
      if (bar >= 4 && s % 4 === 2) d.push('o');
      if (bar >= 4 && (s === 4 || s === 12)) d.push('p');
      if (s === 0 && bar === 0) d.push('x');
      return d;
    },
  },

  boss: {
    inst: 'bossorg', bpm: 150, bars: 8, res: 2,
    lead: ['E5 - F5 E5 - B4 - E5', 'G5 - F5 E5 - D5 - E5', 'F5 - A5 - C6 - A5 F5', 'E5 - F5 - G5 - B5 -',
           'E6 - D6 - B5 - G5 B5', 'C6 - B5 - A5 - G5 F5', 'G5 - B5 - D6 - B5 G5', 'F5 - E5 - F5 - E6 -'],
    chords: [[52, 55, 59], [52, 55, 59], [53, 57, 60], [53, 57, 60], [52, 55, 59], [52, 55, 59], [55, 59, 62], [53, 57, 60]],
    roots: [28, 28, 29, 29, 28, 28, 31, 29],
    lanes: [{
      name: 'acid', res: 1, from: 0, lines: [
        'E2 E3 . E2 E3 . E2 F2 E2 E3 . E2 G2 . F2 E2', 'E2 E3 . E2 E3 . E2 F2 E2 E3 . E2 G2 . F2 E2',
        'F2 F3 . F2 F3 . F2 F#2 F2 F3 . F2 A2 . G2 F2', 'F2 F3 . F2 F3 . F2 F#2 F2 F3 . F2 A2 . G2 F2',
        'E2 E3 . E2 E3 . E2 F2 E2 E3 . E2 G2 . F2 E2', 'E2 E3 . E2 E3 . E2 F2 E2 E3 . E2 G2 . F2 E2',
        'G2 G3 . G2 G3 . G2 G#2 G2 G3 . G2 B2 . A2 G2', 'F2 F3 . F2 F3 . F2 F#2 F2 F3 . F2 A2 . G2 F2'],
    }],
    custom(m, sg, bar, s, t, sd) {
      const r = sg.roots[bar];
      if (s % 4 !== 0) m.osc({ t, type: 'sawtooth', f: hz(r + 12), dur: sd * 0.9, vol: 0.12, out: m.duckBus, lp: { from: 600, to: 600, q: 5 } });
      if (s === 0) sg.chords[bar].forEach((n) => m.organTone(t, hz(n), sd * 16 * 0.97, 0.022, 0.4));
      if (bar >= 4 && (s === 6 || s === 14)) {
        sg.chords[bar].forEach((n) => m.osc({ t, type: 'sawtooth', f: hz(n + 12), dur: sd * 1.2, vol: 0.03, out: m.duckBus, lp: { from: 3200, to: 1000, time: 0.15 } }));
      }
      if (bar === 7 && s === 8) m.noiseSweep(t, sd * 8, 0.26, 300, 10000);
    },
    drums(bar, s) {
      const d = [];
      if (s % 4 === 0 || s === 11) d.push('K');
      if (s === 4 || s === 12) d.push('p', 's');
      if (s % 4 === 2) d.push('o');
      if (s % 2 === 1) d.push('q');
      if (s === 0 && bar % 4 === 0) d.push('x');
      if ((bar === 3 || bar === 7) && s >= 12) d.push('T');
      return d;
    },
  },
};

// Parse once: lead events by step, lane events by step.
for (const sg of Object.values(SONGS)) {
  sg.leadEv = {};
  sg.lead.forEach((line, bar) => parseLine(line, bar, sg.res).forEach((e) => (sg.leadEv[e.step] ||= []).push(e)));
  for (const l of sg.lanes || []) {
    l.ev = {};
    l.lines.forEach((line, bar) => parseLine(line, bar, l.res).forEach((e) => (l.ev[e.step] ||= []).push(e)));
  }
}
export const MUSIC_SONGS = SONGS;

// --- The player --------------------------------------------------------------------------------

export function createMusic() {
  let ctx = null;
  let comp = null;        // shared compressor -> out
  let out = null;         // volume node (set by attach)
  let noiseBuf = null;
  let impulse = null;
  const waves = {};
  let g = null;           // the current song's effects graph: { out, echoIn, echoDl, duckBus, revIn }

  let wanted = null;      // scene the game asked for
  let enabled = true;
  let volume = 0.6;
  let ducked = false;
  let cur = null;         // { id, step, next, timer, graph }

  // ---- voices (all take times in the context's clock) ----
  function pulse(duty) {
    if (waves[duty]) return waves[duty];
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return (waves[duty] = ctx.createPeriodicWave(re, im));
  }

  function osc(o) {
    const t = o.t, a = o.a == null ? 0.004 : o.a;
    const node = ctx.createOscillator();
    if (o.duty) node.setPeriodicWave(pulse(o.duty)); else node.type = o.type || 'square';
    node.frequency.setValueAtTime(o.f, t);
    if (o.to) node.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    if (o.detune) node.detune.value = o.detune;
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib.rate;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(o.vib.depth, t + (o.vib.delay || 0.1) + 0.12);
      l.connect(lg); lg.connect(node.detune);
      l.start(t); l.stop(t + o.dur + 0.03);
    }
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(o.vol, t + a);
    if (o.sustain) {
      const rel = o.rel || 0.04;
      gn.gain.setValueAtTime(o.vol, Math.max(t + a, t + o.dur - rel));
      gn.gain.linearRampToValueAtTime(0.0001, t + o.dur);
    } else {
      gn.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    }
    let src = node;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = o.lp.q || 1;
      f.frequency.setValueAtTime(o.lp.from, t);
      f.frequency.exponentialRampToValueAtTime(o.lp.to, t + (o.lp.time || o.dur));
      node.connect(f); src = f;
    }
    src.connect(gn); gn.connect(o.out || g.out);
    if (o.echo) { const eg = ctx.createGain(); eg.gain.value = o.echo; gn.connect(eg); eg.connect(g.echoIn); }
    if (o.rev) { const rg = ctx.createGain(); rg.gain.value = o.rev; gn.connect(rg); rg.connect(g.revIn); }
    node.start(t); node.stop(t + o.dur + 0.03);
  }

  function noise(t, dur, vol, type, freq, q) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(gn); gn.connect(g.out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  function noiseSweep(t, dur, vol, f0, f1) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(vol, t + dur); gn.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    s.connect(f); f.connect(gn); gn.connect(g.out);
    s.start(t); s.stop(t + dur + 0.1);
  }

  function duck(t) {
    g.duckBus.gain.setValueAtTime(0.28, t);
    g.duckBus.gain.linearRampToValueAtTime(1, t + 0.2);
  }

  // Additive drawbar organ: six harmonics, a little vibrato and a breathy attack.
  function organTone(t, f, dur, vol, rev) {
    const H = [1, 2, 3, 4, 6, 8], A = [1, 0.7, 0.5, 0.38, 0.22, 0.12];
    H.forEach((h, i) => {
      osc({ t, type: 'sine', f: f * h, dur, vol: vol * A[i] * 0.5, a: 0.012, sustain: true, rel: 0.05, rev, vib: i < 2 ? { rate: 5.8, depth: 6, delay: 0.1 } : null });
    });
    noise(t, 0.04, vol * 0.5, 'bandpass', 2400, 1);
  }

  const DRUM = {
    K: (t) => { osc({ t, type: 'sine', f: 170, to: 44, dur: 0.26, vol: 1 }); noise(t, 0.015, 0.2, 'lowpass', 1500); duck(t); },
    p: (t) => { [0, 0.011, 0.022].forEach((d) => noise(t + d, 0.09, 0.2, 'bandpass', 1500, 0.8)); },
    s: (t) => { noise(t, 0.15, 0.32, 'bandpass', 1900, 0.7); osc({ t, type: 'triangle', f: 210, to: 140, dur: 0.1, vol: 0.25 }); },
    q: (t) => noise(t, 0.03, 0.05, 'highpass', 8000),
    o: (t) => noise(t, 0.16, 0.12, 'highpass', 7000),
    x: (t) => noise(t, 1.1, 0.14, 'highpass', 5000),
    T: (t) => osc({ t, type: 'sine', f: 140, to: 80, dur: 0.22, vol: 0.55 }),
  };

  const LEAD = {
    tlead(t, e, f) {
      [-12, 0, 12].forEach((d) => osc({ t, type: 'sawtooth', f, dur: 0.3, vol: 0.04, detune: d, out: g.duckBus, echo: 0.4, lp: { from: 5000, to: 1600, time: 0.2 } }));
    },
    bell(t, e, f, dur) {
      osc({ t, type: 'sine', f, dur: Math.min(1.4, dur * 1.6), vol: 0.12, a: 0.006 });
      osc({ t, type: 'sine', f: f * 3.01, dur: 0.35, vol: 0.025 });
      osc({ t, type: 'triangle', f: f * 2, dur: 0.5, vol: 0.03 });
    },
    bossorg(t, e, f, dur) {
      organTone(t, f, dur, 0.06, 0.3);
      osc({ t, type: 'sawtooth', f, dur, vol: 0.035, a: 0.01, sustain: true, rel: 0.05, lp: { from: 1800, to: 1800, q: 3 } });
    },
  };

  const LANE = {
    acid(t, e, f, step, sd) {
      const accent = step % 16 === 3 || step % 16 === 11;
      osc({ t, type: 'sawtooth', f, dur: sd * 1.1, vol: accent ? 0.12 : 0.085, out: g.duckBus, echo: 0.2, lp: { from: accent ? 2800 : 1600, to: 260, time: sd * 1.1, q: 9 } });
    },
  };

  const voices = { osc, noise, noiseSweep, organTone, get duckBus() { return g.duckBus; } };

  function playStep(sg, step, t, sd) {
    const bar = Math.floor(step / 16), s = step % 16;
    (sg.leadEv[step] || []).forEach((e) => LEAD[sg.inst](t, e, hz(e.midi), e.len * sd * 0.92));
    for (const l of sg.lanes || []) {
      if (bar >= l.from) (l.ev[step] || []).forEach((e) => LANE[l.name](t, e, hz(e.midi), step, sd));
    }
    sg.custom(voices, sg, bar, s, t, sd);
    sg.drums(bar, s).forEach((d) => DRUM[d](t));
  }

  // ---- the effects graph for one song: echo (dotted eighth), church reverb, kick-pumped bus ----
  function buildGraph(bpm) {
    const gr = { out: ctx.createGain(), echoIn: ctx.createGain(), duckBus: ctx.createGain(), revIn: ctx.createGain() };
    gr.out.connect(comp);
    const dl = ctx.createDelay(1), fb = ctx.createGain(), lpf = ctx.createBiquadFilter();
    dl.delayTime.value = (60 / bpm) * 0.75; fb.gain.value = 0.4; lpf.type = 'lowpass'; lpf.frequency.value = 2800;
    gr.echoIn.connect(dl); dl.connect(lpf); lpf.connect(fb); fb.connect(dl); lpf.connect(gr.out);
    gr.duckBus.connect(gr.out);
    const conv = ctx.createConvolver(), rw = ctx.createGain();
    conv.buffer = impulse; rw.gain.value = 0.7;
    gr.revIn.connect(conv); conv.connect(rw); rw.connect(gr.out);
    return gr;
  }

  function stopSong(fade = 0.25) {
    if (!cur) return;
    clearInterval(cur.timer);
    const gr = cur.graph, t = ctx.currentTime;
    gr.out.gain.cancelScheduledValues(t);
    gr.out.gain.setValueAtTime(gr.out.gain.value, t);
    gr.out.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => { try { gr.out.disconnect(); } catch (e) { /* already gone */ } }, (fade + 1.8) * 1000);
    cur = null;
  }

  function startSong(id) {
    const sg = SONGS[id];
    const gr = buildGraph(sg.bpm);
    g = gr;
    const sd = 60 / sg.bpm / 4;
    cur = { id, step: 0, next: ctx.currentTime + 0.08, graph: gr, timer: 0 };
    const total = sg.bars * 16;
    const tick = () => {
      if (!cur || cur.graph !== gr) return;
      g = gr;
      if (cur.next < ctx.currentTime - 0.4) cur.next = ctx.currentTime + 0.05;   // woke from a stall: do not burst
      while (cur.next < ctx.currentTime + 0.2) {
        playStep(sg, cur.step, cur.next, sd);
        cur.next += sd;
        cur.step = (cur.step + 1) % total;
      }
    };
    cur.timer = setInterval(tick, 25);
    tick();
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
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const rl = Math.floor(ctx.sampleRate * 2.2);
      impulse = ctx.createBuffer(2, rl, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const cd = impulse.getChannelData(c);
        for (let j = 0; j < rl; j++) cd[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / rl, 3);
      }
      out.gain.value = Math.pow(volume, 1.6) * 0.5 * (ducked ? 0.35 : 1);
      sync();
    },
    play(id) { wanted = id; sync(); },                    // same scene again does nothing
    stop() { wanted = null; sync(); },
    setEnabled(v) { enabled = !!v; sync(); },
    setVolume(v) { volume = Math.min(1, Math.max(0, Number(v) || 0)); applyVolume(); sync(); },
    duck(on) { ducked = !!on; applyVolume(); },
    get playing() { return cur ? cur.id : null; },
    get scene() { return wanted; },
  };
}
