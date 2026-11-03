// Text drawn from cached images (v0.11.2). fillText/strokeText cost a phone far more than drawImage, and the HUD and the damage
// numbers draw dozens of runs a frame. A run of text is rendered once into a small canvas (2 px per unit, enough for the
// sharpest setting) and then blitted; the cache is bounded and starts over when full. While a web font is still loading
// (document.fonts.check is false) nothing is cached and the text is drawn the plain way, so a fallback face never sticks.

const SCALE = 2;
const MAX_ENTRIES = 600;
const strings = new Map();      // font|color|align|baseline|text -> { c, ax, ay, w, h }
const glyphs = new Map();       // font|fill|stroke|char -> { c, adv, w, h, pad }
const widths = new Map();
let scratch = null;

function ready(font) {
  if (typeof document === 'undefined') return false;
  try { return document.fonts ? document.fonts.check(font) : true; } catch (e) { return false; }
}
export function textWidth(font, text) {
  const key = font + '|' + text;
  let w = widths.get(key);
  if (w === undefined) { w = measure(font, text); bounded(widths); widths.set(key, w); }
  return w;
}
function measure(font, text) {
  if (!scratch) scratch = document.createElement('canvas').getContext('2d');
  scratch.font = font;
  return scratch.measureText(text).width;
}
const sizeOf = (font) => { const m = /(\d+(?:\.\d+)?)px/.exec(font); return m ? Number(m[1]) : 12; };
function bounded(map) { if (map.size >= MAX_ENTRIES) map.clear(); }

// Draws `text` like ctx.fillText would with these settings (and leaves ctx's own font / alignment untouched).
export function drawText(ctx, text, x, y, font, color, align = 'left', baseline = 'alphabetic') {
  const key = `${font}|${color}|${align}|${baseline}|${text}`;
  let e = strings.get(key);
  if (!e) {
    if (!ready(font)) {
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = baseline;
      ctx.fillText(text, x, y);
      return;
    }
    const size = sizeOf(font), pad = 3;
    const w = Math.ceil(measure(font, text)) + pad * 2, h = Math.ceil(size * 1.6) + pad * 2;
    const ax = align === 'center' ? w / 2 : align === 'right' ? w - pad : pad;
    const ay = baseline === 'top' ? pad + size * 0.1 : baseline === 'bottom' ? h - pad - size * 0.1 : baseline === 'middle' ? h / 2 : h * 0.72;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * SCALE); c.height = Math.ceil(h * SCALE);
    const g = c.getContext('2d');
    g.scale(SCALE, SCALE);
    g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = baseline;
    g.fillText(text, ax, ay);
    bounded(strings);
    e = { c, ax, ay, w, h };
    strings.set(key, e);
  }
  ctx.drawImage(e.c, x - e.ax, y - e.ay, e.w, e.h);
}

// A centred, middle-baseline run drawn one character at a time (damage numbers: the values are all different, the characters repeat).
// `stroke` is the outline colour and `strokeW` its width; both are baked into each glyph.
export function drawGlyphs(ctx, text, x, y, font, fill, stroke, strokeW) {
  const n = text.length;
  let total = 0;
  const run = new Array(n);
  for (let i = 0; i < n; i++) {
    const key = `${font}|${fill}|${stroke}|${strokeW}|${text[i]}`;
    let g = glyphs.get(key);
    if (!g) {
      if (!ready(font)) { fallback(ctx, text, x, y, font, fill, stroke, strokeW); return; }
      const size = sizeOf(font), pad = Math.ceil(strokeW) + 1;
      const adv = measure(font, text[i]);
      const w = Math.ceil(adv) + pad * 2, h = Math.ceil(size * 1.3) + pad * 2;
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * SCALE); c.height = Math.ceil(h * SCALE);
      const gx = c.getContext('2d');
      gx.scale(SCALE, SCALE);
      gx.font = font; gx.textAlign = 'left'; gx.textBaseline = 'middle'; gx.lineJoin = 'round';
      gx.strokeStyle = stroke; gx.lineWidth = strokeW; gx.fillStyle = fill;
      gx.strokeText(text[i], pad, h / 2);
      gx.fillText(text[i], pad, h / 2);
      bounded(glyphs);
      g = { c, adv, w, h, pad };
      glyphs.set(key, g);
    }
    run[i] = g;
    total += g.adv;
  }
  let cx = x - total / 2;
  for (let i = 0; i < n; i++) {
    const g = run[i];
    ctx.drawImage(g.c, cx - g.pad, y - g.h / 2, g.w, g.h);
    cx += g.adv;
  }
}

function fallback(ctx, text, x, y, font, fill, stroke, strokeW) {
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke; ctx.lineWidth = strokeW; ctx.fillStyle = fill;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}
