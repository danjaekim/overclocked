// Player character sprites. The art is SVG (sprite-art.js); each is rasterized once into a small
// canvas, so drawing a character in the game is a single drawImage. Until an image has loaded
// (or where there is no DOM, e.g. tests) getSprite returns null and the renderer falls back to
// the plain disc.

import { SPRITE_ART } from './sprite-art.js';
import { ST } from '../data/statuses.js';

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
  const s = (sprites[id] = { img: new Image(), canvas: null, flash: null, tints: {} });
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

// Status looks (M45): an enemy under a status is shaded in its colour, so you read burning, chilled, frozen and shocked from
// the body itself. With several statuses the body takes the colour of the most important one (frozen, burning, shocked,
// chilled) and each of the others is an outline around it in its own colour, the next one out further. A frozen enemy
// is shown frozen, not also chilled.
const LOOKS = [                                          // in priority order
  { bit: ST.FROZEN, tint: '#cfefff', alpha: 0.5, edge: '#cfefff' },
  { bit: ST.BURN, tint: '#ff2a10', alpha: 0.42, edge: '#ff5a2a' },
  { bit: ST.SHOCK, tint: '#ffe14d', alpha: 0.42, edge: '#ffe14d' },
  { bit: ST.CHILL, tint: '#3f9bff', alpha: 0.36, edge: '#4aa8ff' },
];
const LOOK_MASK = ST.BURN | ST.CHILL | ST.FROZEN | ST.SHOCK;
const PAD = 0.84;                                        // the body is drawn this much smaller so outlines fit; the sprite is drawn 1 / PAD larger
const EDGE = 7;                                          // outline thickness in raster pixels, per ring

function silhouette(s, color) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const x = c.getContext('2d');
  x.drawImage(s.canvas, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = color;
  x.fillRect(0, 0, SIZE, SIZE);
  return c;
}

function tinted(s, mask) {
  let c = s.tints[mask];
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = SIZE;
  c.pad = 1 / PAD;
  const x = c.getContext('2d');
  const on = LOOKS.filter((l) => mask & l.bit);
  const main = on[0];
  const o = (SIZE * (1 - PAD)) / 2;
  const bw = SIZE * PAD;
  for (let i = on.length - 1; i >= 1; i--) {             // outlines, the outermost first: the sprite dilated in the colour
    const sil = silhouette(s, on[i].edge);
    const d = EDGE * i;
    x.globalAlpha = 0.95;
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      x.drawImage(sil, o + Math.cos(a) * d, o + Math.sin(a) * d, bw, bw);
    }
  }
  x.globalAlpha = 1;
  const body = document.createElement('canvas');          // the body, tinted only where it is opaque
  body.width = body.height = SIZE;
  const bx = body.getContext('2d');
  bx.drawImage(s.canvas, 0, 0);
  bx.globalCompositeOperation = 'source-atop';
  bx.globalAlpha = main.alpha;
  bx.fillStyle = main.tint;
  bx.fillRect(0, 0, SIZE, SIZE);
  x.drawImage(body, o, o, bw, bw);
  s.tints[mask] = c;
  return c;
}

// The rasterized canvas for a class or enemy, or null while it is not ready. `status` is an enemy's status mask: the
// sprite comes back shaded in the colours of the statuses it carries.
export function getSprite(id, flash = false, status = 0) {
  const s = load(id);
  if (!s || !s.canvas) return null;
  if (flash) return s.flash;
  let mask = status & LOOK_MASK;
  if (mask & ST.FROZEN) mask &= ~ST.CHILL;
  return mask ? tinted(s, mask) : s.canvas;
}
