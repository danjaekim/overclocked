// Shared synthesis for music and sound effects (no audio files). Voices are small WebAudio
// graphs scheduled at an absolute time; a `graph` is one mix (echo, reverb, rumble, kick duck bus,
// tone cap) that voices route into. music.js builds one per song, sfx.js one for the effects.
// Everything here is inert until a context exists.

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midi(n) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(n);
  if (!m) throw new Error('bad note ' + n);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export function parseLine(str, bar, res) {
  const ev = [];
  str.split(/\s+/).forEach((tk, i) => {
    if (tk === '.') return;
    if (tk === '-') { if (ev.length) ev[ev.length - 1].len += res; return; }
    ev.push({ step: bar * 16 + i * res, midi: midi(tk), len: res });
  });
  return ev;
}
export function lineMap(lines, res) {
  const map = {};
  lines.forEach((l, bar) => parseLine(l, bar, res).forEach((e) => (map[e.step] ||= []).push(e)));
  return map;
}

// ---- shared buffers per context ----
const cache = new WeakMap();
function assets(ctx) {
  let a = cache.get(ctx);
  if (a) return a;
  const sr = ctx.sampleRate;
  const white = ctx.createBuffer(1, sr, sr);
  const wd = white.getChannelData(0);
  for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
  // 808-style metal: six detuned square waves
  const metal = ctx.createBuffer(1, sr, sr);
  const md = metal.getChannelData(0);
  const MF = [205.3, 304.4, 369.6, 522.7, 540, 800];
  for (let i = 0; i < md.length; i++) {
    let s = 0;
    for (const f of MF) s += Math.sin(2 * Math.PI * f * 1.7 * i / sr) > 0 ? 1 : -1;
    md[i] = s / 6;
  }
  const curves = {};
  a = { white, metal, imps: {}, curves };
  cache.set(ctx, a);
  return a;
}
// dark impulse response: noise whose highs die faster than its lows; `secs` long, cached per length
function impulse(ctx, secs) {
  const A = assets(ctx), key = secs.toFixed(2);
  if (A.imps[key]) return A.imps[key];
  const sr = ctx.sampleRate, rl = Math.floor(sr * secs);
  const imp = ctx.createBuffer(2, rl, sr);
  for (let c = 0; c < 2; c++) {
    const d = imp.getChannelData(c);
    let y = 0;
    for (let j = 0; j < rl; j++) {
      const k = j / rl;
      const a2 = 0.5 * Math.pow(1 - k, 2) + 0.03;
      y += a2 * ((Math.random() * 2 - 1) - y);
      d[j] = y * Math.pow(1 - k, 2.2) * (j < sr * 0.012 ? j / (sr * 0.012) : 1);
    }
  }
  return (A.imps[key] = imp);
}
function curve(ctx, k) {
  const c = assets(ctx).curves;
  if (c[k]) return c[k];
  const n = 1024, cv = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = Math.tanh(k * x) / Math.tanh(k); }
  return (c[k] = cv);
}

// ---- a mix graph: out, duck bus, echo, reverb, rumble ----
export function graph(ctx, dest, { echoTime = 0.35, echoFb = 0.4, rumble = true, revGain = 0.6, tone = 0, revSecs = 2, rumbleSecs = 1.2 } = {}) {
  const A = assets(ctx);
  const g = { ctx };
  g.out = ctx.createGain();
  if (tone) { const tl = ctx.createBiquadFilter(); tl.type = 'lowpass'; tl.frequency.value = tone; tl.Q.value = 0.5; g.out.connect(tl); tl.connect(dest); } else g.out.connect(dest);
  g.duck = ctx.createGain(); g.duck.connect(g.out);
  // echo: dark, band limited
  g.echo = ctx.createGain();
  const dl = ctx.createDelay(2), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter();
  dl.delayTime.value = echoTime; fb.gain.value = echoFb;
  lp.type = 'lowpass'; lp.frequency.value = 2200; hp.type = 'highpass'; hp.frequency.value = 280;
  g.echo.connect(dl); dl.connect(lp); lp.connect(hp); hp.connect(fb); fb.connect(dl); hp.connect(g.duck);
  // reverb
  g.rev = ctx.createGain();
  const conv = ctx.createConvolver(); conv.buffer = impulse(ctx, revSecs);
  const rg = ctx.createGain(); rg.gain.value = revGain;
  g.rev.connect(conv); conv.connect(rg); rg.connect(g.out);
  // rumble: reverb -> lowpass -> drive -> heavy sidechain
  if (rumble) {
    g.rumble = ctx.createGain();
    const c2 = ctx.createConvolver(); c2.buffer = impulse(ctx, rumbleSecs);
    const l2 = ctx.createBiquadFilter(); l2.type = 'lowpass'; l2.frequency.value = 120; l2.Q.value = 0.9;
    const ws = ctx.createWaveShaper(); ws.curve = curve(ctx, 3);
    const l3 = ctx.createBiquadFilter(); l3.type = 'lowpass'; l3.frequency.value = 180;
    g.rumbleDuck = ctx.createGain();
    const rgain = ctx.createGain(); rgain.gain.value = 0.9;
    g.rumble.connect(c2); c2.connect(l2); l2.connect(ws); ws.connect(l3); l3.connect(rgain); rgain.connect(g.rumbleDuck); g.rumbleDuck.connect(g.out);
  }
  return g;
}

// ---- voices bound to a graph ----
export function voices(g) {
  const ctx = g.ctx, A = assets(ctx);
  function route(node, o, t, end) {
    let last = node;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; last.connect(p); last = p; }
    last.connect(o.out === 'out' ? g.out : o.out === 'none' ? g.out : g.duck);
    if (o.echo) { const e = ctx.createGain(); e.gain.value = o.echo; last.connect(e); e.connect(g.echo); }
    if (o.rev) { const r = ctx.createGain(); r.gain.value = o.rev; last.connect(r); r.connect(g.rev); }
    if (o.rumble && g.rumble) { const r = ctx.createGain(); r.gain.value = o.rumble; last.connect(r); r.connect(g.rumble); }
  }
  function env(gn, o, t) {
    const a = o.a == null ? 0.003 : o.a;
    gn.gain.setValueAtTime(0.0001, t);
    const vol = o.vol * (g.vmul || 1);
    gn.gain.linearRampToValueAtTime(vol, t + a);
    if (o.sustain) {
      const rel = o.rel || 0.04;
      gn.gain.setValueAtTime(vol, Math.max(t + a, t + o.dur - rel));
      gn.gain.linearRampToValueAtTime(0.0001, t + o.dur);
    } else gn.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  }
  function filt(src, o, t) {
    let s = src;
    for (const kind of ['lp', 'hp', 'bp']) {
      const fo = o[kind];
      if (!fo) continue;
      const f = ctx.createBiquadFilter();
      f.type = kind === 'lp' ? 'lowpass' : kind === 'hp' ? 'highpass' : 'bandpass';
      f.Q.value = fo.q || (kind === 'bp' ? 1 : 0.7);
      f.frequency.setValueAtTime(fo.from, t);
      if (fo.to && fo.to !== fo.from) f.frequency.exponentialRampToValueAtTime(fo.to, t + (fo.time || o.dur));
      if (fo.lfo) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = fo.lfo.rate; lg.gain.value = fo.lfo.depth; l.connect(lg); lg.connect(f.frequency); l.start(t); l.stop(t + o.dur + 0.05); }
      s.connect(f); s = f;
    }
    if (o.dist) { const ws = ctx.createWaveShaper(); ws.curve = curve(ctx, o.dist); s.connect(ws); s = ws; }
    return s;
  }
  function osc(o) {
    const t = o.t;
    const n = ctx.createOscillator();
    n.type = o.type || 'sine';
    n.frequency.setValueAtTime(o.f, t);
    if (o.to) n.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + (o.glide || o.dur));
    if (o.detune) n.detune.value = o.detune;
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib.rate; lg.gain.value = o.vib.depth;
      l.connect(lg); lg.connect(n.detune); l.start(t); l.stop(t + o.dur + 0.05);
    }
    const gn = ctx.createGain(); env(gn, o, t);
    filt(n, o, t).connect(gn);
    route(gn, o, t);
    n.start(t); n.stop(t + o.dur + 0.05);
    return n;
  }
  // Several oscillators through ONE envelope, filter and shaper (a chord, a detuned stack): far fewer
  // nodes than one `osc` each, so thick voices stay cheap. `oscs` is [{ f, type, detune, to }]; `vol` is
  // the level each oscillator would have had alone, so a stack of n sounds like n separate voices.
  function stack(o) {
    const t = o.t, n = o.oscs.length;
    const sum = ctx.createGain(); sum.gain.value = 1 / n;
    const gn = ctx.createGain(); env(gn, Object.assign({}, o, { vol: o.vol * n }), t);
    filt(sum, o, t).connect(gn);
    route(gn, o, t);
    o.oscs.forEach((x) => {
      const nd = ctx.createOscillator();
      nd.type = x.type || o.type || 'sawtooth';
      nd.frequency.setValueAtTime(x.f, t);
      if (x.to) nd.frequency.exponentialRampToValueAtTime(Math.max(1, x.to), t + (o.glide || o.dur));
      if (x.detune) nd.detune.value = x.detune;
      nd.connect(sum); nd.start(t); nd.stop(t + o.dur + 0.05);
    });
  }
  function noise(o) {
    const t = o.t;
    const s = ctx.createBufferSource(); s.buffer = o.buf === 'metal' ? A.metal : A.white; s.loop = true;
    if (o.rate) s.playbackRate.value = o.rate;
    const gn = ctx.createGain(); env(gn, o, t);
    filt(s, o, t).connect(gn);
    route(gn, o, t);
    s.start(t, Math.random() * 0.5); s.stop(t + o.dur + 0.05);
  }
  function duck(t, depth, rel) {
    g.duck.gain.cancelScheduledValues(t);
    g.duck.gain.setValueAtTime(depth, t);
    g.duck.gain.linearRampToValueAtTime(1, t + rel);
    if (g.rumbleDuck) {
      g.rumbleDuck.gain.cancelScheduledValues(t);
      g.rumbleDuck.gain.setValueAtTime(0.02, t);
      g.rumbleDuck.gain.linearRampToValueAtTime(0.02, t + 0.06);
      g.rumbleDuck.gain.linearRampToValueAtTime(1, t + rel * 1.4);
    }
  }
  function kick(t, k = {}) {
    const vol = (k.vol || 1) * (g.vmul || 1);
    const n = ctx.createOscillator();
    n.frequency.setValueAtTime(k.f0 || 150, t);
    n.frequency.exponentialRampToValueAtTime(k.f1 || 44, t + (k.pd || 0.08));
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(vol, t);
    gn.gain.setValueAtTime(vol, t + (k.hold || 0.03));
    gn.gain.exponentialRampToValueAtTime(0.0001, t + (k.dur || 0.38));
    let s = n;
    if (k.dist) { const ws = ctx.createWaveShaper(); ws.curve = curve(ctx, k.dist); n.connect(ws); s = ws; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = k.lp || 3000; s.connect(lp); s = lp; }
    s.connect(gn); gn.connect(g.out);
    if (k.rumble && g.rumble) { const r = ctx.createGain(); r.gain.value = k.rumble; gn.connect(r); r.connect(g.rumble); }
    n.start(t); n.stop(t + (k.dur || 0.38) + 0.05);
    if (k.click !== 0) noise({ t, dur: 0.012, vol: (k.click || 0.25) * vol, lp: { from: 4000 }, out: 'out' });
    if (k.duck !== false) duck(t, k.depth == null ? 0.2 : k.depth, k.rel || 0.22);
  }
  function hat(t, h = {}) {
    noise({ t, buf: 'metal', dur: h.dur || 0.045, vol: h.vol || 0.06, hp: { from: h.hp || 7500 }, bp: h.bp ? { from: h.bp, q: 0.8 } : null, out: 'out', pan: h.pan, rev: h.rev, echo: h.echo, dist: h.dist });
    if (h.air) noise({ t, dur: h.dur || 0.045, vol: h.air, hp: { from: 9000 }, out: 'out', pan: h.pan });
  }
  function clap(t, c = {}) {
    const v = c.vol || 0.25;
    [0, 0.009, 0.02].forEach((d) => noise({ t: t + d, dur: 0.02, vol: v, bp: { from: c.f || 1300, q: 1.2 }, out: 'out' }));
    noise({ t: t + 0.03, dur: c.dur || 0.18, vol: v * 0.8, bp: { from: c.f || 1300, q: 1 }, out: 'out', rev: c.rev, dist: c.dist });
  }
  function snare(t, c = {}) {
    const v = c.vol || 0.3;
    osc({ t, f: c.f || 190, to: (c.f || 190) * 0.75, glide: 0.06, dur: 0.12, vol: v * 0.8, out: 'out', dist: c.dist });
    noise({ t, dur: c.dur || 0.2, vol: v, bp: { from: c.nf || 2600, q: 0.6 }, hp: { from: 900 }, out: 'out', rev: c.rev, dist: c.dist });
    if (c.gate) noise({ t: t + 0.01, dur: c.gate, vol: v * 0.4, a: 0.01, sustain: true, rel: 0.012, bp: { from: 1700, q: 0.5 }, out: 'out' });   // gated-reverb tail: flat, then cut
  }
  function metal(t, m = {}) {
    noise({ t, buf: 'metal', rate: m.rate || 1, dur: m.dur || 0.18, vol: m.vol || 0.12, bp: { from: m.f || 2400, q: m.q || 6 }, out: 'out', pan: m.pan, rev: m.rev, echo: m.echo, dist: m.dist });
  }
  // dark metallic ping: inharmonic sine partials
  function ping(t, f, o = {}) {
    [[1, 1], [1.52, 0.55], [2.03, 0.4], [2.71, 0.3], [3.9, 0.15]].slice(0, o.n || 5).forEach(([r, a], i) => osc({ t, f: f * r, dur: (o.dur || 0.3) * (1 - i * 0.15), vol: (o.vol || 0.1) * a, out: o.out || 'out', echo: o.echo, rev: o.rev, pan: o.pan }));
    if (o.click !== 0) noise({ t, dur: 0.008, vol: (o.vol || 0.1) * 0.8, hp: { from: 2500 }, out: o.out || 'out' });
  }
  // reese: three detuned saws and a sub through a wobbling low-pass, distorted
  function reese(t, m, dur, vol, o = {}) {
    stack({ t, oscs: [-17, 0, 17].map((d) => ({ f: hz(m), detune: d })), dur, vol: vol / 2, a: 0.005, sustain: true, rel: 0.03, lp: { from: o.cut || 500, q: o.q || 4, lfo: o.lfo }, dist: o.dist || 3, rumble: o.rumble });
    osc({ t, f: hz(m), dur, vol: vol * 0.6, a: 0.005, sustain: true, rel: 0.03 });
  }
  // growl: two detuned saws through a fast-closing resonant low-pass plus a sub, heavily distorted (midtempo bass stab)
  function growl(t, m, dur, vol, o = {}) {
    stack({ t, oscs: [-13, 13].map((d) => ({ f: hz(m), detune: d })), dur, vol: vol / 2, a: 0.004, lp: { from: o.from || 2600, to: o.to || 260, time: dur * 0.85, q: o.q || 10 }, dist: o.dist || 6, rumble: o.rumble });
    osc({ t, f: hz(m), dur, vol: vol * 1.1, a: 0.004 });
  }
  // a chord: one stack, its notes spread in detune
  function chord(t, notes, o) { stack(Object.assign({}, o, { t, oscs: notes.map((n, i) => ({ f: hz(n), detune: (o.spread || 0) * (i - (notes.length - 1) / 2) })) })); }
  function supersaw(t, f, o) { stack(Object.assign({}, o, { t, oscs: [-14, -5, 5, 14].map((d) => ({ f, type: 'sawtooth', detune: d })), vol: o.vol / 3 })); }
  function sweep(t, dur, vol, f0, f1, o = {}) {
    const s = ctx.createBufferSource(); s.buffer = A.white; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = o.q || 4;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(vol * (g.vmul || 1), t + dur * (o.peak || 1)); gn.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04);
    s.connect(f); f.connect(gn); route(gn, o, t);
    s.start(t); s.stop(t + dur + 0.1);
  }
  return { osc, stack, noise, kick, hat, clap, snare, metal, ping, reese, growl, chord, supersaw, sweep, duck, hz };
}

