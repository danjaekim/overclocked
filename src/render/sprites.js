// Player character sprites. The art is SVG (sprite-art.js); each is rasterized once into a small
// canvas, so drawing a character in the game is a single drawImage. Until an image has loaded
// (or where there is no DOM, e.g. tests) getSprite returns null and the renderer falls back to
// the plain disc.

import { SPRITE_ART } from './sprite-art.js';

const SIZE = 192;                       // raster size in pixels; plenty for a ~56 unit sprite at phone scale
const sprites = {};                     // id -> { img, canvas, flash }

export const SPRITE_IDS = Object.keys(SPRITE_ART);

// A data URL, usable as an <img src> (class select cards).
export function spriteUrl(id) {
  const svg = SPRITE_ART[id];
  return svg ? 'data:image/svg+xml;utf8,' + encodeURIComponent(svg) : '';
}

function load(id) {
  if (sprites[id] || typeof Image === 'undefined' || typeof document === 'undefined') return sprites[id] || null;
  const s = (sprites[id] = { img: new Image(), canvas: null, flash: null });
  s.img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = SIZE;
      c.getContext('2d').drawImage(s.img, 0, 0, SIZE, SIZE);
      // a white silhouette for the hurt flash
      const f = document.createElement('canvas');
      f.width = f.height = SIZE;
      const fx = f.getContext('2d');
      fx.drawImage(c, 0, 0);
      fx.globalCompositeOperation = 'source-atop';
      fx.fillStyle = '#ffffff';
      fx.fillRect(0, 0, SIZE, SIZE);
      s.canvas = c; s.flash = f;
    } catch (e) { s.canvas = null; }
  };
  s.img.src = spriteUrl(id);
  return s;
}

// Starts loading every sprite (called once at boot so the first run has them ready).
export function preloadSprites() { for (const id of SPRITE_IDS) load(id); }

// The rasterized canvas for a class, or null while it is not ready.
export function getSprite(id, flash = false) {
  const s = load(id);
  if (!s || !s.canvas) return null;
  return flash ? s.flash : s.canvas;
}
