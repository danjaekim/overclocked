// M45j: a separate volume for sound effects (saved, validated, applied to the effects bus only).

import { test, assert } from './harness.mjs';
import { DEFAULTS, normalize, createSave } from '../src/save/save.js';
import { createAudio } from '../src/audio/audio.js';
import { musicControlsHtml } from '../src/ui/music-controls.js';

test('sfxVolume defaults to the original level, clamps, and ignores junk', () => {
  assert.equal(DEFAULTS.sfxVolume, 1);
  assert.equal(normalize({ sfxVolume: 0.25 }).sfxVolume, 0.25);
  assert.equal(normalize({ sfxVolume: 7 }).sfxVolume, 1);
  assert.equal(normalize({ sfxVolume: -2 }).sfxVolume, 0);
  assert.equal(normalize({ sfxVolume: 'loud' }).sfxVolume, 1);
  assert.equal(normalize({}).musicVolume, 0.6);                      // music is untouched
});

test('setSfxVolume persists and leaves the music volume alone', () => {
  const mem = {}; const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  const save = createSave(storage);
  save.setSfxVolume(0.3);
  assert.equal(createSave(storage).data.sfxVolume, 0.3);
  assert.equal(createSave(storage).data.musicVolume, 0.6);
});

test('audio keeps its own effects volume without a context', () => {
  const a = createAudio({ sfxVolume: 0.5 });
  assert.equal(a.sfxVolume, 0.5);
  a.setSfxVolume(2); assert.equal(a.sfxVolume, 1);
  a.setSfxVolume(0.2); assert.equal(a.sfxVolume, 0.2);
});

test('the sound rows have an effects slider and a music slider', () => {
  const html = musicControlsHtml({ music: true, volume: 0.6, sfxVolume: 0.4 });
  assert.ok(/data-vol="sfx"[^>]*>/.test(html) && /data-vol="music"/.test(html));
  assert.ok(/value="40"/.test(html) && /value="60"/.test(html));
});
