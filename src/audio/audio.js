// Sound: tiny synthesized blips (no audio files). Browsers only allow audio after a user
// gesture, so the context is created lazily on the first tap/key. The simulation never calls
// this directly: it calls run.sfx(name), which game.js points here, so headless tests and the
// sim stay silent and deterministic. Music (audio/music.js) shares this context; `audio.music`
// is driven by game.js scenes, and `audio.setMusic*` apply the player's music settings.
import { createMusic } from './music.js';
import { createSfx, SFX_NAMES } from './sfx.js';

export function createAudio({ enabled = true, music: musicOn = true, musicVolume = 0.6, sfxVolume = 1 } = {}) {
  const MASTER = 0.7;                    // the effects bus level at full volume
  let sfxVol = sfxVolume;
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
      master.gain.value = MASTER * sfxVol;
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
    get sfxVolume() { return sfxVol; },
    setSfxVolume(v) { sfxVol = Math.min(1, Math.max(0, v)); if (master) master.gain.value = MASTER * sfxVol; },

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
      beginAmbientSession();
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

  // Respect the iPhone silent (ringer) switch: WebAudio is muted by it unless the page holds a
  // "playback" audio session, so we ask for 'ambient' (Safari 16.4+) and never start the silent
  // <audio> keep-alive trick. 'ambient' also lets the player's own music keep playing under us.
  function beginAmbientSession() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    } catch (e) { /* ignore */ }
  }

  // First gesture anywhere creates/resumes the context. iOS only counts some events as user
  // activation for audio, so listen to all the usual ones.
  if (typeof window !== 'undefined') {
    const once = () => audio.unlock();
    for (const ev of ['pointerdown', 'touchstart', 'touchend', 'click']) {
      window.addEventListener(ev, once, { passive: true });
    }
    window.addEventListener('keydown', once);
    // Out of view means silent: suspend the context (music and sfx freeze on its clock).
    const sync = () => {
      if (document.hidden) {
        if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
      } else {
        if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', () => { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); });
    window.addEventListener('pageshow', () => { if (!document.hidden) sync(); });
  }
  return audio;
}

export const SOUND_NAMES = SFX_NAMES;
