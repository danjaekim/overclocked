// Sound: tiny synthesized blips (no audio files). Browsers only allow audio after a user
// gesture, so the context is created lazily on the first tap/key. The simulation never calls
// this directly: it calls run.sfx(name), which game.js points here, so headless tests and the
// sim stay silent and deterministic. Music (audio/music.js) shares this context; `audio.music`
// is driven by game.js scenes, and `audio.setMusic*` apply the player's music settings.
import { createMusic } from './music.js';
import { createSfx, SFX_NAMES } from './sfx.js';

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

export function createAudio({ enabled = true, music: musicOn = true, musicVolume = 0.6 } = {}) {
  let ctx = null;
  let master = null;
  let sfx = null;
  let on = enabled;
  let mOn = musicOn;
  const music = createMusic();
  music.setVolume(musicVolume);
  music.setEnabled(on && mOn);
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);

  function ensure() {
    if (ctx || !AC) return ctx;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      sfx = createSfx(ctx, master);
      music.attach(ctx, ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  const audio = {
    get enabled() { return on; },
    setEnabled(v) { on = !!v; music.setEnabled(on && mOn); },

    music,
    get musicEnabled() { return mOn; },
    setMusicEnabled(v) { mOn = !!v; music.setEnabled(on && mOn); },
    setMusicVolume(v) { music.setVolume(v); },

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
      sfx.play(name);
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
    // Out of view means silent: suspend the context (music and sfx freeze on its clock) and stop
    // the silent keep-alive element, which would otherwise hold the audio session open.
    const sync = () => {
      if (document.hidden) {
        if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
        if (keepAlive) keepAlive.pause();
      } else {
        if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
        if (keepAlive) keepAlive.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', () => { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); });
    window.addEventListener('pageshow', () => { if (!document.hidden) sync(); });
  }
  return audio;
}

export const SOUND_NAMES = SFX_NAMES;
