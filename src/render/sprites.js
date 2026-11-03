// Player character sprites. The art is SVG (sprite-art.js); each is rasterized once into a small
// canvas, so drawing a character in the game is a single drawImage. Until an image has loaded
// (or where there is no DOM, e.g. tests) getSprite returns null and the renderer falls back to
// the plain disc.

import { SPRITE_ART as BASE_ART } from './sprite-art.js';
import { ELITE_ART } from './elite-art.js';
import { BOSS_ART } from './boss-art.js';
import { NEON_ART } from './neon-art.js';

const SPRITE_ART = { ...BASE_ART, ...ELITE_ART, ...BOSS_ART, ...NEON_ART };          // the old woodcut art stays underneath; the Neon Noir sprites (v0.10.1) replace it id by id
import { ST } from '../data/statuses.js';
import { ENEMIES, PROPS } from '../data/enemies.js';
import { ELITE } from '../data/elites.js';
import { GEM } from '../data/progression.js';
import { ORES } from '../data/ores.js';

const SIZE = 192;                       // the largest raster, in pixels; a sprite gets its own, smaller size from rasterSize(id)
const MIN_SIZE = 32;
const PX_PER_UNIT = 2.2;                // device pixels per world unit at the sharpest setting is 2; a little headroom
const SPRITE_K = 3.5, LOOT_K = 4.2;     // widths on screen (entities.js): enemy = radius * 3.5, gem and ore = radius * 4.2
const sprites = {};                     // id -> { img, canvas, flash }

export const SPRITE_IDS = Object.keys(SPRITE_ART);

// Raster size for a sprite: what its largest on-screen width needs at 2.2 px per world unit, rounded up to a multiple of 8
// (v0.11.1; every sprite used to be 192 px and shrunk to 30-110 units on every draw, which is most of a late-game frame).
// Enemies are padded by 1/PAD because their status looks draw the sprite that much larger around an outline. An id the
// data does not explain keeps the full 192.
const PAD_ = 0.84;                      // = PAD below (a const declared later in the file, so it cannot be read here)
export function rasterSize(id) {
  let units = 0, pad = 1;
  const def = ENEMIES[id] || PROPS[id];
  if (def) { units = def.radius * SPRITE_K; pad = 1 / PAD_; }
  else if (id.startsWith('elite_')) {
    let r = 0;
    for (const k in ENEMIES) if (!ENEMIES[k].boss && ENEMIES[k].radius > r) r = ENEMIES[k].radius;
    units = r * ELITE.radiusMult * SPRITE_K; pad = 1 / PAD_;
  } else if (/^gem\d$/.test(id)) { const t = GEM.tiers[Number(id.slice(3))]; if (t) units = t[1] * LOOT_K; }
  else if (id.startsWith('ore_')) { const o = ORES[id.slice(4)]; if (o) units = o.r * LOOT_K; }
  else if (id === 'chest') units = 46;
  else if (id === 'bosschest') units = 46 * 1.4;
  else if (id === 'shrine') units = 76;
  else if (BASE_ART[id]) units = 68;                      // a class: the player sprite is 68 units wide (renderer.js SPRITE_W)
  if (!units) return SIZE;
  return Math.max(MIN_SIZE, Math.min(SIZE, Math.ceil((units * pad * PX_PER_UNIT) / 8) * 8));
}

// A data URL, usable as an <img src> (class select cards).
export function spriteUrl(id) {
  const svg = SPRITE_ART[id];
  return svg ? 'data:image/svg+xml;utf8,' + encodeURIComponent(svg) : '';
}

function load(id) {
  if (sprites[id] || typeof Image === 'undefined' || typeof document === 'undefined') return sprites[id] || null;
  const s = (sprites[id] = { img: new Image(), canvas: null, flash: null, tints: {}, size: rasterSize(id) });
  s.img.onload = () => {
    try {
      const c = document.createElement('canvas');
      const SZ = s.size;
      c.width = c.height = SZ;
      c.getContext('2d').drawImage(s.img, 0, 0, SZ, SZ);
      // the hurt flash: the sprite washed 40% toward white, so a hit enemy keeps its colour and shape (v0.10.6; a full white
      // silhouette made busy fights read as a screen of white blobs)
      const f = document.createElement('canvas');
      f.width = f.height = SZ;
      const fx = f.getContext('2d');
      fx.drawImage(c, 0, 0);
      fx.globalCompositeOperation = 'source-atop';
      fx.globalAlpha = 0.4;
      fx.fillStyle = '#ffffff';
      fx.fillRect(0, 0, SZ, SZ);
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
// v0.10.6: the body tint is light, so an enemy keeps its own colour (its identity) and the status reads from the outline.
const LOOKS = [                                          // in priority order
  { bit: ST.FROZEN, tint: '#d9e0ff', alpha: 0.3, edge: '#d9e0ff' },
  { bit: ST.BURN, tint: '#ff4a10', alpha: 0.14, edge: '#ff7a1a' },
  { bit: ST.SHOCK, tint: '#fff04a', alpha: 0.14, edge: '#fff04a' },
  { bit: ST.CHILL, tint: '#6f8bff', alpha: 0.14, edge: '#b9c8ff' },
];
const LOOK_MASK = ST.BURN | ST.CHILL | ST.FROZEN | ST.SHOCK;
const PAD = 0.84;                                        // the body is drawn this much smaller so outlines fit; the sprite is drawn 1 / PAD larger
const EDGE = 7;                                          // outline thickness in raster pixels per ring, at the full 192 raster (scaled down with the sprite's size)

function silhouette(s, color) {
  const SZ = s.size;
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const x = c.getContext('2d');
  x.drawImage(s.canvas, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = color;
  x.fillRect(0, 0, SZ, SZ);
  return c;
}

function tinted(s, mask) {
  let c = s.tints[mask];
  if (c) return c;
  const SZ = s.size;
  c = document.createElement('canvas');
  c.width = c.height = SZ;
  c.pad = 1 / PAD;
  const x = c.getContext('2d');
  const on = LOOKS.filter((l) => mask & l.bit);
  const main = on[0];
  const o = (SZ * (1 - PAD)) / 2;
  const bw = SZ * PAD;
  for (let i = on.length - 1; i >= 1; i--) {             // outlines, the outermost first: the sprite dilated in the colour
    const sil = silhouette(s, on[i].edge);
    const d = EDGE * (SZ / SIZE) * i;
    x.globalAlpha = 0.95;
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      x.drawImage(sil, o + Math.cos(a) * d, o + Math.sin(a) * d, bw, bw);
    }
  }
  x.globalAlpha = 1;
  const body = document.createElement('canvas');          // the body, tinted only where it is opaque
  body.width = body.height = SZ;
  const bx = body.getContext('2d');
  bx.drawImage(s.canvas, 0, 0);
  bx.globalCompositeOperation = 'source-atop';
  bx.globalAlpha = main.alpha;
  bx.fillStyle = main.tint;
  bx.fillRect(0, 0, SZ, SZ);
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
