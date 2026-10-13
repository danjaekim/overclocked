// Sound: tiny synthesized blips (no audio files). Browsers only allow audio after a user
// gesture, so the context is created lazily on the first tap/key. The simulation never calls
// this directly: it calls run.sfx(name), which game.js points here, so headless tests and the
// sim stay silent and deterministic.

// name: [wave, startHz, endHz, seconds, gain, minGapSeconds]
const SOUNDS = {
  hit:     ['square',   300, 180, 0.04, 0.05, 0.05],
  kill:    ['triangle', 220, 120, 0.07, 0.07, 0.04],
  gem:     ['sine',     700, 1100, 0.05, 0.05, 0.035],
  ore:     ['square',   500, 800, 0.08, 0.05, 0.05],
  hurt:    ['sawtooth', 160, 70,  0.18, 0.12, 0.15],
  levelup: ['triangle', 440, 880, 0.3,  0.14, 0.3],
  forge:   ['square',   200, 400, 0.12, 0.10, 0.08],
  fail:    ['sawtooth', 220, 90,  0.25, 0.10, 0.1],
  shrine:  ['sine',     520, 780, 0.35, 0.10, 0.3],
  boss:    ['sawtooth', 90,  60,  0.7,  0.16, 0.5],
  chest:   ['triangle', 520, 1040, 0.25, 0.14, 0.2],
  evolve:  ['triangle', 330, 1320, 0.6, 0.16, 0.5],
  win:     ['triangle', 520, 1040, 0.8, 0.14, 0.5],
  lose:    ['sawtooth', 300, 60,  0.9,  0.14, 0.5],
  tap:     ['sine',     600, 600, 0.03, 0.05, 0.02],
};

// One second of 8-bit mono silence as a WAV blob URL.
function silentWavUrl() {
  const rate = 8000;
  const n = rate;
  const buf = new Uint8Array(44 + n).fill(128);
  const dv = new DataView(buf.buffer);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) buf[o + i] = t.charCodeAt(i); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  str(36, 'data'); dv.setUint32(40, n, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export function createAudio({ enabled = true } = {}) {
  let ctx = null;
  let master = null;
  let on = enabled;
  const lastPlayed = {};
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);

  function ensure() {
    if (ctx || !AC) return ctx;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  const audio = {
    get enabled() { return on; },
    setEnabled(v) { on = !!v; },

    // Call from a user gesture handler so iOS lets the context start.
    unlock() {
      const c = ensure();
      if (!c) return;
      if (c.state !== 'running') c.resume().catch(() => {});
      // iOS: a one-sample silent buffer inside the gesture fully unlocks the context
      try {
        const src = c.createBufferSource();
        src.buffer = c.createBuffer(1, 1, 22050);
        src.connect(c.destination);
        src.start(0);
      } catch (e) { /* ignore */ }
      beginPlaybackSession();
    },

    // 'none' (no WebAudio), 'suspended' (waiting for a gesture) or 'running'; shown in ?debug=1
    get state() { return ctx ? ctx.state : AC ? 'not started' : 'none'; },

    play(name) {
      if (!on || !ctx) return;
      if (ctx.state !== 'running') {            // e.g. iOS suspends it again after a call or backgrounding
        ctx.resume().catch(() => {});
        return;
      }
      const s = SOUNDS[name];
      if (!s) return;
      const t = ctx.currentTime;
      if (t - (lastPlayed[name] || -1) < s[5]) return;     // rate limit: hundreds of kills per second
      lastPlayed[name] = t;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = s[0];
      osc.frequency.setValueAtTime(s[1], t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, s[2]), t + s[3]);
      g.gain.setValueAtTime(s[4], t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + s[3]);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + s[3] + 0.02);
    },
  };

  // iPhone's silent (ringer) switch mutes WebAudio unless the page is in a "playback" audio
  // session. Safari 16.4+ has navigator.audioSession; older versions need a silent looping
  // <audio> element playing (the same trick the unmute-ios-audio library uses).
  let keepAlive = null;
  function beginPlaybackSession() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* ignore */ }
    if (keepAlive || typeof document === 'undefined') return;
    try {
      keepAlive = document.createElement('audio');
      keepAlive.setAttribute('playsinline', '');
      keepAlive.loop = true;
      keepAlive.src = silentWavUrl();
      keepAlive.play().catch(() => { keepAlive = null; });      // retried on the next gesture
    } catch (e) {
      keepAlive = null;
    }
  }

  // First gesture anywhere creates/resumes the context. iOS only counts some events as user
  // activation for audio, so listen to all the usual ones.
  if (typeof window !== 'undefined') {
    const once = () => audio.unlock();
    for (const ev of ['pointerdown', 'touchstart', 'touchend', 'click']) {
      window.addEventListener(ev, once, { passive: true });
    }
    window.addEventListener('keydown', once);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    });
  }
  return audio;
}

export const SOUND_NAMES = Object.keys(SOUNDS);
